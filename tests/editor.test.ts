import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WorkspaceController } from '../src/storage/controller';
import { WorkspaceStore } from '../src/storage/workspaces';
import { fieldValue, setField, type FieldTarget } from '../src/domain/edit';
import { validatePortfolio } from '../src/domain/validate';
import { readPortfolioPackage } from '../src/packages/portfolio-package';
import { newSession } from '../src/storage/workspaces';
import { packageSession, pngBlob, decodePng } from './package-fixtures';
const target = (
  projectId: string | null,
  path: string,
  scope: FieldTarget['scope'] = projectId ? 'project' : 'site',
  entityId: string | null = null,
): FieldTarget => ({ projectId, path, scope, entityId });
async function editor(blank = false) {
  const initial = blank ? newSession() : packageSession();
  const controller = new WorkspaceController(
    {
      load: async () => initial,
      save: async (_key, session) => ({
        token: 'test-token',
        revision: session.revision,
        savedAt: '2026-10-07T03:00:00.000Z',
      }),
    },
    'editor',
    decodePng,
  );
  await controller.initialize();
  return controller;
}
test('빈 전시장부터 작품 추가·이름 변경·순서·공개 선택은 고정 ID와 유효 자료를 유지한다', async () => {
  const c = await editor(true);
  const first = c.addProject()!;
  const second = c.addProject()!;
  c.edit(target(first, '/title'), '첫 작품');
  c.edit(target(first, '/summary'), '소개');
  c.edit(target(second, '/title'), '다른 작품');
  c.choose(target(first, '/status'), 'published');
  c.moveProject(second, -1);
  const data = c.getSnapshot().session.data;
  assert.deepEqual(data.site.exhibition.projectOrder, [second, first]);
  assert.equal(data.projects[0]!.id, first);
  assert.equal(data.projects[0]!.slug, first);
  assert.equal(data.projects[0]!.status, 'published');
  assert.ok(validatePortfolio(data).valid);
});
test('이름·주소·숫자·기간·링크 오류의 원문을 보존하고 다른 유효 필드를 편집할 수 있다', async () => {
  const c = await editor();
  const id = c.getSnapshot().session.data.projects[0]!.id;
  const prior = structuredClone(c.getSnapshot().session.data.projects[0]!);
  c.edit(target(id, '/slug'), 'bad slug');
  c.edit(target(id, '/teamSize'), '0', 'integer');
  c.edit(target(id, '/links'), '코드 | javascript:alert(1)', 'links');
  c.edit(target(id, '/title'), '새 이름');
  const s = c.getSnapshot().session;
  assert.equal(s.metadata.pendingInputs.length, 3);
  assert.equal(s.data.projects[0]!.slug, prior.slug);
  assert.equal(s.data.projects[0]!.teamSize, prior.teamSize);
  assert.equal(s.data.projects[0]!.title, '새 이름');
  c.edit(target(id, '/teamSize'), '2', 'integer');
  assert.equal(c.getSnapshot().session.metadata.pendingInputs.length, 2);
  c.edit(target(id, '/period/start'), '2026-06', 'optional');
  c.edit(target(id, '/period/end'), '2026-04', 'optional');
  assert.equal(c.getSnapshot().session.data.projects[0]!.period.end, null);
  assert.ok(
    c.getSnapshot().session.metadata.pendingInputs.some((input) => input.path === '/period/end'),
  );
});
test('작품 삭제는 해당 그래프·원문·순서를 정리하고 이미지는 남기며 직후 되돌릴 수 있다', async () => {
  const c = await editor();
  const id = c.getSnapshot().session.data.projects[0]!.id;
  c.addGraphItem(id, 'node');
  c.edit(target(id, '/slug'), '잘못된 주소');
  const previous = structuredClone(c.getSnapshot().session.data);
  c.removeProject(id);
  const s = c.getSnapshot();
  assert.ok(s.canUndo);
  assert.equal(s.session.data.projects.length, 2);
  assert.equal(s.session.data.architectures.length, 0);
  assert.equal(s.session.metadata.pendingInputs.length, 0);
  assert.equal(s.session.assets.size, 3);
  c.undoDelete();
  assert.deepEqual(c.getSnapshot().session.data, previous);
  assert.equal(c.getSnapshot().session.metadata.pendingInputs.length, 1);
  assert.ok(!c.getSnapshot().canUndo);
});
test('삭제 후 다른 편집은 한 단계 되돌리기를 종료한다', async () => {
  const c = await editor();
  c.removeProject(c.getSnapshot().session.data.projects[0]!.id);
  c.edit(target(null, '/profile/bio'), '다음 편집');
  c.undoDelete();
  assert.equal(c.getSnapshot().session.data.projects.length, 2);
  assert.equal(c.getSnapshot().session.data.site.profile.bio, '다음 편집');
});
test('사례 삭제 후 인덱스가 바뀌어도 원문이 다른 사례로 이동하지 않는다', async () => {
  const c = await editor();
  const id = c.getSnapshot().session.data.projects[0]!.id;
  c.addCase(id);
  c.addCase(id);
  const cases = c.getSnapshot().session.data.projects[0]!.caseStudies;
  c.edit(target(id, '/caseStudies/0/title'), 'x'.repeat(121));
  c.edit(target(id, '/caseStudies/1/title'), 'y'.repeat(121));
  c.removeCase(id, cases[0]!.id);
  const inputs = c.getSnapshot().session.metadata.pendingInputs;
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0]!.path, '/caseStudies/0/title');
  assert.equal(inputs[0]!.rawValue, 'y'.repeat(121));
  assert.equal(c.getSnapshot().session.data.projects[0]!.caseStudies[0]!.id, cases[1]!.id);
});
test('시스템 삭제는 연결·부모 참조·해당 원문을 정리하고 다른 시스템을 유지한다', async () => {
  const c = await editor();
  const id = c.getSnapshot().session.data.projects[0]!.id;
  c.addGraphItem(id, 'node');
  c.addGraphItem(id, 'node');
  c.addGraphItem(id, 'edge');
  let graph = c.getSnapshot().session.data.architectures[0]!;
  const a = graph.nodes[0]!.id;
  const b = graph.nodes[1]!.id;
  const edge = graph.edges[0]!.id;
  c.choose(target(id, '/parentId', 'node', b), a);
  c.edit(target(id, '/label', 'edge', edge), 'x'.repeat(81));
  c.removeGraphItem(id, 'node', a);
  graph = c.getSnapshot().session.data.architectures[0]!;
  assert.equal(graph.nodes.length, 1);
  assert.equal(graph.nodes[0]!.parentId, null);
  assert.equal(graph.edges.length, 0);
  assert.equal(c.getSnapshot().session.metadata.pendingInputs.length, 0);
  assert.ok(validatePortfolio(c.getSnapshot().session.data).valid);
  c.undoDelete();
  assert.equal(c.getSnapshot().session.data.architectures[0]!.edges.length, 1);
});
test('그룹 삭제와 부모 순환 검사, 구조 수정 후 확인 해제를 적용한다', async () => {
  const c = await editor();
  const id = c.getSnapshot().session.data.projects[0]!.id;
  c.addGraphItem(id, 'node');
  c.addGraphItem(id, 'node');
  c.addGraphItem(id, 'group');
  const graph = c.getSnapshot().session.data.architectures[0]!;
  const a = graph.nodes[0]!.id;
  const b = graph.nodes[1]!.id;
  const group = graph.groups[0]!.id;
  c.choose(target(id, '/parentId', 'node', b), a);
  c.choose(target(id, '/parentId', 'node', a), b);
  assert.equal(c.getSnapshot().session.data.architectures[0]!.nodes[0]!.parentId, null);
  assert.ok(c.getSnapshot().issues.some((issue) => issue.code === 'R06'));
  c.choose(target(id, '/groupId', 'node', a), group);
  c.choose(target(id, '/verified', 'graph'), true);
  c.edit(target(id, '/responsibility', 'node', a), '실제 책임');
  assert.equal(c.getSnapshot().session.data.architectures[0]!.verified, false);
  c.removeGraphItem(id, 'group', group);
  assert.equal(c.getSnapshot().session.data.architectures[0]!.nodes[0]!.groupId, null);
});
test('이미지를 검사한 뒤만 연결하고 잘못된 이미지와 설명은 원본을 바꾸지 않는다', async () => {
  const c = await editor(true);
  const id = c.addProject()!;
  await c.addImage(pngBlob(), '게임 화면', 'cover', id);
  await c.addImage(pngBlob(), '전투 화면', 'screenshot', id);
  const before = c.getSnapshot().session;
  await c.addImage(new Blob(['bad image']), '설명', 'cover', id);
  assert.equal(
    c.getSnapshot().session.data.projects[0]!.media.coverAssetId,
    before.data.projects[0]!.media.coverAssetId,
  );
  assert.equal(c.getSnapshot().session.assets.size, 2);
  await c.addImage(pngBlob(), '', 'avatar');
  assert.equal(c.getSnapshot().session.assets.size, 2);
  c.removeImageRef('cover', id);
  assert.equal(c.getSnapshot().session.data.projects[0]!.media.coverAssetId, null);
  assert.equal(c.getSnapshot().session.assets.size, 2);
});
test('초안 순서 변경은 원문을 작품 ID에 유지하고 공개 내보내기는 오류·선별을 적용한다', async () => {
  const c = await editor();
  const id = c.getSnapshot().session.data.projects[0]!.id;
  c.edit(target(id, '/slug'), 'bad value');
  c.moveProject(id, 1);
  assert.equal(c.getSnapshot().session.metadata.pendingInputs[0]!.projectId, id);
  assert.equal(await c.export('public'), null);
  c.edit(target(id, '/slug'), 'correct-slug');
  const blob = await c.export('public');
  assert.ok(blob);
  const restored = await readPortfolioPackage(blob, decodePng);
  assert.equal(restored.session.data.projects.length, 1);
  assert.equal(restored.session.assets.size, 1);
});
test('편집한 작품·사례·파일·원문은 실제 IndexedDB와 백업에서 왕복한다', async () => {
  const store = new WorkspaceStore(new IDBFactory(), 'editor-roundtrip', decodePng);
  const c = new WorkspaceController(store, 'key', decodePng);
  await c.initialize();
  const id = c.addProject()!;
  c.edit(target(id, '/title'), '검증 작품');
  c.addCase(id);
  c.edit(target(id, '/caseStudies/0/title'), '사례');
  c.edit(target(id, '/teamSize'), '1.5', 'integer');
  await c.addImage(pngBlob(), '실제 PNG', 'screenshot', id);
  c.rememberEditor('projects', id);
  await c.save();
  const loaded = await store.load('key');
  assert.equal(loaded?.data.projects[0]!.title, '검증 작품');
  assert.equal(loaded?.metadata.pendingInputs[0]!.rawValue, '1.5');
  assert.equal(loaded?.metadata.editorState.projectId, id);
  assert.equal(loaded?.assets.size, 1);
  const backup = await c.export('backup');
  assert.ok(backup);
  const imported = await readPortfolioPackage(backup, decodePng);
  assert.deepEqual(imported.session.data, loaded!.data);
  assert.deepEqual(imported.session.metadata.pendingInputs, loaded!.metadata.pendingInputs);
  await store.close();
});
test('편집 필드 경로는 보호된 ID·없는 대상·prototype 경로를 수정할 수 없다', async () => {
  const c = await editor();
  const data = c.getSnapshot().session.data;
  const id = data.projects[0]!.id;
  assert.equal(setField(data, target(id, '/id'), 'different'), false);
  assert.equal(setField(data, target(id, '/__proto__/value'), 'bad'), false);
  assert.equal(fieldValue(data, target('missing', '/title')), undefined);
  c.edit(target(id, '/id'), 'different');
  assert.equal(c.getSnapshot().session.data.projects[0]!.id, id);
});
test('대상이 없는 사례 원문은 새 사례나 인덱스 이동에 붙지 않고 미정리 입력으로 보존한다', async () => {
  const initial = packageSession();
  const id = initial.data.projects[0]!.id;
  initial.metadata.pendingInputs = [
    {
      scope: 'project',
      projectId: id,
      entityId: null,
      path: '/caseStudies/0/title',
      rawValue: '과거 대상 없는 원문',
    },
    {
      scope: 'project',
      projectId: id,
      entityId: null,
      path: '/caseStudies/01/title',
      rawValue: '잘못된 인덱스 원문',
    },
  ];
  const c = new WorkspaceController(
    {
      load: async () => initial,
      save: async (_key, s) => ({
        token: 'test-token',
        revision: s.revision,
        savedAt: '2026-10-07T03:00:00.000Z',
      }),
    },
    'orphan',
    decodePng,
  );
  await c.initialize();
  c.addCase(id);
  assert.equal(c.getSnapshot().session.data.projects[0]!.caseStudies[0]!.title, '');
  assert.equal(
    c.getSnapshot().session.metadata.pendingInputs[0]!.path,
    '/unresolvedCaseStudies/0/title',
  );
  c.addCase(id);
  c.removeCase(id, c.getSnapshot().session.data.projects[0]!.caseStudies[0]!.id);
  assert.ok(
    c
      .getSnapshot()
      .session.metadata.pendingInputs.some((input) => input.path === '/caseStudies/01/title'),
  );
  assert.equal(c.getSnapshot().session.metadata.pendingInputs.length, 2);
});
test('정확히 표현할 수 없는 정수는 반올림하지 않고 원문으로 보존한다', async () => {
  const c = await editor();
  const id = c.getSnapshot().session.data.projects[0]!.id;
  const before = c.getSnapshot().session.data.projects[0]!.teamSize;
  c.edit(target(id, '/teamSize'), '9007199254740993', 'integer');
  assert.equal(c.getSnapshot().session.data.projects[0]!.teamSize, before);
  assert.equal(c.getSnapshot().session.metadata.pendingInputs[0]!.rawValue, '9007199254740993');
});
