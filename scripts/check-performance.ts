import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

// Initial entry + all static imports. Dynamic route/3D/ZIP chunks have their own loading boundary.
export async function initialBundle(dist: string, base: string) {
  const html = await readFile(resolve(dist, 'index.html'), 'utf8');
  const entry = /<script\b[^>]*src="([^"]+\.js)"/u.exec(html)?.[1];
  if (!entry?.startsWith(base)) throw new Error('성능 검사의 앱 진입 경로가 잘못되었습니다.');
  const visited = new Set<string>();
  const files: { path: string; bytes: number; gzip: number }[] = [];
  async function visit(path: string) {
    if (visited.has(path)) return;
    visited.add(path);
    if (!/^assets\/[a-zA-Z0-9_-]+\.js$/u.test(path)) throw new Error(`정적 JS 참조 오류: ${path}`);
    const code = await readFile(resolve(dist, path));
    files.push({ path, bytes: code.length, gzip: gzipSync(code).length });
    // Rolldown outputs standard import declarations. import(...) is intentionally excluded.
    for (const match of code
      .toString()
      .matchAll(/\bimport\s*(?:[^;"'()]*?\s*from\s*)?["'](\.\/[^"']+\.js)["']/gu))
      await visit(`assets/${match[1]!.slice(2)}`);
  }
  await visit(entry.slice(base.length));
  return {
    files,
    bytes: files.reduce((n, file) => n + file.bytes, 0),
    gzip: files.reduce((n, file) => n + file.gzip, 0),
  };
}
export function enforceBudget(report: Awaited<ReturnType<typeof initialBundle>>) {
  if (report.bytes > 400 * 1024 || report.gzip > 125 * 1024)
    throw new Error(`초기 JS 예산 초과: ${report.bytes} bytes / gzip ${report.gzip} bytes`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = await initialBundle(resolve('dist'), process.env.PAGES_BASE || '/');
  enforceBudget(report);
  console.log(
    `초기 JS: ${(report.bytes / 1024).toFixed(1)} KiB / gzip ${(report.gzip / 1024).toFixed(1)} KiB (${report.files.length}개).`,
  );
}
