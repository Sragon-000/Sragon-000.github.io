import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useViewer } from '../../content/viewer';
import ShareLink from '../media/ShareLink';
import { selectProjects } from '../../domain/select';
import { rememberExhibition } from '../../app/navigation';
import { makeRooms, normalizeSession, workDestination, type Destination } from './model';
import { readExhibitionSession, writeExhibitionSession } from './session';
class SpaceBoundary extends Component<
  { onError: (message: string) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError('전시장 기능을 불러오지 못했습니다. 작품 목록이나 갤러리를 이용해 주세요.');
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
export default function ExhibitionPage() {
  const viewer = useViewer();
  return <ExhibitionContent key={`${viewer.sourceKey}/${viewer.mode}`} />;
}
function ExhibitionContent() {
  const viewer = useViewer();
  const key = `${viewer.sourceKey}/${viewer.mode}`;
  const projects = useMemo(
    () => selectProjects(viewer.data, viewer.mode),
    [viewer.data, viewer.mode],
  );
  const rooms = useMemo(() => makeRooms(projects), [projects]);
  const [session, setSession] = useState(() => normalizeSession(rooms, readExhibitionSession(key)));
  const normalized = normalizeSession(rooms, session);
  const room = rooms[normalized.room];
  const camera = useRef(normalized.camera);
  const current = useRef(normalized);
  current.current = { ...normalized, camera: camera.current };
  const [command, setCommand] = useState(0);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [systemReduced, setSystemReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [manualReduced, setManualReduced] = useState(
    () => readExhibitionSession(key).reduceMotion ?? false,
  );
  const reduced = systemReduced || manualReduced;
  current.current.reduceMotion = manualReduced;
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- Retry replaces React.lazy's cached rejected import object.
  const Space = useMemo(() => lazy(() => import('./Exhibition3D')), [attempt]);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    document.title = `${viewer.data.site.exhibition.title || '3D 전시장'} · 공간 관람 · IO`;
    document.getElementById('exhibition-heading')?.focus({ preventScroll: true });
  }, [viewer.data.site.exhibition.title]);
  useEffect(() => {
    writeExhibitionSession(key, { ...current.current, camera: camera.current });
  }, [key, session, manualReduced]);
  useEffect(
    () => () => writeExhibitionSession(key, { ...current.current, camera: camera.current }),
    [key],
  );
  const selected = projects.find((project) => project.id === normalized.selectedId);
  function select(id: string) {
    if (!room?.works.some((work) => work.project.id === id)) return;
    setSession((previous) => ({ ...previous, selectedId: id }));
  }
  function move(destination: Destination, id?: string) {
    if (error) camera.current = undefined;
    setSession((previous) => ({ ...previous, destination, selectedId: id ?? previous.selectedId }));
    setMoving(!reduced && !error);
    setCommand((value) => value + 1);
  }
  function failure(message: string) {
    setError(message);
    setMoving(false);
  }
  function changeRoom(index: number) {
    if (index === normalized.room) return;
    camera.current = undefined;
    setMoving(false);
    setCommand((value) => value + 1);
    setSession({ room: index, selectedId: null, destination: 'lobby' });
  }
  function openDetail() {
    if (!selected || moving) return;
    writeExhibitionSession(key, { ...current.current, camera: camera.current });
    rememberExhibition(key);
    location.hash = `/projects/${selected.slug}`;
  }
  return (
    <section className="exhibition-page">
      <div className="exhibition-heading">
        <span className="eyebrow">EXPLORE THE SPACE</span>
        <h1 id="exhibition-heading" tabIndex={-1}>
          {viewer.data.site.exhibition.title || '3D 전시장'}
        </h1>
        <ShareLink />
        <p className="lead">전시 지점으로 이동하고, 작품을 선택해 만든 과정과 기술을 둘러보세요.</p>
        {viewer.data.kind === 'example' && (
          <p className="status">기획 예시 전시장 · 실제 공개 전시나 게임 이미지가 아닙니다.</p>
        )}
      </div>
      {projects.length === 0 ? (
        <div className="empty">
          <div>
            <h2>첫 전시를 준비하고 있습니다</h2>
            <p>관람할 작품이 없습니다. 작품을 등록하면 공간에서 둘러볼 수 있습니다.</p>
            <a className="text-link" href="#/gallery">
              갤러리로 돌아가기 ↗
            </a>
          </div>
        </div>
      ) : (
        <>
          <div className="exhibition-toolbar">
            <div role="group" aria-label="전시실 선택">
              {rooms.map((item) => (
                <button
                  key={item.index}
                  aria-pressed={normalized.room === item.index}
                  onClick={() => changeRoom(item.index)}
                >
                  전시실 {item.index + 1} <small>({item.works.length}작품)</small>
                </button>
              ))}
            </div>
            <button onClick={() => move('lobby')}>로비로 이동</button>
            <label className="check-label">
              <input
                type="checkbox"
                checked={reduced}
                disabled={systemReduced}
                onChange={(event) => setManualReduced(event.target.checked)}
              />
              이동 애니메이션 줄이기
            </label>
            <a className="text-link" href="#/gallery">
              갤러리로 관람 ↗
            </a>
          </div>
          <div className="exhibition-layout">
            <div className="exhibition-stage">
              {error ? (
                <div className="space-failure">
                  <h2>3D 공간을 표시할 수 없습니다</h2>
                  <p role="alert">{error}</p>
                  <button
                    onClick={() => {
                      setAttempt((value) => value + 1);
                      setError('');
                    }}
                  >
                    3D 전시장 다시 시도
                  </button>
                </div>
              ) : (
                room && (
                  <SpaceBoundary key={attempt} onError={failure}>
                    <Suspense
                      fallback={
                        <div className="space-loading" role="status">
                          3D 전시장을 불러오는 중입니다.
                        </div>
                      }
                    >
                      <Space
                        theme={viewer.data.site.theme.preset}
                        key={`${key}/${room.index}`}
                        room={room}
                        selectedId={normalized.selectedId}
                        camera={camera.current}
                        destination={normalized.destination}
                        command={command}
                        reduced={reduced}
                        image={viewer.image}
                        onSelect={select}
                        onVisit={(id) => move(workDestination(id), id)}
                        onLobby={() => move('lobby')}
                        onPose={(pose) => {
                          camera.current = pose;
                          writeExhibitionSession(key, { ...current.current, camera: pose });
                        }}
                        onMoving={setMoving}
                        onError={failure}
                      />
                    </Suspense>
                  </SpaceBoundary>
                )
              )}
              <p className="movement-status" role="status">
                {moving
                  ? '선택한 전시 지점으로 이동하고 있습니다.'
                  : `전시실 ${normalized.room + 1} · ${room?.works.length ?? 0}작품`}
              </p>
              <details className="exhibition-help">
                <summary>관람 조작 안내</summary>
                <p>
                  작품 패널을 선택하면 작품 정보가 표시됩니다. 바닥의 초록 이동 지점이나 아래 작품
                  목록으로 해당 구역을 방문하세요. 드래그로 시점을 바꾸고 휠·두 손가락으로
                  확대합니다. 자유 보행은 제공하지 않습니다.
                </p>
                <p>
                  모바일에서 페이지를 내릴 때는 공간 밖을 스크롤하세요. 시스템의 동작 줄이기 설정도
                  적용합니다. 로비로 이동하면 기본 시점으로 돌아옵니다.
                </p>
              </details>
            </div>
            <aside className="exhibition-selection" aria-label="선택한 작품">
              <span className="eyebrow">SELECTED WORK</span>
              {selected ? (
                <>
                  <h2>{selected.title || '제목 준비 중'}</h2>
                  <p>
                    {selected.genre || '장르 준비 중'} · {selected.role || '역할 준비 중'}
                  </p>
                  <p className="prose">{selected.summary || '소개 준비 중'}</p>
                  {viewer.mode === 'workspace' && (
                    <p className="field-note">
                      {selected.status === 'draft' ? '작성 중인 초안' : '공개 대상 작품'}
                    </p>
                  )}
                  <button className="primary" disabled={moving} onClick={openDetail}>
                    선택한 작품 상세 보기 ↗
                  </button>
                  <p className="field-note">상세를 보고 돌아오면 이 전시실과 시점을 복원합니다.</p>
                </>
              ) : (
                <>
                  <h2>작품을 선택해 주세요</h2>
                  <p>공간의 작품 패널이나 아래 목록에서 선택할 수 있습니다.</p>
                </>
              )}
            </aside>
          </div>
          <nav className="exhibition-work-list" aria-label="현재 전시실 작품">
            <h2>전시실 {normalized.room + 1} 작품 바로가기</h2>
            <div>
              {room?.works.map((work) => (
                <button
                  key={work.project.id}
                  aria-pressed={normalized.selectedId === work.project.id}
                  onClick={() => move(workDestination(work.project.id), work.project.id)}
                >
                  <small>{String(work.ordinal).padStart(2, '0')}</small>
                  <strong>{work.project.title || '제목 준비 중'}</strong>
                  <span>{work.project.role || '역할 준비 중'}</span>
                </button>
              ))}
            </div>
          </nav>
        </>
      )}
    </section>
  );
}
