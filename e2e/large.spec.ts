import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createPerformanceServer } from '../scripts/performance/measure';
let service: Awaited<ReturnType<typeof createPerformanceServer>>;
test.beforeAll(async () => {
  service = await createPerformanceServer({ base: '/portfolio/' });
});
test.afterAll(async () => {
  await service?.close();
});
test('큰 그래프·이미지·ZIP의 실제 자원 상한과 worker 사용/정리를 유지한다', async ({
  page,
}, testInfo) => {
  const workers: string[] = [];
  page.on('worker', (worker) => workers.push(worker.url()));
  await page.goto(service.url);
  await page.waitForFunction(
    () => typeof (window as unknown as { runPerformance?: unknown }).runPerformance === 'function',
  );
  const report = await page.evaluate(() =>
    (
      window as unknown as { runPerformance: () => Promise<Record<string, unknown>> }
    ).runPerformance(),
  );
  for (const count of [50, 200]) {
    const value = report[`graph${count}`] as {
      nodes: number;
      editorOptions: number;
      edges: number;
      textureRgbaBytes: number;
      renderer: { calls: number; textures: number; geometries: number };
      remaining: { textures: number; geometries: number };
    };
    expect(value.nodes).toBe(count);
    expect(value.editorOptions).toBe(0);
    expect(value.edges).toBe(count * 3);
    expect(value.textureRgbaBytes).toBeLessThanOrEqual(60 * 1024 * 1024);
    expect(value.renderer.textures).toBeLessThanOrEqual(13);
    expect(value.renderer.calls).toBeLessThan(1200);
    expect(value.remaining).toEqual({ textures: 0, geometries: 0 });
  }
  expect(workers.filter((url) => url.includes('zip-worker')).length).toBeGreaterThanOrEqual(2);
  expect(page.workers()).toHaveLength(0);
  await testInfo.attach('large-performance', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
});
test('200노드의 키보드 선택·이동·2D/3D 왕복은 선택과 viewport를 유지한다', async ({
  page,
}, testInfo) => {
  await page.goto(service.url);
  await page.waitForFunction(
    () => typeof (window as unknown as { inspectGraph?: unknown }).inspectGraph === 'function',
  );
  await page.evaluate(() =>
    (window as unknown as { inspectGraph: (count: number) => void }).inspectGraph(200),
  );
  const selected = page.locator('[data-node="node-0199"]');
  await selected.focus();
  await selected.press('Enter');
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('선택한 검증 시스템')).toHaveText('node-0199');
  await page.getByRole('button', { name: '2D 확대', exact: true }).click();
  await page.getByRole('button', { name: '2D 오른쪽으로 이동', exact: true }).click();
  const before = await page.locator('.graph-svg').getAttribute('viewBox');
  await page.getByRole('button', { name: '검증 3D', exact: true }).click();
  await expect(page.locator('.graph-three canvas')).toBeVisible();
  await expect(page.getByLabel('선택한 검증 시스템')).toHaveText('node-0199');
  await page.screenshot({ path: testInfo.outputPath('graph-200-three.png') });
  await page.getByRole('button', { name: '검증 2D', exact: true }).click();
  await expect(page.locator('.graph-svg')).toHaveAttribute('viewBox', before!);
  await expect(page.locator('[data-node="node-0199"]')).toHaveAttribute('aria-pressed', 'true');
});
for (const base of ['http://127.0.0.1:5290/', 'http://127.0.0.1:5291/portfolio/'])
  test(`대용량 ZIP 취소·CRC 오류·Worker 실패는 ${new URL(base).pathname} 초안을 보존한다`, async ({
    page,
  }) => {
    await page.goto(`${base}#/studio/profile`);
    await page.getByLabel('제작자 이름', { exact: true }).fill('현재 초안 유지');
    await page.getByText('백업 또는 콘텐츠 가져오기', { exact: true }).click();
    await page.getByLabel('ZIP 파일 가져오기', { exact: true }).setInputFiles(service.zipPath);
    await expect(page.getByRole('dialog', { name: '가져올 초안 확인' })).toBeVisible();
    await expect(page.getByLabel('제작자 이름', { exact: true })).toHaveValue('현재 초안 유지');
    await page.getByRole('button', { name: '취소하고 현재 초안 유지', exact: true }).click();
    await expect(page.getByLabel('제작자 이름', { exact: true })).toHaveValue('현재 초안 유지');
    const bytes = Buffer.from(await readFile(service.zipPath));
    const signature = bytes.indexOf(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(signature).toBeGreaterThan(0);
    bytes[signature + 40]! ^= 1;
    await page
      .getByLabel('ZIP 파일 가져오기', { exact: true })
      .setInputFiles({ name: 'corrupt.zip', mimeType: 'application/zip', buffer: bytes });
    await expect(
      page.getByRole('status').filter({ hasText: '파일이 손상되었거나 크기가 맞지 않습니다.' }),
    ).toBeVisible();
    await expect(page.getByLabel('제작자 이름', { exact: true })).toHaveValue('현재 초안 유지');
    await page.route('**/zip-worker.ts?*', (route) => route.abort());
    await page.getByLabel('ZIP 파일 가져오기', { exact: true }).setInputFiles(service.zipPath);
    await expect(
      page.getByRole('status').filter({
        hasText:
          '파일 처리 기능을 불러오지 못했습니다. 기존 초안은 유지됩니다. 연결을 확인하고 다시 시도해 주세요.',
      }),
    ).toBeVisible();
    await expect(page.getByLabel('제작자 이름', { exact: true })).toHaveValue('현재 초안 유지');
    await expect(page.getByRole('dialog', { name: '가져올 초안 확인' })).not.toBeVisible();
  });

test('큰 그래프 편집기는 펼친 폼만 생성하고 접었다 펼쳐도 입력·오류 원문을 유지한다', async ({
  page,
}) => {
  await page.goto(service.url);
  await page.waitForFunction(
    () => typeof (window as unknown as { inspectEditor?: unknown }).inspectEditor === 'function',
  );
  await page.evaluate(() =>
    (window as unknown as { inspectEditor: (count: number) => Promise<void> }).inspectEditor(200),
  );
  expect(await page.locator('#editor option').count()).toBe(0);
  const group = page.locator('[data-graph-entity="group-0"]');
  await group.locator('summary').click();
  await group.getByLabel('그룹 층', { exact: true }).fill('1.5');
  await expect(group.getByLabel('그룹 층', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await group.locator('summary').click();
  await expect(group.getByLabel('그룹 층', { exact: true })).toHaveCount(0);
  await group.locator('summary').click();
  await expect(group.getByLabel('그룹 층', { exact: true })).toHaveValue('1.5');
  const node = page.locator('[data-graph-entity="node-0199"]');
  await node.locator('summary').click();
  await node.getByLabel('시스템 이름', { exact: true }).fill('수정한 시스템 이름');
  await node.locator('summary').click();
  await expect(node.getByLabel('시스템 이름', { exact: true })).toHaveCount(0);
  await node.locator('summary').click();
  await expect(node.getByLabel('시스템 이름', { exact: true })).toHaveValue('수정한 시스템 이름');
  expect(await page.locator('#editor option').count()).toBeLessThan(250);
});
