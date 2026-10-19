import type { Portfolio, Issue } from '../domain/types';
import { preparePublicContent } from '../domain/public';
import { validatePortfolio, validatePublicContent } from '../domain/validate';
import { readMetadata, readManifest } from './metadata';
import { validateAssets, type ImageDecoder } from './images';
import {
  cloneSession,
  ContentError,
  emptyMetadata,
  fail,
  type ExportManifest,
  type StagedImport,
  type WorkspaceSession,
} from './types';
import { jsonBytes, MAX_ZIP_BYTES, parseJson, readZipBlob, writeZipPackage } from './zip';

async function requireAssets(
  data: Portfolio,
  assets: ReadonlyMap<string, Blob>,
  decode?: ImageDecoder,
) {
  const issues = await validateAssets(data, assets, decode);
  if (issues.length) throw new ContentError(issues);
}
function validData(input: unknown, isPublic = false): Portfolio {
  const result = isPublic ? validatePublicContent(input) : validatePortfolio(input);
  if (!result.valid) throw new ContentError(result.issues);
  return result.data;
}
function expectedPaths(data: Portfolio, kind: ExportManifest['kind']): Set<string> {
  const paths =
    kind === 'workspace-backup'
      ? ['portfolio.json', 'backup.json']
      : [
          'content/site.json',
          'content/projects.json',
          'content/assets.json',
          ...data.architectures.map((graph) => `content/architectures/${graph.projectId}.json`),
        ];
  return new Set([...paths, ...data.assets.map((asset) => asset.path)]);
}
function checkExactFiles(files: ReadonlyMap<string, Uint8Array>, paths: Set<string>) {
  if (
    files.size !== paths.size + 1 ||
    [...files.keys()].some((path) => path !== 'export-manifest.json' && !paths.has(path))
  )
    fail('PACKAGE_FILES', '자료가 참조하는 파일 목록과 패키지 파일이 일치하지 않습니다.');
  for (const path of paths)
    if (!files.has(path)) fail('PACKAGE_FILES', '패키지에 필요한 파일이 없습니다.', path);
}

export async function readPortfolioPackage(
  blob: Blob,
  decode?: ImageDecoder,
): Promise<StagedImport> {
  if (blob.size > MAX_ZIP_BYTES) fail('ZIP_SIZE', 'ZIP 파일은 64MiB 이하여야 합니다.');
  const files = await readZipBlob(blob);
  return readPortfolioFiles(files, decode);
}

// Also used by the build tools after bounded filesystem reads.
export async function readPortfolioFiles(
  files: ReadonlyMap<string, Uint8Array>,
  decode?: ImageDecoder,
): Promise<StagedImport> {
  const manifest = readManifest(
    parseJson(files.get('export-manifest.json'), 'export-manifest.json'),
  );
  if (files.size !== manifest.files.length + 1)
    fail('MANIFEST_FILES', '패키지 파일 목록이 실제 파일과 다릅니다.');
  for (const file of manifest.files)
    if (files.get(file.path)?.length !== file.byteSize)
      fail('MANIFEST_FILES', '파일이 없거나 바이트 수가 기록과 다릅니다.', file.path);
  let data: Portfolio;
  let metadata = emptyMetadata();
  let issues: Issue[] = [];
  if (manifest.kind === 'workspace-backup') {
    data = validData(parseJson(files.get('portfolio.json'), 'portfolio.json'));
    const backup = readMetadata(parseJson(files.get('backup.json'), 'backup.json'), data);
    metadata = backup.metadata;
    issues = backup.issues;
  } else {
    const rawSite = parseJson(files.get('content/site.json'), 'content/site.json');
    if (
      !rawSite ||
      typeof rawSite !== 'object' ||
      Array.isArray(rawSite) ||
      Object.keys(rawSite).sort().join(',') !== 'kind,schemaVersion,site'
    )
      fail('PUBLIC_SITE', '공개 전시장 설정 파일 형식이 맞지 않습니다.');
    const site = rawSite as Record<string, unknown>;
    const architectures = [...files.keys()]
      .filter((path) => path.startsWith('content/architectures/'))
      .sort()
      .map((path) => parseJson(files.get(path), path));
    data = validData(
      {
        ...site,
        projects: parseJson(files.get('content/projects.json'), 'content/projects.json'),
        assets: parseJson(files.get('content/assets.json'), 'content/assets.json'),
        architectures,
      },
      true,
    );
  }
  checkExactFiles(files, expectedPaths(data, manifest.kind));
  const assets = new Map(
    data.assets.map((asset) => [
      asset.id,
      new Blob([new Uint8Array(files.get(asset.path)!)], { type: asset.mimeType }),
    ]),
  );
  await requireAssets(data, assets, decode);
  // Imported public content starts a local editing workspace; it does not deploy a site.
  const editing = structuredClone(data);
  if (editing.kind === 'public') editing.kind = 'workspace';
  return {
    session: { workspaceId: crypto.randomUUID(), revision: 0, data: editing, metadata, assets },
    sourceKind: manifest.kind,
    issues,
  };
}

