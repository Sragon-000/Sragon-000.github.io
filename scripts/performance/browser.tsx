import GraphEditor from '../../src/features/studio/GraphEditor';
import { EditorContext } from '../../src/features/studio/EditorFields';
import { WorkspaceController } from '../../src/storage/controller';
import { useRef, useState, useSyncExternalStore } from 'react';
import Graph3D from '../../src/features/architecture/Graph3D';
import type { GraphSession } from '../../src/features/architecture/session';
import '../../src/app/styles.css';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import Graph2D from '../../src/features/architecture/Graph2D';
import { layoutGraph } from '../../src/features/architecture/model';
import { buildArchitectureScene } from '../../src/three/ArchitectureScene';
import { Box3, PerspectiveCamera, WebGLRenderer } from 'three';
import { frameBounds } from '../../src/three/framing';
import { largeGraph } from './fixtures';
import { inspectImage } from '../../src/packages/images';
import { readPortfolioPackage, exportWorkspaceBackup } from '../../src/packages/portfolio-package';
import { emptyMetadata } from '../../src/packages/types';
import { createWorkspace, createProject } from '../../src/domain/create';
import type { WorkspaceSession } from '../../src/packages/types';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
async function observe(task: () => Promise<unknown>) {
  let last = performance.now(),
    gap = 0;
  const interval = setInterval(() => {
    const now = performance.now();
    gap = Math.max(gap, now - last);
    last = now;
  }, 16);
  await pause(40);
  const start = performance.now();
  await task();
  const elapsed = performance.now() - start;
  await pause(40);
  clearInterval(interval);
  return { ms: elapsed, maxTimerGapMs: gap };
}
async function run() {
  const output: Record<string, unknown> = {};
  const root = createRoot(document.getElementById('graph')!);
  for (const count of [50, 200]) {
    const graph = largeGraph(count);
    const timings = [];
    for (let i = 0; i < 30; i++) {
      const start = performance.now();
      layoutGraph(graph);
      timings.push(performance.now() - start);
    }
    const props = {
      graph,
      selectedId: null as string | null,
      emphasize: false,
      onSelect: () => {},
      onBox: () => {},
      reset: 0,
    };
    let start = performance.now();
    flushSync(() => root.render(<Graph2D {...props} />));
    const mount = performance.now() - start;
    const selection = [];
    for (let i = 0; i < 20; i++) {
      start = performance.now();
      flushSync(() => root.render(<Graph2D {...props} selectedId={graph.nodes[i % count]!.id} />));
      selection.push(performance.now() - start);
    }
    const pan = [];
    const button = [...document.querySelectorAll('button')].find(
      (button) => button.getAttribute('aria-label') === '2D 오른쪽으로 이동',
    )!;
    for (let i = 0; i < 20; i++) {
      start = performance.now();
      flushSync(() => button.click());
      pan.push(performance.now() - start);
    }
    start = performance.now();
    const scene = buildArchitectureScene(graph);
    const construct = performance.now() - start;
    const textures = new Set<{ image: { width: number; height: number } }>();
    scene.scene.traverse((object) => {
      const material = (
        object as unknown as { material?: { map?: { image: { width: number; height: number } } } }
      ).material;
      if (material?.map) textures.add(material.map);
    });
    const renderer = new WebGLRenderer({ antialias: false });
    renderer.setSize(960, 540);
    const camera = new PerspectiveCamera(45, 960 / 540, 0.1, 100000);
    const frame = frameBounds(new Box3().setFromObject(scene.scene), camera.aspect, camera.fov);
    camera.position.copy(frame.position);
    camera.lookAt(frame.target);
    camera.far = frame.distance * 10;
    camera.updateProjectionMatrix();
    scene.update(null, false);
    start = performance.now();
    renderer.render(scene.scene, camera);
    const firstDraw = performance.now() - start;
    const info = {
      calls: renderer.info.render.calls,
      textures: renderer.info.memory.textures,
      geometries: renderer.info.memory.geometries,
    };
    (window as unknown as { atlasSample: string }).atlasSample = (
      [...textures][0]!.image as HTMLCanvasElement
    ).toDataURL('image/png');
    const pixels = [...new Set([...textures].map((texture) => texture.image))].reduce(
      (n, image) => n + image.width * image.height,
      0,
    );
    scene.dispose();
    renderer.render(scene.scene, camera);
    const remaining = {
      textures: renderer.info.memory.textures,
      geometries: renderer.info.memory.geometries,
    };
    renderer.dispose();
    renderer.forceContextLoss();
    const controller = await editorController(count);
    const editRoot = createRoot(document.getElementById('editor')!);
    const editorStart = performance.now();
    flushSync(() => editRoot.render(<EditorInspection controller={controller} />));
    const editorMountMs = performance.now() - editorStart;
    const editorOptions = document.querySelectorAll('#editor option').length;
    editRoot.unmount();
    output[`graph${count}`] = {
      editorMountMs,
      editorOptions,
      nodes: count,
      edges: graph.edges.length,
      layoutMedianMs: median(timings),
      mountMs: mount,
      selectionMedianMs: median(selection),
      panMedianMs: median(pan),
      sceneMs: construct,
      firstDrawMs: firstDraw,
      texturePixels: pixels,
      textureRgbaBytes: pixels * 4,
      renderer: info,
      remaining,
    };
  }
  root.unmount();
  const png = await (await fetch('/fixtures/image.png')).blob();
  const photo = await (await fetch('/fixtures/photo.jpg')).blob();
  output.imagePng = await observe(() => inspectImage(png));
  output.imagePhoto = await observe(() => inspectImage(photo));
  output.imagePhotoRepeat = await observe(async () => {
    for (let i = 0; i < 8; i++) await inspectImage(photo);
  });
  const zip = await (await fetch('/fixtures/large.zip')).blob();
  output.zipRead = await observe(() => readPortfolioPackage(zip));
  const data = createWorkspace();
  data.site.profile.displayName = '성능 검사 제작자';
  data.site.exhibition.title = '성능 검사 전시장';
  const project = createProject();
  project.title = '성능 검사 작품';
  project.summary = '성능 검사에만 사용';
  data.projects = [project];
  data.site.exhibition.projectOrder = [project.id];
  const inspected = await inspectImage(png);
  data.assets = Array.from({ length: 8 }, (_, i) => ({
    id: `asset-${i}`,
    path: `assets/asset-${i}.png`,
    alt: '검증 이미지',
    ...inspected,
  }));
  project.media.screenshotAssetIds = data.assets.map((asset) => asset.id);
  const session: WorkspaceSession = {
    workspaceId: 'performance-test',
    revision: 1,
    data,
    metadata: emptyMetadata(),
    assets: new Map(data.assets.map((asset) => [asset.id, png])),
  };
  output.zipExport = await observe(() => exportWorkspaceBackup(session));
  output.fixture = {
    pngBytes: png.size,
    pngPixels: 1024 * 1024,
    photoBytes: photo.size,
    photoPixels: 4096 * 4096,
    zipBytes: zip.size,
    assets: 8,
  };
  return output;
}
(window as unknown as { runPerformance: typeof run }).runPerformance = run;

