import type { Issue, PublicPortfolio } from './types';
import { referencedAssetIds, validatePortfolio, validatePublicContent } from './validate';

export type PublicPreparation =
  { ok: true; data: PublicPortfolio; issues: Issue[] } | { ok: false; issues: Issue[] };

/** Selects JSON content only; file bytes and ZIP validation are a separate stage. */
export function preparePublicContent(input: unknown): PublicPreparation {
  const validated = validatePortfolio(input);
  if (!validated.valid) return { ok: false, issues: validated.issues };
  if (validated.data.kind === 'example')
    return {
      ok: false,
      issues: [
        {
          code: 'EXAMPLE',
          severity: 'error',
          path: '/kind',
          message: '기획 예시는 실제 작품으로 공개할 수 없습니다.',
        },
      ],
    };
  const data = structuredClone(validated.data) as PublicPortfolio;
  const issues = [...validated.issues];
  data.kind = 'public';
  data.projects = data.projects.filter((project) => project.status === 'published');
  const ids = new Set(data.projects.map((project) => project.id));
  data.site.exhibition.projectOrder = data.site.exhibition.projectOrder.filter((id) => ids.has(id));
  data.architectures = data.architectures.filter((graph, index) => {
    if (!ids.has(graph.projectId)) return false;
    if (!graph.verified)
      issues.push({
        code: 'UNVERIFIED_GRAPH',
        severity: 'notice',
        path: `/architectures/${index}`,
        message: '미확인 그래프는 공개 자료에서 제외했습니다.',
        target: { projectId: graph.projectId },
      });
    return graph.verified;
  });
  const reachable = referencedAssetIds(data);
  data.assets = data.assets.filter((asset) => reachable.has(asset.id));
  const final = validatePublicContent(data);
  if (!final.valid) return { ok: false, issues: [...issues, ...final.issues] };
  if (!data.projects.length)
    issues.push({
      code: 'EMPTY_PUBLIC',
      severity: 'notice',
      path: '/projects',
      message: '공개 작품이 없는 빈 전시장입니다.',
    });
  data.projects.forEach((project, index) => {
    const target = { projectId: project.id };
    if (!project.media.video)
      issues.push({
        code: 'NO_VIDEO',
        severity: 'notice',
        path: `/projects/${index}/media/video`,
        message: '이 작품에는 플레이 영상이 등록되지 않았습니다.',
        target,
      });
    if (!data.architectures.some((graph) => graph.projectId === project.id))
      issues.push({
        code: 'NO_GRAPH',
        severity: 'notice',
        path: `/projects/${index}`,
        message: '이 작품에는 공개할 아키텍처가 없습니다.',
        target,
      });
  });
  return { ok: true, data, issues };
}
