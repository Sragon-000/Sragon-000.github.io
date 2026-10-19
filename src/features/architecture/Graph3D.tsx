import { useEffect, useRef } from 'react';
import { Box3, PerspectiveCamera, Raycaster, Vector2 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Architecture } from '../../domain/types';
import { createRendererHost } from '../../three/RendererHost';
import { frameBounds } from '../../three/framing';
import { buildArchitectureScene } from '../../three/ArchitectureScene';
import type { GraphSession } from './session';
import type { ThemePreset } from '../../three/palette';
interface Props {
  graph: Architecture;
  theme?: ThemePreset;
  selectedId: string | null;
  emphasize: boolean;
  onSelect: (id: string) => void;
  onError: (message: string) => void;
  camera?: GraphSession['camera'];
  onCamera: (camera: NonNullable<GraphSession['camera']>) => void;
  reset: number;
}
export default function Graph3D(props: Props) {
  const root = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const poseOutput = useRef<HTMLOutputElement>(null);
  const api = useRef<{ update: () => void; fit: () => void; loseContext: () => void } | null>(null);
  const firstReset = useRef(props.reset);
  useEffect(() => {
    if (!root.current) return;
    let host: ReturnType<typeof createRendererHost> | undefined;
    try {
      host = createRendererHost(root.current, (message) => latest.current.onError(message));
      const architecture = buildArchitectureScene(props.graph, undefined, props.theme);
      host.own(() => architecture.dispose());
      const camera = new PerspectiveCamera(45, 1, 0.1, 100000);
      const controls = new OrbitControls(camera, host.renderer.domElement);
      controls.enableDamping = false;
      controls.screenSpacePanning = true;
      controls.enablePan = true;
      controls.minDistance = 30;
      host.own(() => controls.dispose());
      const bounds = new Box3().setFromObject(architecture.scene);
      const fit = () => {
        const frame = frameBounds(bounds, camera.aspect, camera.fov);
        controls.target.copy(frame.target);
        camera.position.copy(frame.position);
        camera.far = frame.distance * 10;
        camera.updateProjectionMatrix();
        controls.maxDistance = frame.distance * 4;
        controls.update();
        host?.request();
      };
      host.onResize((width, height) => {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      });
      fit();
      const saved = latest.current.camera;
      if (
        saved &&
        saved.position.length === 3 &&
        saved.target.length === 3 &&
        [...saved.position, ...saved.target].every(Number.isFinite)
      ) {
        camera.position.fromArray(saved.position);
        controls.target.fromArray(saved.target);
        controls.update();
      }
      const changed = () => {
        const value = { position: camera.position.toArray(), target: controls.target.toArray() };
        if (import.meta.env.DEV && poseOutput.current)
          poseOutput.current.textContent = JSON.stringify(value);
        latest.current.onCamera(value);
        host?.request();
      };
      controls.addEventListener('change', changed);
      host.own(() => controls.removeEventListener('change', changed));
      changed();
      const ray = new Raycaster();
      const pointer = new Vector2();
      let down: { id: number; x: number; y: number } | null = null;
      const canvas = host.renderer.domElement;
      const start = (event: PointerEvent) => {
        down =
          event.isPrimary && event.button === 0
            ? { id: event.pointerId, x: event.clientX, y: event.clientY }
            : null;
      };
      const end = (event: PointerEvent) => {
        if (
          !down ||
          down.id !== event.pointerId ||
          Math.hypot(event.clientX - down.x, event.clientY - down.y) > 7
        ) {
          down = null;
          return;
        }
        down = null;
        const bounds = canvas.getBoundingClientRect();
        pointer.set(
          ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          (-(event.clientY - bounds.top) / bounds.height) * 2 + 1,
        );
        ray.setFromCamera(pointer, camera);
        const hit = ray.intersectObjects(architecture.pickables).find((hit) => hit.object.visible);
        if (typeof hit?.object.userData.nodeId === 'string')
          latest.current.onSelect(hit.object.userData.nodeId);
      };
      const cancel = () => {
        down = null;
      };
      canvas.addEventListener('pointerdown', start);
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointercancel', cancel);
      host.own(() => {
        canvas.removeEventListener('pointerdown', start);
        canvas.removeEventListener('pointerup', end);
        canvas.removeEventListener('pointercancel', cancel);
      });
      const update = () => {
        architecture.update(latest.current.selectedId, latest.current.emphasize);
        host?.request();
      };
      api.current = { update, fit, loseContext: () => host?.renderer.forceContextLoss() };
      update();
      host.setScene(architecture.scene, camera);
    } catch {
      host?.dispose();
      latest.current.onError(
        '3D 화면을 열 수 없습니다. 2D 보기와 시스템 목록으로 계속 확인할 수 있습니다.',
      );
    }
    return () => {
      api.current = null;
      host?.dispose();
    };
  }, [props.graph, props.theme]);
  useEffect(() => api.current?.update(), [props.selectedId, props.emphasize]);
  useEffect(() => {
    if (firstReset.current !== props.reset) {
      firstReset.current = props.reset;
      api.current?.fit();
    }
  }, [props.reset]);
  return (
    <>
      <div className="graph-three" ref={root} />
      <p className="field-note">
        드래그로 회전, 휠·두 손가락으로 확대합니다. 시스템 목록에서도 선택할 수 있습니다.
      </p>
      {import.meta.env.DEV && (
        <details>
          <summary>개발용 그래프 검사</summary>
          <output ref={poseOutput} aria-label="개발용 그래프 시점" aria-live="off" />
          <button onClick={() => api.current?.loseContext()}>개발용 3D 연결 종료 검사</button>
        </details>
      )}
    </>
  );
}
