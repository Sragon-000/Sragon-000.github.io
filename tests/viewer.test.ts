import assert from 'node:assert/strict';
import { test } from 'node:test';
import { preparePublicContent } from '../src/domain/public';
import { selectProjects } from '../src/domain/select';
import {
  loadPublicContent,
  loadPublicArchitecture,
  MissingContent,
  assetUrl,
  type Fetcher,
} from '../src/content/public-loader';
import { PreviewStore } from '../src/content/preview';
import { packageSession } from './package-fixtures';
import { publicGraph } from './fixtures';
import { jsonBytes } from '../src/packages/zip';
import { WorkspaceController } from '../src/storage/controller';
function server(graph = false) {
  const result = preparePublicContent(packageSession().data);
  if (!result.ok) throw Error('fixture');
  const data = graph ? publicGraph() : result.data;
  const files = new Map<string, Uint8Array>([
    [
      'content/site.json',
      jsonBytes({ schemaVersion: data.schemaVersion, kind: data.kind, site: data.site }),
    ],
    ['content/projects.json', jsonBytes(data.projects)],
    ['content/assets.json', jsonBytes(data.assets)],
    ...data.architectures.map(
      (graph) =>
        [`content/architectures/${graph.projectId}.json`, jsonBytes(graph)] as [string, Uint8Array],
    ),
    ...data.assets.map(
      (asset) => [asset.path, new Uint8Array(asset.byteSize)] as [string, Uint8Array],
    ),
  ]);
  files.set(
    'export-manifest.json',
    jsonBytes({
      exportVersion: '1.0.0',
      schemaVersion: '1.0.0',
      kind: 'public-content',
      createdAt: '2026-10-07T00:00:00.000Z',
      files: [...files].map(([path, bytes]) => ({ path, byteSize: bytes.length })),
    }),
  );
  const requests: string[] = [];
  const fetcher: Fetcher = async (url, init) => {
    assert.equal(init?.cache, 'no-store');
    assert.ok(url.startsWith('https://owner.github.io/portfolio/'));
    const path = new URL(url).pathname.replace('/portfolio/', '');
    requests.push(path);
    const bytes = files.get(path);
    return bytes
      ? new Response(bytes.slice().buffer as ArrayBuffer)
      : new Response('', { status: 404 });
  };
  return { data, files, requests, fetcher };
}
test('공개 공급자는 base 아래 필수 JSON만 읽고 그림과 그래프는 지연 조회한다', async () => {
  const s = server(true);
  const content = await loadPublicContent('/portfolio/', 'https://owner.github.io', s.fetcher);
  assert.deepEqual(content.data.architectures, []);
  assert.equal(s.requests.length, 4);
  const graph = await loadPublicArchitecture(content, s.data.projects[0]!.id, s.fetcher);
  assert.deepEqual(graph, s.data.architectures[0]);
  assert.equal(s.requests.length, 5);
  assert.equal(await loadPublicArchitecture(content, 'not-present', s.fetcher), null);
});
test('미등록 콘텐츠, 네트워크 오류와 버전 오류는 구분되고 다른 자료로 대체하지 않는다', async () => {
  await assert.rejects(
    loadPublicContent(
      '/portfolio/',
      'https://owner.github.io',
      async () => new Response('', { status: 404 }),
    ),
    MissingContent,
  );
  await assert.rejects(
    loadPublicContent(
      '/portfolio/',
      'https://owner.github.io',
      async () => new Response('', { status: 500 }),
    ),
    /불러오지 못/,
  );
  const s = server();
  s.files.set('content/projects.json', jsonBytes([]));
  await assert.rejects(
    loadPublicContent('/portfolio/', 'https://owner.github.io', s.fetcher),
    /크기가/,
  );
  const version = JSON.parse(new TextDecoder().decode(s.files.get('export-manifest.json')));
  version.schemaVersion = '2.0.0';
  s.files.set('export-manifest.json', jsonBytes(version));
  await assert.rejects(loadPublicContent('/portfolio/', 'https://owner.github.io', s.fetcher));
});
test('알 수 없는 키, 잘못된 공개 상태와 배포 이미지 크기 불일치는 거부한다', async () => {
  const s = server();
  const site = JSON.parse(new TextDecoder().decode(s.files.get('content/site.json')));
  site.extra = true;
  const bytes = jsonBytes(site);
  s.files.set('content/site.json', bytes);
  const manifest = JSON.parse(new TextDecoder().decode(s.files.get('export-manifest.json')));
  manifest.files.find((f: { path: string }) => f.path === 'content/site.json').byteSize =
    bytes.length;
  s.files.set('export-manifest.json', jsonBytes(manifest));
  await assert.rejects(
    loadPublicContent('/portfolio/', 'https://owner.github.io', s.fetcher),
    /설정 파일 형식/,
  );
  const a = server();
  const m = JSON.parse(new TextDecoder().decode(a.files.get('export-manifest.json')));
  m.files.find((f: { path: string }) => f.path.startsWith('assets/')).byteSize++;
  a.files.set('export-manifest.json', jsonBytes(m));
  await assert.rejects(
    loadPublicContent('/portfolio/', 'https://owner.github.io', a.fetcher),
    /이미지 목록/,
  );
});
test('손상된 구조 파일은 상세의 구조 영역 오류로 남으며 로더가 다른 작품에 연결하지 않는다', async () => {
  const s = server(true);
  const content = await loadPublicContent('/portfolio/', 'https://owner.github.io', s.fetcher);
  const path = `content/architectures/${s.data.projects[0]!.id}.json`;
  s.files.set(path, jsonBytes({ wrong: true }));
  await assert.rejects(loadPublicArchitecture(content, s.data.projects[0]!.id, s.fetcher));
  assert.equal(content.data.projects.length, 1);
});
test('취소 신호와 파일 크기 제한을 유지하고 외부 base를 거부한다', async () => {
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    loadPublicContent(
      '/portfolio/',
      'https://owner.github.io',
      async (_url, init) => {
        assert.equal(init?.signal, abort.signal);
        init?.signal?.throwIfAborted();
        return new Response('');
      },
      abort.signal,
    ),
  );
  await assert.rejects(
    loadPublicContent('https://other.test/', 'https://owner.github.io'),
    /잘못된/,
  );
  await assert.rejects(
    loadPublicContent(
      '/portfolio/',
      'https://owner.github.io',
      async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1)),
    ),
    /2MiB/,
  );
});
test('공개 이미지 URL은 자산 ID를 통해서만 base 아래로 해결한다', async () => {
  const s = server();
  const content = await loadPublicContent('/portfolio/', 'https://owner.github.io', s.fetcher);
  assert.equal(assetUrl(content, 'cover'), 'https://owner.github.io/portfolio/assets/cover.png');
  assert.equal(assetUrl(content, null), undefined);
  assert.equal(assetUrl(content, '../private'), undefined);
});
test('미리보기는 독립 스냅샷이며 모드별 순서와 초안 포함 여부를 유지하고 URL을 해제한다', () => {
  const session = packageSession();
  const revoked: string[] = [];
  let i = 0;
  const store = new PreviewStore({
    create: () => `blob:test-${i++}`,
    revoke: (url) => revoked.push(url),
  });
  store.start(session, 'public', '#/studio/export');
  const preview = store.getSnapshot()!;
  assert.equal(selectProjects(preview.data, preview.mode).length, 1);
  session.data.site.profile.displayName = '다음 편집';
  assert.notEqual(preview.data.site.profile.displayName, '다음 편집');
  store.start(session, 'workspace', '#/studio/profile');
  assert.equal(revoked.length, 3);
  assert.equal(selectProjects(store.getSnapshot()!.data, 'workspace').length, 3);
  store.end();
  assert.equal(revoked.length, 6);
  assert.equal(store.getSnapshot(), null);
});
test('미리보기 URL 생성 실패는 이전 미리보기를 보존하고 새 자원만 정리한다', () => {
  let i = 0;
  const revoked: string[] = [];
  const store = new PreviewStore({
    create: () => {
      if (++i === 5) throw Error('quota');
      return `blob:${i}`;
    },
    revoke: (value) => revoked.push(value),
  });
  store.start(packageSession(), 'workspace', '#/studio/profile');
  const old = store.getSnapshot();
  assert.throws(() => store.start(packageSession(), 'public', '#/studio/export'));
  assert.equal(store.getSnapshot(), old);
  assert.deepEqual(revoked, ['blob:4']);
  store.end();
});
test('영상 편집은 ID를 정리하고 잘못된 원문을 보존하며 기존 영상과 작품 ID를 유지한다', async () => {
  const session = packageSession();
  const id = session.data.projects[0]!.id;
  const controller = new WorkspaceController(
    {
      load: async () => session,
      save: async (_key, s) => ({
        token: 'test-token',
        revision: s.revision,
        savedAt: '2026-10-07T00:00:00.000Z',
      }),
    },
    'key',
  );
  await controller.initialize();
  controller.editProjectVideo(id, 'https://youtu.be/M7lc1UVf-VE?t=2');
  assert.equal(
    controller.getSnapshot().session.data.projects[0]!.media.video?.videoId,
    'M7lc1UVf-VE',
  );
  controller.editProjectVideo(id, 'https://evil.test/watch?v=M7lc1UVf-VE');
  assert.equal(
    controller.getSnapshot().session.metadata.pendingInputs[0]!.rawValue,
    'https://evil.test/watch?v=M7lc1UVf-VE',
  );
  assert.equal(
    controller.getSnapshot().session.data.projects[0]!.media.video?.videoId,
    'M7lc1UVf-VE',
  );
  controller.editProjectVideo(id, '');
  assert.equal(controller.getSnapshot().session.data.projects[0]!.media.video, null);
  assert.equal(controller.getSnapshot().session.metadata.pendingInputs.length, 0);
});
