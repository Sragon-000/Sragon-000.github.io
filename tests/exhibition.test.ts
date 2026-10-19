import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Mesh, Texture } from 'three';
import { createProject } from '../src/domain/create';
import {
  CameraFlight,
  destinationPose,
  makeRooms,
  normalizeSession,
  validPose,
  workDestination,
} from '../src/features/exhibition/model';
import { readExhibitionSession, writeExhibitionSession } from '../src/features/exhibition/session';
import { buildExhibitionScene } from '../src/three/ExhibitionScene';
import { detailReturn, rememberExhibition, rememberGallery } from '../src/app/navigation';
const projects = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ ...createProject(), title: `검증 작품 ${i + 1}` }));
for (const count of [0, 1, 3, 10])
  test(`${count}작품 배치는 모든 작품을 순서대로 최대 6개씩 전시실에 포함한다`, () => {
    const data = projects(count);
    const original = structuredClone(data);
    const rooms = makeRooms(data);
    assert.equal(rooms.length, Math.ceil(count / 6));
    assert.deepEqual(
      rooms.flatMap((room) => room.works.map((work) => work.project.id)),
      data.map((project) => project.id),
    );
    assert.ok(
      rooms.every(
        (room) =>
          room.works.length <= 6 &&
          new Set(room.works.map((work) => `${work.x}/${work.z}`)).size === room.works.length,
      ),
    );
    assert.deepEqual(data, original);
    assert.deepEqual(
      rooms.flatMap((room) => room.works.map((work) => work.ordinal)),
      data.map((_, i) => i + 1),
    );
  });
