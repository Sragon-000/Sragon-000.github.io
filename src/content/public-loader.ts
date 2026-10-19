import type { Architecture, Portfolio } from '../domain/types';
import { validatePublicContent } from '../domain/validate';
import { readManifest } from '../packages/manifest';
import { ContentError, fail, type ExportManifest } from '../packages/types';
import { parseJson } from '../packages/json';
import { MAX_JSON_BYTES } from '../packages/policy';
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
export type PublicContent = { data: Portfolio; manifest: ExportManifest; base: string };
export class MissingContent extends Error {}
function baseUrl(base: string, origin: string) {
  const url = new URL(base, origin);
  if (url.origin !== new URL(origin).origin || url.search || url.hash)
    throw new Error('잘못된 콘텐츠 경로입니다.');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}
// Read a bounded stream: Content-Length is not trusted, and a missing header must not remove the limit.
async function readBytes(response: Response, limit: number, signal?: AbortSignal) {
  const reader = response.body?.getReader();
  if (!reader) fail('CONTENT_FILE', '콘텐츠 파일을 읽을 수 없습니다.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > limit) fail('CONTENT_SIZE', '콘텐츠 JSON 파일은 2MiB 이하여야 합니다.');
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
async function fetchJson(
  url: string,
  path: string,
  fetcher: Fetcher,
  signal?: AbortSignal,
  expected?: number,
  optional = false,
) {
  const response = await fetcher(url, {
    cache: 'no-store',
    signal,
    headers: { Accept: 'application/json' },
  });
  if (optional && response.status === 404) throw new MissingContent('아직 공개 자료가 없습니다.');
  if (!response.ok)
    fail('CONTENT_NETWORK', `공개 자료를 불러오지 못했습니다 (${response.status}).`, path);
  const bytes = await readBytes(response, MAX_JSON_BYTES, signal);
  if (expected !== undefined && bytes.length !== expected)
    fail(
      'CONTENT_VERSION',
      '파일 크기가 배포 목록과 다릅니다. 다시 불러오거나 배포 파일을 확인해 주세요.',
      path,
    );
  return parseJson(bytes, path);
}
export async function loadPublicContent(
  base: string,
  origin: string,
  fetcher: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<PublicContent> {
  const root = baseUrl(base, origin);
  const manifest = readManifest(
    await fetchJson(
      new URL('export-manifest.json', root).href,
      'export-manifest.json',
      fetcher,
      signal,
      undefined,
      true,
    ),
  );
  if (manifest.kind !== 'public-content')
    fail(
      'CONTENT_KIND',
      '공개 콘텐츠 ZIP의 파일을 배포해 주세요. 초안 백업은 공개 자료가 아닙니다.',
    );
  const get = (path: string) => {
    const file = manifest.files.find((file) => file.path === path);
    if (!file) fail('CONTENT_FILE', '배포 목록에 필요한 파일이 없습니다.', path);
    return fetchJson(new URL(path, root).href, path, fetcher, signal, file.byteSize);
  };
  const [site, projects, assets] = await Promise.all([
    get('content/site.json'),
    get('content/projects.json'),
    get('content/assets.json'),
  ]);
  if (
    !site ||
    typeof site !== 'object' ||
    Array.isArray(site) ||
    Object.keys(site).sort().join(',') !== 'kind,schemaVersion,site'
  )
    fail('CONTENT_SITE', '전시장 설정 파일 형식이 맞지 않습니다.');
  const result = validatePublicContent({ ...site, projects, assets, architectures: [] });
  if (!result.valid) throw new ContentError(result.issues);
  const data = result.data;
  const allowed = new Set([
    'content/site.json',
    'content/projects.json',
    'content/assets.json',
    ...data.assets.map((asset) => asset.path),
    ...data.projects.map((project) => `content/architectures/${project.id}.json`),
  ]);
  if (manifest.files.some((file) => !allowed.has(file.path)))
    fail('CONTENT_FILE', '배포 목록에 공개 자료와 관계없는 파일이 있습니다.');
  for (const asset of data.assets)
    if (manifest.files.find((file) => file.path === asset.path)?.byteSize !== asset.byteSize)
      fail('CONTENT_ASSET', '이미지 목록과 배포 목록이 다릅니다.', asset.path);
  return { data, manifest, base: root };
}
export async function loadPublicArchitecture(
  content: PublicContent,
  projectId: string,
  fetcher: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<Architecture | null> {
  const path = `content/architectures/${projectId}.json`;
  const file = content.manifest.files.find((file) => file.path === path);
  if (!file) return null;
  const graph = await fetchJson(
    new URL(path, content.base).href,
    path,
    fetcher,
    signal,
    file.byteSize,
  );
  const result = validatePublicContent({ ...content.data, architectures: [graph] });
  if (!result.valid) throw new ContentError(result.issues);
  if (result.data.architectures[0]?.projectId !== projectId)
    fail('CONTENT_GRAPH', '구조 파일이 다른 작품에 연결되어 있습니다.', path);
  return result.data.architectures[0]!;
}
export function assetUrl(content: PublicContent, id: string | null) {
  const asset = content.data.assets.find((asset) => asset.id === id);
  return asset ? new URL(asset.path, content.base).href : undefined;
}
