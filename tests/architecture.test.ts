import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, Mesh, PerspectiveCamera, Sprite, SpriteMaterial, Texture, Vector3 } from 'three';
import { fixture } from './fixtures';
import {
  connectedNodes,
  edgeCurve,
  isOwnContribution,
  layoutGraph,
  validSelection,
} from '../src/features/architecture/model';
import {
  readGraphSession,
  writeGraphSession,
  graphSessionKey,
} from '../src/features/architecture/session';
import { DemandFrames, Resources, SingleLease } from '../src/three/lifecycle';
import { frameBounds } from '../src/three/framing';
import { buildArchitectureScene } from '../src/three/ArchitectureScene';
const graph = () => fixture('graph').architectures[0]!;
test('그룹·층·부모 배치는 입력 순서와 무관하게 안정적이며 원본을 바꾸지 않는다', () => {
  const a = graph();
  a.nodes[2]!.parentId = a.nodes[1]!.id;
  const original = structuredClone(a);
  const layout = layoutGraph(a);
  const b = structuredClone(a);
  b.nodes.reverse();
  b.groups.reverse();
  b.edges.reverse();
  assert.deepEqual(layoutGraph(b), layout);
  assert.deepEqual(a, original);
  const parent = layout.nodes.find((node) => node.id === a.nodes[1]!.id)!;
  const child = layout.nodes.find((node) => node.id === a.nodes[2]!.id)!;
  assert.ok(child.x > parent.x);
  assert.equal(child.layer, 1);
});
test('그룹 없는 노드, 빈 그룹과 빈 그래프도 유한한 배치를 만든다', () => {
  const a = graph();
  a.nodes[0]!.groupId = null;
  a.groups.push({ id: 'empty', label: '빈 그룹', layer: 20 });
  const layout = layoutGraph(a);
  assert.ok(layout.groups.some((group) => group.id === '__ungrouped'));
  assert.ok(layout.nodes.every((node) => [node.x, node.y, node.layer].every(Number.isFinite)));
  a.nodes = [];
  a.edges = [];
  assert.ok(layoutGraph(a).width > 0);
});
test('일반 연결 순환·자기 연결·평행 연결의 방향과 경로는 손실되지 않는다', () => {
  const a = graph();
  a.edges.push({
    id: 'back',
    source: 'system-c',
    target: 'system-a',
    type: 'event',
    label: '돌아가기',
    description: '',
  });
  const layout = layoutGraph(a);
  const source = layout.nodes[0]!;
  const target = layout.nodes[1]!;
  assert.notEqual(edgeCurve(source, target, 0).path, edgeCurve(source, target, 1).path);
  assert.ok(edgeCurve(source, source).path.includes('C'));
  assert.ok(edgeCurve(target, source).path);
  assert.deepEqual([...connectedNodes(a, 'system-a')].sort(), ['system-a', 'system-b', 'system-c']);
});
test('부모·자식과 직접 연결만 강조하고 삭제된 선택을 비운다', () => {
  const a = graph();
  a.nodes[2]!.parentId = 'system-a';
  assert.ok(connectedNodes(a, 'system-a').has('system-c'));
  assert.equal(validSelection(a, 'system-a'), 'system-a');
  a.nodes.shift();
  assert.equal(validSelection(a, 'system-a'), null);
  assert.equal(validSelection(a, null), null);
});
test('직접·공동만 내 담당에 포함하며 출처별 세션은 격리된다', () => {
  const a = graph();
  a.nodes[0]!.contributionType = 'direct';
  a.nodes[1]!.contributionType = 'shared';
  a.nodes[2]!.contributionType = 'team';
  assert.ok(isOwnContribution(a.nodes[0]!));
  assert.ok(isOwnContribution(a.nodes[1]!));
  assert.ok(!isOwnContribution(a.nodes[2]!));
  const key = graphSessionKey('workspace/test', 'project');
  const state = {
    selectedId: 'system-b',
    emphasize: true,
    view: '3d' as const,
    camera: { position: [1, 2, 3], target: [0, 0, 0] },
  };
  writeGraphSession(key, state);
  state.camera.position[0] = 999;
  assert.equal(readGraphSession(key).camera?.position[0], 1);
  assert.equal(readGraphSession(graphSessionKey('public/test', 'project')).selectedId, null);
});
test('프레임 요청을 합치고 숨김·정리 후에는 실행하지 않는다', () => {
  let next = 0;
  let draws = 0;
  const callbacks = new Map<number, () => void>();
  const canceled: number[] = [];
  const frames = new DemandFrames(
    {
      request: (callback) => {
        callbacks.set(++next, callback);
        return next;
      },
      cancel: (id) => {
        canceled.push(id);
        callbacks.delete(id);
      },
    },
    () => draws++,
  );
  frames.request();
  frames.request();
  assert.equal(callbacks.size, 1);
  callbacks.get(1)!();
  callbacks.delete(1);
  assert.equal(draws, 1);
  assert.equal(callbacks.size, 0);
  frames.request();
  frames.setPaused(true);
  assert.deepEqual(canceled, [2]);
  frames.request();
  assert.equal(callbacks.size, 0);
  frames.setPaused(false);
  assert.equal(callbacks.size, 1);
  frames.dispose();
  frames.dispose();
  assert.equal(callbacks.size, 0);
  frames.request();
  assert.equal(callbacks.size, 0);
});
test('단일 호스트 소유권은 이전 장면부터 정리하고 오래된 release가 새 장면을 지우지 않는다', () => {
  const owner = new SingleLease();
  const events: string[] = [];
  const a = owner.acquire(() => events.push('a'));
  const b = owner.acquire(() => events.push('b'));
  assert.deepEqual(events, ['a']);
  a();
  assert.deepEqual(events, ['a']);
  b();
  b();
  assert.deepEqual(events, ['a', 'b']);
});
test('공유 자원은 한 번만 해제하고 한 자원의 오류 뒤에도 정리를 계속한다', () => {
  let count = 0;
  const resources = new Resources();
  const shared = { dispose: () => count++ };
  resources.track(shared);
  resources.track(shared);
  resources.track({
    dispose: () => {
      throw Error('fail');
    },
  });
  resources.track({ dispose: () => count++ });
  resources.dispose();
  resources.dispose();
  assert.equal(count, 2);
});
test('실제 Three 오브젝트에서 선택은 ID를 유지하며 층과 정리를 적용한다', () => {
  const a = graph();
  a.nodes[0]!.contributionType = 'direct';
  const disposals = new Map<object, number>();
  const architecture = buildArchitectureScene(a, (text, resources) => {
    assert.ok(text);
    const texture = resources.track(new Texture());
    const material = resources.track(new SpriteMaterial({ map: texture }));
    return new Sprite(material);
  });
  const tracked = new Set<{ addEventListener: (type: 'dispose', listener: () => void) => void }>();
  architecture.scene.traverse((object) => {
    if ('geometry' in object) tracked.add((object as Mesh).geometry);
    if ('material' in object) {
      const materials = (object as Mesh).material;
      for (const material of Array.isArray(materials) ? materials : [materials]) {
        tracked.add(material);
        if ('map' in material && material.map instanceof Texture) tracked.add(material.map);
      }
    }
  });
  for (const item of tracked)
    item.addEventListener('dispose', () => disposals.set(item, (disposals.get(item) ?? 0) + 1));
  assert.equal(architecture.positions.get('system-b')!.y, 140);
  assert.ok(architecture.pickables.some((object) => object.userData.nodeId === 'system-b'));
  const before = architecture.scene.children.length;
  architecture.update('system-a', true);
  architecture.update('system-c', false);
  assert.equal(architecture.scene.children.length, before);
  architecture.dispose();
  assert.equal(architecture.scene.children.length, 0);
  assert.equal(architecture.pickables.length, 0);
  assert.ok(disposals.size > 5);
  assert.equal(disposals.size, tracked.size);
  assert.ok([...disposals.values()].every((count) => count === 1));
  const old = [...disposals.values()];
  architecture.dispose();
  assert.deepEqual([...disposals.values()], old);
});
test('장면 구성 중 오류가 나면 생성한 Three 자원을 정리한다', () => {
  let disposed = 0;
  assert.throws(
    () =>
      buildArchitectureScene(graph(), (_text, resources) => {
        resources.track({ dispose: () => disposed++ });
        throw Error('label fail');
      }),
    /label fail/,
  );
  assert.equal(disposed, 1);
});