test('이동 지점과 로비는 유효 시점을 제공하고 작은 화면은 넓게 관람한다', () => {
  const room = makeRooms(projects(3))[0]!;
  const target = destinationPose(room, workDestination(room.works[0]!.project.id));
  assert.ok(validPose(target));
  assert.ok(target.position[0]! > -7.7 && target.position[0]! < 7.7);
  assert.ok(
    destinationPose(room, 'lobby', 0.6).position[2]! >
      destinationPose(room, 'lobby', 1.8).position[2]!,
  );
  assert.deepEqual(destinationPose(room, 'work:missing'), destinationPose(room, 'lobby'));
});
test('작품이 다른 전시실로 옮겨지거나 삭제되면 카메라와 선택을 정리한다', () => {
  const data = projects(10);
  const rooms = makeRooms(data);
  const selectedId = data[0]!.id;
  const camera = { position: [1, 2, 3], target: [0, 0, 0] };
  const initial = { room: 0, selectedId, destination: workDestination(selectedId), camera };
  const same = normalizeSession(rooms, initial);
  assert.deepEqual(same.camera, camera);
  same.camera!.position[0] = 999;
  assert.equal(initial.camera.position[0], 1);
  const changed = normalizeSession(makeRooms([...data.slice(1), data[0]!]), initial);
  assert.equal(changed.room, 1);
  assert.equal(changed.camera, undefined);
  const deleted = normalizeSession(makeRooms(data.slice(1)), initial);
  assert.equal(deleted.selectedId, null);
  assert.equal(deleted.destination, 'lobby');
  assert.equal(deleted.camera, undefined);
  assert.equal(normalizeSession([], initial).camera, undefined);
});
test('새 이동 요청은 현재 시점에서 시작해 최신 목적지에 도착한다', () => {
  const flight = new CameraFlight();
  const from = { position: [0, 3, 15], target: [0, 2, -6] };
  const first = { position: [-3.5, 3, -5], target: [-7.7, 2.7, -9] };
  const final = { position: [3.5, 3, -5], target: [7.7, 2.7, -9] };
  flight.start(from, first, false);
  flight.step(0);
  const middle = flight.step(50).pose;
  assert.notDeepEqual(middle, from);
  assert.notDeepEqual(middle, first);
  flight.start(middle, final, false);
  flight.step(60);
  let result = flight.step(100);
  for (let time = 150; time <= 1000; time += 50) result = flight.step(time);
  assert.equal(result.moving, false);
  assert.deepEqual(result.pose, final);
});
test('동작 줄이기는 즉시 도착하고 숨김 뒤 큰 시간 차이로 순간 이동하지 않는다', () => {
  const flight = new CameraFlight();
  const from = { position: [0, 0, 0], target: [0, 0, -1] };
  const target = { position: [10, 4, 3], target: [1, 2, 0] };
  assert.equal(flight.start(from, target, true), false);
  assert.deepEqual(flight.step(0).pose, target);
  flight.start(from, target, false);
  flight.step(0);
  const resumed = flight.step(60000);
  assert.equal(resumed.moving, true);
  assert.ok(resumed.pose.position[0]! < 1);
  assert.deepEqual(flight.finish(), target);
});
test('관람 시점은 출처와 모드별로 격리되며 저장값을 변형하지 않는다', () => {
  const session = {
    room: 1,
    selectedId: 'test',
    destination: 'lobby' as const,
    camera: { position: [1, 2, 3], target: [0, 0, 0] },
  };
  writeExhibitionSession('workspace/test/workspace', session);
  session.camera.position[0] = 900;
  assert.equal(readExhibitionSession('workspace/test/workspace').camera?.position[0], 1);
  assert.equal(readExhibitionSession('workspace/test/public').selectedId, null);
  assert.equal(readExhibitionSession('public/test/public').room, 0);
  assert.ok(!validPose({ position: [NaN, 1, 1], target: [0, 0, 0] }));
});
test('전시장 출발은 상세의 복귀 대상이 되며 갤러리 출발과 다른 출처는 분리한다', () => {
  rememberExhibition('source/public');
  assert.equal(detailReturn('source/public').href, '#/exhibition');
  assert.equal(detailReturn('other/public').href, '#/gallery');
  // Supply the only browser property rememberGallery reads.
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: { scrollY: 12 }, configurable: true });
  rememberGallery('test');
  assert.equal(detailReturn('source/public').href, '#/gallery');
  if (previous) Object.defineProperty(globalThis, 'window', previous);
  else Reflect.deleteProperty(globalThis, 'window');
});
test('Three 전시장은 현재 방의 표지만 준비하고 패널/지점은 고정 ID로 선택한다', () => {
  const data = projects(10);
  const room = makeRooms(data)[1]!;
  let posterCount = 0;
  const exhibition = buildExhibitionScene(
    room,
    () => undefined,
    () => {},
    () => {
      posterCount++;
      return { texture: new Texture() };
    },
  );
  assert.equal(posterCount, 4);
  assert.equal(
    exhibition.pickables.filter((object) => object.userData.kind === 'project').length,
    4,
  );
  assert.equal(
    exhibition.pickables.filter((object) => object.userData.kind === 'destination').length,
    4,
  );
  assert.ok(exhibition.pickables.some((object) => object.userData.id === data[6]!.id));
  const before = exhibition.scene.children.length;
  exhibition.update(data[6]!.id);
  exhibition.update(null);
  assert.equal(exhibition.scene.children.length, before);
  exhibition.dispose();
  assert.equal(exhibition.scene.children.length, 0);
});
test('전시장 geometry/material/texture는 한 번 정리하고 표지 비동기 작업도 중단한다', () => {
  let canceled = 0;
  const exhibition = buildExhibitionScene(
    makeRooms(projects(3))[0]!,
    () => undefined,
    () => {},
    () => ({ texture: new Texture(), dispose: () => canceled++ }),
  );
  const items = new Set<{ addEventListener: (type: 'dispose', listener: () => void) => void }>();
  exhibition.scene.traverse((object) => {
    if ('geometry' in object) items.add((object as Mesh).geometry);
    if ('material' in object) {
      const materials = (object as Mesh).material;
      for (const material of Array.isArray(materials) ? materials : [materials]) {
        items.add(material);
        if ('map' in material && material.map instanceof Texture) items.add(material.map);
      }
    }
  });
  let disposed = 0;
  for (const item of items) item.addEventListener('dispose', () => disposed++);
  exhibition.dispose();
  assert.equal(disposed, items.size);
  assert.equal(canceled, 3);
  exhibition.dispose();
  assert.equal(disposed, items.size);
  assert.equal(canceled, 3);
});
test('표지 구성 실패도 이미 준비한 전시장 자원과 작업을 정리한다', () => {
  let call = 0;
  let cleaned = 0;
  assert.throws(
    () =>
      buildExhibitionScene(
        makeRooms(projects(3))[0]!,
        () => undefined,
        () => {},
        () => {
          if (++call === 2) throw Error('fail');
          return { texture: new Texture(), dispose: () => cleaned++ };
        },
      ),
    /fail/,
  );
  assert.equal(cleaned, 1);
});
