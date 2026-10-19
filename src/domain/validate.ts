import type { Issue, Portfolio, ValidationResult } from './types';
import check from './schema-validator';

const escape = (value: string) => value.replaceAll('~', '~0').replaceAll('/', '~1');

export function validateStructure(input: unknown): ValidationResult {
  if (check(input)) return { valid: true, data: input, issues: [] };
  const issues: Issue[] = (check.errors ?? [])
    .filter((error) => error.keyword !== 'if')
    .map((error) => {
      const property =
        error.keyword === 'required'
          ? (error.params.missingProperty as string)
          : error.keyword === 'additionalProperties'
            ? (error.params.additionalProperty as string)
            : null;
      const path = error.instancePath + (property ? `/${escape(property)}` : '');
      const target = targetForPath(input, path);
      return {
        code: 'SCHEMA',
        severity: 'error',
        path,
        ...(target ? { target } : {}),
        message: schemaMessage(error.keyword, error.params),
      };
    });
  return { valid: false, issues };
}

function schemaMessage(keyword: string, params: Record<string, unknown>): string {
  switch (keyword) {
    case 'required':
      return '필수 항목이 없습니다.';
    case 'additionalProperties':
      return '현재 자료 형식에서 지원하지 않는 항목입니다.';
    case 'maxLength':
      return `최대 ${params.limit}자까지 입력할 수 있습니다.`;
    case 'minLength':
      return '내용을 입력해 주세요.';
    case 'pattern':
      return '입력 형식이 맞지 않거나 공백만 입력되어 있습니다.';
    case 'format':
      return `${params.format === 'date' ? '날짜' : '주소'} 형식을 확인해 주세요.`;
    case 'type':
      return `자료 타입이 맞지 않습니다. 필요한 타입: ${params.type}`;
    case 'const':
    case 'enum':
      return '지원하는 값과 자료 버전을 확인해 주세요.';
    case 'uniqueItems':
      return '같은 항목을 중복해서 넣을 수 없습니다.';
    case 'minItems':
      return `항목이 최소 ${params.limit}개 필요합니다.`;
    case 'minimum':
    case 'maximum':
      return '허용되는 숫자 범위를 확인해 주세요.';
    default:
      return '자료 형식을 확인해 주세요.';
  }
}