for (const aspect of [1.94, 0.9])
  test(`카메라 전체 맞춤은 화면 비율 ${aspect}에서 장면의 모서리를 모두 포함한다`, () => {
    const bounds = new Box3(new Vector3(-304, -40, -100), new Vector3(304, 250, 250));
    const frame = frameBounds(bounds, aspect, 45);
    const camera = new PerspectiveCamera(45, aspect, 0.1, frame.distance * 10);
    camera.position.copy(frame.position);
    camera.lookAt(frame.target);
    camera.updateMatrixWorld();
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const point = new Vector3(x, y, z).project(camera);
          assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && point.z < 1);
        }
  });
test('평행 연결과 자기 연결이 많아도 전체 맞춤 범위에 경로와 라벨이 포함된다', () => {
  const a = graph();
  for (let i = 0; i < 12; i++)
    a.edges.push({
      id: `extra-${i}`,
      source: 'system-a',
      target: i % 2 ? 'system-a' : 'system-b',
      type: 'call',
      label: '검증용 긴 연결 이름',
      description: '',
    });
  const layout = layoutGraph(a);
  const positions = new Map(layout.nodes.map((node) => [node.id, node]));
  const counts = new Map<string, number>();
  for (const edge of [...a.edges].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const key = [edge.source, edge.target].sort().join('/');
    const index = counts.get(key) ?? 0;
    counts.set(key, index + 1);
    const curve = edgeCurve(positions.get(edge.source)!, positions.get(edge.target)!, index);
    assert.ok(curve.bounds.minX >= layout.x && curve.bounds.maxX <= layout.x + layout.width);
    assert.ok(curve.bounds.minY >= layout.y && curve.bounds.maxY <= layout.y + layout.height);
    assert.ok(curve.labelX >= layout.x && curve.labelY >= layout.y);
  }
});
