import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Route } from '../../app/router';
import { getWorkspaceController } from '../../storage/runtime';
import { EditorContext } from './EditorFields';
import ProfileSettings from './ProfileSettings';
import ProjectList from './ProjectList';
import PresentationSettings from './PresentationSettings';
import ExportGuidance from './ExportGuidance';
import ProjectEditor from './ProjectEditor';
type StudioRoute = Extract<Route, { name: 'studio' }>;
export default function StudioEditor({ screen, projectId }: Omit<StudioRoute, 'name'>) {
  const runtime = getWorkspaceController();
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const blocked =
    !state.ready ||
    state.loadStatus !== 'ready' ||
    Boolean(state.operation) ||
    Boolean(state.staged);
  const [deletion, requestDelete] = useState<{
    title: string;
    description: string;
    run: () => void;
  } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    void runtime.initialize();
  }, [runtime]);
  useEffect(() => {
    if (state.ready) runtime.rememberEditor(screen, projectId ?? null);
  }, [state.ready, runtime, screen, projectId]);
  useEffect(() => {
    if (deletion && !dialog.current?.open) dialog.current?.showModal();
    else if (!deletion && dialog.current?.open) dialog.current.close();
  }, [deletion]);
  if (!state.ready)
    return (
      <p role="status">
        {state.loadStatus === 'error'
          ? '기존 저장본을 읽지 못해 편집과 저장을 보호하고 있습니다. 다시 읽거나 보관한 백업 파일로 복구해 주세요.'
          : '작업 초안을 불러오고 있습니다.'}
      </p>
    );
  return (
    <EditorContext.Provider value={{ runtime, state, blocked, requestDelete }}>
      {screen === 'profile' && <ProfileSettings />}
      {screen === 'projects' &&
        (projectId ? <ProjectEditor key={projectId} projectId={projectId} /> : <ProjectList />)}
      {screen === 'presentation' && <PresentationSettings />}
      {screen === 'export' && <ExportGuidance />}
      {state.session.metadata.pendingInputs.length > 0 && (
        <details className="pending-inputs">
          <summary>보관된 미정리 입력 {state.session.metadata.pendingInputs.length}개</summary>
          <p className="field-note">
            유효 값을 유지하면서 원문을 보관합니다. 연결 대상이 없는 과거 입력도 여기서 확인할 수
            있습니다.
          </p>
          {state.session.metadata.pendingInputs.map((input, index) => (
            <article key={index}>
              <p>
                {input.projectId
                  ? state.session.data.projects.find((project) => project.id === input.projectId)
                      ?.title || '대상이 없는 작품'
                  : '전시장 설정'}{' '}
                · <code>{input.path}</code>
              </p>
              <pre>{input.rawValue}</pre>
              <button
                disabled={blocked}
                onClick={() =>
                  requestDelete({
                    title: '입력 원문 제거',
                    description: '이 필드의 보관 원문만 제거하고 마지막 유효 값은 유지합니다.',
                    run: () => runtime.discardPending(input),
                  })
                }
              >
                이 입력 원문 제거
              </button>
            </article>
          ))}
        </details>
      )}
      <dialog ref={dialog} aria-labelledby="delete-heading" onCancel={() => requestDelete(null)}>
        <h2 id="delete-heading">{deletion?.title} 확인</h2>
        <p>{deletion?.description}</p>
        <p className="field-note">
          직전 삭제는 바로 되돌릴 수 있습니다. 다른 내용을 편집하거나 새로고침하면 되돌리기가
          종료됩니다.
        </p>
        <div className="actions">
          <button onClick={() => requestDelete(null)}>취소하고 유지</button>
          <button
            className="danger"
            disabled={blocked}
            onClick={() => {
              deletion?.run();
              requestDelete(null);
            }}
          >
            초안에서 삭제
          </button>
        </div>
      </dialog>
    </EditorContext.Provider>
  );
}
