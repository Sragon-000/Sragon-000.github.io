import { useEffect, useRef, useState } from 'react';
import { useViewer } from '../../content/viewer';
import { selectProject, selectProjects } from '../../domain/select';
import type { Architecture, Link, Project } from '../../domain/types';
import {
  jumpTo,
  rememberDetailSection,
  restoreDetailSection,
  detailReturn,
} from '../../app/navigation';
import AssetImage from '../media/AssetImage';
import ShareLink from '../media/ShareLink';
import YouTubeVideo from '../media/YouTubeVideo';
import ArchitectureExplorer from '../architecture/ArchitectureExplorer';
function Links({ links }: { links: Link[] }) {
  return (
    <ul className="link-list">
      {links.map((link, index) => (
        <li key={index}>
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            {link.label} ↗
          </a>
        </li>
      ))}
    </ul>
  );
}
function ArchitectureSummary({ project, expanded }: { project: Project; expanded: boolean }) {
  const projectId = project.id;
  const viewer = useViewer();
  const [result, setResult] = useState<{
    graph: Architecture | null;
    loading: boolean;
    error: string;
  }>({ graph: null, loading: true, error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setResult({ graph: null, loading: true, error: '' });
    void viewer
      .graph(projectId, abort.signal)
      .then((graph) => {
        if (!abort.signal.aborted) setResult({ graph, loading: false, error: '' });
      })
      .catch((error) => {
        if (!abort.signal.aborted)
          setResult({
            graph: null,
            loading: false,
            error: error instanceof Error ? error.message : '구조 자료를 읽을 수 없습니다.',
          });
      });
    return () => abort.abort();
  }, [viewer, projectId, attempt]);
  if (result.loading) return <p role="status">구조 자료를 확인하고 있습니다.</p>;
  if (result.error)
    return (
      <>
        <p role="alert">{result.error}</p>
        <button onClick={() => setAttempt((value) => value + 1)}>구조 자료 다시 불러오기</button>
      </>
    );
  const graph = result.graph;
  if (!graph) return <p className="muted">공개할 아키텍처 자료를 준비하고 있습니다.</p>;
  return (
    <ArchitectureExplorer
      key={`${viewer.sourceKey}/${project.id}`}
      graph={graph}
      project={project}
      expanded={expanded}
    />
  );
}
export default function ProjectDetail({
  slug,
  architecture = false,
}: {
  slug: string;
  architecture?: boolean;
}) {
  const viewer = useViewer();
  const project = selectProject(viewer.data, slug, 'slug', viewer.mode);
  const projects = selectProjects(viewer.data, viewer.mode);
  const index = projects.findIndex((item) => item.id === project?.id);
  const restoredSection = useRef(false);
  const returnLink = detailReturn(`${viewer.sourceKey}/${viewer.mode}`);
  const previous = projects[index - 1];
  const next = projects[index + 1];
  useEffect(() => {
    document.title = `${project?.title || '작품을 찾을 수 없습니다'}${architecture ? ' · 아키텍처' : ''} · ${viewer.data.site.exhibition.title || '프로젝트 전시장'}`;
    if (!architecture && (restoredSection.current || restoreDetailSection(slug))) {
      restoredSection.current = true;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.getElementById('viewer-heading')?.focus({ preventScroll: true });
  }, [project?.id, project?.title, architecture, slug, viewer.data.site.exhibition.title]);
  if (!project)
    return (
      <section className="intro">
        <span className="eyebrow">WORK NOT FOUND</span>
        <h1 id="viewer-heading" tabIndex={-1}>
          작품을 찾을 수 없습니다
        </h1>
        <p className="lead">주소를 확인하거나 갤러리에서 공개된 작품을 둘러보세요.</p>
        <a className="text-link" href="#/gallery">
          갤러리로 돌아가기 ↗
        </a>
      </section>
    );
  if (architecture)
    return (
      <section className="project-page">
        <a
          className="text-link"
          href={`#/projects/${project.slug}`}
          onClick={() => rememberDetailSection(project.slug, 'architecture')}
        >
          작품 상세로 돌아가기 ↗
        </a>
        <h1 id="viewer-heading" tabIndex={-1}>
          {project.title || '제목 준비 중'}
          <br />
          아키텍처
        </h1>
        <ArchitectureSummary project={project} expanded />
      </section>
    );
  const period = project.period.start
    ? `${project.period.start} — ${project.period.ongoing ? '진행 중' : project.period.end || '종료 시점 준비 중'}`
    : '기간 준비 중';
  const sections = [
    { id: 'overview', label: '소개와 영상' },
    { id: 'contribution', label: '담당 역할' },
    { id: 'architecture', label: '아키텍처' },
    ...(project.caseStudies.length ? [{ id: 'cases', label: '문제 해결' }] : []),
    ...(project.outcome || project.reflection || project.links.length
      ? [{ id: 'reflection', label: '회고와 자료' }]
      : []),
  ];
  return (
    <article className="project-page">
      <a className="text-link" href={returnLink.href}>
        {returnLink.label}
      </a>
      <ShareLink slug={project.slug} />
      <div className="detail-heading">
        <span className="eyebrow">
          PROJECT {String(index + 1).padStart(2, '0')}
          {project.status === 'draft' ? ' · 초안' : ''}
        </span>
        <h1 id="viewer-heading" tabIndex={-1}>
          {project.title || '제목 준비 중'}
        </h1>
        <p className="lead">{project.summary || '작품 소개를 준비하고 있습니다.'}</p>
        <p className="detail-tags">
          {project.genre || '장르 준비 중'} <span>·</span> {project.role || '역할 준비 중'}{' '}
          <span>·</span> {period}
        </p>
      </div>
      <div className="detail-layout">
        <div className="detail-body">
          <section id="overview" tabIndex={-1}>
            <h2>소개와 플레이 영상</h2>
            {project.media.video ? (
              <YouTubeVideo video={project.media.video} />
            ) : (
              <div className="video-placeholder">
                <span aria-hidden="true">▶</span>
                <h3>플레이 영상 준비 중</h3>
                <p>등록된 프로젝트 영상이 없습니다.</p>
              </div>
            )}
            {project.overview && <p className="prose">{project.overview}</p>}
            <dl className="production-facts">
              <div>
                <dt>플랫폼</dt>
                <dd>{project.platforms.join(' · ') || '준비 중'}</dd>
              </div>
              <div>
                <dt>사용 기술</dt>
                <dd>{project.technologies.join(' · ') || '준비 중'}</dd>
              </div>
              <div>
                <dt>팀 규모</dt>
                <dd>{project.teamSize === null ? '준비 중' : `${project.teamSize}명`}</dd>
              </div>
            </dl>
            {project.media.screenshotAssetIds.length > 0 && (
              <div className="screenshots">
                {project.media.screenshotAssetIds.map((id) => (
                  <AssetImage id={id} fallback={`${project.title} 게임 화면`} key={id} />
                ))}
              </div>
            )}
          </section>
          <section id="contribution" tabIndex={-1}>
            <h2>담당 역할과 기여</h2>
            <p>{project.role || '역할을 준비하고 있습니다.'}</p>
            {project.contribution.responsibilities.length > 0 && (
              <>
                <h3>직접 담당한 작업</h3>
                <ul>
                  {project.contribution.responsibilities.map((text, i) => (
                    <li key={i}>{text}</li>
                  ))}
                </ul>
              </>
            )}
            {project.contribution.leadership.length > 0 && (
              <>
                <h3>팀을 이끈 경험</h3>
                <ul>
                  {project.contribution.leadership.map((text, i) => (
                    <li key={i}>{text}</li>
                  ))}
                </ul>
              </>
            )}
          </section>
          <section id="architecture" tabIndex={-1}>
            <h2>시스템 아키텍처</h2>
            <ArchitectureSummary project={project} expanded={false} />
          </section>
          {project.caseStudies.length > 0 && (
            <section id="cases" tabIndex={-1}>
              <h2>문제 해결 기록</h2>
              {project.caseStudies.map((study) => (
                <article
                  className="case-study"
                  key={study.id}
                  id={`case-${study.id}`}
                  tabIndex={-1}
                >
                  <h3>{study.title}</h3>
                  {study.problem && (
                    <>
                      <h4>문제</h4>
                      <p className="prose">{study.problem}</p>
                    </>
                  )}
                  {study.alternatives.length > 0 && (
                    <>
                      <h4>검토한 방법</h4>
                      <ul>
                        {study.alternatives.map((text, i) => (
                          <li key={i}>{text}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {study.solution && (
                    <>
                      <h4>선택한 해결책</h4>
                      <p className="prose">{study.solution}</p>
                    </>
                  )}
                  {study.outcome && (
                    <>
                      <h4>결과</h4>
                      <p className="prose">{study.outcome}</p>
                    </>
                  )}
                  <Links links={study.evidence} />
                </article>
              ))}
            </section>
          )}
          {(project.outcome || project.reflection || project.links.length > 0) && (
            <section id="reflection" tabIndex={-1}>
              <h2>결과와 회고</h2>
              {project.outcome && <p className="prose">{project.outcome}</p>}
              {project.reflection && <p className="prose">{project.reflection}</p>}
              <Links links={project.links} />
            </section>
          )}
        </div>
        <nav className="section-nav" aria-label="작품 상세 섹션 이동">
          {sections.map((section) => (
            <button key={section.id} onClick={() => jumpTo(section.id)}>
              {section.label}
            </button>
          ))}
        </nav>
      </div>
      <nav className="adjacent-projects" aria-label="다른 작품">
        {previous ? (
          <a href={`#/projects/${previous.slug}`}>
            <small>← 이전 작품</small>
            <strong>{previous.title || '제목 준비 중'}</strong>
          </a>
        ) : (
          <span />
        )}
        {next ? (
          <a href={`#/projects/${next.slug}`}>
            <small>다음 작품 →</small>
            <strong>{next.title || '제목 준비 중'}</strong>
          </a>
        ) : (
          <span />
        )}
      </nav>
    </article>
  );
}
