import type { ExhibitionSession } from './model';
const sessions = new Map<string, ExhibitionSession>();
export function readExhibitionSession(key: string): ExhibitionSession {
  return structuredClone(sessions.get(key) ?? { room: 0, selectedId: null, destination: 'lobby' });
}
export function writeExhibitionSession(key: string, session: ExhibitionSession) {
  sessions.set(key, structuredClone(session));
}
