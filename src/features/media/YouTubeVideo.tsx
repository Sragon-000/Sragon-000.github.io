import { useLayoutEffect, useRef, useState } from 'react';
import type { Project } from '../../domain/types';
import { startYouTube, youtubeLink } from './youtube';
export default function YouTubeVideo({ video }: { video: NonNullable<Project['media']['video']> }) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error' | 'blocked'>('idle');
  const [message, setMessage] = useState('');
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!attempt || !root.current) return;
    const container = root.current;
    // YouTube replaces its host element; keep React's owned wrapper intact.
    const host = document.createElement('div');
    container.replaceChildren(host);
    const dispose = startYouTube(host, video.videoId, video.title, (state, text) => {
      setStatus(state);
      setMessage(text ?? '');
    });
    return () => {
      dispose();
      container.replaceChildren();
    };
  }, [attempt, video.videoId, video.title]);
  return (
    <div className="video-block">
      {!attempt && (
        <div className="video-placeholder">
          <span aria-hidden="true">▶</span>
          <h3>{video.title}</h3>
          <p>재생을 선택하면 YouTube 플레이어를 불러옵니다.</p>
          <button className="primary" onClick={() => setAttempt(1)}>
            플레이 영상 재생
          </button>
        </div>
      )}
      <div ref={root} className={attempt ? 'video-player' : 'hidden'} />
      {status === 'loading' && <p role="status">YouTube 플레이어를 불러오는 중입니다.</p>}
      {(status === 'error' || status === 'blocked') && (
        <p role={status === 'error' ? 'alert' : 'status'}>{message}</p>
      )}
      {status === 'error' && (
        <button onClick={() => setAttempt((value) => value + 1)}>영상 다시 불러오기</button>
      )}
      <p>
        <a
          className="text-link"
          href={youtubeLink(video.videoId)}
          target="_blank"
          rel="noopener noreferrer"
        >
          YouTube에서 원본 영상 보기 ↗
        </a>
      </p>
    </div>
  );
}
