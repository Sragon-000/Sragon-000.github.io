import { memo, useId, useMemo, useRef, useState } from 'react';
import type { Architecture } from '../../domain/types';
import {
  connectedNodes,
  contributionLabels,
  edgeCurve,
  isOwnContribution,
  layoutGraph,
  relationColors,
  relationLabels,
} from './model';
import type { GraphSession } from './session';
import type { GraphLayout } from './model';
interface Props {
  graph: Architecture;
  selectedId: string | null;
  emphasize: boolean;
  onSelect: (id: string) => void;
  savedBox?: GraphSession['box'];
  onBox: (box: NonNullable<GraphSession['box']>) => void;
  reset: number;
}
export default function Graph2D({
  graph,
  selectedId,
  emphasize,
  onSelect,
  savedBox,
  onBox,
  reset,
}: Props) {
  const layout = useMemo(() => layoutGraph(graph), [graph]);
  const original = { x: layout.x, y: layout.y, width: layout.width, height: layout.height };
  const [viewport, setViewport] = useState({ reset, box: savedBox ?? original });
  const box = viewport.reset === reset ? viewport.box : original;
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; box: typeof box } | null>(null);
  const id = useId().replace(/:/g, '');
  function change(next: typeof box) {
    setViewport({ reset, box: next });
    onBox(next);
  }
  function zoom(factor: number) {
    const width = Math.max(120, Math.min(layout.width * 4, box.width * factor));
    const ratio = width / box.width;
    change({
      x: box.x + (box.width * (1 - ratio)) / 2,
      y: box.y + (box.height * (1 - ratio)) / 2,
      width,
      height: box.height * ratio,
    });
  }
  function pan(x: number, y: number) {
    change({ ...box, x: box.x + x * box.width * 0.15, y: box.y + y * box.height * 0.15 });
  }
  return (
    <div className="graph-2d">
      <div className="graph-navigation" aria-label="2D 그래프 조작">
        <button onClick={() => zoom(0.75)} aria-label="2D 확대">
          ＋
        </button>
        <button onClick={() => zoom(1.33)} aria-label="2D 축소">
          −
        </button>
        <button onClick={() => change(original)}>2D 전체 맞춤</button>
        <button onClick={() => pan(-1, 0)} aria-label="2D 왼쪽으로 이동">
          ←
        </button>
        <button onClick={() => pan(0, -1)} aria-label="2D 위로 이동">
          ↑
        </button>
        <button onClick={() => pan(0, 1)} aria-label="2D 아래로 이동">
          ↓
        </button>
        <button onClick={() => pan(1, 0)} aria-label="2D 오른쪽으로 이동">
          →
        </button>
      </div>
      <svg
        ref={svg}
        className="graph-svg"
        viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
        role="group"
        aria-label="2D 시스템 그래프"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const directions: Record<string, [number, number]> = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
          };
          const direction = directions[event.key];
          if (direction) {
            event.preventDefault();
            pan(...direction);
          }
        }}
        onPointerDown={(event) => {
          if (event.pointerType === 'touch' || (event.target as Element).closest('[data-node]'))
            return;
          drag.current = { x: event.clientX, y: event.clientY, box };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current || !svg.current) return;
          const bounds = svg.current.getBoundingClientRect();
          const ratio = Math.max(
            drag.current.box.width / bounds.width,
            drag.current.box.height / bounds.height,
          );
          change({
            ...drag.current.box,
            x: drag.current.box.x - (event.clientX - drag.current.x) * ratio,
            y: drag.current.box.y - (event.clientY - drag.current.y) * ratio,
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <GraphDrawing
          graph={graph}
          layout={layout}
          id={id}
          selectedId={selectedId}
          emphasize={emphasize}
          onSelect={onSelect}
        />
      </svg>
      <p className="field-note">
        시스템을 선택해 설명을 확인하세요. PC에서는 빈 공간을 드래그하고, 모바일에서는 확대·이동
        버튼을 사용합니다.
      </p>
    </div>
  );
}

// Viewport updates keep this subtree unchanged; selection updates reuse the prepared curves and indexes.
const GraphDrawing = memo(function GraphDrawing({
  graph,
  layout,
  id,
  selectedId,
  emphasize,
  onSelect,
}: Pick<Props, 'graph' | 'selectedId' | 'emphasize' | 'onSelect'> & {
  layout: GraphLayout;
  id: string;
}) {
  const { placements, nodesById, nodeNames, curves } = useMemo(() => {
    const placements = new Map(layout.nodes.map((node) => [node.id, node]));
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const nodeNames = new Map(graph.nodes.map((node) => [node.id, node.label]));
    const parallels = new Map<string, number>();
    const curves = [...graph.edges]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .flatMap((edge) => {
        const a = placements.get(edge.source),
          b = placements.get(edge.target);
        if (!a || !b) return [];
        const key = [edge.source, edge.target].sort().join('/');
        const parallel = parallels.get(key) ?? 0;
        parallels.set(key, parallel + 1);
        return [{ edge, curve: edgeCurve(a, b, parallel) }];
      });
    return { placements, nodesById, nodeNames, curves };
  }, [graph, layout]);
  const adjacent = connectedNodes(graph, selectedId);
  return (
    <>
      {' '}
      <defs>
        {Object.entries(relationColors).map(([type, color]) => (
          <marker
            key={type}
            id={`${id}-${type}`}
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={`var(--relation-${type}, ${color})`} />
          </marker>
        ))}
      </defs>
      {layout.groups.map((group) => (
        <g key={group.id}>
          <title>
            {group.label} · 층 {group.layer}
          </title>
          <rect
            className="graph-group"
            x={group.x}
            y={group.y}
            width={group.width}
            height={group.height}
            rx="12"
          />
          <text className="graph-group-label" x={group.x + 22} y={group.y + 30}>
            {[...group.label].slice(0, 10).join('')}
            {[...group.label].length > 10 ? '…' : ''} · 층 {group.layer}
          </text>
        </g>
      ))}
      {graph.nodes
        .filter((node) => node.parentId)
        .map((node) => {
          const a = placements.get(node.parentId!);
          const b = placements.get(node.id);
          return a && b ? (
            <path
              key={`parent-${node.id}`}
              d={edgeCurve(a, b, -1, true).path}
              className="parent-line"
            >
              <title>
                부모: {nodeNames.get(node.parentId!) || '이름 미입력'} → {node.label}
              </title>
            </path>
          ) : null;
        })}
      {curves.map(({ edge, curve }) => {
        const active = !selectedId || edge.source === selectedId || edge.target === selectedId;
        return (
          <g key={edge.id} opacity={active ? 1 : 0.23}>
            <path
              d={curve.path}
              fill="none"
              stroke={`var(--relation-${edge.type}, ${relationColors[edge.type]})`}
              strokeWidth={active ? 2.5 : 1.5}
              markerEnd={`url(#${id}-${edge.type})`}
            />
            <text className="edge-label" x={curve.labelX} y={curve.labelY} textAnchor="middle">
              {[...(edge.label || relationLabels[edge.type])].slice(0, 10).join('')}
              {[...edge.label].length > 10 ? '…' : ''}
            </text>
            <title>
              {relationLabels[edge.type]}: {nodeNames.get(edge.source) || '이름 미입력'} →{' '}
              {nodeNames.get(edge.target) || '이름 미입력'} · {edge.description}
            </title>
          </g>
        );
      })}
      {layout.nodes.map((position) => {
        const node = nodesById.get(position.id)!;
        const own = emphasize && isOwnContribution(node);
        return (
          <g
            key={node.id}
            data-node={node.id}
            role="button"
            tabIndex={0}
            aria-label={`${node.label || '이름 없는 시스템'} · ${contributionLabels[node.contributionType]}`}
            aria-pressed={selectedId === node.id}
            className={`graph-node ${selectedId === node.id ? 'selected' : ''} ${own ? 'own' : ''}`}
            opacity={!selectedId || adjacent.has(node.id) ? 1 : 0.42}
            onClick={() => onSelect(node.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(node.id);
              }
            }}
          >
            <rect
              x={position.x}
              y={position.y}
              width={position.width}
              height={position.height}
              rx="8"
            />
            <text x={position.x + 14} y={position.y + 26}>
              {[...(node.label || '이름 미입력')].slice(0, 10).join('')}
              {[...node.label].length > 10 ? '…' : ''}
            </text>
            <text className="node-contribution" x={position.x + 14} y={position.y + 46}>
              {contributionLabels[node.contributionType]}
            </text>
            <title>
              {node.label} · {node.responsibility}
            </title>
          </g>
        );
      })}
    </>
  );
});
