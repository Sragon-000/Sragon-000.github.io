import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  type Object3D,
  type Texture,
} from 'three';
import type { ExhibitionRoom, WorkPlacement } from '../features/exhibition/model';
import { Resources } from './lifecycle';
import { scenePalette, type ScenePalette, type ThemePreset } from './palette';
export interface Poster {
  texture: Texture;
  dispose?: () => void;
}
function lines(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  count: number,
) {
  let row = '';
  let index = 0;
  for (const char of text) {
    if (context.measureText(row + char).width > width) {
      context.fillText(row, x, y + index * height);
      if (++index >= count) return;
      row = char;
    } else row += char;
  }
  if (row && index < count) context.fillText(row, x, y + index * height);
}
function makePoster(
  work: WorkPlacement,
  imageUrl: string | undefined,
  resources: Resources,
  invalidate: () => void,
  palette: ScenePalette = scenePalette(),
): Poster {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 880;
  const context = canvas.getContext('2d');
  if (!context) throw Error('작품 표지를 만들 수 없습니다.');
  const texture = resources.track(new CanvasTexture(canvas));
  texture.colorSpace = SRGBColorSpace;
  let active = true;
  let image: HTMLImageElement | undefined;
  const draw = (cover?: HTMLImageElement) => {
    context.fillStyle = palette.surface;
    context.fillRect(0, 0, 640, 880);
    context.fillStyle = palette.accent;
    context.fillRect(0, 0, 640, 8);
    context.fillStyle = palette.placeholder;
    context.fillRect(24, 24, 592, 400);
    if (cover) {
      const scale = Math.max(592 / cover.naturalWidth, 400 / cover.naturalHeight);
      context.save();
      context.beginPath();
      context.rect(24, 24, 592, 400);
      context.clip();
      context.drawImage(
        cover,
        24 + (592 - cover.naturalWidth * scale) / 2,
        24 + (400 - cover.naturalHeight * scale) / 2,
        cover.naturalWidth * scale,
        cover.naturalHeight * scale,
      );
      context.restore();
    } else {
      context.fillStyle = palette.accent;
      context.font = 'bold 110px sans-serif';
      context.fillText(String(work.ordinal).padStart(2, '0'), 56, 215);
      context.fillStyle = palette.muted;
      context.font = '24px sans-serif';
      context.fillText('게임 이미지 준비 중', 56, 300);
    }
    context.fillStyle = palette.text;
    context.font = 'bold 48px sans-serif';
    lines(context, work.project.title || '제목 준비 중', 28, 500, 584, 58, 3);
    context.fillStyle = palette.muted;
    context.font = '24px sans-serif';
    lines(context, work.project.summary, 28, 704, 584, 32, 2);
    context.font = '21px sans-serif';
    lines(
      context,
      `${work.project.genre || '장르 준비 중'} · ${work.project.role || '역할 준비 중'}`,
      28,
      814,
      584,
      28,
      2,
    );
    texture.needsUpdate = true;
    invalidate();
  };
  draw();
  if (imageUrl) {
    image = new Image();
    image.onload = () => {
      if (active && image?.naturalWidth) draw(image);
    };
    image.onerror = () => {
      /* keep the named poster when a cover fails */
    };
    image.src = imageUrl;
  }
  return {
    texture,
    dispose: () => {
      active = false;
      if (image) {
        image.onload = null;
        image.onerror = null;
        image.src = '';
      }
    },
  };
}
export function buildExhibitionScene(
  room: ExhibitionRoom,
  imageUrl: (id: string | null) => string | undefined,
  invalidate: () => void,
  posterFactory = makePoster,
  theme: ThemePreset = 'light',
) {
  const palette = scenePalette(theme);
  const resources = new Resources();
  const scene = new Scene();
  scene.background = new Color(palette.background);
  const pickables: Object3D[] = [];
  const frames = new Map<string, Mesh<BoxGeometry, MeshBasicMaterial>>();
  const posters: Poster[] = [];
  try {
    const floor = new Mesh(
      resources.track(new PlaneGeometry(19, 31)),
      resources.track(new MeshBasicMaterial({ color: palette.floor, side: 2 })),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -3;
    scene.add(floor);
    const plinth = resources.track(new BoxGeometry(0.13, 0.08, 30));
    const trim = resources.track(new MeshBasicMaterial({ color: palette.accent }));
    for (const x of [-9, 9]) {
      const rail = new Mesh(plinth, trim);
      rail.position.set(x, 0.04, -3);
      scene.add(rail);
    }
    const back = new Mesh(
      resources.track(new BoxGeometry(18, 5, 0.3)),
      resources.track(new MeshBasicMaterial({ color: palette.back })),
    );
    back.position.set(0, 2.5, -17);
    scene.add(back);
    const columnGeometry = resources.track(new BoxGeometry(0.22, 5, 0.22));
    const columnMaterial = resources.track(new MeshBasicMaterial({ color: palette.column }));
    for (const x of [-8.7, 8.7])
      for (const z of [4, -5, -14]) {
        const column = new Mesh(columnGeometry, columnMaterial);
        column.position.set(x, 2.5, z);
        scene.add(column);
      }
    const panelGeometry = resources.track(new PlaneGeometry(3.2, 4.4));
    const frameGeometry = resources.track(new BoxGeometry(0.18, 4.7, 3.5));
    const markerGeometry = resources.track(new RingGeometry(0.35, 0.58, 40));
    for (const work of room.works) {
      const frame = new Mesh(
        frameGeometry,
        resources.track(new MeshBasicMaterial({ color: palette.frame })),
      );
      frame.position.set(work.x, 2.75, work.z);
      scene.add(frame);
      frames.set(work.project.id, frame);
      const poster = posterFactory(
        work,
        imageUrl(work.project.media.coverAssetId),
        resources,
        invalidate,
        palette,
      );
      posters.push(poster);
      resources.track(poster.texture);
      const panel = new Mesh(
        panelGeometry,
        resources.track(new MeshBasicMaterial({ map: poster.texture })),
      );
      panel.position.set(work.x + work.facing * 0.12, 2.75, work.z);
      panel.rotation.y = (work.facing * Math.PI) / 2;
      panel.userData = { kind: 'project', id: work.project.id };
      scene.add(panel);
      pickables.push(panel);
      const marker = new Mesh(
        markerGeometry,
        resources.track(
          new MeshBasicMaterial({
            color: palette.accent,
            side: 2,
            transparent: true,
            opacity: 0.8,
          }),
        ),
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(work.x > 0 ? 3.5 : -3.5, 0.02, work.z + 3.8);
      marker.userData = { kind: 'destination', id: work.project.id };
      scene.add(marker);
      pickables.push(marker);
    }
    const lobby = new Mesh(
      markerGeometry,
      resources.track(new MeshBasicMaterial({ color: palette.lobby, side: 2 })),
    );
    lobby.rotation.x = -Math.PI / 2;
    lobby.position.set(0, 0.02, 7);
    lobby.userData = { kind: 'lobby' };
    scene.add(lobby);
    pickables.push(lobby);
    let disposed = false;
    return {
      scene,
      pickables,
      update: (id: string | null) =>
        frames.forEach((frame, key) =>
          frame.material.color.set(key === id ? palette.accent : palette.frame),
        ),
      dispose: () => {
        if (disposed) return;
        disposed = true;
        posters.forEach((poster) => poster.dispose?.());
        resources.dispose();
        scene.clear();
        pickables.length = 0;
      },
    };
  } catch (error) {
    posters.forEach((poster) => poster.dispose?.());
    resources.dispose();
    scene.clear();
    throw error;
  }
}
