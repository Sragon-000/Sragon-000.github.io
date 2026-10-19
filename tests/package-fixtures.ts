import { PNG } from 'pngjs';
import type { ImageDecoder } from '../src/packages/images';
import type { WorkspaceSession } from '../src/packages/types';
import { emptyMetadata } from '../src/packages/types';
import { fixture } from './fixtures';

export function pngBlob(): Blob {
  const image = new PNG({ width: 2, height: 3 });
  image.data.fill(180);
  const bytes = PNG.sync.write(image);
  return new Blob([new Uint8Array(bytes)], { type: 'image/png' });
}
export const decodePng: ImageDecoder = async (blob) => {
  const image = PNG.sync.read(Buffer.from(await blob.arrayBuffer()));
  return { width: image.width, height: image.height };
};
export function packageSession(): WorkspaceSession {
  const data = fixture('owner');
  data.site.profile.displayName = '검증용 제작자';
  data.projects[0]!.status = 'published';
  const cover = pngBlob();
  data.assets = ['cover', 'private', 'unused'].map((id) => ({
    id,
    path: `assets/${id}.png`,
    mimeType: 'image/png',
    byteSize: cover.size,
    width: 2,
    height: 3,
    alt: '자동 검사 이미지',
  }));
  data.projects[0]!.media.coverAssetId = 'cover';
  data.projects[1]!.media.coverAssetId = 'private';
  return {
    workspaceId: crypto.randomUUID(),
    revision: 1,
    data,
    metadata: emptyMetadata(),
    assets: new Map(data.assets.map((asset) => [asset.id, cover])),
  };
}
