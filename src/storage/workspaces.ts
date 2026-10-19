import { createWorkspace } from '../domain/create';
import { validatePortfolio } from '../domain/validate';
import { validateAssets, type ImageDecoder } from '../packages/images';
import { readMetadata } from '../packages/metadata';
import {
  cloneSession,
  ContentError,
  emptyMetadata,
  fail,
  type WorkspaceSession,
} from '../packages/types';

interface StoredWorkspace {
  siteKey: string;
  workspaceId: string;
  revision: number;
  commitId?: string;
  data: WorkspaceSession['data'];
  metadata: WorkspaceSession['metadata'];
}
interface StoredAsset {
  workspaceId: string;
  assetId: string;
  blob: Blob;
}
export interface SaveOptions {
  expectedToken: string | null;
  mode: 'save' | 'replace';
}
export interface SavedWorkspace {
  revision: number;
  savedAt: string;
  token: string;
}
export class StorageConflict extends Error {
  constructor() {
    super(
      '다른 탭에서 저장본이 바뀌었습니다. 이 탭의 입력은 유지했습니다. 백업한 뒤 저장본을 다시 읽어 주세요.',
    );
    this.name = 'StorageConflict';
  }
}
function token(record: StoredWorkspace | undefined): string | null {
  return record
    ? (record.commitId ??
        JSON.stringify([record.workspaceId, record.revision, record.metadata.savedAt]))
    : null;
}
export function siteKey(origin: string, base: string): string {
  const url = new URL(base, new URL(origin).origin);
  if (url.origin !== new URL(origin).origin || url.search || url.hash)
    fail('SITE_KEY', '배포 경로를 확인해 주세요.');
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}/`;
}
export function newSession(): WorkspaceSession {
  return {
    workspaceId: crypto.randomUUID(),
    revision: 0,
    data: createWorkspace(),
    metadata: emptyMetadata(),
    assets: new Map(),
  };
}
export function isDirty(currentRevision: number, savedRevision: number | null): boolean {
  return savedRevision === null || currentRevision !== savedRevision;
}

/** One instance per app session. Writes are serialized; each call captures its own revision. */
export class WorkspaceStore {
  private queue: Promise<unknown> = Promise.resolve();
  private database?: Promise<IDBDatabase>;
  constructor(
    private factory: IDBFactory | undefined = globalThis.indexedDB,
    private dbName = 'io-portfolio-v1',
    private decode?: ImageDecoder,
  ) {}

  private open(): Promise<IDBDatabase> {
    const factory = this.factory;
    if (!factory)
      return Promise.reject(
        new Error(
          '이 브라우저에서 초안 저장소를 사용할 수 없습니다. 입력을 유지하며 파일 백업은 사용할 수 있습니다.',
        ),
      );
    if (!this.database)
      this.database = new Promise((resolve, reject) => {
        const request = factory.open(this.dbName, 1);
        let blocked = false;
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore('workspaces', { keyPath: 'siteKey' });
          const assets = db.createObjectStore('assets', { keyPath: ['workspaceId', 'assetId'] });
          assets.createIndex('workspaceId', 'workspaceId');
        };
        request.onerror = () => {
          this.database = undefined;
          reject(request.error);
        };
        request.onblocked = () => {
          blocked = true;
          this.database = undefined;
          reject(new Error('다른 탭을 닫은 뒤 저장소 연결을 다시 시도해 주세요.'));
        };
        request.onsuccess = () => {
          const db = request.result;
          if (blocked) {
            db.close();
            return;
          }
          db.onversionchange = () => {
            db.close();
            this.database = undefined;
          };
          resolve(db);
        };
      });
    return this.database;
  }

  save(key: string, input: WorkspaceSession, options: SaveOptions): Promise<SavedWorkspace> {
    const snapshot = cloneSession(input);
    const expected = { ...options };
    const run = this.queue.then(async () => {
      if (
        !['save', 'replace'].includes(expected.mode) ||
        (expected.expectedToken !== null && typeof expected.expectedToken !== 'string')
      )
        fail('SAVE_EXPECTATION', '저장본 버전과 저장·교체 방식을 확인해 주세요.');
      if (
        !Number.isSafeInteger(snapshot.revision) ||
        snapshot.revision < 0 ||
        !snapshot.workspaceId
      )
        fail('SESSION', '저장할 작업 상태가 올바르지 않습니다.');
      const result = validatePortfolio(snapshot.data);
      if (!result.valid) throw new ContentError(result.issues);
      readMetadata(snapshot.metadata, snapshot.data);
      const fileIssues = await validateAssets(snapshot.data, snapshot.assets, this.decode);
      if (fileIssues.length) throw new ContentError(fileIssues);
      snapshot.metadata.savedAt = new Date().toISOString();
      const commitId = crypto.randomUUID();
      const db = await this.open();
      return new Promise<SavedWorkspace>((resolve, reject) => {
        const tx = db.transaction(['workspaces', 'assets'], 'readwrite');
        let failure: Error | null = null;
        tx.oncomplete = () =>
          resolve({
            revision: snapshot.revision,
            savedAt: snapshot.metadata.savedAt,
            token: commitId,
          });
        tx.onabort = () =>
          reject(
            failure ??
              tx.error ??
              new Error('초안 저장이 취소되었습니다. 기존 저장본은 유지됩니다.'),
          );
        const workspaces = tx.objectStore('workspaces');
        const assets = tx.objectStore('assets');
        const existing = workspaces.get(key);
        existing.onsuccess = () => {
          const previous = existing.result as StoredWorkspace | undefined;
          if (
            token(previous) !== expected.expectedToken ||
            (expected.mode === 'save' &&
              previous &&
              (previous.workspaceId !== snapshot.workspaceId ||
                previous.revision > snapshot.revision))
          ) {
            failure = new StorageConflict();
            tx.abort();
            return;
          }
          const oldId = previous?.workspaceId ?? snapshot.workspaceId;
          const cursor = assets.index('workspaceId').openCursor(IDBKeyRange.only(oldId));
          cursor.onsuccess = () => {
            const current = cursor.result;
            if (current) {
              current.delete();
              current.continue();
              return;
            }
            try {
              for (const [assetId, blob] of snapshot.assets)
                assets.put({
                  workspaceId: snapshot.workspaceId,
                  assetId,
                  blob,
                } satisfies StoredAsset);
              workspaces.put({
                siteKey: key,
                workspaceId: snapshot.workspaceId,
                revision: snapshot.revision,
                commitId,
                data: snapshot.data,
                metadata: snapshot.metadata,
              } satisfies StoredWorkspace);
            } catch (error) {
              failure = error instanceof Error ? error : new Error('초안을 저장할 수 없습니다.');
              tx.abort();
            }
          };
        };
      });
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async load(key: string): Promise<WorkspaceSession | null> {
    await this.queue;
    const db = await this.open();
    const loaded = await new Promise<WorkspaceSession | null>((resolve, reject) => {
      const tx = db.transaction(['workspaces', 'assets'], 'readonly');
      let result: WorkspaceSession | null = null;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error ?? new Error('저장된 초안을 읽을 수 없습니다.'));
      const request = tx.objectStore('workspaces').get(key);
      request.onsuccess = () => {
        const record = request.result as StoredWorkspace | undefined;
        if (!record) return;
        const assets = tx
          .objectStore('assets')
          .index('workspaceId')
          .getAll(IDBKeyRange.only(record.workspaceId));
        assets.onsuccess = () => {
          result = {
            workspaceId: record.workspaceId,
            revision: record.revision,
            storageToken: token(record)!,
            data: record.data,
            metadata: record.metadata,
            assets: new Map(
              (assets.result as StoredAsset[]).map((asset) => [asset.assetId, asset.blob]),
            ),
          };
        };
      };
    });
    if (loaded) {
      const result = validatePortfolio(loaded.data);
      if (!result.valid) throw new ContentError(result.issues);
      readMetadata(loaded.metadata, loaded.data);
      const issues = await validateAssets(loaded.data, loaded.assets, this.decode);
      if (issues.length) throw new ContentError(issues);
    }
    return loaded;
  }

  async version(key: string): Promise<string | null> {
    await this.queue;
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('workspaces', 'readonly');
      const request = tx.objectStore('workspaces').get(key);
      tx.oncomplete = () => resolve(token(request.result as StoredWorkspace | undefined));
      tx.onabort = () =>
        reject(tx.error ?? new Error('저장본 버전을 읽을 수 없습니다. 다시 시도해 주세요.'));
    });
  }

  async close() {
    await this.queue;
    if (this.database) (await this.database).close();
    this.database = undefined;
  }
}
