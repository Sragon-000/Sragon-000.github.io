import { WebGLRenderer, type Camera, type Scene } from 'three';
import { DemandFrames, SingleLease } from './lifecycle';
const owner = new SingleLease();
export interface RendererHost {
  renderer: WebGLRenderer;
  setScene: (scene: Scene, camera: Camera) => void;
  request: () => void;
  dispose: () => void;
  onResize: (callback: (width: number, height: number) => void) => void;
  own: (cleanup: () => void) => void;
  animate: (callback: ((time: number) => boolean) | null) => void;
}
export function createRendererHost(
  element: HTMLElement,
  onFailure: (message: string) => void,
  options: { label?: string; fallback?: string } = {},
): RendererHost {
  // Release the previous scene before creating another context.
  owner.clear();
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.domElement.setAttribute('aria-label', options.label ?? '3D 시스템 그래프');
  renderer.domElement.setAttribute('role', 'img');
  element.append(renderer.domElement);
  let scene: Scene | undefined;
  let camera: Camera | undefined;
  let disposed = false;
  let resizeCallback: ((width: number, height: number) => void) | undefined;
  const cleanups: (() => void)[] = [];
  let animate: ((time: number) => boolean) | null = null;
  const fallback = options.fallback ?? '2D 보기와 시스템 목록으로 계속 볼 수 있습니다.';
  const frames = new DemandFrames(
    {
      request: (callback) => requestAnimationFrame(callback),
      cancel: (id) => cancelAnimationFrame(id),
    },
    () => {
      if (scene && camera) {
        try {
          const again = animate?.(performance.now()) ?? false;
          renderer.render(scene, camera);
          if (again) frames.request();
        } catch {
          frames.setPaused(true);
          onFailure(`3D 화면을 그리지 못했습니다. ${fallback}`);
        }
      }
    },
  );
  const visibility = () => frames.setPaused(document.hidden);
  const lost = (event: Event) => {
    event.preventDefault();
    frames.setPaused(true);
    onFailure(`3D 연결이 중단됐습니다. ${fallback} 다시 시도할 수 있습니다.`);
  };
  const resize = () => {
    const width = Math.max(1, element.clientWidth);
    const height = Math.max(1, element.clientHeight);
    renderer.setSize(width, height, false);
    resizeCallback?.(width, height);
    frames.request();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(element);
  document.addEventListener('visibilitychange', visibility);
  renderer.domElement.addEventListener('webglcontextlost', lost);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    frames.dispose();
    observer.disconnect();
    document.removeEventListener('visibilitychange', visibility);
    renderer.domElement.removeEventListener('webglcontextlost', lost);
    for (const cleanup of cleanups.splice(0))
      try {
        cleanup();
      } catch {
        /* finish host cleanup */
      }
    try {
      renderer.dispose();
    } catch {
      /* still remove the context and canvas */
    }
    try {
      renderer.forceContextLoss();
    } catch {
      /* the context may already be gone */
    }
    renderer.domElement.remove();
  };
  const release = owner.acquire(dispose);
  visibility();
  resize();
  return {
    renderer,
    setScene: (next, nextCamera) => {
      scene = next;
      camera = nextCamera;
      frames.request();
    },
    request: () => frames.request(),
    dispose: release,
    onResize: (callback) => {
      resizeCallback = callback;
      resize();
    },
    own: (cleanup) => cleanups.push(cleanup),
    animate: (callback) => {
      animate = callback;
      frames.request();
    },
  };
}
