import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  WorkspaceStore,
  isDirty,
  siteKey,
  type SavedWorkspace,
  type SaveOptions,
} from '../src/storage/workspaces';
import { WorkspaceController } from '../src/storage/controller';
import { packageSession, decodePng } from './package-fixtures';
import { jsonBytes } from '../src/packages/zip';
import { cloneSession, type WorkspaceSession } from '../src/packages/types';
async function commit(
  store: WorkspaceStore,
  key: string,
  session: WorkspaceSession,
  mode: SaveOptions['mode'] = 'save',
) {
  return store.save(key, session, { expectedToken: await store.version(key), mode });
}

test('초안과 Blob은 한 저장본으로 복원되고 배포 경로별로 격리된다', async () => {
  const store = new WorkspaceStore(new IDBFactory(), 'test', decodePng);
  const a = packageSession();
  const b = packageSession();
  b.data.site.profile.displayName = '다른 제작자';
  const ka = siteKey('https://person.github.io', '/first/');
  const kb = siteKey('https://person.github.io', '/second');
  assert.notEqual(ka, kb);
  assert.equal(kb, siteKey('https://person.github.io', '/second/'));
  await commit(store, ka, a);
  await commit(store, kb, b);
  const loaded = await store.load(ka);
  assert.deepEqual(loaded?.data, a.data);
  assert.equal((await store.load(kb))?.data.site.profile.displayName, '다른 제작자');
  assert.deepEqual(
    await loaded!.assets.get('cover')!.arrayBuffer(),
    await a.assets.get('cover')!.arrayBuffer(),
  );
  await store.close();
});
test('transaction 마지막 put 성공 후에도 abort되면 이전 자료와 이미지가 남는다', async () => {
  const factory = new IDBFactory();
  const nativeOpen = factory.open.bind(factory);
  let abortWrite = false;
  factory.open = (...args) => {
    const request = nativeOpen(...args);
    request.addEventListener('success', () => {
      const db = request.result;
      const transaction = db.transaction.bind(db);
      db.transaction = (...args) => {
        const tx = transaction(...args);
        if (abortWrite && args[1] === 'readwrite') {
          const store = tx.objectStore('workspaces');
          const put = store.put.bind(store);
          store.put = (...args) => {
            const request = put(...args);
            request.addEventListener('success', () => tx.abort());
            return request;
          };
        }
        return tx;
      };
    });
    return request;
  };
  const store = new WorkspaceStore(factory, 'abort-test', decodePng);
  const old = packageSession();
  await commit(store, 'site-a', old);
  const replacement = packageSession();
  replacement.data.site.profile.displayName = '교체할 이름';
  abortWrite = true;
  await assert.rejects(commit(store, 'site-a', replacement, 'replace'));
  abortWrite = false;
  const loaded = await store.load('site-a');
  assert.equal(loaded?.workspaceId, old.workspaceId);
  assert.deepEqual(loaded?.data, old.data);
  assert.deepEqual(
    await loaded!.assets.get('cover')!.arrayBuffer(),
    await old.assets.get('cover')!.arrayBuffer(),
  );
  await store.close();
});
test('연속 저장은 호출 시점의 스냅샷을 순서대로 반영하고 오래된 revision을 거부한다', async () => {
  const store = new WorkspaceStore(new IDBFactory(), 'queue-test', decodePng);
  const session = packageSession();
  const first = store.save('key', session, { expectedToken: null, mode: 'save' });
  session.revision++;
  session.data.site.profile.displayName = '두 번째';
  const snapshot = cloneSession(session);
  const second = first.then((saved) =>
    store.save('key', snapshot, { expectedToken: saved.token, mode: 'save' }),
  );
  session.data.site.profile.displayName = '아직 저장하지 않은 편집';
  assert.equal((await first).revision, 1);
  assert.equal((await second).revision, 2);
  assert.equal((await store.load('key'))?.data.site.profile.displayName, '두 번째');
  session.revision = 1;
  await assert.rejects(commit(store, 'key', session));
  assert.equal((await store.load('key'))?.revision, 2);
  await store.close();
});
test('교체 저장은 이전 이미지들을 제거하면서 다른 사이트의 초안을 보존한다', async () => {
  const store = new WorkspaceStore(new IDBFactory(), 'replace-test', decodePng);
  const a = packageSession();
  const b = packageSession();
  await commit(store, 'a', a);
  await commit(store, 'b', b);
  const next = packageSession();
  next.data.assets = [];
  next.assets.clear();
  next.data.projects.forEach((project) => {
    project.media.coverAssetId = null;
  });
  await commit(store, 'a', next, 'replace');
  assert.equal((await store.load('a'))?.assets.size, 0);
  assert.equal((await store.load('b'))?.assets.size, 3);
  await store.close();
});
test('원문과 편집 상태도 저장되며 잘못된 파일은 저장본을 바꾸지 않는다', async () => {
  const store = new WorkspaceStore(new IDBFactory(), 'raw-test', decodePng);
  const session = packageSession();
  session.metadata.pendingInputs = [
    {
      scope: 'project',
      projectId: session.data.projects[1]!.id,
      entityId: null,
      path: '/media/video',
      rawValue: 'invalid youtube URL',
    },
  ];
  await commit(store, 'a', session);
  assert.deepEqual((await store.load('a'))?.metadata.pendingInputs, session.metadata.pendingInputs);
  session.assets.delete('cover');
  await assert.rejects(commit(store, 'a', session));
  assert.equal((await store.load('a'))?.assets.size, 3);
  await store.close();
});
test('저장 중 추가 편집은 미저장 상태로 남는다', async () => {
  let complete!: (value: SavedWorkspace) => void;
  const controller = new WorkspaceController(
    {
      load: async () => null,
      save: () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    },
    'a',
  );
  await controller.initialize();
  controller.editSite('displayName', '먼저 입력');
  const revision = controller.getSnapshot().session.revision;
  const saving = controller.save();
  controller.editSite('displayName', '저장 중 추가 입력');
  await Promise.resolve();
  complete({ token: 'test-token', revision, savedAt: new Date().toISOString() });
  await saving;
  assert.equal(controller.getSnapshot().savedRevision, revision);
  assert.equal(controller.dirty(), true);
  assert.equal(controller.getSnapshot().session.data.site.profile.displayName, '저장 중 추가 입력');
  assert.equal(controller.getSnapshot().status, '저장한 뒤의 변경 사항이 남아 있습니다.');
  assert.equal(isDirty(2, 1), true);
  assert.equal(isDirty(1, 1), false);
});
test('가져오기 검사·취소·저장 실패는 현재 초안을 보존한다', async () => {
  const controller = new WorkspaceController(
    {
      load: async () => null,
      save: async () => {
        throw new Error('저장 실패');
      },
    },
    'a',
    decodePng,
  );
  await controller.initialize();
  controller.editSite('displayName', '기존 제작자');
  const previous = structuredClone(controller.getSnapshot().session.data);
  await controller.stage(new Blob(['bad']), 'zip');
  assert.deepEqual(controller.getSnapshot().session.data, previous);
  const candidate = packageSession();
  candidate.data.assets = [];
  candidate.assets.clear();
  candidate.data.projects.forEach((project) => {
    project.media.coverAssetId = null;
  });
  await controller.stage(new Blob([jsonBytes(candidate.data)]), 'json');
  assert.deepEqual(controller.getSnapshot().session.data, previous);
  assert.ok(controller.getSnapshot().staged);
  await controller.confirmImport();
  assert.deepEqual(controller.getSnapshot().session.data, previous);
  assert.ok(controller.getSnapshot().staged);
  controller.cancelImport();
  assert.equal(controller.getSnapshot().staged, null);
  assert.deepEqual(controller.getSnapshot().session.data, previous);
});
test('확인한 가져오기는 저장 성공 후에만 적용된다', async () => {
  const store = new WorkspaceStore(new IDBFactory(), 'controller-test', decodePng);
  const controller = new WorkspaceController(store, 'a', decodePng);
  await controller.initialize();
  const candidate = packageSession();
  const images = new Map(
    candidate.data.assets.map((asset) => [asset.path, candidate.assets.get(asset.id)!]),
  );
  await controller.stage(new Blob([jsonBytes(candidate.data)]), 'json', images);
  assert.equal(controller.getSnapshot().session.data.projects.length, 0);
  await controller.confirmImport();
  assert.equal(controller.getSnapshot().session.data.projects.length, 3);
  assert.equal(controller.dirty(), false);
  assert.equal((await store.load('a'))?.data.projects.length, 3);
  await store.close();
});
test('초과 길이 이름의 원문을 별도로 보관하고 유효 값은 유지한다', async () => {
  const controller = new WorkspaceController(
    {
      load: async () => null,
      save: async () => ({ token: 'test-token', revision: 0, savedAt: new Date().toISOString() }),
    },
    'a',
  );
  await controller.initialize();
  controller.editSite('displayName', '유효 이름');
  controller.editSite('displayName', '🚀'.repeat(41));
  assert.equal(controller.getSnapshot().session.data.site.profile.displayName, '유효 이름');
  assert.equal(
    controller.getSnapshot().session.metadata.pendingInputs[0]?.rawValue,
    '🚀'.repeat(41),
  );
  controller.editSite('displayName', '🚀'.repeat(40));
  assert.equal(controller.getSnapshot().session.metadata.pendingInputs.length, 0);
});
