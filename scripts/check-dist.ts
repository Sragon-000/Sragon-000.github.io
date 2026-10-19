import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_STATIC_FILES, loadSiteContent, readDirectory } from './content-files';
import { pagesBase } from './content-plugin';
import { publicationUrl, sharingPaths, sharingTags, sharingInfo } from './sharing';
import { selectProjects } from '../src/domain/select';
import { decodeNodeImage } from './content-files';
import { MAX_PACKAGE_BYTES } from '../src/packages/zip';

export async function checkDist(
  dist: string,
  source: string,
  base: string,
  siteUrl = process.env.PAGES_URL,
) {
  pagesBase(base);
  const content = await loadSiteContent(source);
  const published = publicationUrl(siteUrl, base);
  const required = new Set([
    'index.html',
    ...APP_STATIC_FILES,
    ...content.files.keys(),
    ...sharingPaths(content.data),
  ]);
  const files = await readDirectory(
    dist,
    (path) =>
      required.has(path) ||
      /^assets\/[a-zA-Z0-9_-]+\.(?:js|css)$/.test(path) ||
      /^assets\/aurora-dream-[a-zA-Z0-9_-]+\.webp$/.test(path),
    1024,
    MAX_PACKAGE_BYTES + 32 * 1024 * 1024,
  );
  for (const path of required)
    if (!files.has(path)) throw new Error(`빌드 출력 파일 누락: ${path}`);
  for (const [path, bytes] of content.files)
    if (!Buffer.from(bytes).equals(Buffer.from(files.get(path)!)))
      throw new Error(`빌드 콘텐츠가 원본과 다릅니다: ${path}`);
  for (const [path, bytes] of files) {
    if (!path.endsWith('.css')) continue;
    const css = new TextDecoder().decode(bytes);
    for (const match of css.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) {
      const ref = match[1]!;
      if (!ref.startsWith(base) || !files.has(ref.slice(base.length)))
        throw new Error(`빌드 CSS의 정적 파일 경로 오류: ${ref}`);
    }
  }
  for (const project of [undefined, ...selectProjects(content.data)]) {
    const info = sharingInfo(content.data, project);
    const page = project ? `${info.page}index.html` : 'index.html';
    const html = new TextDecoder().decode(files.get(page));
    for (const tag of sharingTags(content.data, base, published, project).split('\n    '))
      if (!html.includes(tag)) throw new Error(`공유 메타데이터 오류: ${page}`);
    const refs = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"[^>]*>/g)]
      .filter((match) => !match[0].includes('rel="canonical"'))
      .map((match) => match[1]!);
    for (const ref of refs) {
      if (!ref.startsWith(base) || !files.has(ref.slice(base.length)))
        throw new Error(`빌드 HTML의 정적 파일 경로 오류: ${ref}`);
    }
    if (!refs.some((ref) => ref.endsWith('.js'))) throw new Error('앱 진입 스크립트가 없습니다.');
    const dimensions = await decodeNodeImage(new Blob([new Uint8Array(files.get(info.image)!)]));
    if (dimensions.width !== 1200 || dimensions.height !== 630)
      throw new Error(`공유 이미지 크기 오류: ${info.image}`);
    if (project && !html.includes(`data-initial-route="${info.route}"`))
      throw new Error(`작품 공유 진입 경로 오류: ${page}`);
  }
  return files.size;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(
      `dist 검사 완료: ${await checkDist(resolve('dist'), resolve('site-content'), pagesBase(process.env.PAGES_BASE))}개 파일.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
