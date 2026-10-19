import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createWorkspace } from '../domain/create';
import { selectArchitecture } from '../domain/select';
import type { Architecture, Portfolio, ViewMode } from '../domain/types';
import {
  assetUrl,
  loadPublicArchitecture,
  loadPublicContent,
  MissingContent,
  type PublicContent,
} from './public-loader';
import { previewStore } from './preview';
interface Viewer {
  sourceKey: string;
  data: Portfolio;
  mode: ViewMode;
  preview: boolean;
  image: (id: string | null) => string | undefined;
  graph: (id: string, signal: AbortSignal) => Promise<Architecture | null>;
}
const Context = createContext<Viewer | null>(null);
export function useViewer() {
  const value = useContext(Context);
  if (!value) throw new Error('관람 자료 공급자가 필요합니다.');
  return value;
}
export default function ViewerProvider({ children }: { children: ReactNode }) {
  const preview = useSyncExternalStore(previewStore.subscribe, previewStore.getSnapshot);
  const [content, setContent] = useState<PublicContent | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (preview) return;
    const abort = new AbortController();
    setStatus('loading');
    setContent(null);
    void loadPublicContent(import.meta.env.BASE_URL, location.origin, fetch, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) {
          setContent(value);
          setStatus('ready');
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          setStatus(error instanceof MissingContent ? 'missing' : 'error');
          setMessage(error instanceof Error ? error.message : '공개 자료를 읽을 수 없습니다.');
        }
      });
    return () => abort.abort();
  }, [preview, attempt]);
  const value = useMemo<Viewer>(
    () =>
      preview
        ? {
            sourceKey: `workspace/${preview.workspaceId}`,
            data: preview.data,
            mode: preview.mode,
            preview: true,
            image: (id) => preview.urls.get(id ?? ''),
            graph: async (id) => selectArchitecture(preview.data, id, preview.mode) ?? null,
          }
        : {
            sourceKey: `public/${location.origin}${import.meta.env.BASE_URL}`,
            data: content?.data ?? createWorkspace(),
            mode: 'public',
            preview: false,
            image: (id) => (content ? assetUrl(content, id) : undefined),
            graph: (id, signal) =>
              content ? loadPublicArchitecture(content, id, fetch, signal) : Promise.resolve(null),
          },
    [preview, content],
  );
  if (!preview && status === 'loading')
    return (
      <section className="intro">
        <h1 tabIndex={-1}>전시를 불러오는 중입니다</h1>
        <p role="status">공개된 작품과 제작자 정보를 읽고 있습니다.</p>
      </section>
    );
  if (!preview && status === 'error')
    return (
      <section className="intro">
        <h1 tabIndex={-1}>전시 자료를 불러올 수 없습니다</h1>
        <p role="alert">{message}</p>
        <button onClick={() => setAttempt((value) => value + 1)}>다시 불러오기</button>
      </section>
    );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
