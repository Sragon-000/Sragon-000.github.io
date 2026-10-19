import type { Asset, Issue } from '../domain/types';
import { createProject } from '../domain/create';
import {
  fieldValue,
  setField,
  sameTarget,
  inputValue,
  removeIndexedInputs,
  type FieldTarget,
  type InputKind,
} from '../domain/edit';
import { normalizeYouTube } from '../domain/media';
import { validatePortfolio } from '../domain/validate';
import { cloneSession, type WorkspaceSession } from '../packages/types';

export type ImageTarget = 'avatar' | 'logo' | 'favicon' | 'cover' | 'screenshot';
export type GraphItem = 'group' | 'node' | 'edge';
export type EditCommand =
  | { type: 'field'; target: FieldTarget; raw: string; kind: InputKind }
  | { type: 'choice'; target: FieldTarget; value: unknown }
  | { type: 'video'; projectId: string; raw: string }
  | { type: 'project-add' }
  | { type: 'project-remove'; projectId: string }
  | { type: 'project-move'; projectId: string; direction: -1 | 1 }
  | { type: 'ongoing'; projectId: string; value: boolean }
  | { type: 'pending-remove'; target: FieldTarget }
  | { type: 'case-add'; projectId: string }
  | { type: 'case-remove'; projectId: string; id: string }
  | { type: 'image-add'; target: ImageTarget; projectId?: string; asset: Asset; blob: Blob }
  | { type: 'image-remove'; target: ImageTarget; projectId?: string; assetId?: string }
  | { type: 'graph-add'; projectId: string; kind: GraphItem | 'graph' }
  | { type: 'graph-remove'; projectId: string; kind: GraphItem; id: string }
  | { type: 'restore'; snapshot: WorkspaceSession };
export interface EditResult {
  session: WorkspaceSession | null;
  status?: string;
  issues: Issue[];
  deletion?: boolean;
  projectId?: string;
}
const unchanged = (): EditResult => ({ session: null, issues: [] });
function unverify(session: WorkspaceSession, target: FieldTarget) {
  if (['graph', 'group', 'node', 'edge'].includes(target.scope) && target.path !== '/verified') {
    const graph = session.data.architectures.find((graph) => graph.projectId === target.projectId);
    if (graph) graph.verified = false;
  }
}
function editField(
  input: WorkspaceSession,
  session: WorkspaceSession,
  command: Extract<EditCommand, { type: 'field' }>,
): EditResult {
  const { target, raw, kind } = command;
  if (fieldValue(session.data, target) === undefined) return unchanged();
  let issues: Issue[] = [];
  try {
    if (!setField(session.data, target, inputValue(raw, kind, fieldValue(session.data, target))))
      return unchanged();
    const result = validatePortfolio(session.data);
    if (!result.valid) issues = result.issues;
  } catch (error) {
    issues = [
      {
        code: 'INPUT',
        severity: 'error',
        path: target.path,
        message: error instanceof Error ? error.message : '입력을 확인해 주세요.',
      },
    ];
  }
  session.metadata.pendingInputs = session.metadata.pendingInputs.filter(
    (input) => !sameTarget(input, target),
  );
  if (issues.length) {
    session.data = structuredClone(input.data);
    session.metadata.pendingInputs.push({ ...target, rawValue: raw });
  } else unverify(session, target);
  return {
    session,
    issues,
    status: issues.length
      ? '유효하지 않은 입력은 원문으로 보관했습니다. 마지막 유효 자료를 유지합니다.'
      : '변경 사항이 있습니다. 저장하거나 미리 볼 수 있습니다.',
  };
}

