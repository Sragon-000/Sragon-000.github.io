import type { Architecture, GraphNode } from '../../domain/types';
export const contributionLabels = {
  direct: '직접 구현',
  shared: '공동 구현',
  team: '팀 구현',
  unknown: '미정',
};
export const relationLabels = { call: '호출', data: '데이터', event: '이벤트', dependency: '의존' };
export const relationColors = {
  call: '#b7dc76',
  data: '#70c9dd',
  event: '#d3a2dd',
  dependency: '#aab8bb',
};
export function isOwnContribution(node: GraphNode) {
  return node.contributionType === 'direct' || node.contributionType === 'shared';
}
export interface Placement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
  groupKey: string;
}
export interface GraphLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  nodes: Placement[];
  groups: {
    id: string;
    label: string;
    layer: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function layoutGraph(graph: Architecture): GraphLayout {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const grouped = new Map(graph.groups.map((group) => [group.id, [] as GraphNode[]]));
  const ungrouped: GraphNode[] = [];
  for (const node of graph.nodes) {
    const bucket = node.groupId === null ? undefined : grouped.get(node.groupId);
    if (bucket) bucket.push(node);
    else ungrouped.push(node);
  }
  const groups = [...graph.groups]
    .sort((a, b) => a.layer - b.layer || compare(a.id, b.id))
    .map((group) => ({ ...group, nodes: grouped.get(group.id)! }));
  if (ungrouped.length)
    groups.push({ id: '__ungrouped', label: '그룹 없음', layer: 0, nodes: ungrouped });
  const depthCache = new Map<string, number>();
  function depth(node: GraphNode) {
    const trail: GraphNode[] = [];
    const seen = new Set<string>();
    let cursor: GraphNode | undefined = node;
    while (cursor && !depthCache.has(cursor.id)) {
      if (seen.has(cursor.id)) break;
      seen.add(cursor.id);
      trail.push(cursor);
      const parent: GraphNode | undefined = cursor.parentId ? byId.get(cursor.parentId) : undefined;
      cursor = parent?.groupId === node.groupId ? parent : undefined;
    }
    let current = cursor ? (depthCache.get(cursor.id) ?? -1) : -1;
    for (const item of trail.reverse()) depthCache.set(item.id, ++current);
    return depthCache.get(node.id) ?? 0;
  }
  const result: GraphLayout = { x: 0, y: 0, width: 320, height: 220, nodes: [], groups: [] };
  let left = 24;
  for (const group of groups) {
    const columns = new Map<number, GraphNode[]>();
    for (const node of [...group.nodes].sort((a, b) => compare(a.id, b.id))) {
      const d = depth(node);
      const items = columns.get(d) ?? [];
      items.push(node);
      columns.set(d, items);
    }
    const columnCount = Math.max(0, ...columns.keys()) + 1;
    const rows = Math.max(1, ...[...columns.values()].map((items) => items.length));
    const width = Math.max(240, (columnCount - 1) * 320 + 228);
    const height = rows * 96 + 86;
    result.groups.push({
      id: group.id,
      label: group.label,
      layer: group.layer,
      x: left,
      y: 24,
      width,
      height,
    });
    for (const [column, nodes] of columns)
      nodes.forEach((node, row) =>
        result.nodes.push({
          id: node.id,
          x: left + 24 + column * 320,
          y: 90 + row * 96,
          width: 180,
          height: 62,
          layer: group.layer,
          groupKey: group.id,
        }),
      );
    left += width + 64;
    result.height = Math.max(result.height, height + 60);
  }
  let right = Math.max(320, left);
  let bottom = result.height;
  const byPosition = new Map(result.nodes.map((node) => [node.id, node]));
  const parallels = new Map<string, number>();
  for (const edge of [...graph.edges].sort((a, b) => compare(a.id, b.id))) {
    const source = byPosition.get(edge.source);
    const target = byPosition.get(edge.target);
    if (!source || !target) continue;
    const key = [edge.source, edge.target].sort().join('/');
    const parallel = parallels.get(key) ?? 0;
    parallels.set(key, parallel + 1);
    const curve = edgeCurve(source, target, parallel);
    result.x = Math.min(result.x, curve.bounds.minX - 12, curve.labelX - 72);
    result.y = Math.min(result.y, curve.bounds.minY - 12, curve.labelY - 16);
    right = Math.max(right, curve.bounds.maxX + 12, curve.labelX + 72);
    bottom = Math.max(bottom, curve.bounds.maxY + 12, curve.labelY + 16);
  }
  result.width = right - result.x;
  result.height = bottom - result.y;
  return result;
}
export function validSelection(graph: Architecture, id: string | null) {
  return id && graph.nodes.some((node) => node.id === id) ? id : null;
}
export function connectedNodes(graph: Architecture, id: string | null): Set<string> {
  const ids = new Set<string>();
  if (!id) return ids;
  ids.add(id);
  graph.edges.forEach((edge) => {
    if (edge.source === id) ids.add(edge.target);
    if (edge.target === id) ids.add(edge.source);
  });
  const node = graph.nodes.find((node) => node.id === id);
  if (node?.parentId) ids.add(node.parentId);
  graph.nodes.filter((node) => node.parentId === id).forEach((node) => ids.add(node.id));
  return ids;
}
export function edgeCurve(source: Placement, target: Placement, parallel = 0, hierarchy = false) {
  if (source.id === target.id) {
    const x = source.x + source.width;
    const y = source.y + source.height / 2;
    return {
      path: `M ${x} ${y + 8} C ${x + 80 + parallel * 16} ${y + 65} ${x + 80 + parallel * 16} ${y - 65} ${x} ${y - 8}`,
      labelX: x + 52 + parallel * 16,
      labelY: y - 36 - parallel * 14,
      bounds: { minX: x, minY: y - 65, maxX: x + 80 + parallel * 16, maxY: y + 65 },
    };
  }
  const right = target.x >= source.x;
  const x1 = source.x + (right ? source.width : 0);
  const x2 = target.x + (right ? 0 : target.width);
  const y1 = source.y + source.height / 2;
  const y2 = target.y + target.height / 2;
  const bend = Math.max(40, Math.abs(x2 - x1) / 2);
  const offset = parallel * 24 + (!right && !hierarchy ? -160 : 0);
  return {
    path: `M ${x1} ${y1} C ${x1 + (right ? bend : -bend)} ${y1 + offset} ${x2 + (right ? -bend : bend)} ${y2 + offset} ${x2} ${y2}`,
    labelX: (x1 + x2) / 2,
    labelY: (y1 + y2) / 2 - 8 + offset * 0.75,
    bounds: {
      minX: Math.min(x1, x2, x1 + (right ? bend : -bend), x2 + (right ? -bend : bend)),
      minY: Math.min(y1, y2, y1 + offset, y2 + offset),
      maxX: Math.max(x1, x2, x1 + (right ? bend : -bend), x2 + (right ? -bend : bend)),
      maxY: Math.max(y1, y2, y1 + offset, y2 + offset),
    },
  };
}
