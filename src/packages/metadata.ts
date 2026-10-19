import type { Portfolio, Issue } from '../domain/types';
import { ContentError, fail, type BackupMetadata } from './types';
import backupCheck from './backup-validator';
export { readManifest } from './manifest';

export function readMetadata(
  input: unknown,
  data: Portfolio,
): { metadata: BackupMetadata; issues: Issue[] } {
  if (!backupCheck(input))
    throw new ContentError(
      (backupCheck.errors ?? []).map((error) => ({
        code: 'BACKUP_SCHEMA',
        severity: 'error',
        path: `/backup${error.instancePath}`,
        message: '백업 버전과 편집 상태의 형식을 확인해 주세요.',
      })),
    );
  const issues: Issue[] = [];
  const keys = new Set<string>();
  input.pendingInputs.forEach((pending, index) => {
    const p = `/backup/pendingInputs/${index}`;
    if (
      (pending.scope === 'site' && (pending.projectId !== null || pending.entityId !== null)) ||
      (['project', 'graph'].includes(pending.scope) &&
        (!pending.projectId || pending.entityId !== null)) ||
      (['group', 'node', 'edge'].includes(pending.scope) &&
        (!pending.projectId || !pending.entityId))
    )
      fail('PENDING_TARGET', '입력 원문의 대상 ID 구성이 맞지 않습니다.', p);
    const key = JSON.stringify([pending.scope, pending.projectId, pending.entityId, pending.path]);
    if (keys.has(key)) fail('PENDING_DUPLICATE', '같은 필드에 입력 원문이 중복되어 있습니다.', p);
    keys.add(key);
    const project = data.projects.find((project) => project.id === pending.projectId);
    const graph = data.architectures.find((graph) => graph.projectId === pending.projectId);
    let target: unknown;
    switch (pending.scope) {
      case 'site':
        target = data.site;
        break;
      case 'project':
        target = project;
        break;
      case 'graph':
        target = graph;
        break;
      case 'group':
        target = graph?.groups.find((group) => group.id === pending.entityId);
        break;
      case 'node':
        target = graph?.nodes.find((node) => node.id === pending.entityId);
        break;
      case 'edge':
        target = graph?.edges.find((edge) => edge.id === pending.entityId);
        break;
    }
    for (const key of pending.path.slice(1).split('/')) {
      if (!target || typeof target !== 'object' || !Object.hasOwn(target, key)) {
        target = undefined;
        break;
      }
      target = (target as Record<string, unknown>)[key];
    }
    if (target === undefined)
      issues.push({
        code: 'ORPHAN_INPUT',
        severity: 'notice',
        path: p,
        message: '대상이 없는 입력 원문을 보존했습니다. 다른 필드에 자동 적용하지 않습니다.',
      });
  });
  if (
    input.editorState.projectId &&
    !data.projects.some((project) => project.id === input.editorState.projectId)
  )
    issues.push({
      code: 'ORPHAN_EDITOR',
      severity: 'notice',
      path: '/backup/editorState/projectId',
      message: '이전에 편집하던 작품이 없습니다. 작품 목록에서 다시 선택해 주세요.',
    });
  return { metadata: input, issues };
}
