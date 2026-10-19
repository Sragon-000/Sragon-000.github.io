import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm, copyFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, join, sep } from 'node:path';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { publicContentPlugin } from '../scripts/content-plugin';
import { validationPlugin } from '../scripts/validation-plugin';
import { checkDist } from '../scripts/check-dist';
import { initialBundle, enforceBudget } from '../scripts/check-performance';
import { exportPublicContent } from '../src/packages/portfolio-package';
import { readZip } from '../src/packages/zip';
import { decodeNodeImage } from '../scripts/content-files';
import { publicGraph } from '../tests/fixtures';
import { packageSession } from '../tests/package-fixtures';

let root: string;
let server: Server;
let origin: string;
let rendererFile: string;
const reports: Record<string, Awaited<ReturnType<typeof initialBundle>>> = {};
test.beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'io-production-'));
  const session = packageSession();
  const data = publicGraph();
  session.data = { ...data, kind: 'workspace' };
  session.data.site.profile.displayName = '공유 검증 제작자';
  session.data.site.exhibition.title = '공유 검증 전시장';
  session.data.site.exhibition.description = '자동 검사 전용 전시장';
  const first = session.data.projects[0]!;
  session.data.projects = Array.from({ length: 10 }, (_, i) => ({
    ...structuredClone(first),
    id: `test-work-${i + 1}`,
    slug: `test-work-${i + 1}`,
    title: `공유 검증 작품 ${i + 1}`,
    summary: `공유 검증 작품 ${i + 1}의 소개`,
    media: { ...first.media, coverAssetId: 'cover' },
  }));
  session.data.projects.push({
    ...structuredClone(first),
    id: 'hidden-work',
    slug: 'hidden-work',
    title: '비공개 검증 작품',
    status: 'draft',
  });
  session.data.site.exhibition.projectOrder = session.data.projects.map((project) => project.id);
  session.data.architectures[0]!.projectId = 'test-work-1';
  session.data.assets = [packageSession().data.assets[0]!];
  const files = readZip(
    new Uint8Array(await (await exportPublicContent(session, decodeNodeImage)).blob.arrayBuffer()),
  );
  const source = join(root, 'site-content');
  for (const [path, bytes] of files) {
    await mkdir(dirname(join(source, path)), { recursive: true });
    await writeFile(join(source, path), bytes);
  }
  for (const base of ['/', '/portfolio/']) {
    const out = join(root, base === '/' ? 'root' : 'sub');
    await build({
      configFile: false,
      base,
      plugins: [
        validationPlugin(),
        react(),
        publicContentPlugin(source, resolve('public'), `https://owner.example${base}`),
      ],
      logLevel: 'silent',
      build: { outDir: out, emptyOutDir: true },
    });
    if (base === '/')
      for (const name of await readdir(join(out, 'assets'))) {
        if (
          name.endsWith('.js') &&
          (await readFile(join(out, 'assets', name), 'utf8')).includes('isWebGLRenderer')
        )
          rendererFile = name;
      }
    await checkDist(out, source, base, `https://owner.example${base}`);
    reports[base] = await initialBundle(out, base);
    enforceBudget(reports[base]!);
  }
  await copyFile(
    join(root, 'root/share/test-work-1/card.jpg'),
    join(tmpdir(), 'io-sharing-cover-card.jpg'),
  );
  server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname);
      const sub = path.startsWith('/portfolio/');
      const folder = join(root, sub ? 'sub' : 'root');
      if (sub) path = path.slice('/portfolio'.length);
      if (path.endsWith('/')) path += 'index.html';
      const file = resolve(folder, `.${path}`);
      if (!file.startsWith(folder + sep)) throw new Error('path');
      const mime: Record<string, string> = {
        js: 'text/javascript',
        css: 'text/css',
        json: 'application/json',
        html: 'text/html',
        jpg: 'image/jpeg',
        png: 'image/png',
        svg: 'image/svg+xml',
      };
      res.setHeader('Content-Type', mime[file.split('.').at(-1)!] ?? 'application/octet-stream');
      res.end(await readFile(file));
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server');
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (root) await rm(root, { recursive: true, force: true });
});
for (const base of ['/', '/portfolio/']) {
  test(`프로덕션 ${base} 공유 HTML은 JS 없이 읽히고 작품 상세로 진입한다`, async ({
    browser,
    page,
  }, testInfo) => {
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    try {
      const bot = await noJs.newPage();
      await bot.goto(`${origin}${base}share/test-work-1/`);
      await expect(bot.locator('meta[property="og:title"]')).toHaveAttribute(
        'content',
        '공유 검증 작품 1 · 공유 검증 전시장',
      );
      await expect(bot.locator('meta[property="og:description"]')).toHaveAttribute(
        'content',
        '공유 검증 작품 1의 소개',
      );
      await expect(bot.locator('meta[property="og:image"]')).toHaveAttribute(
        'content',
        `https://owner.example${base}share/test-work-1/card.jpg`,
      );
      await expect(bot.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `https://owner.example${base}share/test-work-1/`,
      );
      await expect(
        bot.getByRole('heading', { name: '공유 검증 작품 1 · 공유 검증 전시장', exact: true }),
      ).toBeVisible();
      expect((await bot.request.get(`${origin}${base}share/test-work-1/card.jpg`)).status()).toBe(
        200,
      );
      expect((await bot.request.get(`${origin}${base}share/hidden-work/`)).status()).toBe(404);
    } finally {
      await noJs.close();
    }
    await page.goto(`${origin}${base}share/test-work-1/`);
    await expect(
      page.getByRole('heading', { name: '공유 검증 작품 1', exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(`${origin}${base}#/projects/test-work-1`);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: '공유 검증 작품 1', exact: true }),
    ).toBeVisible();
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    await page.getByRole('button', { name: '작품 링크 복사', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `${origin}${base}share/test-work-1/`,
    );
    await expect(
      page.getByRole('status').filter({ hasText: '공유 링크를 복사했습니다.' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: `${origin}${base}share/test-work-1/`, exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('share-detail.png') });
  });
}
test('프로덕션 갤러리는 그래프·3D·편집·영상 요청을 하지 않고 선택할 때 불러온다', async ({
  page,
}, testInfo) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(`${origin}/`);
  await expect(page.getByRole('heading', { name: '공유 검증 전시장', exact: true })).toBeVisible();
  expect(
    requests.some((url) =>
      /ProjectDetail|Graph3D|RendererHost|WorkspaceTools|ExhibitionPage|Exhibition3D|architectures|youtube/iu.test(
        url,
      ),
    ),
  ).toBe(false);
  expect(requests.some((url) => url.includes(rendererFile))).toBe(false);
  const initial = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((item) => item.name.endsWith('.js'))
      .map((item) => new URL(item.name).pathname),
  );
  expect(new Set(initial)).toEqual(new Set(reports['/']!.files.map((file) => `/${file.path}`)));
  await page.locator('#card-test-work-1').click();
  await expect(page.getByRole('heading', { name: '공유 검증 작품 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '3D 보기', exact: true })).toBeVisible();
  expect(requests.some((url) => url.includes('ProjectDetail'))).toBe(true);
  expect(requests.some((url) => url.includes('content/architectures/test-work-1.json'))).toBe(true);
  expect(requests.some((url) => /Graph3D|youtube/iu.test(url) || url.includes(rendererFile))).toBe(
    false,
  );
  await page.getByRole('button', { name: '3D 보기', exact: true }).click();
  await expect(page.locator('.graph-three canvas')).toBeVisible();
  expect(requests.some((url) => url.includes(rendererFile))).toBe(true);
  await page.getByRole('link', { name: '3D 전시장', exact: true }).click();
  await expect(page.locator('.exhibition-canvas canvas')).toBeVisible();
  expect(requests.some((url) => url.includes('ExhibitionPage'))).toBe(true);
  expect(requests.some((url) => url.includes('Exhibition3D'))).toBe(true);
  await testInfo.attach('initial-bundle', {
    body: JSON.stringify(reports, null, 2),
    contentType: 'application/json',
  });
});
test('프로덕션 지연 화면 다운로드 실패에도 갤러리로 돌아갈 수 있다', async ({ page }) => {
  await page.route('**/assets/ProjectDetail-*.js', (route) => route.abort());
  await page.goto(`${origin}/#/projects/test-work-1`);
  await expect(
    page.getByRole('heading', { name: '화면 기능을 불러올 수 없습니다', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: '갤러리로 돌아가기 ↗', exact: true }).click();
  await expect(page.getByRole('heading', { name: '공유 검증 전시장', exact: true })).toBeVisible();
});

test('클립보드 접근을 거부해도 복사할 공유 주소를 표시한다', async ({ page }) => {
  await page.context().grantPermissions([], { origin });
  await page.goto(`${origin}/#/projects/test-work-1`);
  await page.getByRole('button', { name: '작품 링크 복사', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '아래 공유 주소를 선택해 복사해 주세요.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: `${origin}/share/test-work-1/`, exact: true }),
  ).toBeVisible();
});
