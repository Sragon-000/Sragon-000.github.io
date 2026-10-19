import { useState } from 'react';
import { useViewer } from '../../content/viewer';
export default function AssetImage({
  id,
  fallback,
  className = '',
}: {
  id: string | null;
  fallback: string;
  className?: string;
}) {
  const viewer = useViewer();
  const asset = viewer.data.assets.find((asset) => asset.id === id);
  const src = viewer.image(id);
  const [failed, setFailed] = useState<string | undefined>();
  return src && asset && failed !== src ? (
    <img
      className={className}
      src={src}
      alt={asset.alt}
      width={asset.width}
      height={asset.height}
      loading="lazy"
      onError={() => setFailed(src)}
    />
  ) : (
    <div className={`image-fallback ${className}`} role="img" aria-label={fallback}>
      <span aria-hidden="true">{fallback}</span>
      {src && <small>이미지를 불러올 수 없습니다</small>}
    </div>
  );
}
