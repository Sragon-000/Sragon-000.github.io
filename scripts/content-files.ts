import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { readPortfolioFiles } from '../src/packages/portfolio-package';
import { readManifest } from '../src/packages/metadata';
import { fail } from '../src/packages/types';
import { parseJson } from '../src/packages/zip';
import {
  MAX_PACKAGE_BYTES,
  MAX_PACKAGE_FILES,
  fileByteLimit,
  isPublicPath,
} from '../src/packages/policy';
import { MAX_IMAGE_PIXELS, type ImageDecoder } from '../src/packages/images';

// Decode pixels, not just the header: truncated files must also fail CI.
export const decodeNodeImage: ImageDecoder = async (blob) => {
  const { info } = await sharp(Buffer.from(await blob.arrayBuffer()), {
    failOn: 'warning',
    limitInputPixels: MAX_IMAGE_PIXELS,
  })
    .autoOrient()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height };
};

export async function readDirectory(
  root: string,
  permitted: (path: string) => boolean,
  limit = MAX_PACKAGE_FILES,
  maxTotal = MAX_PACKAGE_BYTES,
) {
  const files = new Map<string, Uint8Array>();
  let total = 0;
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    fail('CONTENT_PATH', '일반 콘텐츠 폴더가 필요합니다.', root);
  async function visit(relative: string, depth: number) {
    if (depth > 3) fail('CONTENT_PATH', '지원하지 않는 하위 폴더입니다.', relative);
    for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await visit(path, depth + 1);
        continue;
      }
      if (!entry.isFile() || !permitted(path))
        fail('CONTENT_PATH', '지원하지 않는 파일 또는 심볼릭 링크입니다.', path);
      const fullPath = join(root, path);
      const stat = await lstat(fullPath);
      const maxBytes = fileByteLimit(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes || files.size >= limit)
        fail('CONTENT_SIZE', '파일 크기 또는 개수 한도를 초과했습니다.', path);
      const bytes = new Uint8Array(await readFile(fullPath));
      total += bytes.length;
      if (bytes.length > maxBytes || total > maxTotal)
        fail('CONTENT_SIZE', '파일 크기 합계 한도를 초과했습니다.', path);
      files.set(path, bytes);
    }
  }
  await visit('', 0);
  return files;
}

export async function validateContentFiles(files: ReadonlyMap<string, Uint8Array>) {
  for (const path of files.keys())
    if (!isPublicPath(path)) fail('CONTENT_PATH', '공개 콘텐츠 파일만 반영할 수 있습니다.', path);
  const manifest = readManifest(
    parseJson(files.get('export-manifest.json'), 'export-manifest.json'),
  );
  if (manifest.kind !== 'public-content')
    fail('CONTENT_KIND', '공개 콘텐츠 ZIP을 사용해 주세요. 전체 백업은 배포할 수 없습니다.');
  const staged = await readPortfolioFiles(files, decodeNodeImage);
  return { files, data: { ...staged.session.data, kind: 'public' as const }, manifest };
}
export async function loadSiteContent(root: string) {
  return validateContentFiles(await readDirectory(root, (path) => isPublicPath(path)));
}
export const APP_STATIC_FILES = new Set(['.nojekyll', 'favicon.svg', 'licenses/three.txt']);
export async function validateAppStatic(root: string) {
  const files = await readDirectory(root, (path) => APP_STATIC_FILES.has(path), 3);
  for (const path of APP_STATIC_FILES)
    if (!files.has(path)) fail('APP_STATIC', '앱의 기본 정적 파일이 없습니다.', path);
}
