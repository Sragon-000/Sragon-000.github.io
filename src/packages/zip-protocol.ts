import type { Issue } from '../domain/types';
export type ZipRequest =
  | { kind: 'read'; blob: Blob }
  | { kind: 'write' | 'package'; files: ReadonlyMap<string, Uint8Array> };
export type ZipResponse =
  | { ok: true; kind: 'read'; files: Map<string, Uint8Array> }
  | { ok: true; kind: 'write'; bytes: Uint8Array<ArrayBuffer> }
  | { ok: true; kind: 'package'; bytes: Uint8Array<ArrayBuffer>; files: Map<string, Uint8Array> }
  | { ok: false; issues: Issue[] };
