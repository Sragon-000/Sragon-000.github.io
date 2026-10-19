import type { Site } from '../domain/types';
export type ThemePreset = Site['theme']['preset'];
const light = {
  background: '#f2f4ff',
  text: '#18243b',
  muted: '#4f5e7c',
  accent: '#5145cd',
  surface: '#ffffff',
  panel: '#e4e9f8',
  floor: '#e1e5f5',
  back: '#d7ddf2',
  column: '#acb7d5',
  frame: '#b8c1df',
  placeholder: '#e7ebf8',
  node: '#ccd5ed',
  group: '#c6cfea',
  selected: '#b2abeb',
  direct: '#88b899',
  shared: '#80bec0',
  hierarchy: '#8ca497',
  labelBackground: '#ffffffee',
  lobby: '#598d9c',
  relations: { call: '#47732f', data: '#246b85', event: '#855497', dependency: '#61736b' },
};
const digital: typeof light = {
  background: '#101b20',
  text: '#eff6e7',
  muted: '#b5c8b9',
  accent: '#c8f17b',
  surface: '#162c27',
  panel: '#233c35',
  floor: '#1b302c',
  back: '#183b35',
  column: '#4b6860',
  frame: '#3d6555',
  placeholder: '#233c35',
  node: '#607b8e',
  group: '#1e3941',
  selected: '#eff6a5',
  direct: '#bee676',
  shared: '#67d2d0',
  hierarchy: '#83979e',
  labelBackground: '#13211fea',
  lobby: '#88cbd0',
  relations: { call: '#b7dc76', data: '#70c9dd', event: '#d3a2dd', dependency: '#aab8bb' },
};
export type ScenePalette = typeof light;
export const scenePalette = (theme: ThemePreset = 'light'): ScenePalette =>
  theme === 'digital' ? digital : light;
