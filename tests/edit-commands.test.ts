import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editWorkspace } from '../src/storage/edit-commands';
import { cloneSession } from '../src/packages/types';
import { packageSession } from './package-fixtures';

test('편집 명령은 원본 데이터·원문·이미지 맵과 저장 revision을 변경하지 않는다', () => {
  const input = packageSession();
  const before = cloneSession(input);
  const result = editWorkspace(input, {
    type: 'project-remove',
    projectId: input.data.projects[0]!.id,
  });
  assert.ok(result.session);
  assert.equal(result.deletion, true);
  assert.equal(result.session.data.projects.length, input.data.projects.length - 1);
  assert.equal(result.session.revision, input.revision);
  assert.deepEqual(input.data, before.data);
  assert.deepEqual(input.metadata, before.metadata);
  result.session.assets.delete('cover');
  assert.equal(input.assets.has('cover'), true);
});

test('입력 실패 명령은 원본을 보존하고 결과에만 원문과 오류를 담는다', () => {
  const input = packageSession();
  const before = cloneSession(input);
  const result = editWorkspace(input, {
    type: 'field',
    target: {
      scope: 'project',
      projectId: input.data.projects[0]!.id,
      entityId: null,
      path: '/teamSize',
    },
    raw: '1.5',
    kind: 'integer',
  });
  assert.ok(result.session);
  assert.equal(result.issues.length, 1);
  assert.equal(result.session.metadata.pendingInputs[0]!.rawValue, '1.5');
  assert.deepEqual(result.session.data, before.data);
  assert.deepEqual(input.metadata, before.metadata);
});
