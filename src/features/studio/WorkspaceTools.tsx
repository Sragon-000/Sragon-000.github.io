import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getWorkspaceController } from '../../storage/runtime';
import { previewStore } from '../../content/preview';
import StudioEditor from './StudioEditor';
import type { Route } from '../../app/router';
import { resetGalleryReturn } from '../../app/navigation';

export default function WorkspaceTools({
  screen,
  projectId,
}: Omit<Extract<Route, { name: 'studio' }>, 'name'>) {
  const runtime = getWorkspaceController();
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const dialog = useRef<HTMLDialogElement>(null);
  const reloadDialog = useRef<HTMLDialogElement>(null);
  const [jsonImages, setJsonImages] = useState<Map<string, File>>(new Map());
  const [imageSelectionError, setImageSelectionError] = useState('');
  const [artifact, setArtifact] = useState<{
    url: string;
    name: string;
    kind: 'backup' | 'public';
  } | null>(null);
  useEffect(() => {
    setArtifact(null);
  }, [state.session.workspaceId, state.session.revision]);
  useEffect(
    () => () => {
      if (artifact) URL.revokeObjectURL(artifact.url);
    },
    [artifact],
  );
  useEffect(() => {
    void runtime.initialize();
  }, [runtime]);
  useEffect(() => {
    if (state.staged && !dialog.current?.open) dialog.current?.showModal();
    else if (!state.staged && dialog.current?.open) dialog.current.close();
  }, [state.staged]);
  const busy = !state.ready || Boolean(state.operation);
  const transferBusy =
    state.loadStatus === 'loading' || Boolean(state.operation) || Boolean(state.saving);
  const importBlocked = transferBusy || Boolean(state.staged) || state.conflict;
  async function exportFile(kind: 'backup' | 'public') {
    const blob = await runtime.export(kind);
    if (blob)
      setArtifact({
        url: URL.createObjectURL(blob),
        name: `io-${kind === 'backup' ? 'workspace-backup' : 'public-content'}-${new Date().toISOString().slice(0, 10)}.zip`,
        kind,
      });
  }
  return (
    <section className="workspace-tools" aria-labelledby="workspace-heading">
      <div className="section-heading">
        <span className="eyebrow">LOCAL WORKSPACE</span>
        <h2 id="workspace-heading">초안 보관과 파일 이동</h2>
      </div>
      <p>
        이 기기의 초안을 저장하거나 파일로 옮길 수 있습니다. 공개 콘텐츠 ZIP은 자신의 GitHub
        저장소에 반영해 배포합니다.
      </p>
      <div className="workspace-summary">
        <strong>
          {state.session.data.kind === 'example' ? '기획 예시 작업 공간' : '개인 전시장 초안'}
        </strong>
        {state.ready && (
          <span>
            작품 {state.session.data.projects.length}개 · 이미지 {state.session.data.assets.length}
            개 · 입력 원문 {state.session.metadata.pendingInputs.length}개
          </span>
        )}
        <span className="save-indicator">
          {state.loadStatus === 'error'
            ? '기존 저장본 복구 필요'
            : !state.ready
              ? '저장본 읽는 중'
              : state.saving
                ? '저장 중'
                : runtime.dirty()
                  ? '저장하지 않은 변경 사항'
                  : '이 기기에 저장됨'}
        </span>
      </div>
      <div className="editor-toolbar">
        <button
          className="primary"
          disabled={busy || state.loadStatus !== 'ready' || Boolean(state.staged) || state.conflict}
          onClick={() => void runtime.save()}
        >
          초안 저장
        </button>
        <button
          disabled={busy || Boolean(state.staged)}
          onClick={() => {
            resetGalleryReturn();
            previewStore.start(state.session, 'workspace', location.hash);
            location.hash = '/gallery';
          }}
        >
          편집 내용 미리보기
        </button>
        <a className="button-link" href="#/studio/export">
          파일 내보내기 화면 ↗
        </a>
      </div>
      {(state.loadStatus === 'error' || state.conflict) && (
        <div className="status" role="alert">
          <strong>
            {state.conflict ? '다른 저장본과 충돌했습니다' : '저장본을 읽지 못했습니다'}
          </strong>
          <p>
            기존 저장본은 유지됩니다. 이 탭에 입력이 있다면 먼저 전체 초안 백업을 다운로드하세요.
          </p>
          <button
            disabled={transferBusy || Boolean(state.staged)}
            onClick={() => {
              if (state.ready) reloadDialog.current?.showModal();
              else void runtime.reload();
            }}
          >
            저장본 다시 읽기
          </button>
        </div>
      )}
      <StudioEditor key={state.session.workspaceId} screen={screen} projectId={projectId} />
      {state.canUndo && (
        <div className="status">
          <span>직전 삭제를 되돌릴 수 있습니다. </span>
          <button
            disabled={busy || Boolean(state.staged)}
            onClick={() => {
              runtime.undoDelete();
              const editor = runtime.getSnapshot().session.metadata.editorState;
              location.hash = `/studio/${editor.screen}${editor.projectId ? `/${editor.projectId}` : ''}`;
            }}
          >
            직전 삭제 되돌리기
          </button>
        </div>
      )}
      <div className="actions">
        <button
          className="primary"
          disabled={busy || state.loadStatus !== 'ready' || Boolean(state.staged) || state.conflict}
          onClick={() => void runtime.save()}
        >
          이 기기에 초안 저장
        </button>
        <button disabled={busy || Boolean(state.saving)} onClick={() => void exportFile('backup')}>
          전체 초안 백업
        </button>
        <button
          disabled={busy || Boolean(state.saving) || Boolean(state.staged)}
          onClick={() => void exportFile('public')}
        >
          공개 콘텐츠 내보내기
        </button>
      </div>
      <div className="actions preview-actions">
        <button
          disabled={busy || Boolean(state.staged)}
          onClick={() => {
            resetGalleryReturn();
            previewStore.start(state.session, 'public', location.hash);
            location.hash = '/gallery';
          }}
        >
          공개 대상 미리보기
        </button>
        <button
          disabled={busy || Boolean(state.staged)}
          onClick={() => {
            resetGalleryReturn();
            previewStore.start(state.session, 'workspace', location.hash);
            location.hash = '/gallery';
          }}
        >
          초안 포함 전체 미리보기
        </button>
      </div>
      <p className="field-note">
        현재 입력의 스냅샷을 관람합니다. 미리보기는 공개 사이트를 변경하지 않으며, 새로고침하면
        종료됩니다.
      </p>
      <p className="status" role="status">
        {state.status}
      </p>
      {artifact && (
        <p>
          <a className="download-link" href={artifact.url} download={artifact.name}>
            {artifact.kind === 'backup' ? '백업' : '공개 콘텐츠'} ZIP 다운로드 ↗
          </a>
        </p>
      )}
      {state.issues.length > 0 && (
        <ul className="issues">
          {state.issues.map((issue, index) => (
            <li key={index} className={issue.severity}>
              <strong>{issue.severity === 'error' ? '수정 필요' : '안내'}</strong>
              <span>{issue.message}</span>
              <code>{issue.path || '/'}</code>
              {issue.target?.projectId && (
                <a className="text-link" href={`#/studio/projects/${issue.target.projectId}`}>
                  관련 작품 수정 ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      <details className="import-panel">
        <summary>백업 또는 콘텐츠 가져오기</summary>
        <p>파일 검사 후 제작자와 작품 수를 확인합니다. 현재 초안은 교체 확인 전까지 유지됩니다.</p>
        <label htmlFor="package-file">ZIP 파일 가져오기</label>
        <input
          id="package-file"
          type="file"
          accept=".zip,application/zip"
          disabled={importBlocked}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              setArtifact(null);
              void runtime.stage(file, 'zip');
            }
            event.target.value = '';
          }}
        />
        <details className="json-import">
          <summary>JSON과 이미지 파일로 가져오기</summary>
          <p>
            이미지가 있으면 먼저 함께 선택하세요. 이미지 파일명은 JSON의 assets 경로 마지막 파일명과
            같아야 합니다.
          </p>
          <label htmlFor="json-images">함께 가져올 이미지</label>
          <input
            id="json-images"
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/avif"
            disabled={importBlocked}
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              const map = new Map(files.map((file) => [`assets/${file.name}`, file]));
              if (map.size !== files.length) {
                setJsonImages(new Map());
                setImageSelectionError(
                  '같은 파일명을 가진 이미지가 있습니다. 파일명을 확인해 다시 선택해 주세요.',
                );
                event.target.value = '';
                return;
              }
              setImageSelectionError('');
              setJsonImages(map);
            }}
          />
          <p className="field-note">선택된 이미지 {jsonImages.size}개</p>
          {imageSelectionError && <p role="alert">{imageSelectionError}</p>}
          <label htmlFor="json-file">portfolio.json 가져오기</label>
          <input
            id="json-file"
            type="file"
            accept=".json,application/json"
            disabled={importBlocked || Boolean(imageSelectionError)}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                setArtifact(null);
                void runtime.stage(file, 'json', jsonImages);
              }
              event.target.value = '';
            }}
          />
        </details>
      </details>
      <dialog
        ref={dialog}
        aria-labelledby="import-heading"
        onCancel={(event) => {
          if (state.operation === 'import') event.preventDefault();
          else runtime.cancelImport();
        }}
      >
        <h2 id="import-heading">가져올 초안 확인</h2>
        {state.staged && (
          <>
            <p>
              <strong>
                {state.staged.session.data.site.profile.displayName || '제작자 이름 미입력'}
              </strong>{' '}
              · {state.staged.session.data.site.exhibition.title || '전시장 이름 미입력'}
            </p>
            <p>
              작품 {state.staged.session.data.projects.length}개 · 이미지{' '}
              {state.staged.session.data.assets.length}개 · 입력 원문{' '}
              {state.staged.session.metadata.pendingInputs.length}개
            </p>
            <p>
              {state.staged.session.data.kind === 'example'
                ? '기획 예시로 가져옵니다. 실제 작품으로 공개되지 않습니다.'
                : '현재 초안을 가져온 자료로 교체하고 이 기기에 저장합니다.'}
            </p>
            {state.loadStatus === 'error' && (
              <p role="alert">
                읽지 못한 기존 저장본과 이미지를 가져온 백업으로 교체합니다. 복구할 파일이 맞는지
                확인하세요.
              </p>
            )}
            {state.staged.issues.map((issue, index) => (
              <p key={index}>{issue.message}</p>
            ))}
            <p className="field-note">필요하면 먼저 현재 초안을 백업하세요.</p>
            <div className="actions">
              <button disabled={transferBusy} onClick={() => runtime.cancelImport()}>
                취소하고 현재 초안 유지
              </button>
              <button disabled={busy} onClick={() => void exportFile('backup')}>
                현재 초안 백업
              </button>
              <button
                className="primary"
                disabled={transferBusy || state.conflict}
                onClick={() => void runtime.confirmImport()}
              >
                현재 초안 대신 가져오기
              </button>
            </div>
            <p role="status">{state.status}</p>
            {artifact && (
              <p>
                <a className="download-link" href={artifact.url} download={artifact.name}>
                  {artifact.kind === 'backup' ? '백업' : '공개 콘텐츠'} ZIP 다운로드 ↗
                </a>
              </p>
            )}
          </>
        )}
      </dialog>
      <dialog
        ref={reloadDialog}
        aria-labelledby="reload-heading"
        onCancel={(event) => {
          if (state.operation) event.preventDefault();
        }}
      >
        <h2 id="reload-heading">저장본 다시 읽기 확인</h2>
        <p>
          이 탭의 미저장 내용을 저장된 초안으로 교체합니다. 먼저 전체 초안 백업을 다운로드해 보관할
          수 있습니다.
        </p>
        <div className="actions">
          <button disabled={transferBusy} onClick={() => reloadDialog.current?.close()}>
            취소하고 입력 유지
          </button>
          <button disabled={busy} onClick={() => void exportFile('backup')}>
            미저장 초안 백업
          </button>
          <button
            disabled={transferBusy}
            onClick={async () => {
              await runtime.reload();
              reloadDialog.current?.close();
            }}
          >
            저장본으로 다시 읽기
          </button>
        </div>
        {artifact && (
          <p>
            <a className="download-link" href={artifact.url} download={artifact.name}>
              백업 ZIP 다운로드 ↗
            </a>
          </p>
        )}
      </dialog>
    </section>
  );
}
