import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WorkspaceController } from '../src/storage/controller';
import { WorkspaceStore, newSession, StorageConflict } from '../src/storage/workspaces';
import { packageSession, decodePng, pngBlob } from './package-fixtures';
import { jsonBytes } from '../src/packages/zip';
import { inspectImage, MAX_IMAGE_PIXELS } from '../src/packages/images';

async function pair() {
  const factory = new IDBFactory();
  const a = new WorkspaceStore(factory, 'safety', decodePng);
  const b = new WorkspaceStore(factory, 'safety', decodePng);
  await a.save('key', packageSession(), { expectedToken: null, mode: 'save' });
  const ca = new WorkspaceController(a, 'key', decodePng);
  const cb = new WorkspaceController(b, 'key', decodePng);
  await ca.initialize();
  await cb.initialize();
  return { a, b, ca, cb };
}
for (const edits of [1, 4])
  test(`두 탭의 편집 횟수가 ${edits}회여도 오래된 저장본이 다른 탭 변경을 덮어쓰지 않는다`, async () => {
    const { a, b, ca, cb } = await pair();
    ca.editSite('displayName', 'A 탭 저장');
    for (let i = 0; i < edits; i++) cb.editSite('title', `B 탭 입력 ${i}`);
    await ca.save();
    await cb.save();
    assert.equal((await a.load('key'))!.data.site.profile.displayName, 'A 탭 저장');
    assert.equal(cb.getSnapshot().session.data.site.exhibition.title, `B 탭 입력 ${edits - 1}`);
    assert.equal(cb.getSnapshot().conflict, true);
    assert.equal(cb.dirty(), true);
    assert.ok(await cb.export('backup'));
    assert.equal(cb.getSnapshot().conflict, true);
    await cb.reload();
    assert.equal(cb.getSnapshot().conflict, false);
    assert.equal(cb.getSnapshot().session.data.site.profile.displayName, 'A 탭 저장');
    assert.equal(cb.dirty(), false);
    await a.close();
    await b.close();
  });
