import { readZip, checkZipFiles, writeZip as writeZipOnMain } from './zip-core';
import { ContentError, fail } from './types';
import { MAX_ZIP_BYTES } from './policy';
import type { ZipRequest, ZipResponse } from './zip-protocol';
export {
  readZip,
  MAX_ZIP_BYTES,
  MAX_PACKAGE_BYTES,
  MAX_JSON_BYTES,
  jsonBytes,
  parseJson,
} from './zip-core';
export const ZIP_WORKER_THRESHOLD = 4 * 1024 * 1024;
export function runZipWorker(request: ZipRequest): Promise<ZipResponse> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./zip-worker.ts', import.meta.url), { type: 'module' });
    } catch {
      fail(
        'ZIP_WORKER',
        '파일 처리 기능을 시작하지 못했습니다. 연결과 브라우저 설정을 확인해 주세요.',
      );
    }
    const cleanup = () => {
      clearTimeout(timeout);
      worker.terminate();
    };
    const stop = () => {
      cleanup();
      reject(
        new ContentError([
          {
            code: 'ZIP_WORKER',
            severity: 'error',
            path: '',
            message:
              '파일 처리 기능을 불러오지 못했습니다. 기존 초안은 유지됩니다. 연결을 확인하고 다시 시도해 주세요.',
          },
        ]),
      );
    };
    const timeout = setTimeout(stop, 120_000);
    worker.onerror = stop;
    worker.onmessageerror = stop;
    worker.onmessage = ({ data }: MessageEvent<ZipResponse>) => {
      cleanup();
      if (data.ok) resolve(data);
      else reject(new ContentError(data.issues));
    };
    try {
      worker.postMessage(request);
    } catch {
      stop();
    }
  });
}
export async function readZipBlob(blob: Blob) {
  if (blob.size > MAX_ZIP_BYTES) fail('ZIP_SIZE', 'ZIP 파일은 64MiB 이하여야 합니다.');
  if (typeof Worker === 'function' && blob.size >= ZIP_WORKER_THRESHOLD) {
    const result = await runZipWorker({ kind: 'read', blob });
    if (!result.ok || result.kind !== 'read')
      fail('ZIP_WORKER', '파일 처리 응답이 올바르지 않습니다.');
    return result.files;
  }
  return readZip(new Uint8Array(await blob.arrayBuffer()));
}
export async function writeZip(files: ReadonlyMap<string, Uint8Array>): Promise<Blob> {
  const total = checkZipFiles(files);
  if (typeof Worker === 'function' && total >= ZIP_WORKER_THRESHOLD) {
    // Structured cloning preserves the caller's buffers; only the result is transferred back.
    const result = await runZipWorker({ kind: 'write', files });
    if (!result.ok || result.kind !== 'write')
      fail('ZIP_WORKER', '파일 처리 응답이 올바르지 않습니다.');
    return new Blob([result.bytes], { type: 'application/zip' });
  }
  return writeZipOnMain(files);
}

// Export compression and verification share one worker, then reuse the inflated files for schema/image checks.
export async function writeZipPackage(files: ReadonlyMap<string, Uint8Array>) {
  const total = checkZipFiles(files);
  if (typeof Worker === 'function' && total >= ZIP_WORKER_THRESHOLD) {
    const result = await runZipWorker({ kind: 'package', files });
    if (!result.ok || result.kind !== 'package')
      fail('ZIP_WORKER', '파일 처리 응답이 올바르지 않습니다.');
    return { blob: new Blob([result.bytes], { type: 'application/zip' }), files: result.files };
  }
  const blob = await writeZipOnMain(files);
  return { blob, files: readZip(new Uint8Array(await blob.arrayBuffer())) };
}
