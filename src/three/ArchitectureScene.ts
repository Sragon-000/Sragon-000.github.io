import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CubicBezierCurve3,
  LineSegments,
  Float32BufferAttribute,
  DynamicDrawUsage,
  LineBasicMaterial,
  LineDashedMaterial,
  Mesh,
  InstancedMesh,
  Matrix4,
  Quaternion,
  MeshBasicMaterial,
  PlaneGeometry,
  QuadraticBezierCurve3,
  Scene,
  Sprite,
  Vector3,
  type Object3D,
} from 'three';
import type { Architecture } from '../domain/types';
import {
  connectedNodes,
  isOwnContribution,
  layoutGraph,
  relationColors,
  relationLabels,
} from '../features/architecture/model';
import { Resources } from './lifecycle';
import { createAtlasLabels } from './LabelAtlas';
import { scenePalette, type ThemePreset } from './palette';
export interface ArchitectureScene {
  scene: Scene;
  pickables: Object3D[];
  positions: Map<string, Vector3>;
  update: (id: string | null, emphasize: boolean) => void;
  dispose: () => void;
}
export function buildArchitectureScene(
  graph: Architecture,
  labelFactory?: (text: string, resources: Resources) => Sprite | undefined,
  theme: ThemePreset = 'light',
): ArchitectureScene {
  const palette = scenePalette(theme);
  const resources = new Resources();
  const scene = new Scene();
  scene.background = new Color(palette.background);
  const layout = layoutGraph(graph);
  const positions = new Map(
    layout.nodes.map((node) => [
      node.id,
      new Vector3(node.x + node.width / 2 - layout.width / 2, node.layer * 140, node.y - 100),
    ]),
  );
  const pickables: Object3D[] = [];
  const objects = new Map<string, { mesh: Mesh<BoxGeometry, MeshBasicMaterial>; label?: Sprite }>();
  const edges: {
    source: string;
    target: string;
    start: number;
    count: number;
    arrow: Matrix4;
    type: keyof typeof relationColors;
    label?: Sprite;
  }[] = [];
  try {
    const atlasLabel = labelFactory ? undefined : createAtlasLabels(resources, palette);
    const createLabel = (text: string) => {
      const label = labelFactory ? labelFactory(text, resources) : atlasLabel!(text);
      if (label) resources.track(label.geometry);
      return label;
    };
    const box = resources.track(new BoxGeometry(180, 56, 24));
    const cone = resources.track(new ConeGeometry(8, 18, 6));
    for (const group of layout.groups) {
      const plane = new Mesh(
        resources.track(new PlaneGeometry(group.width, group.height)),
        resources.track(
          new MeshBasicMaterial({
            color: palette.group,
            transparent: true,
            opacity: 0.48,
            side: 2,
            depthWrite: false,
          }),
        ),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(
        group.x + group.width / 2 - layout.width / 2,
        group.layer * 140 - 38,
        group.y + group.height / 2 - 100,
      );
      scene.add(plane);
      const label = createLabel(
        `${[...group.label].length > 8 ? [...group.label].slice(0, 6).join('') + '…' : group.label} · 층 ${group.layer}`,
      );
      if (label) {
        label.position.set(plane.position.x, plane.position.y + 8, group.y - 100);
        scene.add(label);
      }
    }
    for (const node of graph.nodes) {
      const position = positions.get(node.id);
      if (!position) continue;
      const mesh = new Mesh(
        box,
        resources.track(new MeshBasicMaterial({ color: palette.node, transparent: true })),
      );
      mesh.position.copy(position);
      mesh.userData.nodeId = node.id;
      scene.add(mesh);
      pickables.push(mesh);
      const label = createLabel(node.label || '이름 미입력');
      if (label) {
        label.position.copy(position).add(new Vector3(0, 52, 0));
        label.userData.nodeId = node.id;
        scene.add(label);
        pickables.push(label);
      }
      objects.set(node.id, { mesh, label });
    }
    const counts = new Map<string, number>();
    const linePositions: number[] = [];
    const lineColors: number[] = [];
    for (const edge of [...graph.edges].sort((a, b) => (a.id < b.id ? -1 : 1))) {
      const source = positions.get(edge.source);
      const target = positions.get(edge.target);
      if (!source || !target) continue;
      const key = [edge.source, edge.target].sort().join('/');
      const parallel = counts.get(key) ?? 0;
      counts.set(key, parallel + 1);
      let points: Vector3[];
      if (edge.source === edge.target) {
        points = new CubicBezierCurve3(
          source.clone().add(new Vector3(92, 8, 0)),
          source.clone().add(new Vector3(220, 95, 0)),
          source.clone().add(new Vector3(220, -95, 0)),
          source.clone().add(new Vector3(92, -8, 0)),
        ).getPoints(24);
      } else {
        const direction = target.clone().sub(source).normalize();
        const margin = Math.min(
          Math.abs(92 / direction.x),
          Math.abs(30 / direction.y),
          Math.abs(14 / direction.z),
        );
        const start = source.clone().addScaledVector(direction, margin + 2);
        const end = target.clone().addScaledVector(direction, -margin - 4);
        const middle = start.clone().add(end).multiplyScalar(0.5);
        middle.y += 30 + parallel * 30;
        points = new QuadraticBezierCurve3(start, middle, end).getPoints(24);
      }
      const start = linePositions.length / 3;
      const color = new Color(palette.relations[edge.type]);
      for (let i = 1; i < points.length; i++)
        for (const point of [points[i - 1]!, points[i]!]) {
          linePositions.push(point.x, point.y, point.z);
          lineColors.push(color.r, color.g, color.b, 1);
        }
      const count = linePositions.length / 3 - start;
      const end = points.at(-1)!;
      const direction = end.clone().sub(points.at(-2)!).normalize();
      const arrowPosition = end.clone().addScaledVector(direction, -9);
      const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction);
      const arrow = new Matrix4().compose(arrowPosition, rotation, new Vector3(1, 1, 1));
      const label = createLabel(edge.label || relationLabels[edge.type]);
      if (label) {
        label.scale.set(150, 25, 1);
        label.position.copy(points[12]!).add(new Vector3(0, 20, 0));
        scene.add(label);
      }
      edges.push({
        source: edge.source,
        target: edge.target,
        start,
        count,
        arrow,
        type: edge.type,
        label,
      });
    }
    const arrows = new Map<string, InstancedMesh<ConeGeometry, MeshBasicMaterial>>();
    for (const type of Object.keys(relationColors) as (keyof typeof relationColors)[]) {
      const capacity = edges.filter((edge) => edge.type === type).length;
      if (!capacity) continue;
      for (const active of [true, false]) {
        const batch = resources.track(
          new InstancedMesh(
            cone,
            resources.track(
              new MeshBasicMaterial({
                color: palette.relations[type],
                transparent: true,
                opacity: active ? 1 : 0.16,
              }),
            ),
            capacity,
          ),
        );
        batch.count = 0;
        batch.frustumCulled = false;
        batch.instanceMatrix.setUsage(DynamicDrawUsage);
        scene.add(batch);
        arrows.set(`${type}/${active}`, batch);
      }
    }
    const updateArrows = (selected: string | null) => {
      for (const batch of arrows.values()) batch.count = 0;
      for (const edge of edges) {
        const active = !selected || edge.source === selected || edge.target === selected;
        const batch = arrows.get(`${edge.type}/${active}`)!;
        batch.setMatrixAt(batch.count++, edge.arrow);
      }
      for (const batch of arrows.values()) {
        batch.instanceMatrix.needsUpdate = true;
        batch.computeBoundingBox();
      }
    };
    updateArrows(null);
    const colors = new Float32BufferAttribute(lineColors, 4).setUsage(DynamicDrawUsage);
    if (linePositions.length) {
      const geometry = resources.track(new BufferGeometry());
      geometry.setAttribute('position', new Float32BufferAttribute(linePositions, 3));
      geometry.setAttribute('color', colors);
      const lines = new LineSegments(
        geometry,
        resources.track(new LineBasicMaterial({ vertexColors: true, transparent: true })),
      );
      lines.userData.kind = 'relations';
      scene.add(lines);
    }
    const parentPositions: number[] = [];
    const parentDistances: number[] = [];
    for (const node of graph.nodes) {
      const start = node.parentId ? positions.get(node.parentId) : undefined;
      const end = positions.get(node.id);
      if (start && end) {
        parentPositions.push(start.x, start.y, start.z, end.x, end.y, end.z);
        parentDistances.push(0, start.distanceTo(end));
      }
    }
    if (parentPositions.length) {
      const geometry = resources.track(new BufferGeometry());
      geometry.setAttribute('position', new Float32BufferAttribute(parentPositions, 3));
      geometry.setAttribute('lineDistance', new Float32BufferAttribute(parentDistances, 1));
      const parents = new LineSegments(
        geometry,
        resources.track(
          new LineDashedMaterial({
            color: palette.hierarchy,
            transparent: true,
            opacity: 0.45,
            dashSize: 8,
            gapSize: 6,
          }),
        ),
      );
      parents.userData.kind = 'hierarchy';
      scene.add(parents);
    }
    return {
      scene,
      pickables,
      positions,
      update: (selected, emphasize) => {
        const related = connectedNodes(graph, selected);
        for (const node of graph.nodes) {
          const object = objects.get(node.id);
          if (!object) continue;
          object.mesh.material.color.set(
            selected === node.id
              ? palette.selected
              : emphasize && isOwnContribution(node)
                ? node.contributionType === 'direct'
                  ? palette.direct
                  : palette.shared
                : palette.node,
          );
          object.mesh.material.opacity = !selected || related.has(node.id) ? 1 : 0.25;
          if (object.label) {
            object.label.visible = !selected || related.has(node.id);
            object.label.scale.set(
              selected === node.id ? 280 : 210,
              selected === node.id ? 47 : 35,
              1,
            );
          }
        }
        for (const edge of edges) {
          const active = !selected || edge.source === selected || edge.target === selected;
          for (let i = edge.start; i < edge.start + edge.count; i++)
            colors.setW(i, active ? 1 : 0.16);

          if (edge.label) edge.label.visible = active;
        }
        colors.needsUpdate = true;
        updateArrows(selected);
      },
      dispose: () => {
        resources.dispose();
        scene.clear();
        pickables.length = 0;
      },
    };
  } catch (error) {
    resources.dispose();
    scene.clear();
    throw error;
  }
}
