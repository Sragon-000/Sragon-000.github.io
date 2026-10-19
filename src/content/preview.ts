import { cloneSession, type WorkspaceSession } from '../packages/types';
import type { Portfolio, ViewMode } from '../domain/types';
export interface Preview {
  workspaceId: string;
  data: Portfolio;
  mode: ViewMode;
  urls: ReadonlyMap<string, string>;
  returnTo: string;
}
export class PreviewStore {
  private current: Preview | null = null;
  private listeners = new Set<() => void>();
  constructor(
    private urls = {
      create: (blob: Blob) => URL.createObjectURL(blob),
      revoke: (url: string) => URL.revokeObjectURL(url),
    },
  ) {}
  getSnapshot = () => this.current;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  start(session: WorkspaceSession, mode: ViewMode, returnTo: string) {
    const snapshot = cloneSession(session);
    const created = new Map<string, string>();
    try {
      for (const [id, blob] of snapshot.assets) created.set(id, this.urls.create(blob));
    } catch (error) {
      created.forEach((url) => this.urls.revoke(url));
      throw error;
    }
    this.release();
    this.current = {
      workspaceId: snapshot.workspaceId,
      data: snapshot.data,
      mode,
      urls: created,
      returnTo,
    };
    this.listeners.forEach((listener) => listener());
  }
  private release() {
    this.current?.urls.forEach((url) => this.urls.revoke(url));
  }
  end() {
    this.release();
    this.current = null;
    this.listeners.forEach((listener) => listener());
  }
}
export const previewStore = new PreviewStore();
