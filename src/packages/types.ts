import type { Portfolio, Issue, PendingInput } from '../domain/types';

export type { PendingInput } from '../domain/types';
export interface BackupMetadata {
  backupVersion: '1.0.0';
  savedAt: string;
  editorState: {
    screen: 'profile' | 'projects' | 'presentation' | 'export';
    projectId: string | null;
  };
  pendingInputs: PendingInput[];
}
export interface ExportManifest {
  exportVersion: '1.0.0';
  schemaVersion: '1.0.0';
  kind: 'workspace-backup' | 'public-content';
  createdAt: string;
  files: { path: string; byteSize: number }[];
}
export interface WorkspaceSession {
  workspaceId: string;
  revision: number;
  data: Portfolio;
  metadata: BackupMetadata;
  assets: Map<string, Blob>;
  // Local storage identity only; never included in content or backup JSON.
  storageToken?: string;
}
export interface StagedImport {
  session: WorkspaceSession;
  sourceKind: ExportManifest['kind'] | 'json';
  issues: Issue[];
}
export class ContentError extends Error {
  constructor(public readonly issues: Issue[]) {
    super(issues.map((issue) => issue.message).join('\n'));
    this.name = 'ContentError';
  }
}
export function fail(code: string, message: string, path = ''): never {
  throw new ContentError([{ code, severity: 'error', message, path }]);
}
export function emptyMetadata(): BackupMetadata {
  return {
    backupVersion: '1.0.0',
    savedAt: new Date().toISOString(),
    editorState: { screen: 'profile', projectId: null },
    pendingInputs: [],
  };
}
export function cloneSession(session: WorkspaceSession): WorkspaceSession {
  return {
    ...session,
    data: structuredClone(session.data),
    metadata: structuredClone(session.metadata),
    assets: new Map(session.assets),
  };
}