test('두 탭의 첫 저장도 기존 저장본을 덮어쓰지 않는다', async () => {
  const factory = new IDBFactory();
  const a = new WorkspaceStore(factory, 'new');
  const b = new WorkspaceStore(factory, 'new');
  const ca = new WorkspaceController(a, 'key');
  const cb = new WorkspaceController(b, 'key');
  await ca.initialize();
  await cb.initialize();
  ca.editSite('displayName', '첫 탭');
  cb.editSite('displayName', '둘째 탭');
  await ca.save();
  await cb.save();
  assert.equal((await a.load('key'))!.data.site.profile.displayName, '첫 탭');
  assert.equal(cb.getSnapshot().conflict, true);
  await a.close();
  await b.close();
});
test('한 탭의 연속 저장은 각 호출 스냅샷을 보존하며 자기 저장 버전을 이어 쓴다', async () => {
  const store = new WorkspaceStore(new IDBFactory(), 'queue');
  const controller = new WorkspaceController(store, 'key');
  await controller.initialize();
  const saves: Promise<void>[] = [];
  for (let i = 0; i < 5; i++) {
    controller.editSite('displayName', `입력 ${i}`);
    saves.push(controller.save());
  }
  await Promise.all(saves);
  assert.equal(controller.getSnapshot().saving, 0);
  assert.equal(controller.getSnapshot().conflict, false);
  assert.equal((await store.load('key'))!.data.site.profile.displayName, '입력 4');
  assert.equal(controller.dirty(), false);
  await store.close();
});
test('일반 저장은 workspace 교체를 거부하고 명시적 교체는 확인한 버전만 사용한다', async () => {
  const store = new WorkspaceStore(new IDBFactory(), 'replace', decodePng);
  const first = await store.save('key', packageSession(), { expectedToken: null, mode: 'save' });
  const next = newSession();
  await assert.rejects(
    store.save('key', next, { expectedToken: first.token, mode: 'save' }),
    StorageConflict,
  );
  const replacement = await store.save('key', next, {
    expectedToken: first.token,
    mode: 'replace',
  });
  await assert.rejects(
    store.save('key', packageSession(), { expectedToken: first.token, mode: 'replace' }),
    StorageConflict,
  );
  assert.equal(await store.version('key'), replacement.token);
  assert.equal((await store.load('key'))!.workspaceId, next.workspaceId);
  await store.close();
});
test('다른 탭의 가져오기 이후 오래된 탭에서 저장해도 교체 자료를 보존한다', async () => {
  const { a, b, ca, cb } = await pair();
  const imported = newSession();
  imported.data.site.profile.displayName = '가져온 제작자';
  await ca.stage(new Blob([jsonBytes(imported.data)]), 'json');
  await ca.confirmImport();
  cb.editSite('displayName', '오래된 탭 입력');
  await cb.save();
  assert.equal((await a.load('key'))!.data.site.profile.displayName, '가져온 제작자');
  assert.equal(cb.getSnapshot().session.data.site.profile.displayName, '오래된 탭 입력');
  assert.equal(cb.getSnapshot().conflict, true);
  await a.close();
  await b.close();
});
test('가져오기 확인을 기다리는 동안 저장본이 바뀌면 교체를 거부한다', async () => {
  const { a, b, ca, cb } = await pair();
  const incoming = newSession();
  incoming.data.site.profile.displayName = '교체 후보';
  await ca.stage(new Blob([jsonBytes(incoming.data)]), 'json');
  cb.editSite('displayName', '확인 중 다른 탭 저장');
  await cb.save();
  await ca.confirmImport();
  assert.equal((await a.load('key'))!.data.site.profile.displayName, '확인 중 다른 탭 저장');
  assert.ok(ca.getSnapshot().staged);
  assert.equal(ca.getSnapshot().conflict, true);
  ca.cancelImport();
  await ca.reload();
  assert.equal(ca.getSnapshot().session.data.site.profile.displayName, '확인 중 다른 탭 저장');
  await a.close();
  await b.close();
});
test('읽기 실패 시 편집·저장·빈 백업을 막고 다시 읽기로 원본을 복원한다', async () => {
  let fail = false;
  const store = new WorkspaceStore(new IDBFactory(), 'read-error', async (blob) => {
    if (fail) throw Error('디코더 실패');
    return decodePng(blob);
  });
  const first = await store.save('key', packageSession(), { expectedToken: null, mode: 'save' });
  fail = true;
  const controller = new WorkspaceController(store, 'key', decodePng);
  await controller.initialize();
  assert.equal(controller.getSnapshot().loadStatus, 'error');
  assert.equal(controller.getSnapshot().ready, false);
  assert.equal(controller.dirty(), false);
  controller.editSite('displayName', '실패 후 입력');
  await controller.save();
  assert.equal(await controller.export('backup'), null);
  assert.equal(await store.version('key'), first.token);
  fail = false;
  await controller.reload();
  assert.equal(controller.getSnapshot().session.data.projects.length, 3);
  assert.equal(controller.getSnapshot().session.assets.size, 3);
  assert.equal(controller.getSnapshot().ready, true);
  await store.close();
});
test('읽기 실패 상태의 파일 복구도 확인 전과 취소 때 기존 저장본을 유지한다', async () => {
  let fail = false;
  const store = new WorkspaceStore(new IDBFactory(), 'recovery', async (blob) => {
    if (fail) throw Error('디코더 실패');
    return decodePng(blob);
  });
  const first = await store.save('key', packageSession(), { expectedToken: null, mode: 'save' });
  fail = true;
  const controller = new WorkspaceController(store, 'key', decodePng);
  await controller.initialize();
  const incoming = newSession();
  incoming.data.site.profile.displayName = '복구 파일';
  const json = new Blob([jsonBytes(incoming.data)]);
  await controller.stage(json, 'json');
  assert.ok(controller.getSnapshot().staged);
  assert.equal(await store.version('key'), first.token);
  controller.cancelImport();
  assert.equal(await store.version('key'), first.token);
  assert.equal(controller.getSnapshot().ready, false);
  await controller.stage(json, 'json');
  await controller.confirmImport();
  assert.equal(controller.getSnapshot().ready, true);
  assert.equal((await store.load('key'))!.data.site.profile.displayName, '복구 파일');
  await store.close();
});
test('새로 읽기에 실패해도 현재 탭의 미저장 내용은 유지한다', async () => {
  const session = newSession();
  let fail = false;
  let writes = 0;
  const controller = new WorkspaceController(
    {
      load: async () => {
        if (fail) throw Error('읽기 실패');
        return session;
      },
      save: async () => {
        writes++;
        return { revision: 0, savedAt: new Date().toISOString(), token: 'test' };
      },
    },
    'key',
  );
  await controller.initialize();
  controller.editSite('displayName', '유지할 입력');
  fail = true;
  await controller.reload();
  assert.equal(controller.getSnapshot().session.data.site.profile.displayName, '유지할 입력');
  assert.equal(controller.getSnapshot().ready, true);
  assert.equal(controller.dirty(), true);
  assert.equal(controller.getSnapshot().loadStatus, 'error');
  await controller.save();
  assert.equal(writes, 0);
  assert.ok(await controller.export('backup'));
});
test('기존 commitId 없는 저장본도 원래 자료를 읽고 새 저장 버전으로 갱신한다', async () => {
  const factory = new IDBFactory();
  const store = new WorkspaceStore(factory, 'legacy', decodePng);
  await store.save('key', packageSession(), { expectedToken: null, mode: 'save' });
  await store.close();
  await new Promise<void>((resolve, reject) => {
    const request = factory.open('legacy', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('workspaces', 'readwrite');
      const object = tx.objectStore('workspaces');
      const read = object.get('key');
      read.onsuccess = () => {
        delete read.result.commitId;
        object.put(read.result);
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => reject(tx.error);
    };
  });
  const controller = new WorkspaceController(store, 'key', decodePng);
  await controller.initialize();
  assert.equal(controller.getSnapshot().session.data.projects.length, 3);
  controller.editSite('displayName', '기존 자료 수정');
  await controller.save();
  assert.equal(controller.getSnapshot().conflict, false);
  assert.equal((await store.load('key'))!.data.site.profile.displayName, '기존 자료 수정');
  await store.close();
});
test('편집 화면 이동만으로 콘텐츠 dirty나 revision을 올리지 않는다', async () => {
  const store = new WorkspaceStore(new IDBFactory(), 'metadata');
  const controller = new WorkspaceController(store, 'key');
  await controller.initialize();
  await controller.save();
  const revision = controller.getSnapshot().session.revision;
  controller.rememberEditor('export');
  assert.equal(controller.getSnapshot().session.revision, revision);
  assert.equal(controller.dirty(), false);
  await controller.save();
  assert.equal((await store.load('key'))!.metadata.editorState.screen, 'export');
  await store.close();
});
test('이미지의 픽셀 한도는 브라우저 검사에도 적용한다', async () => {
  assert.equal(MAX_IMAGE_PIXELS, 40_000_000);
  await inspectImage(pngBlob(), async () => ({ width: 10000, height: 4000 }));
  await assert.rejects(
    inspectImage(pngBlob(), async () => ({ width: 10000, height: 4001 })),
    /4천만 픽셀/,
  );
});
