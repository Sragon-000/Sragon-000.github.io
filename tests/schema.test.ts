import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateStructure } from '../src/domain/validate';
import type { Portfolio } from '../src/domain/types';
import { examples, fixture, publicGraph, asset } from './fixtures';

for (const [name, input] of Object.entries(examples))
  test(`기존 예시 형식 호환: ${name}`, () => {
    assert.equal(validateStructure(input).valid, true);
  });
test('최소 공개 작품 및 빈 전시장 형식', () => {
  const data = fixture('owner');
  data.kind = 'public';
  data.site.profile.displayName = '테스트';
  data.projects = data.projects.slice(0, 1);
  data.projects[0]!.status = 'published';
  data.site.exhibition.projectOrder = [data.projects[0]!.id];
  assert.equal(validateStructure(data).valid, true);
  data.projects = [];
  data.site.exhibition.projectOrder = [];
  assert.equal(validateStructure(data).valid, true);
});
test('확인한 공개 그래프 형식', () => assert.equal(validateStructure(publicGraph()).valid, true));

const cases: [string, (data: Portfolio) => void][] = [
  [
    '공개 프로필 공백',
    (d) => {
      d.site.profile.displayName = '   ';
    },
  ],
  [
    '공개 전시 제목 공백',
    (d) => {
      d.site.exhibition.title = '\n';
    },
  ],
  [
    '공개 작품명 누락',
    (d) => {
      d.projects[0]!.title = '';
    },
  ],
  [
    '공개 요약 누락',
    (d) => {
      d.projects[0]!.summary = '';
    },
  ],
  [
    '공개 자료에 초안',
    (d) => {
      d.projects[0]!.status = 'draft';
    },
  ],
  [
    '0명 팀',
    (d) => {
      d.projects[0]!.teamSize = 0;
    },
  ],
  [
    '잘못된 월',
    (d) => {
      d.projects[0]!.period.start = '2026-13';
    },
  ],
  [
    '잘못된 영상 ID',
    (d) => {
      d.projects[0]!.media.video = { provider: 'youtube', videoId: 'bad', title: '테스트' };
    },
  ],
  [
    '지원하지 않는 버전',
    (d) => {
      Object.assign(d, { schemaVersion: '2.0.0' });
    },
  ],
  [
    'HTTP 링크',
    (d) => {
      d.site.profile.links = [{ label: '테스트', url: 'http://example.com' }];
    },
  ],
  [
    '알 수 없는 필드',
    (d) => {
      Object.assign(d.site.profile, { unknownKey: 'keep me' });
    },
  ],
  [
    '자산 경로 탈출',
    (d) => {
      d.assets = [asset()];
      d.assets[0]!.path = '../private.png';
    },
  ],
  [
    '40자 초과 이름',
    (d) => {
      d.site.profile.displayName = '가'.repeat(41);
    },
  ],
  [
    '미확인 공개 그래프',
    (d) => {
      d.architectures[0]!.verified = false;
    },
  ],
  [
    '노드 없는 공개 그래프',
    (d) => {
      d.architectures[0]!.nodes = [];
    },
  ],
  [
    '존재하지 않는 날짜',
    (d) => {
      d.architectures[0]!.revision.reviewedAt = '2026-02-30';
    },
  ],
  [
    '근거 없는 공개 그래프',
    (d) => {
      d.architectures[0]!.revision.sources = [];
    },
  ],
  [
    '공개 사례의 문제 누락',
    (d) => {
      d.projects[0]!.caseStudies = [
        {
          id: 'case-a',
          title: '사례',
          problem: '',
          alternatives: [],
          solution: '해결',
          outcome: '결과',
          evidence: [],
        },
      ];
    },
  ],
];
for (const [name, mutate] of cases)
  test(`형식 거부: ${name}`, () => {
    const data = publicGraph();
    mutate(data);
    const before = structuredClone(data);
    assert.equal(validateStructure(data).valid, false);
    assert.deepEqual(data, before, '검사 중 입력을 수정하지 않는다');
  });
test('유니코드 코드 포인트와 실제 윤년 날짜 검사', () => {
  const data = publicGraph();
  data.site.profile.displayName = '🚀'.repeat(40);
  data.architectures[0]!.revision.reviewedAt = '2024-02-29';
  assert.equal(validateStructure(data).valid, true);
  data.site.profile.displayName += '🚀';
  assert.equal(validateStructure(data).valid, false);
  data.site.profile.displayName = '테스트';
  data.architectures[0]!.revision.reviewedAt = '2025-02-29';
  assert.equal(validateStructure(data).valid, false);
});
test('필수키, 타입과 추가키를 자동으로 수정하지 않는다', () => {
  for (const value of [null, {}, 'text', [], { ...examples.blank, projects: '3' }]) {
    assert.equal(validateStructure(value).valid, false);
  }
  const data = fixture('blank');
  delete (data.site.profile as Partial<typeof data.site.profile>).bio;
  const result = validateStructure(data);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.path === '/site/profile/bio'));
  assert.equal('bio' in data.site.profile, false);
});
test('공개 필수값 오류는 선별 후에도 작품 ID로 연결한다', () => {
  const data = publicGraph();
  data.projects[0]!.title = '';
  const result = validateStructure(data);
  const issue = result.issues.find((issue) => issue.path === '/projects/0/title')!;
  assert.equal(issue.target?.projectId, data.projects[0]!.id);
});
