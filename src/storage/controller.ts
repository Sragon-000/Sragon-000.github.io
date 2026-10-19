import type { Issue } from '../domain/types';
import { createImageAsset, type ImageDecoder } from '../packages/images';
import {
  readPortfolioJson,
  readPortfolioPackage,
  exportPublicContent,
  exportWorkspaceBackup,
} from '../packages/portfolio-package';
import {
  cloneSession,
  ContentError,
  type StagedImport,
  type WorkspaceSession,
} from '../packages/types';
import { isDirty, newSession, StorageConflict, type WorkspaceStore } from './workspaces';
import type { FieldTarget, InputKind } from '../domain/edit';
import { editWorkspace, type EditCommand, type ImageTarget, type GraphItem } from './edit-commands';

type Store = Pick<WorkspaceStore, 'save' | 'load'> & Partial<Pick<WorkspaceStore, 'version'>>;
export interface WorkspaceState {
  session: WorkspaceSession;
  ready: boolean;
  savedRevision: number | null;
  status: string;
  issues: Issue[];
  staged: StagedImport | null;
  saving: number;
  operation: 'import' | 'export' | 'read' | null;
  canUndo: boolean;
  loadStatus: 'loading' | 'ready' | 'error';
  conflict: boolean;
}

export class WorkspaceController {
  private state: WorkspaceState = {
    session: newSession(),
    ready: false,
    loadStatus: 'loading',
    conflict: false,
    savedRevision: null,
    status: '저장된 초안을 불러오는 중입니다.',
    issues: [],
    staged: null,
    saving: 0,
    operation: null,
    canUndo: false,
  };
  private listeners = new Set<() => void>();
  private initialization?: Promise<void>;
  private persistedToken: string | null | undefined;
  private stagedToken: string | null | undefined;
  private saveQueue: Promise<void> = Promise.resolve();
  constructor(
    private store: Store,
    private key: string,
    private decode?: ImageDecoder,
  ) {}
  getSnapshot = () => this.state;
  refreshStorePrototype(prototype: object) {
    Object.setPrototypeOf(this.store, prototype);
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private patch(update: Partial<WorkspaceState>) {
    this.state = { ...this.state, ...update };
    this.listeners.forEach((listener) => listener());
  }
  private error(error: unknown) {
    this.patch({
      ...(error instanceof StorageConflict ? { conflict: true } : {}),
      status:
        error instanceof Error
          ? error.message
          : '작업을 완료할 수 없습니다. 현재 초안은 유지됩니다.',
      issues: error instanceof ContentError ? error.issues : [],
    });
  }
  initialize() {
    // Keep an older HMR controller's unsaved memory, but require a fresh read
    // before it can write without a known storage identity.
    if (!this.state.loadStatus) {
      this.saveQueue = Promise.resolve();
      this.patch({
        loadStatus: 'ready',
        conflict: true,
        status: '앱을 갱신했습니다. 미저장 입력을 백업한 뒤 저장본을 다시 읽어 주세요.',
      });
    }
    if (!this.initialization)
      this.initialization = (async () => {
        try {
          const session = await this.store.load(this.key);
          this.persistedToken = session?.storageToken ?? null;
          this.patch({
            ...(session ? { session, savedRevision: session.revision } : {}),
            ready: true,
            loadStatus: 'ready',
            conflict: false,
            status: session
              ? '이 기기에 저장된 초안을 복원했습니다.'
              : '새 전시장 초안을 시작합니다.',
          });
        } catch (error) {
          this.initialization = undefined;
          this.patch({ ready: false, loadStatus: 'error' });
          this.error(error);
        }
      })();
    return this.initialization;
  }
  async reload() {
    if (this.state.operation || this.state.saving || this.state.staged) return;
    const wasReady = this.state.ready;
    this.patch({ operation: 'read', status: '저장본을 다시 읽는 중입니다.' });
    try {
      const session = await this.store.load(this.key);
      this.persistedToken = session?.storageToken ?? null;
      this.undoSession = null;
      this.patch({
        session: session ?? newSession(),
        savedRevision: session?.revision ?? null,
        ready: true,
        loadStatus: 'ready',
        conflict: false,
        canUndo: false,
        issues: [],
        status: session
          ? '저장본을 다시 읽었습니다.'
          : '저장된 초안이 없습니다. 새 초안을 시작합니다.',
      });
    } catch (error) {
      // A failed refresh must keep this tab's valid, unsaved content.
      this.patch({ ready: wasReady, loadStatus: 'error', conflict: false });
      this.error(error);
    } finally {
      this.patch({ operation: null });
    }
  }
  dirty() {
    return this.state.ready && isDirty(this.state.session.revision, this.state.savedRevision);
  }

  private editable() {
    return (
      this.state.ready &&
      this.state.loadStatus === 'ready' &&
      !this.state.staged &&
      !['read', 'import'].includes(this.state.operation ?? '')
    );
  }
  private undoSession: WorkspaceSession | null = null;
  private commit(command: EditCommand) {
    const result = editWorkspace(this.state.session, command);
    if (!result.session) {
      if (result.status) this.patch({ issues: result.issues, status: result.status });
      return result;
    }
    this.undoSession = result.deletion ? cloneSession(this.state.session) : null;
    result.session.revision = this.state.session.revision + 1;
    this.patch({
      session: result.session,
      issues: result.issues,
      status: result.status,
      canUndo: Boolean(result.deletion),
    });
    return result;
  }
  editSite(field: 'displayName' | 'title', rawValue: string) {
    this.edit(
      {
        scope: 'site',
        projectId: null,
        entityId: null,
        path: field === 'displayName' ? '/profile/displayName' : '/exhibition/title',
      },
      rawValue,
    );
  }
  async addAvatar(blob: Blob) {
    await this.addImage(blob, '전시장 제작자 프로필 이미지', 'avatar');
  }
  editProjectVideo(projectId: string, rawValue: string) {
    if (this.editable()) this.commit({ type: 'video', projectId, raw: rawValue });
  }
  edit(target: FieldTarget, rawValue: string, kind: InputKind = 'text') {
    if (this.editable()) this.commit({ type: 'field', target, raw: rawValue, kind });
  }
  choose(target: FieldTarget, value: unknown) {
    if (this.editable()) this.commit({ type: 'choice', target, value });
  }
  rememberEditor(
    screen: WorkspaceState['session']['metadata']['editorState']['screen'],
    projectId: string | null = null,
  ) {
    if (!this.state.ready || this.state.loadStatus !== 'ready' || this.state.operation === 'import')
      return;
    const current = this.state.session.metadata.editorState;
    if (current.screen === screen && current.projectId === projectId) return;
    const session = cloneSession(this.state.session);
    session.metadata.editorState = { screen, projectId };
    this.patch({ session });
  }
  addProject() {
    return this.editable() ? (this.commit({ type: 'project-add' }).projectId ?? null) : null;
  }
  setOngoing(projectId: string, ongoing: boolean) {
    if (this.editable()) this.commit({ type: 'ongoing', projectId, value: ongoing });
  }
  discardPending(target: FieldTarget) {
    if (this.editable()) this.commit({ type: 'pending-remove', target });
  }
  moveProject(projectId: string, direction: -1 | 1) {
    if (this.editable()) this.commit({ type: 'project-move', projectId, direction });
  }
  removeProject(projectId: string) {
    if (this.editable()) this.commit({ type: 'project-remove', projectId });
  }
  undoDelete() {
    if (!this.editable() || !this.undoSession) return;
    const snapshot = this.undoSession;
    this.undoSession = null;
    this.commit({ type: 'restore', snapshot });
  }
  addCase(projectId: string) {
    if (this.editable()) this.commit({ type: 'case-add', projectId });
  }
  removeCase(projectId: string, id: string) {
    if (this.editable()) this.commit({ type: 'case-remove', projectId, id });
  }
  async addImage(blob: Blob, alt: string, target: ImageTarget, projectId?: string) {
    if (!this.editable() || this.state.operation) return;
    this.patch({ operation: 'read', status: '이미지 형식과 크기를 확인하는 중입니다.' });
    try {
      const image = await createImageAsset(blob, alt, this.decode);
      this.commit({ type: 'image-add', target, projectId, ...image });
    } catch (error) {
      this.error(error);
    } finally {
      this.patch({ operation: null });
    }
  }
  removeImageRef(target: ImageTarget, projectId?: string, assetId?: string) {
    if (this.editable()) this.commit({ type: 'image-remove', target, projectId, assetId });
  }
  addGraphItem(projectId: string, kind: GraphItem | 'graph') {
    if (this.editable()) this.commit({ type: 'graph-add', projectId, kind });
  }
  removeGraphItem(projectId: string, kind: GraphItem, id: string) {
    if (this.editable()) this.commit({ type: 'graph-remove', projectId, kind, id });
  }

  async save() {
    if (
      !this.state.ready ||
      this.state.loadStatus !== 'ready' ||
      this.state.operation === 'import' ||
      this.state.operation === 'read' ||
      this.state.staged
    )
      return;
    if (this.persistedToken === undefined || this.state.conflict) {
      this.error(new StorageConflict());
      return;
    }
    const snapshot = cloneSession(this.state.session);
    this.patch({ saving: this.state.saving + 1, status: '이 기기에 초안을 저장하는 중입니다.' });
    const run = this.saveQueue.then(async () => {
      try {
        if (this.state.conflict || this.persistedToken === undefined) throw new StorageConflict();
        const saved = await this.store.save(this.key, snapshot, {
          expectedToken: this.persistedToken,
          mode: 'save',
        });
        this.persistedToken = saved.token;
        const current = this.state.session;
        if (current.workspaceId === snapshot.workspaceId) {
          const session = cloneSession(current);
          session.metadata.savedAt = saved.savedAt;
          session.storageToken = saved.token;
          this.patch({
            session,
            savedRevision: Math.max(this.state.savedRevision ?? -1, saved.revision),
            issues: [],
            status:
              current.revision === saved.revision
                ? '이 기기에 초안을 저장했습니다.'
                : '저장한 뒤의 변경 사항이 남아 있습니다.',
          });
        }
      } catch (error) {
        this.error(error);
      } finally {
        this.patch({ saving: this.state.saving - 1 });
      }
    });
    this.saveQueue = run;
    await run;
  }

  async stage(blob: Blob, format: 'zip' | 'json', images: ReadonlyMap<string, Blob> = new Map()) {
    if (
      this.state.loadStatus === 'loading' ||
      this.state.operation ||
      this.state.saving ||
      this.state.staged
    )
      return;
    if (this.state.conflict) {
      this.error(new StorageConflict());
      return;
    }
    this.patch({ operation: 'read', status: '가져올 자료와 파일을 검사하는 중입니다.' });
    try {
      const staged =
        format === 'zip'
          ? await readPortfolioPackage(blob, this.decode)
          : await readPortfolioJson(blob, images, this.decode);
      this.stagedToken =
        this.state.loadStatus === 'error'
          ? await this.store.version?.(this.key)
          : this.persistedToken;
      if (this.stagedToken === undefined)
        throw new Error('기존 저장본의 상태를 확인할 수 없습니다. 먼저 다시 읽기를 시도해 주세요.');
      this.patch({
        staged,
        issues: staged.issues,
        status: '가져올 자료를 확인해 주세요. 현재 초안은 아직 바뀌지 않았습니다.',
      });
    } catch (error) {
      this.error(error);
    } finally {
      this.patch({ operation: null });
    }
  }
  cancelImport() {
    if (this.state.operation === 'import') return;
    this.stagedToken = undefined;
    this.patch({
      staged: null,
      issues: [],
      status: '가져오기를 취소했습니다. 현재 초안과 기존 저장본을 유지합니다.',
    });
  }
  async confirmImport() {
    if (!this.state.staged || this.state.operation || this.state.saving) return;
    if (this.stagedToken === undefined) return;
    const imported = cloneSession(this.state.staged.session);
    imported.revision = this.state.session.revision + 1;
    this.patch({ operation: 'import', status: '가져온 초안과 이미지를 함께 저장하는 중입니다.' });
    try {
      const result = await this.store.save(this.key, imported, {
        expectedToken: this.stagedToken,
        mode: 'replace',
      });
      this.persistedToken = result.token;
      imported.storageToken = result.token;
      imported.metadata.savedAt = result.savedAt;
      this.undoSession = null;
      this.stagedToken = undefined;
      this.patch({
        canUndo: false,
        ready: true,
        loadStatus: 'ready',
        conflict: false,
        session: imported,
        savedRevision: imported.revision,
        staged: null,
        issues: [],
        status: '가져온 자료로 초안을 교체하고 이 기기에 저장했습니다.',
      });
    } catch (error) {
      this.error(error);
    } finally {
      this.patch({ operation: null });
    }
  }
  async export(kind: 'backup' | 'public'): Promise<Blob | null> {
    if (!this.state.ready || this.state.operation || this.state.saving) return null;
    const snapshot = cloneSession(this.state.session);
    this.patch({ operation: 'export', status: '내보낼 파일을 만들고 다시 검사하는 중입니다.' });
    try {
      const result =
        kind === 'backup'
          ? await exportWorkspaceBackup(snapshot, this.decode)
          : await exportPublicContent(snapshot, this.decode);
      this.patch({
        issues: result.issues,
        status: `${kind === 'backup' ? '전체 초안 백업' : '공개 콘텐츠'} 파일을 생성했습니다. ZIP 다운로드를 선택해 파일을 받으세요. 실제 사이트 배포는 별도입니다.`,
      });
      return result.blob;
    } catch (error) {
      this.error(error);
      return null;
    } finally {
      this.patch({ operation: null });
    }
  }
}
