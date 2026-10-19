import { normalizeYouTube, youtubeLink } from '../../domain/media';
export { normalizeYouTube, youtubeLink };
export interface Player {
  playVideo(): void;
  stopVideo(): void;
  destroy(): void;
  getIframe(): HTMLIFrameElement;
}
export interface YouTubeApi {
  Player: new (
    host: HTMLElement,
    options: {
      videoId: string;
      host: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady: (event: { target: Player }) => void;
        onError: (event: { data: number }) => void;
        onAutoplayBlocked: () => void;
      };
    },
  ) => Player;
}
declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let apiPromise: Promise<YouTubeApi> | undefined;
export function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    let finished = false;
    const cleanup = () => {
      clearTimeout(timeout);
      script.onerror = null;
      if (window.onYouTubeIframeAPIReady === ready) window.onYouTubeIframeAPIReady = previous;
    };
    const fail = () => {
      if (finished) return;
      finished = true;
      cleanup();
      script.remove();
      apiPromise = undefined;
      reject(new Error('YouTube 연결에 실패했습니다. 다시 시도하거나 원본 영상을 열어 주세요.'));
    };
    const ready = () => {
      if (!window.YT?.Player) {
        fail();
        return;
      }
      finished = true;
      cleanup();
      resolve(window.YT);
      try {
        previous?.();
      } catch {
        /* another consumer must not break this player */
      }
    };
    const timeout = setTimeout(fail, 15000);
    window.onYouTubeIframeAPIReady = ready;
    script.onerror = fail;
    document.head.append(script);
  });
  return apiPromise;
}
export function startYouTube(
  host: HTMLElement,
  id: string,
  title: string,
  status: (state: 'loading' | 'ready' | 'error' | 'blocked', message?: string) => void,
  load = loadYouTubeApi,
  origin = location.origin,
) {
  let disposed = false;
  let ready = false;
  let player: Player | undefined;
  let readyTimeout: ReturnType<typeof setTimeout> | undefined;
  status('loading');
  void load()
    .then((api) => {
      if (disposed) return;
      readyTimeout = setTimeout(() => {
        if (!disposed)
          status(
            'error',
            '플레이어 응답이 늦어지고 있습니다. 다시 시도하거나 원본 영상을 열어 주세요.',
          );
      }, 15000);
      player = new api.Player(host, {
        videoId: id,
        host: 'https://www.youtube-nocookie.com',
        playerVars: { origin, playsinline: 1, autoplay: 0 },
        events: {
          onReady: (event) => {
            if (disposed) return;
            ready = true;
            clearTimeout(readyTimeout);
            event.target.getIframe().title = title;
            status('ready');
            event.target.playVideo();
          },
          onError: (event) => {
            clearTimeout(readyTimeout);
            if (!disposed)
              status(
                'error',
                `영상을 재생할 수 없습니다 (코드 ${event.data}). 원본 영상을 확인해 주세요.`,
              );
          },
          onAutoplayBlocked: () => {
            clearTimeout(readyTimeout);
            if (!disposed) status('blocked', '플레이어 안의 재생 버튼을 눌러 주세요.');
          },
        },
      });
    })
    .catch((error) => {
      clearTimeout(readyTimeout);
      if (!disposed)
        status('error', error instanceof Error ? error.message : '영상을 불러올 수 없습니다.');
    });
  return () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(readyTimeout);
    if (player) {
      try {
        if (ready) player.stopVideo();
      } catch {
        /* remove the frame even if the player is no longer reachable */
      }
      try {
        player.destroy();
      } catch {
        /* the React wrapper is removed by the caller */
      }
    }
  };
}