/** Editing rules clone the input and never save, publish or advance revision. New IDs use UUIDs. */
export function editWorkspace(input: WorkspaceSession, command: EditCommand): EditResult {
  const session = cloneSession(command.type === 'restore' ? command.snapshot : input);
  if (command.type === 'field') return editField(input, session, command);
  let status = '';
  let deletion = false;
  let projectId: string | undefined;
  const project =
    'projectId' in command
      ? session.data.projects.find((project) => project.id === command.projectId)
      : undefined;
  switch (command.type) {
    case 'choice':
      if (!setField(session.data, command.target, command.value)) return unchanged();
      unverify(session, command.target);
      session.metadata.pendingInputs = session.metadata.pendingInputs.filter(
        (input) => !sameTarget(input, command.target),
      );
      status = '선택을 변경했습니다. 아직 저장하지 않은 변경 사항입니다.';
      break;
    case 'video': {
      if (!project) return unchanged();
      const id = normalizeYouTube(command.raw);
      const path = '/media/video';
      session.metadata.pendingInputs = session.metadata.pendingInputs.filter(
        (input) =>
          !(
            input.scope === 'project' &&
            input.projectId === command.projectId &&
            input.path === path
          ),
      );
      if (!command.raw.trim()) project.media.video = null;
      else if (id)
        project.media.video = {
          provider: 'youtube',
          videoId: id,
          title: project.media.video?.title ?? '플레이 영상',
        };
      else
        session.metadata.pendingInputs.push({
          scope: 'project',
          projectId: command.projectId,
          entityId: null,
          path,
          rawValue: command.raw,
        });
      return {
        session,
        issues:
          id || !command.raw.trim()
            ? []
            : [
                {
                  code: 'YOUTUBE_INPUT',
                  severity: 'error',
                  path,
                  message:
                    'YouTube 영상 ID 또는 watch·youtu.be·shorts·live·embed 주소를 입력해 주세요.',
                  target: { projectId: command.projectId },
                },
              ],
        status: id
          ? '영상 주소를 정리했습니다. 실제 재생은 미리보기에서 확인해 주세요.'
          : '영상 입력을 변경했습니다. 아직 저장하지 않은 변경 사항입니다.',
      };
    }
    case 'project-add': {
      const added = createProject(session.data.projects);
      session.data.projects.push(added);
      session.data.site.exhibition.projectOrder.push(added.id);
      session.metadata.editorState = { screen: 'projects', projectId: added.id };
      projectId = added.id;
      status = '새 작품 초안을 추가했습니다.';
      break;
    }
    case 'project-remove':
      session.data.projects = session.data.projects.filter(
        (project) => project.id !== command.projectId,
      );
      session.data.architectures = session.data.architectures.filter(
        (graph) => graph.projectId !== command.projectId,
      );
      session.data.site.exhibition.projectOrder = session.data.site.exhibition.projectOrder.filter(
        (id) => id !== command.projectId,
      );
      session.metadata.pendingInputs = session.metadata.pendingInputs.filter(
        (input) => input.projectId !== command.projectId,
      );
      if (session.metadata.editorState.projectId === command.projectId)
        session.metadata.editorState.projectId = null;
      deletion = true;
      status =
        '작품과 해당 개발 기록·구조 입력을 초안에서 삭제했습니다. 이미지는 보관했습니다. 바로 되돌릴 수 있습니다.';
      break;
    case 'project-move': {
      const order = session.data.site.exhibition.projectOrder;
      const index = order.indexOf(command.projectId);
      const other = index + command.direction;
      if (index < 0 || other < 0 || other >= order.length) return unchanged();
      [order[index], order[other]] = [order[other]!, order[index]!];
      status = '전시 순서를 변경했습니다.';
      break;
    }
    case 'ongoing':
      if (!project) return unchanged();
      project.period.ongoing = command.value;
      if (command.value) project.period.end = null;
      status = '진행 상태를 변경했습니다. 진행 중인 작품은 종료 월을 비웁니다.';
      break;
    case 'pending-remove':
      session.metadata.pendingInputs = session.metadata.pendingInputs.filter(
        (input) => !sameTarget(input, command.target),
      );
      deletion = true;
      status = '선택한 입력 원문을 제거했습니다. 바로 되돌릴 수 있습니다.';
      break;
    case 'case-add':
      if (!project) return unchanged();
      session.metadata.pendingInputs = session.metadata.pendingInputs.map((input) => {
        if (input.scope !== 'project' || input.projectId !== command.projectId) return input;
        const match = /^\/caseStudies\/(0|[1-9]\d*)(\/.*)$/.exec(input.path);
        return match && Number(match[1]) >= project.caseStudies.length
          ? { ...input, path: `/unresolvedCaseStudies/${match[1]}${match[2]}` }
          : input;
      });
      project.caseStudies.push({
        id: `case-${crypto.randomUUID()}`,
        title: '',
        problem: '',
        alternatives: [],
        solution: '',
        outcome: '',
        evidence: [],
      });
      status = '개발 사례를 추가했습니다.';
      break;
    case 'case-remove': {
      if (!project) return unchanged();
      const index = project.caseStudies.findIndex((study) => study.id === command.id);
      if (index < 0) return unchanged();
      project.caseStudies.splice(index, 1);
      session.data.architectures
        .filter((graph) => graph.projectId === command.projectId)
        .forEach((graph) => {
          graph.nodes.forEach((node) => {
            node.relatedCaseIds = node.relatedCaseIds.filter((id) => id !== command.id);
          });
          graph.verified = false;
        });
      session.metadata.pendingInputs = removeIndexedInputs(
        session.metadata.pendingInputs,
        'project',
        command.projectId,
        'caseStudies',
        index,
      );
      deletion = true;
      status = '개발 사례와 시스템의 사례 연결을 삭제했습니다. 바로 되돌릴 수 있습니다.';
      break;
    }
    case 'image-add':
      if (['cover', 'screenshot'].includes(command.target) && !project)
        throw Error('이미지를 연결할 작품이 없습니다.');
      session.data.assets.push(structuredClone(command.asset));
      session.assets.set(command.asset.id, command.blob);
      if (command.target === 'avatar') session.data.site.profile.avatarAssetId = command.asset.id;
      else if (command.target === 'logo') session.data.site.theme.logoAssetId = command.asset.id;
      else if (command.target === 'favicon')
        session.data.site.theme.faviconAssetId = command.asset.id;
      else if (command.target === 'cover') project!.media.coverAssetId = command.asset.id;
      else project!.media.screenshotAssetIds.push(command.asset.id);
      status = '이미지를 등록했습니다. 교체 전 파일도 백업에는 보관됩니다.';
      break;
    case 'image-remove':
      if (command.target === 'avatar') session.data.site.profile.avatarAssetId = null;
      else if (command.target === 'logo') session.data.site.theme.logoAssetId = null;
      else if (command.target === 'favicon') session.data.site.theme.faviconAssetId = null;
      else if (command.target === 'cover' && project) project.media.coverAssetId = null;
      else if (command.target === 'screenshot' && project)
        project.media.screenshotAssetIds = project.media.screenshotAssetIds.filter(
          (id) => id !== command.assetId,
        );
      status = '이미지 연결을 해제했습니다. 파일은 전체 백업에 보관됩니다.';
      break;
    case 'graph-add': {
      if (!project) return unchanged();
      let graph = session.data.architectures.find((graph) => graph.projectId === command.projectId);
      if (!graph) {
        graph = {
          projectId: command.projectId,
          verified: false,
          revision: { label: null, reviewedAt: null, sources: [] },
          groups: [],
          nodes: [],
          edges: [],
        };
        session.data.architectures.push(graph);
      }
      const id = `${command.kind}-${crypto.randomUUID()}`;
      if (command.kind === 'group') graph.groups.push({ id, label: '새 그룹', layer: 0 });
      if (command.kind === 'node')
        graph.nodes.push({
          id,
          label: '',
          groupId: null,
          parentId: null,
          responsibility: '',
          inputs: [],
          outputs: [],
          decisions: '',
          contributionType: 'unknown',
          contributionNote: '',
          relatedCaseIds: [],
          codeRefs: [],
        });
      if (command.kind === 'edge') {
        if (graph.nodes.length < 2)
          return { ...unchanged(), status: '연결을 만들려면 시스템을 2개 이상 등록해 주세요.' };
        graph.edges.push({
          id,
          source: graph.nodes[0]!.id,
          target: graph.nodes[1]!.id,
          type: 'dependency',
          label: '',
          description: '',
        });
      }
      graph.verified = false;
      status = '구조 초안을 추가했습니다. 실제 프로젝트에 맞게 내용을 입력해 주세요.';
      break;
    }
    case 'graph-remove': {
      const graph = session.data.architectures.find(
        (graph) => graph.projectId === command.projectId,
      );
      if (!graph) return unchanged();
      const removed = graph.edges
        .filter(
          (edge) =>
            command.kind === 'node' && (edge.source === command.id || edge.target === command.id),
        )
        .map((edge) => edge.id);
      if (command.kind === 'group') {
        graph.groups = graph.groups.filter((group) => group.id !== command.id);
        graph.nodes.forEach((node) => {
          if (node.groupId === command.id) node.groupId = null;
        });
      }
      if (command.kind === 'node') {
        graph.nodes = graph.nodes.filter((node) => node.id !== command.id);
        graph.edges = graph.edges.filter((edge) => !removed.includes(edge.id));
        graph.nodes.forEach((node) => {
          if (node.parentId === command.id) node.parentId = null;
        });
      }
      if (command.kind === 'edge')
        graph.edges = graph.edges.filter((edge) => edge.id !== command.id);
      graph.verified = false;
      session.metadata.pendingInputs = session.metadata.pendingInputs.filter(
        (input) =>
          !(
            input.projectId === command.projectId &&
            ((input.scope === command.kind && input.entityId === command.id) ||
              (input.scope === 'edge' && removed.includes(input.entityId ?? '')))
          ),
      );
      deletion = true;
      status = '항목과 연결 참조를 정리했습니다. 바로 되돌릴 수 있습니다.';
      break;
    }
    case 'restore':
      status = '직전 삭제를 되돌렸습니다. 저장하거나 미리 볼 수 있습니다.';
      break;
    default:
      return unsupportedCommand(command);
  }
  const valid = validatePortfolio(session.data);
  return valid.valid
    ? { session, status, issues: [], deletion, projectId }
    : {
        session: null,
        status: '수정 내용을 반영할 수 없습니다. 입력과 참조를 확인해 주세요.',
        issues: valid.issues,
      };
}

function unsupportedCommand(_command: never): never {
  throw new Error('지원하지 않는 편집 명령입니다.');
}
