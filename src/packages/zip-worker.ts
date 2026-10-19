import { readZip, writeZipSync } from './zip-core';
import { ContentError } from './types';
import type { ZipRequest, ZipResponse } from './zip-protocol';
const scope = self as unknown as {
  onmessage: (event: MessageEvent<ZipRequest>) => void;
  postMessage: (message: ZipResponse, transfer: Transferable[]) => void;
};
scope.onmessage = async ({ data }) => {
  try {
    if (data.kind === 'read') {
      const files = readZip(new Uint8Array(await data.blob.arrayBuffer()));
      const buffers = [...new Set([...files.values()].map((bytes) => bytes.buffer as ArrayBuffer))];
      scope.postMessage({ ok: true, kind: 'read', files }, buffers);
    } else {
      const bytes = writeZipSync(data.files) as Uint8Array<ArrayBuffer>;
      if (data.kind === 'package') {
        const files = readZip(bytes);
        const buffers = [
          ...new Set([
            bytes.buffer,
            ...[...files.values()].map((file) => file.buffer as ArrayBuffer),
          ]),
        ];
        scope.postMessage({ ok: true, kind: 'package', bytes, files }, buffers);
      } else scope.postMessage({ ok: true, kind: 'write', bytes }, [bytes.buffer]);
    }
  } catch (error) {
    scope.postMessage(
      {
        ok: false,
        issues:
          error instanceof ContentError
            ? error.issues
            : [
                {
                  code: 'ZIP_DECODE',
                  severity: 'error',
                  path: '',
                  message: 'ZIP 파일 처리에 실패했습니다.',
                },
              ],
      },
      [],
    );
  }
};
