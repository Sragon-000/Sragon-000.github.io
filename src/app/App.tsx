import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { parseRoute } from './router';
import ViewerProvider, { useViewer } from '../content/viewer';
import { previewStore } from '../content/preview';
import Gallery from '../features/gallery/Gallery';
import { resetGalleryReturn } from './navigation';
import PageBoundary from './PageBoundary';
import { installMotion } from './motion';
const ValidationLab = import.meta.env.DEV ? lazy(() => import('./ValidationLab')) : null;
const WorkspaceTools = lazy(() => import('../features/studio/WorkspaceTools'));
const ProjectDetail = lazy(() => import('../features/project/ProjectDetail'));
const ExhibitionPage = lazy(() => import('../features/exhibition/ExhibitionPage'));
const subscribe = (listener: () => void) => {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
};
const studioLabels = {
  profile: '기본 정보',
  projects: '작품 관리',
  presentation: '전시 설정',
  export: '내보내기',
};
function ViewerRoutes({
  hash,
  onDefaultView,
}: {
  hash: string;
  onDefaultView: (view: 'gallery' | 'exhibition') => void;
}) {
  const viewer = useViewer();
  const route = parseRoute(hash, viewer.data.site.exhibition.defaultView);
  useEffect(() => {
    onDefaultView(viewer.data.site.exhibition.defaultView);
  }, [viewer.data.site.exhibition.defaultView, onDefaultView]);
  useEffect(() => {
    if (route.name === 'exhibition' || route.name === 'not-found')
      document.querySelector<HTMLHeadingElement>('main h1')?.focus({ preventScroll: true });
  }, [route.name]);
  useEffect(() => {
    document.documentElement.dataset.theme = viewer.data.site.theme.preset;
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const previous = favicon?.href;
    const custom = viewer.image(viewer.data.site.theme.faviconAssetId);
    if (favicon && custom) favicon.href = custom;
    return () => {
      delete document.documentElement.dataset.theme;
      if (favicon && previous) favicon.href = previous;
    };
  }, [viewer]);
  if (route.name === 'gallery') return <Gallery />;
  if (route.name === 'exhibition')
    return (
      <PageBoundary key="exhibition" preview={viewer.preview}>
        <Suspense fallback={<p role="status">전시장 기능을 불러오는 중입니다.</p>}>
          <ExhibitionPage />
        </Suspense>
      </PageBoundary>
    );
  if (route.name === 'project' || route.name === 'architecture')
    return (
      <PageBoundary key={`${route.name}/${route.slug}`} preview={viewer.preview}>
        <Suspense fallback={<p role="status">작품 정보를 불러오는 중입니다.</p>}>
          <ProjectDetail
            key={`${route.name}/${route.slug}`}
            slug={route.slug}
            architecture={route.name === 'architecture'}
          />
        </Suspense>
      </PageBoundary>
    );
  return (
    <section className="intro">
      <span className="eyebrow">PAGE NOT FOUND</span>
      <h1 tabIndex={-1}>페이지를 찾을 수 없습니다</h1>
      <p className="lead">주소를 확인하거나 갤러리에서 작품을 둘러보세요.</p>
      <a className="text-link" href="#/gallery">
        갤러리로 돌아가기 ↗
      </a>
    </section>
  );
}
export default function App() {
  useEffect(() => installMotion(document.getElementById('root')!), []);
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  );
  const preview = useSyncExternalStore(previewStore.subscribe, previewStore.getSnapshot);
  const [defaultView, setDefaultView] = useState<'gallery' | 'exhibition'>('gallery');
  const route = parseRoute(hash, defaultView);
  const studioScreen = route.name === 'studio' ? route.screen : null;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (studioScreen) {
      document.title = `${studioLabels[studioScreen]} · IO`;
      heading.current?.focus();
    } else if (route.name === 'exhibition' || route.name === 'not-found') {
      document.title = `${route.name === 'exhibition' ? '3D 전시장' : '페이지를 찾을 수 없습니다'} · IO`;
      window.scrollTo(0, 0);
    }
  }, [hash, route.name, studioScreen]);
  return (
    <>
      <a
        className="skip"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        본문으로 이동
      </a>
      <header className="header">
        <a className="brand" href="#/gallery" aria-label="IO 전시장 홈">
          IO<span>PROJECT EXHIBITION</span>
        </a>
        <nav aria-label="관람 메뉴">
          <a href="#/gallery" aria-current={route.name === 'gallery' ? 'page' : undefined}>
            갤러리
          </a>
          <a href="#/exhibition" aria-current={route.name === 'exhibition' ? 'page' : undefined}>
            3D 전시장
          </a>
        </nav>
      </header>
      {preview && (
        <aside className="preview-banner" aria-label="초안 미리보기">
          <span>
            <strong>
              {preview.mode === 'public' ? '공개 대상 미리보기' : '초안 포함 전체 미리보기'}
            </strong>
            {preview.data.kind === 'example' ? ' · 기획 예시' : ''} · 이 화면은 아직 배포되지
            않았습니다.
          </span>
          <button
            onClick={() => {
              const target = preview.returnTo;
              resetGalleryReturn();
              previewStore.end();
              location.hash = target;
            }}
          >
            미리보기 종료하고 설정으로
          </button>
        </aside>
      )}
      <main id="main" tabIndex={-1}>
        {route.name === 'studio' ? (
          <section className="studio">
            <span className="eyebrow">YOUR EXHIBITION</span>
            <h1 ref={heading} tabIndex={-1}>
              {studioLabels[route.screen]}
            </h1>
            <nav className="studio-nav" aria-label="설정 메뉴">
              {Object.entries(studioLabels).map(([key, label]) => (
                <a
                  key={key}
                  href={`#/studio/${key}`}
                  aria-current={route.screen === key ? 'page' : undefined}
                >
                  {label}
                </a>
              ))}
            </nav>
            <p className="lead">
              제작자 소개와 작품·구조 입력을 편집하고, 저장·미리보기·파일 내보내기를 진행할 수
              있습니다.
            </p>
            {route.projectId && (
              <p>
                작품 ID: <code>{route.projectId}</code>
              </p>
            )}
            <Suspense fallback={<p>초안 보관 도구를 불러오는 중입니다.</p>}>
              <WorkspaceTools screen={route.screen} projectId={route.projectId} />
            </Suspense>
            {ValidationLab && (
              <Suspense fallback={<p>검증 도구를 불러오는 중입니다.</p>}>
                <ValidationLab />
              </Suspense>
            )}
          </section>
        ) : (
          <ViewerProvider>
            <ViewerRoutes hash={hash} onDefaultView={setDefaultView} />
          </ViewerProvider>
        )}
      </main>
      <footer>
        <span>IO · 각자의 이야기를 담는 전시장</span>
        <span>개발 중 · 갤러리와 3D 전시장</span>
        {import.meta.env.DEV && <a href="#/studio/profile">전시장 설정 ↗</a>}
      </footer>
    </>
  );
}