function GraphInspection({ count }: { count: number }) {
  const [graph] = useState(() => largeGraph(count));
  const [selectedId, select] = useState<string | null>(null);
  const [view, setView] = useState<'2d' | '3d'>('2d');
  const [message, setMessage] = useState('');
  const box = useRef<GraphSession['box']>(undefined);
  const camera = useRef<GraphSession['camera']>(undefined);
  const shared = { graph, selectedId, emphasize: true, onSelect: select, reset: 0 };
  return (
    <>
      <button onClick={() => setView('2d')}>검증 2D</button>
      <button onClick={() => setView('3d')}>검증 3D</button>
      <output aria-label="선택한 검증 시스템">{selectedId}</output>
      <p role="status">{message}</p>
      {view === '2d' ? (
        <Graph2D
          {...shared}
          savedBox={box.current}
          onBox={(value) => {
            box.current = value;
          }}
        />
      ) : (
        <Graph3D
          {...shared}
          camera={camera.current}
          onCamera={(value) => {
            camera.current = value;
          }}
          onError={setMessage}
        />
      )}
    </>
  );
}
(window as unknown as { inspectGraph: (count: number) => void }).inspectGraph = (count) => {
  const root = createRoot(document.getElementById('graph')!);
  flushSync(() => root.render(<GraphInspection count={count} />));
};

async function editorController(count: number) {
  const data = createWorkspace();
  const project = createProject();
  project.id = 'performance-project';
  project.slug = project.id;
  project.title = '성능 검사 작품';
  project.summary = '편집 검사에만 사용';
  data.projects = [project];
  data.site.exhibition.projectOrder = [project.id];
  data.architectures = [largeGraph(count)];
  const session: WorkspaceSession = {
    workspaceId: 'performance-editor',
    revision: 1,
    data,
    metadata: emptyMetadata(),
    assets: new Map(),
  };
  const controller = new WorkspaceController(
    {
      load: async () => session,
      save: async () => ({
        revision: 1,
        savedAt: new Date().toISOString(),
        token: 'performance-only',
      }),
    },
    'performance-only',
  );
  await controller.initialize();
  return controller;
}
function EditorInspection({ controller }: { controller: WorkspaceController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return (
    <EditorContext.Provider
      value={{ runtime: controller, state, blocked: false, requestDelete: () => {} }}
    >
      <GraphEditor projectId="performance-project" />
    </EditorContext.Provider>
  );
}
(window as unknown as { inspectEditor: (count: number) => Promise<void> }).inspectEditor = async (
  count,
) => {
  const controller = await editorController(count);
  const root = createRoot(document.getElementById('editor')!);
  flushSync(() => root.render(<EditorInspection controller={controller} />));
};
