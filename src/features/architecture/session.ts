export interface GraphSession {
  selectedId: string | null;
  emphasize: boolean;
  view: '2d' | '3d';
  camera?: { position: number[]; target: number[] };
  box?: { x: number; y: number; width: number; height: number };
}
const sessions = new Map<string, GraphSession>();
export function graphSessionKey(workspace: string, projectId: string) {
  return `${workspace}/${projectId}`;
}
export function readGraphSession(key: string): GraphSession {
  return structuredClone(sessions.get(key) ?? { selectedId: null, emphasize: false, view: '2d' });
}
export function writeGraphSession(key: string, state: GraphSession) {
  sessions.set(key, structuredClone(state));
}
