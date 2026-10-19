import { useEffect, useRef } from 'react';
import { PerspectiveCamera, Raycaster, Vector2 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRendererHost } from '../../three/RendererHost';
import { buildExhibitionScene } from '../../three/ExhibitionScene';
import type { ThemePreset } from '../../three/palette';
import {
  CameraFlight,
  destinationPose,
  validPose,
  workDestination,
  type Destination,
  type ExhibitionRoom,
  type Pose,
} from './model';
interface Props {
  theme?: ThemePreset;
  room: ExhibitionRoom;
  selectedId: string | null;
  camera?: Pose;
  destination: Destination;
  command: number;
  reduced: boolean;
  image: (id: string | null) => string | undefined;
  onSelect: (id: string) => void;
  onVisit: (id: string) => void;
  onLobby: () => void;
  onPose: (pose: Pose) => void;
  onMoving: (moving: boolean) => void;
  onError: (message: string) => void;
}
export default function Exhibition3D(props: Props) {
  const root = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const poseOutput = useRef<HTMLOutputElement>(null);
  const api = useRef<{
    move: (destination: Destination, reduced: boolean) => void;
    update: () => void;
    lose: () => void;
    reduce: () => void;
  } | null>(null);
  const initialCommand = useRef(props.command);
  useEffect(() => {
    if (!root.current) return;
    let host: ReturnType<typeof createRendererHost> | undefined;
    try {
      host = createRendererHost(root.current, (message) => latest.current.onError(message), {
        label: '3D 프로젝트 전시장',
        fallback: '갤러리와 작품 목록으로 계속 관람할 수 있습니다.',
      });
      const exhibition = buildExhibitionScene(
        props.room,
        props.image,
        () => host?.request(),
        undefined,
        props.theme,
      );
      host.own(() => exhibition.dispose());
      const camera = new PerspectiveCamera(55, 1, 0.1, 200);
      const controls = new OrbitControls(camera, host.renderer.domElement);
      controls.enableDamping = false;
      controls.enablePan = false;
      controls.minDistance = 3;
      controls.maxDistance = 65;
      controls.minPolarAngle = 0.1;
      controls.maxPolarAngle = Math.PI / 2 - 0.03;
      host.own(() => controls.dispose());
      host.onResize((width, height) => {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      });
      const flight = new CameraFlight();
      let moving = false;
      const pose = (): Pose => ({
        position: camera.position.toArray(),
        target: controls.target.toArray(),
      });
      const report = () => {
        const value = pose();
        if (import.meta.env.DEV && poseOutput.current)
          poseOutput.current.textContent = JSON.stringify(value);
        latest.current.onPose(value);
      };
      function bounds(destination: Destination) {
        const work = props.room.works.find(
          (work) => workDestination(work.project.id) === destination,
        );
        controls.minAzimuthAngle = work ? (work.x < 0 ? 0.05 : -Math.PI / 2 + 0.05) : -0.65;
        controls.maxAzimuthAngle = work ? (work.x < 0 ? Math.PI / 2 - 0.05 : -0.05) : 0.65;
        controls.maxDistance = work ? 14 : 65;
      }
      function apply(next: Pose) {
        camera.position.fromArray(next.position);
        controls.target.fromArray(next.target);
        controls.update();
        report();
      }
      const initial = latest.current;
      bounds(initial.destination);
      apply(
        validPose(initial.camera)
          ? initial.camera
          : destinationPose(props.room, initial.destination, camera.aspect),
      );
      const changed = () => {
        if (!moving) report();
        host?.request();
      };
      controls.addEventListener('change', changed);
      host.own(() => controls.removeEventListener('change', changed));
      const move = (destination: Destination, reduced: boolean) => {
        moving = flight.start(
          pose(),
          destinationPose(props.room, destination, camera.aspect),
          reduced,
        );
        controls.enabled = !moving;
        controls.minAzimuthAngle = -Infinity;
        controls.maxAzimuthAngle = Infinity;
        controls.maxDistance = 65;
        if (!moving) {
          bounds(destination);
          apply(flight.finish());
        }
        latest.current.onMoving(moving);
        host?.request();
      };
      host.animate((time) => {
        if (!moving) return false;
        const next = flight.step(time);
        moving = next.moving;
        if (!moving) {
          bounds(latest.current.destination);
          controls.enabled = true;
          latest.current.onMoving(false);
        }
        apply(next.pose);
        return moving;
      });
      const raycaster = new Raycaster();
      const pointer = new Vector2();
      const canvas = host.renderer.domElement;
      let down: { id: number; x: number; y: number } | null = null;
      const downEvent = (event: PointerEvent) => {
        down =
          !moving && event.isPrimary && event.button === 0
            ? { id: event.pointerId, x: event.clientX, y: event.clientY }
            : null;
      };
      const upEvent = (event: PointerEvent) => {
        if (
          moving ||
          !down ||
          down.id !== event.pointerId ||
          Math.hypot(event.clientX - down.x, event.clientY - down.y) > 7
        ) {
          down = null;
          return;
        }
        down = null;
        const rect = canvas.getBoundingClientRect();
        pointer.set(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          (-(event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
        const data = raycaster.intersectObjects(exhibition.pickables)[0]?.object.userData;
        if (data?.kind === 'project' && typeof data.id === 'string')
          latest.current.onSelect(data.id);
        else if (data?.kind === 'destination' && typeof data.id === 'string')
          latest.current.onVisit(data.id);
        else if (data?.kind === 'lobby') latest.current.onLobby();
      };
      const cancel = () => {
        down = null;
      };
      canvas.addEventListener('pointerdown', downEvent);
      canvas.addEventListener('pointerup', upEvent);
      canvas.addEventListener('pointercancel', cancel);
      host.own(() => {
        canvas.removeEventListener('pointerdown', downEvent);
        canvas.removeEventListener('pointerup', upEvent);
        canvas.removeEventListener('pointercancel', cancel);
      });
      const update = () => {
        exhibition.update(latest.current.selectedId);
        host?.request();
      };
      api.current = {
        move,
        update,
        reduce: () => {
          if (moving) move(latest.current.destination, true);
        },
        lose: () => host?.renderer.forceContextLoss(),
      };
      update();
      host.setScene(exhibition.scene, camera);
      latest.current.onMoving(false);
    } catch {
      host?.dispose();
      latest.current.onError(
        '3D 전시장을 열 수 없습니다. 작품 목록이나 갤러리에서 계속 관람해 주세요.',
      );
    }
    return () => {
      api.current = null;
      host?.dispose();
    };
  }, [props.room, props.image, props.theme]);
  useEffect(() => api.current?.update(), [props.selectedId]);
  useEffect(() => {
    if (initialCommand.current !== props.command) {
      initialCommand.current = props.command;
      api.current?.move(props.destination, props.reduced);
    }
  }, [props.command, props.destination, props.reduced]);
  useEffect(() => {
    if (props.reduced) api.current?.reduce();
  }, [props.reduced]);
  return (
    <>
      <div className="exhibition-canvas" ref={root} />
      {import.meta.env.DEV && (
        <details className="exhibition-dev">
          <summary>개발용 전시장 검사</summary>
          <output ref={poseOutput} aria-label="개발용 전시장 시점" aria-live="off" />
          <button className="field-note" onClick={() => api.current?.lose()}>
            개발용 전시장 연결 종료 검사
          </button>
        </details>
      )}
    </>
  );
}
