import blank from '../spec/examples/blank.workspace.json' with { type: 'json' };
import owner from '../spec/examples/first-owner.workspace.json' with { type: 'json' };
import graph from '../spec/examples/architecture.example.json' with { type: 'json' };
import { validatePortfolio } from '../src/domain/validate';
import type { Asset, Portfolio, PublicPortfolio } from '../src/domain/types';

export const examples = { blank, owner, graph };
export function fixture(key: keyof typeof examples): Portfolio {
  const result = validatePortfolio(structuredClone(examples[key]));
  if (!result.valid) throw new Error(JSON.stringify(result.issues));
  return result.data;
}
export function publicGraph(): PublicPortfolio {
  const data = fixture('graph') as PublicPortfolio;
  data.kind = 'public';
  data.projects[0]!.status = 'published';
  data.architectures[0]!.verified = true;
  data.architectures[0]!.revision.reviewedAt = '2026-10-06';
  data.architectures[0]!.revision.sources = [
    {
      kind: 'author',
      label: '테스트용 확인',
      url: null,
      note: '실제 프로젝트 자료가 아닌 자동 검사 입력입니다.',
    },
  ];
  return data;
}
export function asset(id = 'image-a'): Asset {
  return {
    id,
    path: `assets/${id}.png`,
    mimeType: 'image/png',
    byteSize: 10,
    width: 1,
    height: 1,
    alt: '테스트 이미지',
  };
}