/** Pure semantic validation. Call only after validateStructure has succeeded. */
export function validateRelations(data: Portfolio): Issue[] {
  const issues: Issue[] = [];
  const error = (code: string, path: string, message: string, target?: Issue['target']) => {
    const resolved = target ?? targetForPath(data, path);
    issues.push({
      code,
      severity: 'error',
      path,
      message,
      ...(resolved ? { target: resolved } : {}),
    });
  };
  const unique = (
    values: string[],
    code: string,
    path: string,
    field?: string,
    target?: Issue['target'],
  ) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value))
        error(
          code,
          `${path}/${index}${field ? `/${field}` : ''}`,
          `중복된 ${field ?? '항목'}입니다: ${value}`,
          target,
        );
      seen.add(value);
    });
  };
  unique(
    data.projects.map((project) => project.id),
    'R01',
    '/projects',
    'id',
  );
  unique(
    data.projects.map((project) => project.slug),
    'R01',
    '/projects',
    'slug',
  );
  const projects = new Map(data.projects.map((project) => [project.id, project]));
  const order = data.site.exhibition.projectOrder;
  if (
    order.length !== data.projects.length ||
    new Set(order).size !== order.length ||
    order.some((id) => !projects.has(id)) ||
    data.projects.some((project) => !order.includes(project.id))
  ) {
    error(
      'R02',
      '/site/exhibition/projectOrder',
      '전시 순서는 모든 작품 ID를 정확히 한 번 포함해야 합니다.',
    );
  }
  unique(
    data.architectures.map((graph) => graph.projectId),
    'R03',
    '/architectures',
    'projectId',
  );
  data.architectures.forEach((graph, gi) => {
    const path = `/architectures/${gi}`;
    const target = { projectId: graph.projectId };
    if (!projects.has(graph.projectId))
      error('R03', `${path}/projectId`, '그래프에 연결한 작품이 없습니다.', target);
    for (const field of ['groups', 'nodes', 'edges'] as const) {
      unique(
        graph[field].map((item) => item.id),
        'R04',
        `${path}/${field}`,
        'id',
        target,
      );
    }
    const groups = new Set(graph.groups.map((group) => group.id));
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const cases = new Set(projects.get(graph.projectId)?.caseStudies.map((study) => study.id));
    graph.nodes.forEach((node, ni) => {
      const np = `${path}/nodes/${ni}`;
      const nt = { ...target, entityId: node.id };
      if (node.groupId !== null && !groups.has(node.groupId))
        error('R05', `${np}/groupId`, '해당 그래프에 그룹이 없습니다.', nt);
      if (node.parentId !== null && !nodes.has(node.parentId))
        error('R05', `${np}/parentId`, '해당 그래프에 부모 시스템이 없습니다.', nt);
      node.relatedCaseIds.forEach((id, ci) => {
        if (!cases.has(id))
          error(
            'R08',
            `${np}/relatedCaseIds/${ci}`,
            '해당 작품에 연결한 개발 사례가 없습니다.',
            nt,
          );
      });
      if (
        data.kind === 'public' &&
        (node.contributionType === 'direct' || node.contributionType === 'shared') &&
        !node.contributionNote.trim()
      ) {
        error('R13', `${np}/contributionNote`, '직접 또는 공동 구현한 내용을 설명해 주세요.', nt);
      }
    });
    // Parent links are a hierarchy; ordinary edges may legitimately form cycles.
    const finished = new Set<string>();
    const indexes = new Map(graph.nodes.map((node, index) => [node.id, index]));
    for (const node of graph.nodes) {
      const trail = new Set<string>();
      let cursor: string | null = node.id;
      while (cursor !== null && nodes.has(cursor) && !finished.has(cursor)) {
        if (trail.has(cursor)) {
          error(
            'R06',
            `${path}/nodes/${indexes.get(cursor)}/parentId`,
            '부모 관계에 자기 참조 또는 순환이 있습니다.',
            { ...target, entityId: cursor },
          );
          break;
        }
        trail.add(cursor);
        cursor = nodes.get(cursor)!.parentId;
      }
      trail.forEach((id) => finished.add(id));
    }
    graph.edges.forEach((edge, ei) => {
      for (const field of ['source', 'target'] as const) {
        if (!nodes.has(edge[field]))
          error('R07', `${path}/edges/${ei}/${field}`, '연결할 시스템이 해당 그래프에 없습니다.', {
            ...target,
            entityId: edge.id,
          });
      }
      if (edge.source === edge.target)
        issues.push({
          code: 'SELF_EDGE',
          severity: 'notice',
          path: `${path}/edges/${ei}`,
          message: '자기 참조 연결선의 의도와 설명을 확인해 주세요.',
          target: { ...target, entityId: edge.id },
        });
    });
    graph.revision.sources.forEach((source, si) => {
      if (source.kind !== 'author' && source.url === null)
        error(
          'R14',
          `${path}/revision/sources/${si}/url`,
          '코드와 문서 근거에는 주소가 필요합니다.',
          target,
        );
      if (source.kind === 'author' && !source.note.trim())
        error(
          'R14',
          `${path}/revision/sources/${si}/note`,
          '작성자의 구조 확인 설명이 필요합니다.',
          target,
        );
    });
  });
  const assets = new Set(data.assets.map((asset) => asset.id));
  const assetRef = (id: string | null, path: string, target?: Issue['target']) => {
    if (id !== null && !assets.has(id))
      error('R09', path, '참조한 이미지가 자산 목록에 없습니다.', target);
  };
  assetRef(data.site.profile.avatarAssetId, '/site/profile/avatarAssetId');
  assetRef(data.site.theme.logoAssetId, '/site/theme/logoAssetId');
  assetRef(data.site.theme.faviconAssetId, '/site/theme/faviconAssetId');
  data.projects.forEach((project, pi) => {
    const path = `/projects/${pi}`;
    const target = { projectId: project.id };
    unique(
      project.caseStudies.map((study) => study.id),
      'R08',
      `${path}/caseStudies`,
      'id',
      target,
    );
    assetRef(project.media.coverAssetId, `${path}/media/coverAssetId`, target);
    project.media.screenshotAssetIds.forEach((id, ai) =>
      assetRef(id, `${path}/media/screenshotAssetIds/${ai}`, target),
    );
    const { start, end, ongoing } = project.period;
    if (start && end && end < start)
      error('R11', `${path}/period/end`, '종료 월은 시작 월보다 빠를 수 없습니다.', target);
    if (ongoing && end !== null)
      error('R11', `${path}/period/end`, '진행 중인 작품의 종료 월은 비워 주세요.', target);
  });
  unique(
    data.assets.map((asset) => asset.id),
    'R10',
    '/assets',
    'id',
  );
  unique(
    data.assets.map((asset) => asset.path),
    'R10',
    '/assets',
    'path',
  );
  const mimeByExt: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    avif: 'image/avif',
  };
  data.assets.forEach((asset, ai) => {
    const ext = asset.path.split('.').at(-1)!;
    if (asset.path !== `assets/${asset.id}.${ext}` || asset.mimeType !== mimeByExt[ext]) {
      error('R10', `/assets/${ai}/path`, '이미지 ID, 파일명과 MIME 형식이 일치해야 합니다.', {
        assetId: asset.id,
      });
    }
  });
  walkUrls(data, '', (url, path) => {
    if (!isHttpsUrl(url))
      error(
        'R12',
        path,
        '인증정보 없이 올바른 HTTPS 주소를 입력해 주세요.',
        targetForPath(data, path),
      );
  });
  if (data.kind === 'public') {
    data.projects.forEach((project, pi) => {
      if (project.status !== 'published')
        error('R15', `/projects/${pi}/status`, '공개 자료에는 공개 작품만 포함할 수 있습니다.', {
          projectId: project.id,
        });
    });
    data.architectures.forEach((graph, gi) => {
      if (!graph.verified || !projects.has(graph.projectId))
        error('R15', `/architectures/${gi}`, '공개 작품의 확인한 그래프만 포함할 수 있습니다.', {
          projectId: graph.projectId,
        });
    });
    const reachable = referencedAssetIds(data);
    data.assets.forEach((asset, ai) => {
      if (!reachable.has(asset.id))
        error('R15', `/assets/${ai}`, '공개 자료에 사용하지 않는 이미지가 포함되어 있습니다.', {
          assetId: asset.id,
        });
    });
  }
  return issues;
}

