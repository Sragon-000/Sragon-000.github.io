import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkspace, createProject } from '../src/domain/create';
import { selectProjects, selectProject, selectArchitecture } from '../src/domain/select';
import {
  validatePortfolio,
  validateRelations,
  validatePublicContent,
  isHttpsUrl,
} from '../src/domain/validate';
import { preparePublicContent } from '../src/domain/public';
import type { Portfolio } from '../src/domain/types';
import { fixture, publicGraph, asset } from './fixtures';

test('빈 자료와 새 작품은 격리된 유효한 초안이다', () => {
  const a = createWorkspace();
  const b = createWorkspace();
  const project = createProject();
  const second = createProject([project]);
  assert.notEqual(project.id, second.id);
  assert.equal(project.slug, project.id);
  a.projects.push(project);
  a.site.exhibition.projectOrder.push(project.id);
  assert.equal(validatePortfolio(a).valid, true);
  assert.equal(validatePortfolio(b).valid, true);
  assert.equal(b.projects.length, 0);
  project.title = '새 제목';
  assert.equal(project.slug, project.id);
});

const cases: [string, string, (data: Portfolio) => void][] = [
  [
    '중복 작품 ID',
    'R01',
    (d) => {
      d.projects.push(structuredClone(d.projects[0]!));
    },
  ],
  [
    '중복 slug',
    'R01',
    (d) => {
      const p = structuredClone(d.projects[0]!);
      p.id = 'second';
      d.projects.push(p);
      d.site.exhibition.projectOrder.push(p.id);
    },
  ],
  [
    '순서 누락',
    'R02',
    (d) => {
      d.site.exhibition.projectOrder = [];
    },
  ],
  [
    '순서 중복',
    'R02',
    (d) => {
      d.site.exhibition.projectOrder.push(d.projects[0]!.id);
    },
  ],
  [
    '없는 작품 순서',
    'R02',
    (d) => {
      d.site.exhibition.projectOrder = ['missing'];
    },
  ],
  [
    '없는 그래프 작품',
    'R03',
    (d) => {
      d.architectures[0]!.projectId = 'missing';
    },
  ],
  [
    '작품당 여러 그래프',
    'R03',
    (d) => {
      d.architectures.push(structuredClone(d.architectures[0]!));
    },
  ],
  [
    '중복 그룹',
    'R04',
    (d) => {
      d.architectures[0]!.groups.push(structuredClone(d.architectures[0]!.groups[0]!));
    },
  ],
  [
    '중복 노드',
    'R04',
    (d) => {
      d.architectures[0]!.nodes.push(structuredClone(d.architectures[0]!.nodes[0]!));
    },
  ],
  [
    '중복 연결',
    'R04',
    (d) => {
      d.architectures[0]!.edges.push(structuredClone(d.architectures[0]!.edges[0]!));
    },
  ],
  [
    '없는 그룹',
    'R05',
    (d) => {
      d.architectures[0]!.nodes[0]!.groupId = 'missing';
    },
  ],
  [
    '없는 부모',
    'R05',
    (d) => {
      d.architectures[0]!.nodes[0]!.parentId = 'missing';
    },
  ],
  [
    '자기 부모',
    'R06',
    (d) => {
      d.architectures[0]!.nodes[0]!.parentId = 'system-a';
    },
  ],
  [
    '부모 순환',
    'R06',
    (d) => {
      const n = d.architectures[0]!.nodes;
      n[0]!.parentId = n[1]!.id;
      n[1]!.parentId = n[2]!.id;
      n[2]!.parentId = n[0]!.id;
    },
  ],
  [
    '없는 출발 노드',
    'R07',
    (d) => {
      d.architectures[0]!.edges[0]!.source = 'missing';
    },
  ],
  [
    '없는 도착 노드',
    'R07',
    (d) => {
      d.architectures[0]!.edges[0]!.target = 'missing';
    },
  ],
  [
    '없는 사례 참조',
    'R08',
    (d) => {
      d.architectures[0]!.nodes[0]!.relatedCaseIds = ['missing'];
    },
  ],
  [
    '중복 사례',
    'R08',
    (d) => {
      const c = {
        id: 'case-a',
        title: '사례',
        problem: '문제',
        alternatives: [],
        solution: '해결',
        outcome: '결과',
        evidence: [],
      };
      d.projects[0]!.caseStudies = [c, structuredClone(c)];
    },
  ],
  [
    '없는 대표 이미지',
    'R09',
    (d) => {
      d.projects[0]!.media.coverAssetId = 'missing';
    },
  ],
  [
    '없는 스크린샷',
    'R09',
    (d) => {
      d.projects[0]!.media.screenshotAssetIds = ['missing'];
    },
  ],
  [
    '없는 프로필 이미지',
    'R09',
    (d) => {
      d.site.profile.avatarAssetId = 'missing';
    },
  ],
  [
    '없는 로고',
    'R09',
    (d) => {
      d.site.theme.logoAssetId = 'missing';
    },
  ],
  [
    '없는 파비콘',
    'R09',
    (d) => {
      d.site.theme.faviconAssetId = 'missing';
    },
  ],
  [
    '중복 자산 ID',
    'R10',
    (d) => {
      d.assets = [asset(), asset()];
    },
  ],
  [
    '중복 자산 경로',
    'R10',
    (d) => {
      d.assets = [asset(), { ...asset('image-b'), path: 'assets/image-a.png' }];
    },
  ],
  [
    '파일명과 ID 불일치',
    'R10',
    (d) => {
      d.assets = [{ ...asset(), path: 'assets/other.png' }];
    },
  ],
  [
    '확장자와 MIME 불일치',
    'R10',
    (d) => {
      d.assets = [{ ...asset(), mimeType: 'image/jpeg' }];
    },
  ],
  [
    '역순 기간',
    'R11',
    (d) => {
      d.projects[0]!.period = { start: '2026-10', end: '2026-09', ongoing: false };
    },
  ],
  [
    '진행 중 종료월',
    'R11',
    (d) => {
      d.projects[0]!.period = { start: null, end: '2026-10', ongoing: true };
    },
  ],
  [
    '링크 인증정보',
    'R12',
    (d) => {
      d.projects[0]!.links = [{ label: '코드', url: 'https://user:pass@example.com/code' }];
    },
  ],
  [
    '노드 코드 링크 인증정보',
    'R12',
    (d) => {
      d.architectures[0]!.nodes[0]!.codeRefs = [
        { label: '코드', url: 'https://user@example.com/' },
      ];
    },
  ],
  [
    '직접 구현 설명 누락',
    'R13',
    (d) => {
      d.architectures[0]!.nodes[0]!.contributionType = 'direct';
    },
  ],
  [
    '공동 구현 설명 누락',
    'R13',
    (d) => {
      d.architectures[0]!.nodes[0]!.contributionType = 'shared';
    },
  ],
  [
    '코드 근거 주소 누락',
    'R14',
    (d) => {
      d.architectures[0]!.revision.sources[0]!.kind = 'code';
    },
  ],
  [
    '문서 근거 주소 누락',
    'R14',
    (d) => {
      d.architectures[0]!.revision.sources[0]!.kind = 'document';
    },
  ],
  [
    '작성자 확인 누락',
    'R14',
    (d) => {
      d.architectures[0]!.revision.sources[0]!.note = ' ';
    },
  ],
  [
    '도달하지 않는 공개 자산',
    'R15',
    (d) => {
      d.assets = [asset()];
    },
  ],
];
for (const [name, code, mutate] of cases)
  test(`관계 검사 ${code}: ${name}`, () => {
    const data = publicGraph();
    mutate(data);
    const before = structuredClone(data);
    const result = validatePortfolio(data);
    assert.equal(result.valid, false);
    const relations = validateRelations(data);
    assert.ok(
      relations.some((issue) => issue.code === code),
      JSON.stringify(relations),
    );
    assert.deepEqual(data, before);
  });

