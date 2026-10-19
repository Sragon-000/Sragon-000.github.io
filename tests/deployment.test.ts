import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import {
  decodeNodeImage,
  loadSiteContent,
  validateAppStatic,
  validateContentFiles,
} from '../scripts/content-files';
import { importContent } from '../scripts/import-content';
import { checkDist } from '../scripts/check-dist';
import { contentRequestPath, pagesBase } from '../scripts/content-plugin';
import { sharingHtml, sharingInfo, sharingCard } from '../scripts/sharing';
import { exportPublicContent, exportWorkspaceBackup } from '../src/packages/portfolio-package';
import { jsonBytes, readZip } from '../src/packages/zip';
import { ContentError } from '../src/packages/types';
import { inspectImage } from '../src/packages/images';
import { packageSession, pngBlob } from './package-fixtures';
import { publicGraph } from './fixtures';

const rejected = (code: string) => (error: unknown) =>
  error instanceof ContentError && error.issues.some((issue) => issue.code === code);
const blobBytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());
async function temporary(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'io-deploy-test-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
async function writeFiles(root: string, files: ReadonlyMap<string, Uint8Array>) {
  await mkdir(root, { recursive: true });
  for (const [path, bytes] of files) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), bytes);
  }
}
async function publicFiles() {
  return readZip(
    await blobBytes((await exportPublicContent(packageSession(), decodeNodeImage)).blob),
  );
}
function refreshManifest(files: Map<string, Uint8Array>) {
  const manifest = JSON.parse(new TextDecoder().decode(files.get('export-manifest.json')));
  manifest.files = [...files]
    .filter(([path]) => path !== 'export-manifest.json')
    .map(([path, bytes]) => ({ path, byteSize: bytes.length }));
  files.set('export-manifest.json', jsonBytes(manifest));
}