export function isHttpsUrl(value: string): boolean {
  // oxlint-disable-next-line eslint/no-control-regex -- Reject control characters in untrusted external URLs.
  if (!value.startsWith('https://') || /[\s\\\u0000-\u001f\u007f]/u.test(value)) return false;
  const authority = /^https:\/\/([^/?#]+)/u.exec(value)?.[1];
  if (!authority || authority.includes('@')) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function walkUrls(value: unknown, path: string, visit: (url: string, path: string) => void) {
  if (Array.isArray(value))
    value.forEach((child, index) => walkUrls(child, `${path}/${index}`, visit));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const next = `${path}/${escape(key)}`;
      if (key === 'url' && typeof child === 'string') visit(child, next);
      else walkUrls(child, next, visit);
    }
  }
}

function targetForPath(input: unknown, path: string): Issue['target'] {
  const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const item = (value: unknown, index: string | undefined): Record<string, unknown> =>
    Array.isArray(value) && index !== undefined ? record(value[Number(index)]) : {};
  const id = (value: unknown): string | undefined =>
    typeof value === 'string' && value.length <= 64 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)
      ? value
      : undefined;
  const data = record(input);
  const segments = path.split('/');
  if (segments[1] === 'projects') {
    const project = item(data.projects, segments[2]);
    const study = segments[3] === 'caseStudies' ? item(project.caseStudies, segments[4]) : {};
    const projectId = id(project.id);
    const entityId = id(study.id);
    return projectId ? { projectId, ...(entityId ? { entityId } : {}) } : undefined;
  }
  if (segments[1] === 'architectures') {
    const graph = item(data.architectures, segments[2]);
    const entity = ['nodes', 'edges', 'groups'].includes(segments[3] ?? '')
      ? item(graph[segments[3]!], segments[4])
      : {};
    const projectId = id(graph.projectId);
    const entityId = id(entity.id);
    return projectId ? { projectId, ...(entityId ? { entityId } : {}) } : undefined;
  }
  if (segments[1] === 'assets') {
    const assetId = id(item(data.assets, segments[2]).id);
    return assetId ? { assetId } : undefined;
  }
  return undefined;
}

export function referencedAssetIds(data: Portfolio): Set<string> {
  const ids = [
    data.site.profile.avatarAssetId,
    data.site.theme.logoAssetId,
    data.site.theme.faviconAssetId,
    ...data.projects.flatMap((project) => [
      project.media.coverAssetId,
      ...project.media.screenshotAssetIds,
    ]),
  ];
  return new Set(ids.filter((id): id is string => id !== null));
}

export function validatePortfolio(input: unknown): ValidationResult {
  const structure = validateStructure(input);
  if (!structure.valid) return structure;
  const issues = validateRelations(structure.data);
  return issues.some((issue) => issue.severity === 'error')
    ? { valid: false, issues }
    : { valid: true, data: structure.data, issues };
}

export function validatePublicContent(input: unknown): ValidationResult {
  const result = validatePortfolio(input);
  if (!result.valid) return result;
  if (result.data.kind !== 'public')
    return {
      valid: false,
      issues: [
        { code: 'KIND', severity: 'error', path: '/kind', message: '공개 자료 형식이 필요합니다.' },
      ],
    };
  return result;
}