test('일반 연결 순환과 부모 트리는 허용한다', () => {
  const data = publicGraph();
  const graph = data.architectures[0]!;
  graph.edges.push({
    id: 'edge-c-a',
    source: 'system-c',
    target: 'system-a',
    type: 'event',
    label: '반환',
    description: '',
  });
  graph.nodes[1]!.parentId = 'system-a';
  graph.nodes[2]!.parentId = 'system-b';
  assert.equal(validatePortfolio(data).valid, true);
  graph.edges[2]!.target = 'system-c';
  const result = validatePortfolio(data);
  assert.equal(result.valid, true);
  assert.ok(
    result.issues.some((issue) => issue.code === 'SELF_EDGE' && issue.severity === 'notice'),
  );
});
test('R15는 잘못 표기된 공개 작품과 미확인 그래프도 검사한다', () => {
  const data = publicGraph();
  data.projects[0]!.status = 'draft';
  data.architectures[0]!.verified = false;
  assert.equal(validateRelations(data).filter((issue) => issue.code === 'R15').length, 2);
  assert.equal(validatePublicContent(data).valid, false);
});
test('R12는 모든 링크 영역에 적용되고 실제 접속을 주장하지 않는다', () => {
  for (const url of [
    'http://example.com',
    'https:///example.com',
    'https://@example.com',
    'https://example.com:99999',
    'https://user@example.com',
    'https://example.com\\path',
    'https://example.com/\npath',
  ])
    assert.equal(isHttpsUrl(url), false, url);
  for (const url of [
    'https://example.com',
    'https://example.com/path?q=hello#code',
    'https://unreachable.invalid/path',
  ])
    assert.equal(isHttpsUrl(url), true, url);
  const data = publicGraph();
  data.architectures[0]!.revision.sources[0]!.url = 'https://user@example.com';
  assert.ok(validatePortfolio(data).issues.some((issue) => issue.code === 'R12'));
});
test('관계 오류는 안정적인 이동 대상 ID를 제공한다', () => {
  const data = publicGraph();
  data.architectures[0]!.edges[0]!.target = 'missing';
  const issue = validateRelations(data).find((issue) => issue.code === 'R07')!;
  assert.equal(issue.path, '/architectures/0/edges/0/target');
  assert.deepEqual(issue.target, { projectId: 'example-project', entityId: 'edge-a-b' });
});
test('공개 선별은 순서, 사용 자산과 원본을 보존한다', () => {
  const data = fixture('owner');
  data.site.profile.displayName = '다른 사람';
  data.projects[0]!.status = 'published';
  data.projects[2]!.status = 'published';
  data.site.exhibition.projectOrder.reverse();
  data.assets = [asset('profile'), asset('cover'), asset('private'), asset('unused')];
  data.site.profile.avatarAssetId = 'profile';
  data.projects[0]!.media.coverAssetId = 'cover';
  data.projects[1]!.media.coverAssetId = 'private';
  const graph = fixture('graph').architectures[0]!;
  graph.projectId = data.projects[0]!.id;
  data.architectures = [graph];
  const before = structuredClone(data);
  const result = preparePublicContent(data);
  if (!result.ok) assert.fail(JSON.stringify(result.issues));
  assert.deepEqual(result.data.site.exhibition.projectOrder, [
    data.projects[2]!.id,
    data.projects[0]!.id,
  ]);
  assert.deepEqual(
    result.data.assets.map((a) => a.id),
    ['profile', 'cover'],
  );
  assert.equal(result.data.architectures.length, 0);
  assert.ok(result.issues.some((issue) => issue.code === 'UNVERIFIED_GRAPH'));
  assert.deepEqual(data, before);
  result.data.projects[0]!.title = '편집';
  assert.deepEqual(data, before);
});
test('확인한 그래프는 유지하고 기여 설명을 공개 때 검사한다', () => {
  const data: Portfolio = publicGraph();
  data.kind = 'workspace';
  const node = data.architectures[0]!.nodes[0]!;
  node.contributionType = 'direct';
  assert.equal(validatePortfolio(data).valid, true);
  const fail = preparePublicContent(data);
  assert.equal(fail.ok, false);
  assert.ok(fail.issues.some((issue) => issue.code === 'R13'));
  node.contributionNote = '담당한 시스템 설명';
  const pass = preparePublicContent(data);
  assert.equal(pass.ok, true);
  if (pass.ok) assert.equal(pass.data.architectures.length, 1);
});
test('초안만 있는 자료는 빈 공개 전시장을 만들며 예시는 거부한다', () => {
  const data = fixture('owner');
  data.site.profile.displayName = '테스트';
  const result = preparePublicContent(data);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.data.projects, []);
    assert.deepEqual(result.data.site.exhibition.projectOrder, []);
  }
  assert.ok(result.issues.some((issue) => issue.code === 'EMPTY_PUBLIC'));
  assert.equal(preparePublicContent(fixture('graph')).ok, false);
});
test('공개 필수값과 관계 오류가 있으면 원본을 보존하고 실패한다', () => {
  const data = fixture('owner');
  data.projects[0]!.status = 'published';
  const before = structuredClone(data);
  assert.equal(preparePublicContent(data).ok, false);
  assert.deepEqual(data, before);
  data.site.profile.displayName = '이름';
  data.architectures = publicGraph().architectures;
  assert.equal(preparePublicContent(data).ok, false);
});
test('공통 조회는 공개 여부와 전시 순서 및 ID/slug를 구분한다', () => {
  const data = fixture('owner');
  data.projects[1]!.status = 'published';
  data.site.exhibition.projectOrder.reverse();
  assert.equal(selectProjects(data).length, 1);
  assert.equal(selectProjects(data, 'workspace').length, 3);
  const project = data.projects[1]!;
  project.slug = 'public-address';
  assert.equal(selectProject(data, 'public-address')?.id, project.id);
  assert.equal(selectProject(data, project.id), undefined);
  assert.equal(selectProject(data, project.id, 'id')?.slug, 'public-address');
  const graph = publicGraph().architectures[0]!;
  graph.projectId = project.id;
  graph.verified = false;
  data.architectures = [graph];
  assert.equal(selectArchitecture(data, project.id), undefined);
  assert.equal(selectArchitecture(data, project.id, 'workspace')?.projectId, project.id);
  graph.verified = true;
  assert.equal(selectArchitecture(data, project.id)?.projectId, project.id);
});
test('워크스페이스를 public으로 잘못 전달하면 거부한다', () =>
  assert.equal(validatePublicContent(createWorkspace()).valid, false));
