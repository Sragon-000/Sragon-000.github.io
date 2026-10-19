import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readZip, MAX_ZIP_BYTES } from '../src/packages/zip';
import { loadSiteContent, validateContentFiles } from './content-files';

export async function importContent(zipPath: string, target: string, dryRun = false) {
  const source = await lstat(zipPath);
  if (!source.isFile() || source.isSymbolicLink() || source.size > MAX_ZIP_BYTES)
    throw new Error('64MiB 이하의 일반 ZIP 파일을 선택해 주세요.');
  const content = await validateContentFiles(readZip(new Uint8Array(await readFile(zipPath))));
  if (dryRun)
    return { projects: content.data.projects.length, files: content.files.size, backup: null };
  let exists = false;
  try {
    await lstat(target);
    exists = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  // Refuse to overwrite a malformed directory or symlink. Repair it separately.
  if (exists) await loadSiteContent(target);
  await mkdir(dirname(target), { recursive: true });
  const stage = await mkdtemp(join(dirname(target), '.site-content-stage-'));
  const backup = exists
    ? join(dirname(target), `.site-content-backup-${crypto.randomUUID()}`)
    : null;
  let moved = false;
  try {
    for (const [path, bytes] of content.files) {
      await mkdir(dirname(join(stage, path)), { recursive: true });
      await writeFile(join(stage, path), bytes, { flag: 'wx' });
    }
    await loadSiteContent(stage);
    if (backup) {
      await rename(target, backup);
      moved = true;
    }
    try {
      await rename(stage, target);
    } catch (error) {
      if (moved && backup) await rename(backup, target);
      throw error;
    }
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
  return { projects: content.data.projects.length, files: content.files.size, backup };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--check');
    const paths = args.filter((arg) => arg !== '--check');
    if (paths.length !== 1 || paths[0]!.startsWith('--'))
      throw new Error('사용법: npm run content:import -- "/경로/공개콘텐츠.zip" [--check]');
    const result = await importContent(resolve(paths[0]!), resolve('site-content'), dryRun);
    console.log(
      `${dryRun ? '검증 완료' : '로컬 반영 완료'}: 작품 ${result.projects}개, 파일 ${result.files}개. GitHub 업로드·배포는 별도입니다.`,
    );
    if (result.backup) console.log(`기존 공개 파일 보존 위치: ${result.backup}`);
    if (!dryRun) console.log('개발 서버를 재시작하거나 npm run build 후 확인해 주세요.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
