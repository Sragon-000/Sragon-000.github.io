import { test, expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { readFile } from 'node:fs/promises';
import { readZip, parseJson } from '../src/packages/zip';

async function studio(page: Page, base = 'http://127.0.0.1:5290/') {
  await page.goto(`${base}#/studio/profile`);
  await expect(page.getByLabel('제작자 이름', { exact: true })).toBeVisible();
}
async function save(page: Page) {
  await page.getByRole('button', { name: '초안 저장', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '이 기기에 초안을 저장했습니다.' }),
  ).toBeVisible();
}
async function graph(page: Page) {
  await studio(page);
  await page.getByRole('button', { name: '기획 예시 그래프 미리보기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '구조 예시 프로젝트 아키텍처' })).toBeVisible();
}
async function graphRoundTrip(page: Page) {
  await page.getByRole('link', { name: '작품 상세로 돌아가기 ↗', exact: true }).click();
  await page.getByRole('link', { name: '그래프 크게 보기 ↗', exact: true }).click();
  await expect(page.getByRole('heading', { name: '구조 예시 프로젝트 아키텍처' })).toBeVisible();
}
async function pose(page: Page) {
  return JSON.parse((await page.getByLabel('개발용 그래프 시점').textContent()) ?? '{}') as {
    position: number[];
    target: number[];
  };
}

test('분리한 설정 화면을 왕복해도 입력·테마·공개 선택을 유지한다', async ({ page }) => {
  await studio(page);
  await page.getByLabel('제작자 이름', { exact: true }).fill('분리 검증 제작자');
  await page.getByLabel('전시장 이름', { exact: true }).fill('분리 검증 전시장');
  await page.getByRole('link', { name: '전시 설정', exact: true }).click();
  await page
    .getByLabel('전시장 설명', { exact: true })
    .fill('설정 화면 왕복을 확인하는 검증 전시장');
  await page.getByLabel('테마', { exact: true }).selectOption('light');
  await page.getByLabel('첫 관람 화면', { exact: true }).selectOption('exhibition');
  await page.getByRole('link', { name: '작품 관리', exact: true }).click();
  await page.getByRole('button', { name: '작품 추가', exact: true }).click();
  await page.getByLabel('작품명', { exact: true }).fill('분리 검증 작품');
  await page.getByLabel('한 줄 요약', { exact: true }).fill('자동 검사에만 사용하는 작품');
  await page.getByLabel('공개 대상으로 선택', { exact: true }).check();
  await save(page);
  await page.getByRole('link', { name: '내보내기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '내보내기와 배포', exact: true })).toBeVisible();
  await expect(page.getByText('공개 대상 1개 · 초안 0개', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '공개 대상 미리보기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '분리 검증 전시장', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('heading', { name: '분리 검증 작품', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '미리보기 종료하고 설정으로', exact: true }).click();
  await page.getByRole('link', { name: '전시 설정', exact: true }).click();
  await expect(page.getByLabel('첫 관람 화면', { exact: true })).toHaveValue('exhibition');
  await expect(page.getByLabel('테마', { exact: true })).toHaveValue('light');
  await page.getByRole('link', { name: '기본 정보', exact: true }).click();
  await expect(page.getByLabel('제작자 이름', { exact: true })).toHaveValue('분리 검증 제작자');
});

for (const base of ['http://127.0.0.1:5290/', 'http://127.0.0.1:5291/portfolio/']) {
  test(`공개 JSON과 직접 접근·새로고침은 ${new URL(base).pathname} 경로를 사용한다`, async ({
    page,
  }) => {
    const response = await page.request.get(`${base}export-manifest.json`);
    expect(response.status()).toBe(200);
    expect((await response.json()).kind).toBe('public-content');
    expect((await page.request.get(`${base}favicon.svg`)).status()).toBe(200);
    await studio(page, base);
    await page.getByLabel('제작자 이름', { exact: true }).fill('경로 검증 제작자');
    await save(page);
    await page.reload();
    await expect(page.getByLabel('제작자 이름', { exact: true })).toHaveValue('경로 검증 제작자');
  });
}

test('두 탭 충돌은 입력과 백업을 유지하고 다시 읽기 전에 확인한다', async ({
  page,
  context,
}, testInfo) => {
  await studio(page);
  await page.getByLabel('제작자 이름', { exact: true }).fill('기존 제작자');
  await page.getByLabel('전시장 이름', { exact: true }).fill('기존 전시장');
  await save(page);
  const other = await context.newPage();
  await studio(other);
  await page.getByLabel('제작자 이름', { exact: true }).fill('첫 탭 저장');
  await other.getByLabel('전시장 이름', { exact: true }).fill('둘째 탭 미저장');
  await save(page);
  await other.getByRole('button', { name: '초안 저장', exact: true }).click();
  await expect(
    other.getByRole('alert').filter({ hasText: '다른 저장본과 충돌했습니다' }),
  ).toBeVisible();
  await expect(other.getByLabel('전시장 이름', { exact: true })).toHaveValue('둘째 탭 미저장');
  await expect(other.getByRole('button', { name: '초안 저장', exact: true })).toBeDisabled();
  await other
    .getByRole('alert')
    .filter({ hasText: '다른 저장본과 충돌했습니다' })
    .scrollIntoViewIfNeeded();
  await other.screenshot({ path: testInfo.outputPath('conflict.png') });
  await other.getByRole('button', { name: '전체 초안 백업', exact: true }).click();
  const downloadPromise = other.waitForEvent('download');
  await other.getByRole('link', { name: '백업 ZIP 다운로드 ↗', exact: true }).click();
  const download = await downloadPromise;
  const files = readZip(new Uint8Array(await readFile((await download.path())!)));
  const backedUp = parseJson(files.get('portfolio.json'), 'portfolio.json') as {
    site: { exhibition: { title: string } };
  };
  expect(backedUp.site.exhibition.title).toBe('둘째 탭 미저장');
  await other.getByRole('button', { name: '저장본 다시 읽기', exact: true }).click();
  await expect(other.getByRole('dialog', { name: '저장본 다시 읽기 확인' })).toBeVisible();
  await other.getByRole('button', { name: '취소하고 입력 유지', exact: true }).click();
  await expect(other.getByLabel('전시장 이름', { exact: true })).toHaveValue('둘째 탭 미저장');
  await other.getByRole('button', { name: '저장본 다시 읽기', exact: true }).click();
  await other.getByRole('button', { name: '저장본으로 다시 읽기', exact: true }).click();
  await expect(other.getByLabel('제작자 이름', { exact: true })).toHaveValue('첫 탭 저장');
  await expect(other.getByLabel('전시장 이름', { exact: true })).toHaveValue('기존 전시장');
});

test('읽기 실패 UI는 저장을 막고 원본을 보존하며 다시 읽기로 복구한다', async ({ page }) => {
  await studio(page);
  await page.getByLabel('제작자 이름', { exact: true }).fill('보존할 제작자');
  await save(page);
  // Only this test's isolated Chromium profile is modified to simulate an unsupported record.
  async function recordVersion(version: string) {
    await page.evaluate(async (schemaVersion) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('io-portfolio-v1', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('workspaces', 'readwrite');
          const store = tx.objectStore('workspaces');
          const read = store.get(`${location.origin}/`);
          read.onsuccess = () => {
            read.result.data.schemaVersion = schemaVersion;
            store.put(read.result);
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => reject(tx.error);
        };
      });
    }, version);
  }
  await recordVersion('unsupported-test-version');
  await page.reload();
  await expect(
    page.getByRole('alert').filter({ hasText: '저장본을 읽지 못했습니다' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '초안 저장', exact: true })).toBeDisabled();
  const original = await page.evaluate(
    async () =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open('io-portfolio-v1', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('workspaces', 'readonly');
          const read = tx.objectStore('workspaces').get(`${location.origin}/`);
          tx.oncomplete = () => {
            resolve(read.result.data.site.profile.displayName);
            db.close();
          };
          tx.onabort = () => reject(tx.error);
        };
      }),
  );
  expect(original).toBe('보존할 제작자');
  await recordVersion('1.0.0');
  await page.getByRole('button', { name: '저장본 다시 읽기', exact: true }).click();
  await expect(page.getByLabel('제작자 이름', { exact: true })).toHaveValue('보존할 제작자');
});

test('2D 확대와 이동 직후 왕복해도 viewBox가 유지된다', async ({ page }) => {
  await graph(page);
  await page.getByRole('button', { name: '2D 확대', exact: true }).click();
  await page.getByRole('button', { name: '2D 오른쪽으로 이동', exact: true }).click();
  const box = await page
    .getByRole('group', { name: '2D 시스템 그래프', exact: true })
    .getAttribute('viewBox');
  await graphRoundTrip(page);
  await expect(page.getByRole('group', { name: '2D 시스템 그래프', exact: true })).toHaveAttribute(
    'viewBox',
    box!,
  );
});

test('3D 회전 직후 왕복해도 실제 카메라 시점이 유지된다', async ({ page }) => {
  await graph(page);
  await page.getByRole('button', { name: '3D 보기', exact: true }).click();
  const canvas = page.getByRole('img', { name: '3D 시스템 그래프', exact: true });
  await expect(canvas).toBeVisible();
  await page.getByText('개발용 그래프 검사', { exact: true }).click();
  await expect(page.getByLabel('개발용 그래프 시점')).not.toHaveText('');
  const before = await pose(page);
  await canvas.scrollIntoViewIfNeeded();
  const bounds = (await canvas.boundingBox())!;
  const x = bounds.x + bounds.width * 0.4;
  const y = bounds.y + bounds.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y - 10, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => pose(page)).not.toEqual(before);
  const rotated = await pose(page);
  await graphRoundTrip(page);
  await expect(canvas).toBeVisible();
  await page.getByText('개발용 그래프 검사', { exact: true }).click();
  await expect(page.getByLabel('개발용 그래프 시점')).not.toHaveText('');
  const returned = await pose(page);
  for (const field of ['position', 'target'] as const)
    rotated[field].forEach((value, i) => expect(returned[field][i]).toBeCloseTo(value, 7));
});

test('이미지와 미정리 입력을 포함한 초안 백업은 실제 UI에서 왕복한다', async ({ page }) => {
  await studio(page);
  await page.getByLabel('제작자 이름', { exact: true }).fill('ZIP 검증 제작자');
  await page.getByRole('link', { name: '작품 관리', exact: true }).click();
  await page.getByRole('button', { name: '작품 추가', exact: true }).click();
  await page.getByLabel('작품명', { exact: true }).fill('백업할 작품');
  await page.getByLabel('팀 규모', { exact: true }).fill('1.5');
  await page.getByLabel('대표 이미지 대체 설명', { exact: true }).fill('회귀 검사 PNG');
  const png = new PNG({ width: 2, height: 3 });
  png.data.fill(180);
  await page
    .getByLabel('대표 이미지 파일 선택', { exact: true })
    .setInputFiles({ name: 'test-cover.png', mimeType: 'image/png', buffer: PNG.sync.write(png) });
  await expect(page.getByRole('img', { name: '회귀 검사 PNG' })).toBeVisible();
  await save(page);
  await page.getByRole('button', { name: '전체 초안 백업', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: '백업 ZIP 다운로드 ↗', exact: true }).click();
  const download = await downloadPromise;
  await page.getByLabel('작품명', { exact: true }).fill('복구 전 변경');
  await page.getByText('백업 또는 콘텐츠 가져오기', { exact: true }).click();
  await page
    .getByLabel('ZIP 파일 가져오기', { exact: true })
    .setInputFiles((await download.path())!);
  await expect(page.getByRole('dialog', { name: '가져올 초안 확인' })).toBeVisible();
  await page.getByRole('button', { name: '현재 초안 대신 가져오기', exact: true }).click();
  await expect(page.getByLabel('작품명', { exact: true })).toHaveValue('백업할 작품');
  await expect(page.getByLabel('팀 규모', { exact: true })).toHaveValue('1.5');
  const image = page.getByRole('img', { name: '회귀 검사 PNG' });
  await expect(image).toBeVisible();
  expect(
    await image.evaluate((el) => ({
      width: (el as HTMLImageElement).naturalWidth,
      height: (el as HTMLImageElement).naturalHeight,
    })),
  ).toEqual({ width: 2, height: 3 });
});
