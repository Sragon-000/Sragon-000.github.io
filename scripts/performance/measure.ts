import { createServer, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';
import { build, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, type Browser } from '@playwright/test';
import sharp from 'sharp';
import { validationPlugin } from '../validation-plugin';
import { exportWorkspaceBackup } from '../../src/packages/portfolio-package';
import { inspectImage } from '../../src/packages/images';
import { decodeNodeImage } from '../content-files';
import { createWorkspace, createProject } from '../../src/domain/create';
import { emptyMetadata } from '../../src/packages/types';

export async function createPerformanceServer(options: { base?: string; baseline?: string } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'io-large-performance-'));
  let server: Server | undefined;
  try {
    const fixtures = join(directory, 'fixtures');
    await mkdir(fixtures);
    let seed = 123456789;
    const random = Buffer.alloc(1024 * 1024 * 3);
    for (let i = 0; i < random.length; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      random[i] = seed & 255;
    }
    const png = await sharp(random, { raw: { width: 1024, height: 1024, channels: 3 } })
      .png()
      .toBuffer();
    const photo = await sharp(random, { raw: { width: 1024, height: 1024, channels: 3 } })
      .resize(4096, 4096)
      .jpeg({ quality: 80 })
      .toBuffer();
    await writeFile(join(fixtures, 'image.png'), png);
    await writeFile(join(fixtures, 'photo.jpg'), photo);
    const blob = new Blob([new Uint8Array(png)]);
    const inspected = await inspectImage(blob, decodeNodeImage);
    const data = createWorkspace();
    data.site.profile.displayName = '성능 검사 제작자';
    data.site.exhibition.title = '성능 검사 전시장';
    const project = createProject();
    project.title = '성능 검사 작품';
    project.summary = '성능 검사에만 사용';
    data.projects = [project];
    data.site.exhibition.projectOrder = [project.id];
    data.assets = Array.from({ length: 8 }, (_, i) => ({
      id: `asset-${i}`,
      path: `assets/asset-${i}.png`,
      alt: '검증 이미지',
      ...inspected,
    }));
    project.media.screenshotAssetIds = data.assets.map((asset) => asset.id);
    const session = {
      workspaceId: 'performance-test',
      revision: 1,
      data,
      metadata: emptyMetadata(),
      assets: new Map(data.assets.map((asset) => [asset.id, blob])),
    };
    await writeFile(
      join(fixtures, 'large.zip'),
      new Uint8Array(
        await (await exportWorkspaceBackup(session, decodeNodeImage)).blob.arrayBuffer(),
      ),
    );
    const dist = join(directory, 'dist');
    const baseline = options.baseline;
    const baselineFiles = [
      'src/features/architecture/Graph2D.tsx',
      'src/features/architecture/model.ts',
      'src/three/ArchitectureScene.ts',
      'src/packages/images.ts',
      'src/packages/zip.ts',
      'src/packages/portfolio-package.ts',
      'src/features/studio/GraphEditor.tsx',
    ];
    const previousSources: Plugin = {
      name: 'measurement-baseline',
      enforce: 'pre',
      async load(id) {
        if (!baseline) return;
        const relative = baselineFiles.find((path) => resolve(path) === id);
        if (relative) return readFile(resolve(baseline, relative), 'utf8');
      },
    };
    await build({
      configFile: false,
      base: options.base ?? '/',
      plugins: [previousSources, validationPlugin(), react()],
      logLevel: 'silent',
      build: {
        outDir: dist,
        emptyOutDir: true,
        rolldownOptions: { input: resolve('scripts/performance/index.html') },
      },
    });
    server = createServer(async (req, res) => {
      try {
        let pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname);
        if (!pathname.startsWith('/fixtures/') && options.base && options.base !== '/') {
          if (!pathname.startsWith(options.base)) throw Error('path');
          pathname = pathname.slice(options.base.length - 1);
        }
        const base = pathname.startsWith('/fixtures/') ? directory : dist;
        const path = resolve(base, `.${pathname}`);
        if (!path.startsWith(base + sep)) throw Error('path');
        res.setHeader(
          'Content-Type',
          path.endsWith('.html')
            ? 'text/html'
            : path.endsWith('.js')
              ? 'text/javascript'
              : path.endsWith('.css')
                ? 'text/css'
                : 'application/octet-stream',
        );
        res.end(await readFile(path));
      } catch {
        res.statusCode = 404;
        res.end();
      }
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('server');

    return {
      url: `http://127.0.0.1:${address.port}${options.base ?? '/'}scripts/performance/index.html`,
      zipPath: join(fixtures, 'large.zip'),
      close: async () => {
        server?.closeAllConnections();
        if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    server?.closeAllConnections();
    server?.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function measure() {
  const service = await createPerformanceServer({ baseline: process.argv[3] });
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(service.url);
    await page.waitForFunction(
      () =>
        typeof (window as unknown as { runPerformance?: unknown }).runPerformance === 'function',
    );
    const samples = [];
    for (let i = 0; i < 3; i++)
      samples.push(
        await page.evaluate(() =>
          (window as unknown as { runPerformance: () => Promise<unknown> }).runPerformance(),
        ),
      );
    const sample = await page.evaluate(
      () => (window as unknown as { atlasSample: string }).atlasSample,
    );
    const report = {
      at: new Date().toISOString(),
      environment: {
        browser: browser.version(),
        gpu: 'SwiftShader',
        viewport: '1280×900',
        iterations: 3,
        throttling: false,
      },
      samples,
    };
    const output = resolve(process.argv[2] || 'test-results/performance-large.json');
    await mkdir(resolve(output, '..'), { recursive: true });
    await writeFile(output, JSON.stringify(report, null, 2));
    await writeFile(`${output}.atlas.png`, Buffer.from(sample.split(',')[1]!, 'base64'));
    console.log(`성능 기록: ${output}`);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser?.close();
    await service.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await measure();
