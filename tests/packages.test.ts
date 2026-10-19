import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zipSync } from 'fflate';
import { createImageAsset, inspectImage, validateAssets } from '../src/packages/images';
import { readMetadata, readManifest } from '../src/packages/metadata';
import {
  exportWorkspaceBackup,
  exportPublicContent,
  readPortfolioJson,
  readPortfolioPackage,
} from '../src/packages/portfolio-package';
import { ContentError } from '../src/packages/types';
import { jsonBytes, readZip, writeZip } from '../src/packages/zip';
import { packageSession, decodePng, pngBlob } from './package-fixtures';
import { publicGraph } from './fixtures';

const rejected = (code: string) => (error: unknown) =>
  error instanceof ContentError && error.issues.some((issue) => issue.code === code);
const bytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());
test('실제 PNG 디코딩과 메타데이터 검사', async () => {
  const blob = pngBlob();
  const result = await inspectImage(blob, decodePng);
  assert.deepEqual(result, { mimeType: 'image/png', byteSize: blob.size, width: 2, height: 3 });
  const created = await createImageAsset(blob, '표지 설명', decodePng);
  assert.ok(created.asset.path.startsWith('assets/image-'));
  assert.equal(created.asset.alt, '표지 설명');
  assert.equal(
    (await validateAssets(packageSession().data, packageSession().assets, decodePng)).length,
    0,
  );
});
test('파일명이나 선언 MIME만으로 이미지를 허용하지 않는다', async () => {
  await assert.rejects(
    inspectImage(new Blob(['fake'], { type: 'image/png' }), decodePng),
    rejected('IMAGE_FORMAT'),
  );
  const real = await bytes(pngBlob());
  await assert.rejects(
    inspectImage(new Blob([real.slice(0, 20)]), decodePng),
    rejected('IMAGE_DECODE'),
  );
  await assert.rejects(inspectImage(new Blob([]), decodePng), rejected('IMAGE_SIZE'));
  await assert.rejects(
    inspectImage(new Blob([new Uint8Array(10 * 1024 * 1024 + 1)]), decodePng),
    rejected('IMAGE_SIZE'),
  );
});
test('누락·추가 파일과 바이트·픽셀·MIME 불일치를 검출한다', async () => {
  for (const field of ['byteSize', 'width', 'height', 'mimeType'] as const) {
    const session = packageSession();
    if (field === 'mimeType') session.data.assets[0]!.mimeType = 'image/jpeg';
    else session.data.assets[0]![field]++;
    assert.ok(
      (await validateAssets(session.data, session.assets, decodePng)).some(
        (issue) => issue.code === 'R10',
      ),
    );
  }
  const session = packageSession();
  session.assets.delete('cover');
  session.assets.set('extra', pngBlob());
  assert.equal((await validateAssets(session.data, session.assets, decodePng)).length, 2);
});
test('전체 백업 왕복은 초안·이미지 바이트·잘못된 영상 원문을 보존한다', async () => {
  const session = packageSession();
  session.metadata.pendingInputs = [
    {
      scope: 'project',
      projectId: session.data.projects[1]!.id,
      entityId: null,
      path: '/media/video',
      rawValue: '이 주소는 아직 잘못된 영상 URL',
    },
  ];
  session.metadata.editorState = { screen: 'projects', projectId: session.data.projects[1]!.id };
  const before = structuredClone(session.data);
  const exported = await exportWorkspaceBackup(session, decodePng);
  const imported = await readPortfolioPackage(exported.blob, decodePng);
  assert.equal(imported.sourceKind, 'workspace-backup');
  assert.deepEqual(imported.session.data, session.data);
  assert.deepEqual(imported.session.metadata.pendingInputs, session.metadata.pendingInputs);
  assert.deepEqual(imported.session.metadata.editorState, session.metadata.editorState);
  for (const [id, blob] of session.assets)
    assert.deepEqual(await bytes(imported.session.assets.get(id)!), await bytes(blob));
  assert.deepEqual(session.data, before);
});
test('공개 패키지는 공개 작품과 사용 이미지뿐이며 원본을 보존한다', async () => {
  const session = packageSession();
  const before = structuredClone(session.data);
  const output = await exportPublicContent(session, decodePng);
  const files = readZip(await bytes(output.blob));
  assert.deepEqual([...files.keys()].sort(), [
    'assets/cover.png',
    'content/assets.json',
    'content/projects.json',
    'content/site.json',
    'export-manifest.json',
  ]);
  const restored = await readPortfolioPackage(output.blob, decodePng);
  assert.equal(restored.sourceKind, 'public-content');
  assert.equal(restored.session.data.kind, 'workspace');
  assert.equal(restored.session.data.projects.length, 1);
  assert.equal(restored.session.assets.size, 1);
  assert.equal(restored.session.metadata.pendingInputs.length, 0);
  assert.deepEqual(session.data, before);
});
test('공개 대상의 미정리 원문은 막고 제외 대상 원문은 백업에 남긴다', async () => {
  const session = packageSession();
  session.metadata.pendingInputs = [
    {
      scope: 'project',
      projectId: session.data.projects[1]!.id,
      entityId: null,
      path: '/media/video',
      rawValue: 'bad',
    },
  ];
  await exportPublicContent(session, decodePng);
  session.metadata.pendingInputs[0]!.projectId = session.data.projects[0]!.id;
  await assert.rejects(exportPublicContent(session, decodePng), rejected('PENDING_PUBLIC'));
});
test('확인한 그래프는 작품 ID 파일로 공개 패키지에서 왕복한다', async () => {
  const session = packageSession();
  const graph = publicGraph().architectures[0]!;
  graph.projectId = session.data.projects[0]!.id;
  session.data.architectures = [graph];
  const result = await exportPublicContent(session, decodePng);
  assert.ok(readZip(await bytes(result.blob)).has(`content/architectures/${graph.projectId}.json`));
  assert.deepEqual(
    (await readPortfolioPackage(result.blob, decodePng)).session.data.architectures,
    [graph],
  );
});
test('예시 백업의 종류와 미확인 그래프 원문을 구분해 보존한다', async () => {
  const session = packageSession();
  session.data.kind = 'example';
  const backup = await exportWorkspaceBackup(session, decodePng);
  assert.equal((await readPortfolioPackage(backup.blob, decodePng)).session.data.kind, 'example');
  await assert.rejects(exportPublicContent(session, decodePng), rejected('EXAMPLE'));
  session.data.kind = 'workspace';
  const graph = publicGraph().architectures[0]!;
  graph.projectId = session.data.projects[0]!.id;
  graph.verified = false;
  session.data.architectures = [graph];
  session.metadata.pendingInputs = [
    {
      scope: 'node',
      projectId: graph.projectId,
      entityId: graph.nodes[0]!.id,
      path: '/label',
      rawValue: '',
    },
  ];
  const result = await exportPublicContent(session, decodePng);
  assert.equal(
    (await readPortfolioPackage(result.blob, decodePng)).session.data.architectures.length,
    0,
  );
});
test('없어진 입력 대상은 원문을 보존하고 자동 적용하지 않는다', () => {
  const session = packageSession();
  session.metadata.pendingInputs = [
    {
      scope: 'node',
      projectId: 'missing',
      entityId: 'missing',
      path: '/label',
      rawValue: '보존할 입력',
    },
  ];
  const result = readMetadata(session.metadata, session.data);
  assert.equal(result.issues[0]!.code, 'ORPHAN_INPUT');
  assert.equal(result.metadata.pendingInputs[0]!.rawValue, '보존할 입력');
});
test('백업 메타데이터의 버전·날짜·중복 원문·대상 형식을 검사한다', () => {
  const session = packageSession();
  assert.throws(
    () => readMetadata({ ...session.metadata, backupVersion: '2.0.0' }, session.data),
    rejected('BACKUP_SCHEMA'),
  );
  assert.throws(
    () => readMetadata({ ...session.metadata, savedAt: '2026-02-30T00:00:00Z' }, session.data),
    rejected('BACKUP_SCHEMA'),
  );
  const p = {
    scope: 'site' as const,
    projectId: null,
    entityId: null,
    path: '/profile/displayName',
    rawValue: '원문',
  };
  session.metadata.pendingInputs = [p, { ...p }];
  assert.throws(() => readMetadata(session.metadata, session.data), rejected('PENDING_DUPLICATE'));
  session.metadata.pendingInputs = [{ ...p, projectId: 'project-a' }];
  assert.throws(() => readMetadata(session.metadata, session.data), rejected('PENDING_TARGET'));
});
test('일반 JSON은 실제 이미지 파일이 함께 있어야 가져온다', async () => {
  const session = packageSession();
  const json = new Blob([jsonBytes(session.data)]);
  await assert.rejects(readPortfolioJson(json, new Map(), decodePng), rejected('R10'));
  const images = new Map(
    session.data.assets.map((asset) => [asset.path, session.assets.get(asset.id)!]),
  );
  assert.deepEqual((await readPortfolioJson(json, images, decodePng)).session.data, session.data);
  images.set('assets/unlisted.png', pngBlob());
  await assert.rejects(readPortfolioJson(json, images, decodePng), rejected('PACKAGE_FILES'));
});
test('manifest의 버전·누락·파일 크기와 예상 밖 파일을 검사한다', async () => {
  const output = await exportWorkspaceBackup(packageSession(), decodePng);
  const original = readZip(await bytes(output.blob));
  assert.throws(() => readManifest({ exportVersion: '2.0.0' }), rejected('MANIFEST_SCHEMA'));
  const files = new Map(original);
  files.delete('assets/cover.png');
  await assert.rejects(
    readPortfolioPackage(await writeZip(files), decodePng),
    rejected('MANIFEST_FILES'),
  );
  const changed = new Map(original);
  changed.set('portfolio.json', jsonBytes({}));
  await assert.rejects(
    readPortfolioPackage(await writeZip(changed), decodePng),
    rejected('MANIFEST_FILES'),
  );
  const extra = new Map(original);
  extra.set('content/projects.json', jsonBytes([]));
  const manifest = JSON.parse(new TextDecoder().decode(extra.get('export-manifest.json')));
  manifest.files.push({
    path: 'content/projects.json',
    byteSize: extra.get('content/projects.json')!.length,
  });
  extra.set('export-manifest.json', jsonBytes(manifest));
  await assert.rejects(
    readPortfolioPackage(await writeZip(extra), decodePng),
    rejected('PACKAGE_FILES'),
  );
});
test('자산 누락을 manifest에서 숨겨도 가져오기는 실패한다', async () => {
  const output = await exportWorkspaceBackup(packageSession(), decodePng);
  const files = readZip(await bytes(output.blob));
  files.delete('assets/cover.png');
  const manifest = JSON.parse(new TextDecoder().decode(files.get('export-manifest.json')));
  manifest.files = manifest.files.filter(
    (file: { path: string }) => file.path !== 'assets/cover.png',
  );
  files.set('export-manifest.json', jsonBytes(manifest));
  await assert.rejects(
    readPortfolioPackage(await writeZip(files), decodePng),
    rejected('PACKAGE_FILES'),
  );
});
test('ZIP 경로 탈출·추가 실행 파일·중복 파일을 거부한다', () => {
  for (const name of ['../portfolio.json', '/portfolio.json', 'assets\\cover.png', 'app.js'])
    assert.throws(() => readZip(zipSync({ [name]: jsonBytes({}) })), rejected('ZIP_PATH'));
  const zip = zipSync({ 'content/site.json': jsonBytes({}), 'content/xxxx.json': jsonBytes({}) });
  const from = new TextEncoder().encode('content/xxxx.json');
  const to = new TextEncoder().encode('content/site.json');
  for (let i = 0; i <= zip.length - from.length; i++)
    if (from.every((byte, j) => zip[i + j] === byte)) zip.set(to, i);
  assert.throws(() => readZip(zip), rejected('ZIP_DUPLICATE'));
});
test('손상된 ZIP 데이터와 압축 전 크기 한도를 검사한다', () => {
  const zip = zipSync({ 'portfolio.json': jsonBytes({ name: 'test' }) }, { level: 0 });
  const view = new DataView(zip.buffer);
  const start = 30 + view.getUint16(26, true) + view.getUint16(28, true);
  zip[start + 2] = zip[start + 2]! ^ 1;
  assert.throws(() => readZip(zip), rejected('ZIP_CHECKSUM'));
  const large = zipSync({ 'portfolio.json': jsonBytes({}) });
  for (let i = 0; i < large.length - 46; i++)
    if (new DataView(large.buffer).getUint32(i, true) === 0x02014b50) {
      new DataView(large.buffer).setUint32(i + 24, 3 * 1024 * 1024, true);
      break;
    }
  assert.throws(() => readZip(large), rejected('ZIP_SIZE'));
});
test('정상 ZIP이더라도 JSON 인코딩과 스키마 오류는 거부한다', async () => {
  const session = packageSession();
  const result = await exportWorkspaceBackup(session, decodePng);
  const files = readZip(await bytes(result.blob));
  files.set('portfolio.json', new Uint8Array([0xff, 0xfe]));
  const manifest = JSON.parse(new TextDecoder().decode(files.get('export-manifest.json')));
  manifest.files.find((file: { path: string }) => file.path === 'portfolio.json').byteSize = 2;
  files.set('export-manifest.json', jsonBytes(manifest));
  await assert.rejects(
    readPortfolioPackage(await writeZip(files), decodePng),
    rejected('JSON_FILE'),
  );
});
