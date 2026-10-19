import { CanvasTexture, LinearFilter, Sprite, SpriteMaterial, SRGBColorSpace } from 'three';
import type { Resources } from './lifecycle';
import { scenePalette, type ScenePalette } from './palette';

export const LABEL_CELL_WIDTH = 256;
export const LABEL_CELL_HEIGHT = 64;
export const LABEL_ATLAS_SIZE = 1024;
const columns = LABEL_ATLAS_SIZE / LABEL_CELL_WIDTH;
const rows = LABEL_ATLAS_SIZE / LABEL_CELL_HEIGHT;
// Each clone has its own UV transform but shares the page Source/GPU allocation.
export function createAtlasLabels(resources: Resources, palette: ScenePalette = scenePalette()) {
  const pages: { texture: CanvasTexture; context: CanvasRenderingContext2D; used: number }[] = [];
  const labels = new Map<string, CanvasTexture>();
  return (text: string) => {
    const shortened = [...text].slice(0, 14).join('') + ([...text].length > 14 ? '…' : '');
    let map = labels.get(shortened);
    if (!map) {
      let page = pages.at(-1);
      if (!page || page.used === columns * rows) {
        const canvas = document.createElement('canvas');
        canvas.width = LABEL_ATLAS_SIZE;
        canvas.height = LABEL_ATLAS_SIZE;
        const context = canvas.getContext('2d');
        if (!context) return undefined;
        const texture = resources.track(new CanvasTexture(canvas));
        texture.colorSpace = SRGBColorSpace;
        texture.minFilter = LinearFilter;
        texture.magFilter = LinearFilter;
        texture.generateMipmaps = false;
        page = { texture, context, used: 0 };
        pages.push(page);
      }
      const x = (page.used % columns) * LABEL_CELL_WIDTH,
        y = Math.floor(page.used / columns) * LABEL_CELL_HEIGHT;
      page.used++;
      const context = page.context;
      context.fillStyle = palette.labelBackground;
      context.fillRect(x, y, LABEL_CELL_WIDTH, LABEL_CELL_HEIGHT);
      context.fillStyle = palette.text;
      context.font = 'bold 32px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(
        shortened,
        x + LABEL_CELL_WIDTH / 2,
        y + LABEL_CELL_HEIGHT / 2,
        LABEL_CELL_WIDTH - 16,
      );
      page.texture.needsUpdate = true;
      map = resources.track(page.texture.clone());
      // Half-pixel padding keeps linear filtering inside the cell without mipmap bleed.
      map.repeat.set(
        (LABEL_CELL_WIDTH - 1) / LABEL_ATLAS_SIZE,
        (LABEL_CELL_HEIGHT - 1) / LABEL_ATLAS_SIZE,
      );
      map.offset.set(
        (x + 0.5) / LABEL_ATLAS_SIZE,
        1 - (y + LABEL_CELL_HEIGHT - 0.5) / LABEL_ATLAS_SIZE,
      );
      labels.set(shortened, map);
    }
    const sprite = new Sprite(resources.track(new SpriteMaterial({ map, depthWrite: false })));
    sprite.scale.set(210, 35, 1);
    return sprite;
  };
}