export async function readPortfolioJson(
  blob: Blob,
  imageFiles: ReadonlyMap<string, Blob> = new Map(),
  decode?: ImageDecoder,
): Promise<StagedImport> {
  if (blob.size > 2 * 1024 * 1024) fail('JSON_FILE', 'JSON 파일은 2MiB 이하여야 합니다.');
  const data = validData(parseJson(new Uint8Array(await blob.arrayBuffer()), 'portfolio.json'));
  const files = new Map<string, Blob>();
  for (const asset of data.assets) {
    const file = imageFiles.get(asset.path);
    if (file) files.set(asset.id, file);
  }
  if ([...imageFiles.keys()].some((path) => !data.assets.some((asset) => asset.path === path)))
    fail('PACKAGE_FILES', '자산 목록에 없는 이미지 파일이 있습니다.');
  await requireAssets(data, files, decode);
  const editing = structuredClone(data);
  if (editing.kind === 'public') editing.kind = 'workspace';
  return {
    session: {
      workspaceId: crypto.randomUUID(),
      revision: 0,
      data: editing,
      metadata: emptyMetadata(),
      assets: files,
    },
    sourceKind: 'json',
    issues: [],
  };
}

async function finishPackage(
  files: Map<string, Uint8Array>,
  kind: ExportManifest['kind'],
  decode?: ImageDecoder,
) {
  const manifest: ExportManifest = {
    exportVersion: '1.0.0',
    schemaVersion: '1.0.0',
    kind,
    createdAt: new Date().toISOString(),
    files: [...files].map(([path, bytes]) => ({ path, byteSize: bytes.length })),
  };
  readManifest(manifest);
  files.set('export-manifest.json', jsonBytes(manifest));
  const finished = await writeZipPackage(files);
  // These files were re-read from the finished ZIP through the same CRC/size parser.
  await readPortfolioFiles(finished.files, decode);
  return finished.blob;
}
async function appendAssets(
  files: Map<string, Uint8Array>,
  data: Portfolio,
  assets: ReadonlyMap<string, Blob>,
) {
  for (const asset of data.assets)
    files.set(asset.path, new Uint8Array(await assets.get(asset.id)!.arrayBuffer()));
}

export async function exportWorkspaceBackup(
  input: WorkspaceSession,
  decode?: ImageDecoder,
): Promise<{ blob: Blob; issues: Issue[] }> {
  const session = cloneSession(input);
  validData(session.data);
  const metadata = readMetadata(session.metadata, session.data);
  await requireAssets(session.data, session.assets, decode);
  // savedAt describes the snapshot creation time; save success remains a transaction event.
  session.metadata.savedAt = new Date().toISOString();
  const files = new Map([
    ['portfolio.json', jsonBytes(session.data)],
    ['backup.json', jsonBytes(session.metadata)],
  ]);
  await appendAssets(files, session.data, session.assets);
  return { blob: await finishPackage(files, 'workspace-backup', decode), issues: metadata.issues };
}

export async function exportPublicContent(
  input: WorkspaceSession,
  decode?: ImageDecoder,
): Promise<{ blob: Blob; issues: Issue[] }> {
  const session = cloneSession(input);
  const result = preparePublicContent(session.data);
  if (!result.ok) throw new ContentError(result.issues);
  readMetadata(session.metadata, session.data);
  if (
    session.metadata.pendingInputs.some(
      (pending) =>
        pending.scope === 'site' ||
        (pending.scope === 'project'
          ? result.data.projects.some((project) => project.id === pending.projectId)
          : result.data.architectures.some((graph) => graph.projectId === pending.projectId)),
    )
  )
    fail(
      'PENDING_PUBLIC',
      '공개 대상에 아직 정리하지 않은 입력이 있습니다. 원문을 확인하고 해결한 뒤 내보내 주세요.',
    );
  const data = result.data;
  const assets = new Map(
    data.assets
      .map((asset) => [asset.id, session.assets.get(asset.id)!])
      .filter((entry): entry is [string, Blob] => Boolean(entry[1])),
  );
  await requireAssets(data, assets, decode);
  const files = new Map([
    [
      'content/site.json',
      jsonBytes({ schemaVersion: data.schemaVersion, kind: data.kind, site: data.site }),
    ],
    ['content/projects.json', jsonBytes(data.projects)],
    ['content/assets.json', jsonBytes(data.assets)],
    ...data.architectures.map(
      (graph) =>
        [`content/architectures/${graph.projectId}.json`, jsonBytes(graph)] as [string, Uint8Array],
    ),
  ]);
  await appendAssets(files, data, assets);
  return { blob: await finishPackage(files, 'public-content', decode), issues: result.issues };
}
