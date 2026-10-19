import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Mesh, BufferGeometry, LineSegments, Sprite, SpriteMaterial, Texture } from 'three';
import { largeGraph } from '../scripts/performance/fixtures';
import { layoutGraph } from '../src/features/architecture/model';
import { buildArchitectureScene } from '../src/three/ArchitectureScene';
import { inspectImage, decodeBrowserImage, createImageAsset } from '../src/packages/images';
import { ContentError } from '../src/packages/types';
import { readZip, readZipBlob, writeZip, runZipWorker } from '../src/packages/zip';
import { pngBlob } from './package-fixtures';
const rejected = (code: string) => (error: unknown) =>
  error instanceof ContentError && error.issues.some((issue) => issue.code === code);
for (const count of [50, 200])
  test(`${count}노드 배치와 묶은 연결선은 원본·선택·정리를 유지한다`, () => {
    const graph = largeGraph(count),
      original = structuredClone(graph);
    const layout = layoutGraph(graph);
    const shuffled = structuredClone(graph);
    shuffled.nodes.reverse();
    shuffled.groups.reverse();
    shuffled.edges.reverse();
    assert.deepEqual(layoutGraph(shuffled), layout);
    assert.deepEqual(graph, original);
    const scene = buildArchitectureScene(
      graph,
      (_text, resources) =>
        new Sprite(resources.track(new SpriteMaterial({ map: resources.track(new Texture()) }))),
    );
    const relations = scene.scene.children.find(
      (object) => object.userData.kind === 'relations',
    ) as LineSegments;
    const hierarchy = scene.scene.children.find(
      (object) => object.userData.kind === 'hierarchy',
    ) as LineSegments;
    assert.ok(relations);
    assert.ok(hierarchy);
    assert.equal(relations.geometry.getAttribute('position').count, count * 3 * 48);
    scene.update('node-0000', true);
    const colors = relations.geometry.getAttribute('color');
    assert.equal(colors.itemSize, 4);
    assert.equal(colors.getW(0), 1);
    assert.ok(Math.abs(colors.getW(48) - 0.16) < 1e-6);
    const node = scene.pickables.find(
      (object) => object instanceof Mesh && object.userData.nodeId === 'node-0000',
    ) as Mesh<BufferGeometry, SpriteMaterial>;
    assert.equal(node.material.opacity, 1);
    const distances = hierarchy.geometry.getAttribute('lineDistance');
    assert.equal(distances.getX(0), 0);
    assert.ok(distances.getX(1) > 0);
    assert.equal(distances.getX(2), 0);
    let disposed = 0;
    relations.geometry.addEventListener('dispose', () => disposed++);
    scene.dispose();
    scene.dispose();
    assert.equal(disposed, 1);
    assert.equal(scene.scene.children.length, 0);
  });
