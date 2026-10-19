import type { Asset, Issue, Portfolio } from '../domain/types';
import { ContentError, fail } from './types';

export type ImageDecoder = (blob: Blob) => Promise<{ width: number; height: number }>;
import { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS } from './policy';
export { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS } from './policy';
const text = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.slice(start, end));

export function sniffImage(bytes: Uint8Array): Asset['mimeType'] | undefined {
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value))
    return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (text(bytes, 0, 4) === 'RIFF' && text(bytes, 8, 12) === 'WEBP') return 'image/webp';
  if (text(bytes, 4, 8) === 'ftyp') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const end = Math.min(view.getUint32(0), bytes.length);
    if (text(bytes, 8, 12) === 'avif' || text(bytes, 8, 12) === 'avis') return 'image/avif';
    for (let offset = 16; offset + 4 <= end; offset += 4)
      if (['avif', 'avis'].includes(text(bytes, offset, offset + 4))) return 'image/avif';
  }
  return undefined;
}

export const decodeBrowserImage: ImageDecoder = async (blob) => {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    try {
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
};

type ImageInfo = { mimeType: Asset['mimeType']; byteSize: number; width: number; height: number };
const browserInspections = new WeakMap<Blob, Promise<ImageInfo>>();
export async function inspectImage(
  blob: Blob,
  decode: ImageDecoder = decodeBrowserImage,
): Promise<ImageInfo> {
  // Blob bytes are immutable. Cache only the built-in decoder and return a fresh metadata object.
  if (decode !== decodeBrowserImage) return inspectUncached(blob, decode);
  let pending = browserInspections.get(blob);
  if (!pending) {
    pending = inspectUncached(blob, decode);
    browserInspections.set(blob, pending);
  }
  try {
    return { ...(await pending) };
  } catch (error) {
    if (browserInspections.get(blob) === pending) browserInspections.delete(blob);
    throw error;
  }
}
async function inspectUncached(blob: Blob, decode: ImageDecoder): Promise<ImageInfo> {
  if (!blob.size || blob.size > MAX_IMAGE_BYTES)
    fail('IMAGE_SIZE', '이미지는 0바이트보다 크고 10MiB 이하여야 합니다.');
  const mimeType = sniffImage(new Uint8Array(await blob.slice(0, 4096).arrayBuffer()));
  if (!mimeType) fail('IMAGE_FORMAT', 'PNG, JPEG, WebP 또는 AVIF 이미지 파일을 선택해 주세요.');
  let dimensions: { width: number; height: number };
  try {
    dimensions = await decode(blob.slice(0, blob.size, mimeType));
  } catch {
    fail('IMAGE_DECODE', '이미지 파일을 정상적으로 읽을 수 없습니다.');
  }
  if (
    !Number.isInteger(dimensions.width) ||
    !Number.isInteger(dimensions.height) ||
    dimensions.width < 1 ||
    dimensions.height < 1
  )
    fail('IMAGE_DIMENSIONS', '이미지 크기를 확인할 수 없습니다.');
  if (dimensions.width * dimensions.height > MAX_IMAGE_PIXELS)
    fail('IMAGE_PIXELS', '이미지는 4천만 픽셀 이하여야 합니다. 크기를 줄인 뒤 다시 등록해 주세요.');
  return { mimeType, byteSize: blob.size, ...dimensions };
}

export async function createImageAsset(
  blob: Blob,
  alt: string,
  decode?: ImageDecoder,
): Promise<{ asset: Asset; blob: Blob }> {
  const inspected = await inspectImage(blob, decode);
  const id = `image-${crypto.randomUUID()}`;
  const ext = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/avif': 'avif',
  }[inspected.mimeType];
  if (!alt.trim() || [...alt].length > 300)
    fail('IMAGE_ALT', '이미지 설명을 1~300자로 입력해 주세요.');
  const normalized = blob.slice(0, blob.size, inspected.mimeType);
  if (!decode || decode === decodeBrowserImage)
    browserInspections.set(normalized, Promise.resolve(inspected));
  return {
    asset: { id, path: `assets/${id}.${ext}`, ...inspected, alt: alt.trim() },
    blob: normalized,
  };
}

export async function validateAssets(
  data: Portfolio,
  files: ReadonlyMap<string, Blob>,
  decode?: ImageDecoder,
): Promise<Issue[]> {
  const issues: Issue[] = [];
  for (const [index, asset] of data.assets.entries()) {
    const path = `/assets/${index}`;
    const target = { assetId: asset.id };
    const blob = files.get(asset.id);
    if (!blob) {
      issues.push({
        code: 'R10',
        severity: 'error',
        path,
        message: '이미지 파일이 없습니다.',
        target,
      });
      continue;
    }
    try {
      const actual = await inspectImage(blob, decode);
      if (
        actual.mimeType !== asset.mimeType ||
        actual.byteSize !== asset.byteSize ||
        actual.width !== asset.width ||
        actual.height !== asset.height
      )
        issues.push({
          code: 'R10',
          severity: 'error',
          path,
          message: '이미지 파일의 형식·바이트 수·가로·세로가 기록과 일치하지 않습니다.',
          target,
        });
    } catch (error) {
      if (error instanceof ContentError)
        issues.push(...error.issues.map((issue) => ({ ...issue, code: 'R10', path, target })));
      else throw error;
    }
  }
  for (const id of files.keys())
    if (!data.assets.some((asset) => asset.id === id))
      issues.push({
        code: 'R10',
        severity: 'error',
        path: '/assets',
        message: '자산 목록에 없는 이미지 파일이 포함되어 있습니다.',
        target: { assetId: id },
      });
  return issues;
}
