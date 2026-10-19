import { useEffect } from 'react';
import { useViewer } from '../../content/viewer';
import { selectProjects } from '../../domain/select';
import { rememberGallery, restoreGallery } from '../../app/navigation';
import AssetImage from '../media/AssetImage';
import ShareLink from '../media/ShareLink';
export default function Gallery() {
  const viewer = useViewer();
  const { profile, exhibition } = viewer.data.site;
  const projects = selectProjects(viewer.data, viewer.mode);
  useEffect(() => {
    document.title = `${exhibition.title || '프로젝트 전시장'} · ${profile.displayName || '제작자'}`;
    if (!restoreGallery()) {
      window.scrollTo(0, 0);
      document.getElementById('viewer-heading')?.focus({ preventScroll: true });
    }
  }, [exhibition.title, profile.displayName]);
  return (
    <section className="gallery-page">
      <div className="gallery-intro">
        <div>
          {viewer.data.site.theme.logoAssetId && (
            <AssetImage
              id={viewer.data.site.theme.logoAssetId}
              fallback={exhibition.title || '전시장'}
              className="exhibition-logo"
            />
          )}
          <span className="eyebrow">PROJECT EXHIBITION</span>
          <h1 id="viewer-heading" tabIndex={-1}>
            {exhibition.title || '만든 게임, 쌓아온 이야기.'}
          </h1>
          <p className="lead">
            {exhibition.description ||
              '게임과 그 안의 기술, 그리고 만든 사람의 경험을 담는 프로젝트 전시장.'}
          </p>
          <div className="creator-line">
            {profile.avatarAssetId && (
              <AssetImage
                id={profile.avatarAssetId}
                fallback={profile.displayName || '제작자'}
                className="creator-avatar"
              />
            )}
            <div>
              <strong>{profile.displayName || '제작자 소개 준비 중'}</strong>
              {profile.interests.length > 0 && <p>{profile.interests.join(' · ')}</p>}
            </div>
          </div>
          <div className="gallery-actions">
            <a className="exhibition-invite" href="#/exhibition">
              <strong>3D 전시장 둘러보기</strong>
              <span aria-hidden="true">↗</span>
            </a>
            <ShareLink />
          </div>
        </div>
      </div>
      <div className="works-heading">
        <h2>전시 작품</h2>
        <span>{String(projects.length).padStart(2, '0')} WORKS</span>
      </div>
      {projects.length === 0 ? (
        <div className="empty">
          <span className="empty-symbol" aria-hidden="true">
            ＋
          </span>
          <div>
            <h2>첫 전시를 준비하고 있습니다</h2>
            <p>
              {viewer.preview && viewer.mode === 'workspace'
                ? '등록된 작품이 없습니다. 설정 화면에서 자료를 준비해 주세요.'
                : '아직 공개된 작품이 없습니다. 작품이 등록되면 이곳에서 둘러볼 수 있습니다.'}
            </p>
          </div>
        </div>
      ) : (
        <div className={`project-grid${projects.length >= 3 ? ' has-featured' : ''}`}>
          {projects.map((project, index) => (
            <a
              className="project-card"
              id={`card-${project.id}`}
              key={project.id}
              href={`#/projects/${project.slug}`}
              onClick={() => rememberGallery(project.id)}
            >
              <div className="cover-wrap">
                <AssetImage
                  id={project.media.coverAssetId}
                  fallback={project.title || '제목 준비 중'}
                  className="project-cover"
                />
                <span className="work-number">{String(index + 1).padStart(2, '0')}</span>
                {viewer.mode === 'workspace' && project.status === 'draft' && (
                  <span className="draft-badge">초안</span>
                )}
              </div>
              <div className="card-copy">
                <h3>
                  {project.title || '제목 준비 중'} <span aria-hidden="true">↗</span>
                </h3>
                <p className="project-meta">
                  {project.genre || '장르 준비 중'} · {project.role || '역할 준비 중'}
                </p>
                {project.summary && project.summary !== project.genre && <p>{project.summary}</p>}
              </div>
            </a>
          ))}
        </div>
      )}
      <section className="creator-about" aria-labelledby="about-heading">
        <span className="eyebrow">ABOUT THE CREATOR</span>
        <h2 id="about-heading">{profile.displayName || '전시장 제작자'}</h2>
        <p className="prose">{profile.bio || '소개를 준비하고 있습니다.'}</p>
        {profile.links.length > 0 && (
          <ul className="link-list">
            {profile.links.map((link, index) => (
              <li key={index}>
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.label} ↗
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