test('같은 불변 Blob은 브라우저에서 한 번 검사하고 메타데이터 수정으로 캐시를 오염시키지 않는다', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  let count = 0,
    closed = 0;
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: async () => {
      count++;
      return { width: 2, height: 3, close: () => closed++ };
    },
  });
  try {
    const blob = pngBlob();
    const [a, b] = await Promise.all([inspectImage(blob), inspectImage(blob)]);
    assert.equal(count, 1);
    assert.equal(closed, 1);
    a.width = 999;
    assert.equal(b.width, 2);
    assert.equal((await inspectImage(blob)).width, 2);
    let custom = 0;
    const decoder = async () => {
      custom++;
      return { width: 2, height: 3 };
    };
    await inspectImage(blob, decoder);
    await inspectImage(blob, decoder);
    assert.equal(custom, 2);
  } finally {
    if (original) Object.defineProperty(globalThis, 'createImageBitmap', original);
    else Reflect.deleteProperty(globalThis, 'createImageBitmap');
  }
});
test('브라우저 이미지 검사 실패는 캐시에 남지 않아 같은 Blob도 재시도한다', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  let count = 0;
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: async () => {
      if (++count === 1) throw Error('decode');
      return { width: 2, height: 3, close: () => {} };
    },
  });
  try {
    const blob = pngBlob();
    await assert.rejects(inspectImage(blob, decodeBrowserImage), rejected('IMAGE_DECODE'));
    assert.equal((await inspectImage(blob)).height, 3);
    assert.equal(count, 2);
  } finally {
    if (original) Object.defineProperty(globalThis, 'createImageBitmap', original);
    else Reflect.deleteProperty(globalThis, 'createImageBitmap');
  }
});
test('ZIP Worker 오류는 원래 오류 코드를 전달하고 성공/오류/시작 실패 때 작업을 정리한다', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  let terminated = 0;
  class FakeWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    onmessageerror: (() => void) | null = null;
    terminate() {
      terminated++;
    }
    postMessage() {
      queueMicrotask(() =>
        this.onmessage?.({
          data: {
            ok: false,
            issues: [
              {
                code: 'ZIP_CHECKSUM',
                severity: 'error',
                path: 'assets/test.png',
                message: 'checksum',
              },
            ],
          },
        }),
      );
    }
  }
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
  try {
    await assert.rejects(
      runZipWorker({ kind: 'read', blob: new Blob() }),
      rejected('ZIP_CHECKSUM'),
    );
    assert.equal(terminated, 1);
    class BrokenWorker extends FakeWorker {
      override postMessage() {
        queueMicrotask(() => this.onerror?.());
      }
    }
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: BrokenWorker });
    await assert.rejects(runZipWorker({ kind: 'read', blob: new Blob() }), rejected('ZIP_WORKER'));
    assert.equal(terminated, 2);
    class SuccessWorker extends FakeWorker {
      override postMessage() {
        queueMicrotask(() =>
          this.onmessage?.({ data: { ok: true, kind: 'read', files: new Map() } }),
        );
      }
    }
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: SuccessWorker });
    await runZipWorker({ kind: 'read', blob: new Blob() });
    assert.equal(terminated, 3);
    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      value: class {
        constructor() {
          throw Error('blocked');
        }
      },
    });
    await assert.rejects(runZipWorker({ kind: 'read', blob: new Blob() }), rejected('ZIP_WORKER'));
    await assert.rejects(
      writeZip(new Map([['unsafe.js', new Uint8Array(5 * 1024 * 1024)]])),
      rejected('ZIP_SIZE'),
    );
  } finally {
    if (original) Object.defineProperty(globalThis, 'Worker', original);
    else Reflect.deleteProperty(globalThis, 'Worker');
  }
});
test('Node와 작은 ZIP의 경로도 같은 바이트/CRC 검증을 적용한다', async () => {
  const files = new Map([['assets/test.png', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])]]);
  const zip = await writeZip(files);
  assert.deepEqual(await readZipBlob(zip), readZip(new Uint8Array(await zip.arrayBuffer())));
  const corrupt = new Uint8Array(await zip.arrayBuffer());
  const view = new DataView(corrupt.buffer);
  const start = 30 + view.getUint16(26, true) + view.getUint16(28, true);
  corrupt[start]! ^= 1;
  await assert.rejects(readZipBlob(new Blob([corrupt])), (error) => error instanceof ContentError);
});

test('등록 때 검사한 전체 바이트의 MIME 정규화 Blob도 재디코딩하지 않고 메타데이터를 분리한다', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  let count = 0;
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: async () => {
      count++;
      return { width: 2, height: 3, close: () => {} };
    },
  });
  try {
    const image = await createImageAsset(pngBlob(), '검증 이미지');
    image.asset.width = 999;
    assert.equal((await inspectImage(image.blob)).width, 2);
    assert.equal(count, 1);
  } finally {
    if (original) Object.defineProperty(globalThis, 'createImageBitmap', original);
    else Reflect.deleteProperty(globalThis, 'createImageBitmap');
  }
});
