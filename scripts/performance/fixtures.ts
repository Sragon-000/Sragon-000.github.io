import type { Architecture } from '../../src/domain/types';
export function largeGraph(count: number): Architecture {
  const groups = Array.from({ length: Math.max(1, Math.ceil(count / 20)) }, (_, i) => ({
    id: `group-${i}`,
    label: `검증 그룹 ${i}`,
    layer: i % 3,
  }));
  return {
    projectId: 'performance-project',
    verified: false,
    revision: { label: '성능 검사 예시', reviewedAt: null, sources: [] },
    groups,
    nodes: Array.from({ length: count }, (_, i) => ({
      id: `node-${String(i).padStart(4, '0')}`,
      label: `검증 시스템 ${i}`,
      groupId: groups[Math.floor(i / 20)]!.id,
      parentId: i % 20 ? `node-${String(i - 1).padStart(4, '0')}` : null,
      responsibility: '성능 검사 전용 시스템',
      inputs: [],
      outputs: [],
      decisions: '',
      contributionType: i % 3 === 0 ? 'direct' : 'team',
      contributionNote: '검증용 기여',
      relatedCaseIds: [],
      codeRefs: [],
    })),
    edges: Array.from({ length: count * 3 }, (_, i) => ({
      id: `edge-${String(i).padStart(4, '0')}`,
      source: `node-${String(i % count).padStart(4, '0')}`,
      target: `node-${String((i * 7 + 3) % count).padStart(4, '0')}`,
      type: 'data',
      label: `검증 연결 ${i}`,
      description: '성능 검사 전용 연결',
    })),
  };
}