test('저장소의 공개 콘텐츠 폴더는 빌드와 같은 검증을 통과한다', async () => {
  const content = await loadSiteContent('site-content');
  assert.equal(content.data.kind, 'public');
  assert.equal(content.manifest.kind, 'public-content');
  assert.equal(content.manifest.schemaVersion, '1.0.0');
});
test('Node 이미지 검사는 네 형식을 실제 디코딩하고 EXIF 방향을 적용한다', async () => {
  for (const format of ['png', 'jpeg', 'webp', 'avif'] as const) {
    const bytes = await sharp({ create: { width: 3, height: 5, channels: 3, background: 'red' } })
      .toFormat(format)
      .toBuffer();
    const result = await inspectImage(new Blob([new Uint8Array(bytes)]), decodeNodeImage);
    assert.equal(result.width, 3);
    assert.equal(result.height, 5);
    assert.equal(result.mimeType, `image/${format}`);
  }
  const rotated = await sharp({ create: { width: 3, height: 5, channels: 3, background: 'red' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  assert.deepEqual(await decodeNodeImage(new Blob([new Uint8Array(rotated)])), {
    width: 5,
    height: 3,
  });
});
test('헤더만 정상인 잘린 이미지와 픽셀 메타데이터 불일치를 거부한다', async () => {
  const files = await publicFiles();
  files.set('assets/cover.png', (await blobBytes(pngBlob())).slice(0, 33));
  refreshManifest(files);
  const assets = JSON.parse(new TextDecoder().decode(files.get('content/assets.json')));
  assets[0].byteSize = 33;
  files.set('content/assets.json', jsonBytes(assets));
  refreshManifest(files);
  await assert.rejects(validateContentFiles(files), rejected('R10'));
  const second = await publicFiles();
  const changed = JSON.parse(new TextDecoder().decode(second.get('content/assets.json')));
  changed[0].width++;
  second.set('content/assets.json', jsonBytes(changed));
  refreshManifest(second);
  await assert.rejects(validateContentFiles(second), rejected('R10'));
});
test('공개 파일 검증은 사용 이미지와 확인한 그래프만 읽는다', async () => {
  const session = packageSession();
  const graph = publicGraph().architectures[0]!;
  graph.projectId = session.data.projects[0]!.id;
  session.data.architectures = [graph];
  const files = readZip(
    await blobBytes((await exportPublicContent(session, decodeNodeImage)).blob),
  );
  const result = await validateContentFiles(files);
  assert.equal(result.data.projects.length, 1);
  assert.equal(result.data.assets.length, 1);
  assert.equal(result.data.architectures.length, 1);
  graph.verified = false;
  files.set(`content/architectures/${graph.projectId}.json`, jsonBytes(graph));
  refreshManifest(files);
  await assert.rejects(validateContentFiles(files));
});
test('누락·추가·잘못된 바이트 수와 버전은 공개 파일 검증에서 실패한다', async () => {
  for (const change of ['missing', 'extra', 'bytes', 'version']) {
    const files = await publicFiles();
    if (change === 'missing') files.delete('assets/cover.png');
    if (change === 'extra') files.set('content/architectures/unrelated.json', jsonBytes({}));
    if (change === 'bytes') files.set('content/projects.json', jsonBytes([]));
    if (change === 'version') {
      const manifest = JSON.parse(new TextDecoder().decode(files.get('export-manifest.json')));
      manifest.exportVersion = '2.0.0';
      files.set('export-manifest.json', jsonBytes(manifest));
    }
    await assert.rejects(validateContentFiles(files));
  }
});
test('파일 검사에서 실행 파일과 초안 백업은 허용하지 않는다', async () => {
  const files = await publicFiles();
  files.set('app.js', new TextEncoder().encode('alert(1)'));
  await assert.rejects(validateContentFiles(files), rejected('CONTENT_PATH'));
  const backup = readZip(
    await blobBytes((await exportWorkspaceBackup(packageSession(), decodeNodeImage)).blob),
  );
  await assert.rejects(validateContentFiles(backup));
});
test('디렉터리의 심볼릭 링크·예상 밖 파일과 기본 파일 누락은 거부한다', async () =>
  temporary(async (root) => {
    const content = join(root, 'content');
    await writeFiles(content, await publicFiles());
    await writeFile(join(root, 'secret.txt'), 'local');
    await symlink(join(root, 'secret.txt'), join(content, 'assets', 'extra.png'));
    await assert.rejects(loadSiteContent(content), rejected('CONTENT_PATH'));
    await rm(join(content, 'assets', 'extra.png'));
    await writeFile(join(content, 'notes.txt'), 'private');
    await assert.rejects(loadSiteContent(content), rejected('CONTENT_PATH'));
    const staticRoot = join(root, 'public');
    await mkdir(staticRoot);
    await assert.rejects(validateAppStatic(staticRoot), rejected('APP_STATIC'));
  }));
test('반영 전 검사는 파일을 생성하지 않으며 정상 반영은 기존 자료를 보존한다', async () =>
  temporary(async (root) => {
    const target = join(root, 'site-content');
    const zip = join(root, 'new.zip');
    const session = packageSession();
    await writeFile(
      zip,
      await blobBytes((await exportPublicContent(session, decodeNodeImage)).blob),
    );
    const checked = await importContent(zip, target, true);
    assert.equal(checked.projects, 1);
    await assert.rejects(readFile(join(target, 'export-manifest.json')), { code: 'ENOENT' });
    const first = await importContent(zip, target);
    assert.equal(first.backup, null);
    const before = await readFile(join(target, 'content/site.json'));
    session.data.site.profile.displayName = '다른 검증 제작자';
    await writeFile(
      zip,
      await blobBytes((await exportPublicContent(session, decodeNodeImage)).blob),
    );
    const second = await importContent(zip, target);
    assert.equal((await loadSiteContent(target)).data.site.profile.displayName, '다른 검증 제작자');
    assert.deepEqual(await readFile(join(second.backup!, 'content/site.json')), before);
  }));
test('잘못된 ZIP과 백업 반영 실패 후 기존 공개 자료는 그대로 유지된다', async () =>
  temporary(async (root) => {
    const target = join(root, 'site-content');
    await writeFiles(target, await publicFiles());
    const before = await readFile(join(target, 'export-manifest.json'));
    const zip = join(root, 'bad.zip');
    await writeFile(zip, 'not zip');
    await assert.rejects(importContent(zip, target));
    await writeFile(
      zip,
      await blobBytes((await exportWorkspaceBackup(packageSession(), decodeNodeImage)).blob),
    );
    await assert.rejects(importContent(zip, target));
    assert.deepEqual(await readFile(join(target, 'export-manifest.json')), before);
  }));
test('기존 폴더가 손상됐거나 링크이면 자동으로 덮어쓰지 않는다', async () =>
  temporary(async (root) => {
    const target = join(root, 'site-content');
    const zip = join(root, 'public.zip');
    await writeFile(
      zip,
      await blobBytes((await exportPublicContent(packageSession(), decodeNodeImage)).blob),
    );
    await mkdir(target);
    await writeFile(join(target, 'notes.txt'), 'retain');
    await assert.rejects(importContent(zip, target));
    assert.equal(await readFile(join(target, 'notes.txt'), 'utf8'), 'retain');
    await symlink(target, join(root, 'linked'));
    await assert.rejects(importContent(zip, join(root, 'linked')), rejected('CONTENT_PATH'));
  }));
test('Pages base는 루트·저장소 경로만 허용하고 외부·부모 경로를 거부한다', () => {
  assert.equal(pagesBase(), '/');
  assert.equal(pagesBase('/my-portfolio/'), '/my-portfolio/');
  for (const value of ['https://example.com/', '../', '/repo', '//', '/a/../', '/a/./', '/x/?q=1'])
    assert.throws(() => pagesBase(value));
});
test('개발 서버의 공개 파일 요청은 실제 base를 한 번만 제거한다', () => {
  assert.equal(contentRequestPath('/export-manifest.json', '/'), 'export-manifest.json');
  assert.equal(
    contentRequestPath('/portfolio/content/site.json?v=1', '/portfolio/'),
    'content/site.json',
  );
  assert.equal(contentRequestPath('/other/content/site.json', '/portfolio/'), null);
  assert.equal(contentRequestPath('/portfolio-other/content/site.json', '/portfolio/'), null);
});
test('dist의 공개 콘텐츠·HTML 경로와 예상 밖 초안 파일을 검사한다', async () =>
  temporary(async (root) => {
    const source = join(root, 'site-content');
    const dist = join(root, 'dist');
    const files = await publicFiles();
    await writeFiles(source, files);
    await writeFiles(
      dist,
      new Map([
        ...files,
        [
          'index.html',
          new TextEncoder().encode(
            '<head><title>test</title><link href="/portfolio/favicon.svg"></head><body><div id="root"></div><script src="/portfolio/assets/app.js"></script></body>',
          ),
        ],
        ['assets/app.js', new TextEncoder().encode('export {}')],
        ['favicon.svg', new TextEncoder().encode('<svg/>')],
        ['.nojekyll', new Uint8Array()],
        ['licenses/three.txt', new TextEncoder().encode('license')],
      ]),
    );
    const data = (await loadSiteContent(source)).data;
    const template = await readFile(join(dist, 'index.html'), 'utf8');
    await writeFile(join(dist, 'index.html'), sharingHtml(template, data, '/portfolio/'));
    for (const project of [undefined, ...data.projects]) {
      const info = sharingInfo(data, project);
      await mkdir(dirname(join(dist, info.image)), { recursive: true });
      await writeFile(join(dist, info.image), await sharingCard(data, files, project));
      if (project)
        await writeFile(
          join(dist, info.page, 'index.html'),
          sharingHtml(template, data, '/portfolio/', undefined, project),
        );
    }
    await checkDist(dist, source, '/portfolio/');
    const background = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#f1f4ff' },
    })
      .webp()
      .toBuffer();
    const backgroundPath = join(dist, 'assets/aurora-dream-test.webp');
    const cssPath = join(dist, 'assets/style.css');
    await writeFile(backgroundPath, background);
    await writeFile(
      cssPath,
      'body{background-image:url(/portfolio/assets/aurora-dream-test.webp)}',
    );
    await checkDist(dist, source, '/portfolio/');
    await rm(backgroundPath);
    await assert.rejects(checkDist(dist, source, '/portfolio/'), /CSS의 정적 파일 경로 오류/);
    await writeFile(backgroundPath, background);
    await writeFile(cssPath, 'body{background-image:url(/assets/aurora-dream-test.webp)}');
    await assert.rejects(checkDist(dist, source, '/portfolio/'), /CSS의 정적 파일 경로 오류/);
    await rm(cssPath);
    await writeFile(join(dist, 'assets/private.webp'), background);
    await assert.rejects(checkDist(dist, source, '/portfolio/'), rejected('CONTENT_PATH'));
    await rm(join(dist, 'assets/private.webp'));
    await assert.rejects(checkDist(dist, source, '/'));
    await writeFile(join(dist, 'portfolio.json'), '{}');
    await assert.rejects(checkDist(dist, source, '/portfolio/'), rejected('CONTENT_PATH'));
    await rm(join(dist, 'portfolio.json'));
    await writeFile(join(dist, 'content/projects.json'), '[]');
    await assert.rejects(checkDist(dist, source, '/portfolio/'), /원본과 다릅니다/);
  }));
