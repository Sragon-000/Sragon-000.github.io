import { useState } from 'react';
import { useViewer } from '../../content/viewer';

export default function ShareLink({ slug }: { slug?: string }) {
  const viewer = useViewer();
  const [message, setMessage] = useState('');
  if (viewer.preview || import.meta.env.DEV) return null;
  const url = new URL(`${import.meta.env.BASE_URL}${slug ? `share/${slug}/` : ''}`, location.origin)
    .href;
  return (
    <div className="share-link">
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setMessage('공유 링크를 복사했습니다.');
          } catch {
            setMessage('아래 공유 주소를 선택해 복사해 주세요.');
          }
        }}
      >
        {slug ? '작품 링크 복사' : '전시장 링크 복사'}
      </button>
      {message && (
        <>
          <p role="status">{message}</p>
          <a href={url}>{url}</a>
        </>
      )}
    </div>
  );
}
