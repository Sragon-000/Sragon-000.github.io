import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Architecture, Project } from '../../domain/types';
import { useViewer } from '../../content/viewer';
import { jumpTo, rememberDetailSection } from '../../app/navigation';
import Graph2D from './Graph2D';
import { connectedNodes, contributionLabels, relationLabels, validSelection } from './model';
import { graphSessionKey, readGraphSession, writeGraphSession, type GraphSession } from './session';
class ThreeBoundary extends Component<
  { onError: (message: string) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError('3D 기능을 불러오지 못했습니다. 2D로 계속 보거나 다시 시도해 주세요.');
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
export default function ArchitectureExplorer({
  graph,
  project,
  expanded,
}: {
  graph: Architecture;
  project: Project;
  expanded: boolean;
}) {
  const viewer = useViewer();
  const key = graphSessionKey(`${viewer.sourceKey}/${viewer.mode}`, project.id);
  const [session, setSession] = useState<GraphSession>(() => readGraphSession(key));
  const selectedId = validSelection(graph, session.selectedId);
  const camera = useRef(session.camera);
  const box = useRef(session.box);
  const current = useRef(session);
  current.current = { ...session, selectedId, camera: camera.current, box: box.current };
  const [reset, setReset] = useState(0);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- Retry replaces React.lazy's cached rejected import object.
  const Three = useMemo(() => lazy(() => import('./Graph3D')), [attempt]);
  const saveSession = useCallback(() => {
    writeGraphSession(key, { ...current.current, camera: camera.current, box: box.current });
  }, [key]);
  useEffect(() => {
    if (session.selectedId !== selectedId) setSession((previous) => ({ ...previous, selectedId }));
    saveSession();
  }, [session, selectedId, saveSession]);
  useEffect(() => () => saveSession(), [saveSession]);
  function select(id: string) {
    setSession((previous) => ({ ...previous, selectedId: id }));
  }
  function failure(message: string) {
    setError(message);
    setSession((previous) => ({ ...previous, view: '2d' }));
  }
  function showCase(id: string) {
    const target = `case-${id}`;
    if (!expanded) jumpTo(target);
    else {
      rememberDetailSection(project.slug, target);
      location.hash = `/projects/${project.slug}`;
    }
  }
  const node = graph.nodes.find((node) => node.id === selectedId);
  const adjacent = connectedNodes(graph, selectedId);
  const parents = graph.nodes.filter((item) => item.parentId === selectedId);
  if (!graph.nodes.length)
    return <p className="muted">등록된 시스템이 없습니다. 구조를 준비하고 있습니다.</p>;
  return (
    <div className={`architecture-explorer ${expanded ? 'expanded' : 'compact'}`}>
      <div className="graph-provenance">
        {viewer.data.kind === 'example'
          ? '기획 예시 · 실제 작품의 구조가 아닙니다.'
          : graph.verified
            ? '제작자가 확인한 구조'
            : '작성 중인 구조 · 초안'}
        <span>
          시스템 {graph.nodes.length}개 · 연결 {graph.edges.length}개
        </span>
      </div>
      <div className="graph-toolbar">
        <div className="graph-tabs" role="group" aria-label="아키텍처 보기">
          <button
            aria-pressed={session.view === '2d'}
            onClick={() => setSession((previous) => ({ ...previous, view: '2d' }))}
          >
            2D 보기
          </button>
          <button
            aria-pressed={session.view === '3d'}
            onClick={() => {
              if (session.view === '3d' && !error) return;
              setError('');
              setAttempt((value) => value + 1);
              setSession((previous) => ({ ...previous, view: '3d' }));
            }}
          >
            {error ? '3D 다시 시도' : '3D 보기'}
          </button>
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={session.emphasize}
            onChange={(event) =>
              setSession((previous) => ({ ...previous, emphasize: event.target.checked }))
            }
          />
          내 담당 강조
        </label>
        <button
          onClick={() => {
            box.current = undefined;
            camera.current = undefined;
            setReset((value) => value + 1);
          }}
        >
          전체 맞춤
        </button>
        <button
          disabled={!selectedId}
          onClick={() => setSession((previous) => ({ ...previous, selectedId: null }))}
        >
          선택 해제
        </button>
        {!expanded && (
          <a className="text-link" href={`#/projects/${project.slug}/architecture`}>
            그래프 크게 보기 ↗
          </a>
        )}
      </div>
      {error && (
        <p className="status" role="alert">
          {error}
        </p>
      )}
      <div className="graph-layout">
        <div className="graph-stage">
          {session.view === '2d' ? (
            <Graph2D
              key={`2d-${key}`}
              graph={graph}
              selectedId={selectedId}
              emphasize={session.emphasize}
              onSelect={select}
              savedBox={box.current}
              onBox={(value) => {
                box.current = value;
                writeGraphSession(key, { ...current.current, box: value });
              }}
              reset={reset}
            />
          ) : (
            <ThreeBoundary key={attempt} onError={failure}>
              <Suspense
                fallback={
                  <p className="status" role="status">
                    3D 그래프를 불러오는 중입니다.
                  </p>
                }
              >
                <Three
                  graph={graph}
                  theme={viewer.data.site.theme.preset}
                  selectedId={selectedId}
                  emphasize={session.emphasize}
                  onSelect={select}
                  onError={failure}
                  camera={camera.current}
                  onCamera={(value) => {
                    camera.current = value;
                    writeGraphSession(key, { ...current.current, camera: value });
                  }}
                  reset={reset}
                />
              </Suspense>
            </ThreeBoundary>
          )}
          <div className="graph-legend" aria-label="관계 범례">
            {Object.entries(relationLabels).map(([type, label]) => (
              <span key={type} data-type={type}>
                → {label}
              </span>
            ))}
            <span>⋯ 부모 관계</span>
          </div>
          <p className="field-note">
            직접·공동 구현을 내 담당으로 강조합니다. 선택한 시스템과 직접 연결된 관계를 함께
            표시합니다.
          </p>
          <details className="system-picker" open={expanded}>
            <summary>시스템 목록 · 키보드와 터치로 선택</summary>
            <div>
              {graph.nodes.map((item) => (
                <button
                  key={item.id}
                  className={
                    session.emphasize && ['direct', 'shared'].includes(item.contributionType)
                      ? 'own'
                      : ''
                  }
                  aria-pressed={selectedId === item.id}
                  onClick={() => select(item.id)}
                >
                  {item.label || '이름 미입력'}
                  <small>
                    {contributionLabels[item.contributionType]}
                    {selectedId && adjacent.has(item.id) && item.id !== selectedId
                      ? ' · 연결됨'
                      : ''}
                  </small>
                </button>
              ))}
            </div>
          </details>
        </div>
        <aside className="system-detail" aria-label="선택한 시스템 설명">
          <div id={`graph-detail-${project.id}`} tabIndex={-1}>
            {node ? (
              <>
                <span className="eyebrow">SELECTED SYSTEM</span>
                <h3>{node.label || '이름 미입력'}</h3>
                <p className={`contribution-badge ${node.contributionType}`}>
                  {contributionLabels[node.contributionType]}
                </p>
                <p className="field-note">
                  {node.groupId
                    ? `${graph.groups.find((group) => group.id === node.groupId)?.label} · 층 ${graph.groups.find((group) => group.id === node.groupId)?.layer}`
                    : '그룹 없음'}
                </p>
                <h4>책임</h4>
                <p className="prose">{node.responsibility || '설명 준비 중'}</p>
                {node.inputs.length > 0 && (
                  <>
                    <h4>입력</h4>
                    <ul>
                      {node.inputs.map((text, i) => (
                        <li key={i}>{text}</li>
                      ))}
                    </ul>
                  </>
                )}
                {node.outputs.length > 0 && (
                  <>
                    <h4>출력</h4>
                    <ul>
                      {node.outputs.map((text, i) => (
                        <li key={i}>{text}</li>
                      ))}
                    </ul>
                  </>
                )}
                {node.decisions && (
                  <>
                    <h4>설계 결정</h4>
                    <p className="prose">{node.decisions}</p>
                  </>
                )}
                {node.contributionNote && (
                  <>
                    <h4>내 기여</h4>
                    <p className="prose">{node.contributionNote}</p>
                  </>
                )}
                {(node.parentId || parents.length > 0) && (
                  <>
                    <h4>부모·자식 관계</h4>
                    {node.parentId && (
                      <button onClick={() => select(node.parentId!)}>
                        부모:{' '}
                        {graph.nodes.find((item) => item.id === node.parentId)?.label ||
                          '이름 미입력'}
                      </button>
                    )}
                    {parents.map((child) => (
                      <button key={child.id} onClick={() => select(child.id)}>
                        자식: {child.label || '이름 미입력'}
                      </button>
                    ))}
                  </>
                )}
                {graph.edges.some((edge) => edge.source === node.id || edge.target === node.id) && (
                  <>
                    <h4>연결과 이유</h4>
                    <ul className="relationship-list">
                      {graph.edges
                        .filter((edge) => edge.source === node.id || edge.target === node.id)
                        .map((edge) => (
                          <li key={edge.id}>
                            <strong>
                              {graph.nodes.find((item) => item.id === edge.source)?.label ||
                                '이름 미입력'}{' '}
                              →{' '}
                              {graph.nodes.find((item) => item.id === edge.target)?.label ||
                                '이름 미입력'}
                            </strong>
                            <span>
                              {relationLabels[edge.type]} · {edge.label || '이름 미입력'}
                            </span>
                            {edge.description && <p className="prose">{edge.description}</p>}
                          </li>
                        ))}
                    </ul>
                  </>
                )}
                {node.relatedCaseIds.length > 0 && (
                  <>
                    <h4>연결된 개발 사례</h4>
                    {node.relatedCaseIds.map((id) => {
                      const study = project.caseStudies.find((study) => study.id === id);
                      return study ? (
                        <button key={id} onClick={() => showCase(id)}>
                          {study.title || '제목 미입력'} · 사례 보기 ↗
                        </button>
                      ) : null;
                    })}
                  </>
                )}
                {node.codeRefs.length > 0 && (
                  <>
                    <h4>코드·문서</h4>
                    <ul className="link-list">
                      {node.codeRefs.map((link, i) => (
                        <li key={i}>
                          <a href={link.url} target="_blank" rel="noopener noreferrer">
                            {link.label} ↗
                          </a>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <>
                <h3>시스템을 선택해 주세요</h3>
                <p>
                  그래프의 시스템이나 목록에서 선택하면 책임·기여·연결 이유를 확인할 수 있습니다.
                </p>
              </>
            )}
          </div>
          {node && (
            <button className="detail-jump" onClick={() => jumpTo(`graph-detail-${project.id}`)}>
              시스템 설명으로 이동 ↓
            </button>
          )}
        </aside>
      </div>
      <div className="graph-revision">
        {graph.revision.label && <p>기준 버전: {graph.revision.label}</p>}
        {graph.revision.reviewedAt && <p>제작자 확인일: {graph.revision.reviewedAt}</p>}
        {graph.revision.sources.map((source, i) => (
          <div key={i}>
            {source.url ? (
              <a className="text-link" href={source.url} target="_blank" rel="noopener noreferrer">
                {source.label} ↗
              </a>
            ) : (
              <strong>{source.label}</strong>
            )}
            {source.note && <p className="prose">{source.note}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
