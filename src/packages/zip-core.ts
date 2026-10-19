import { unzipSync, zip, zipSync, type Zippable } from 'fflate';
import { fail } from './types';

import {
  MAX_ZIP_BYTES,
  MAX_PACKAGE_BYTES,
  MAX_PACKAGE_FILES,
  fileByteLimit,
  isPackagePath,
} from './policy';
export { MAX_ZIP_BYTES, MAX_PACKAGE_BYTES, MAX_JSON_BYTES } from './policy';
export { jsonBytes, parseJson } from './json';
const decoder = new TextDecoder('utf-8', { fatal: true });

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255]!;
  return (crc ^ 0xffffffff) >>> 0;
}

/** Validate the central directory before allocating inflated file buffers. */
export function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  if (!bytes.length || bytes.length > MAX_ZIP_BYTES)
    fail('ZIP_SIZE', 'ZIP 파일은 64MiB 이하여야 합니다.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  const min = Math.max(0, end - 65535);
  while (
    end >= min &&
    !(
      view.getUint32(end, true) === 0x06054b50 &&
      end + 22 + view.getUint16(end + 20, true) === bytes.length
    )
  )
    end--;
  if (end < min) fail('ZIP_FORMAT', '올바른 ZIP 파일이 아닙니다.');
  const count = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);
  const directorySize = view.getUint32(end + 12, true);
  if (
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    view.getUint16(end + 8, true) !== count ||
    count > MAX_PACKAGE_FILES ||
    cursor + directorySize !== end
  )
    fail('ZIP_FORMAT', '일반 단일 ZIP 형식과 최대 512개 파일만 지원합니다.');
  const entries = new Map<string, { size: number; crc: number }>();
  let total = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50)
      fail('ZIP_FORMAT', 'ZIP 파일 목록이 손상되었습니다.');
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const next =
      cursor +
      46 +
      nameLength +
      view.getUint16(cursor + 30, true) +
      view.getUint16(cursor + 32, true);
    if (next > end || flags & 1 || ![0, 8].includes(method))
      fail('ZIP_FORMAT', '암호화되었거나 지원하지 않는 ZIP 파일입니다.');
    let name: string;
    try {
      name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    } catch {
      fail('ZIP_PATH', '파일 이름의 인코딩이 맞지 않습니다.');
    }
    if (!isPackagePath(name)) fail('ZIP_PATH', '지원하지 않는 파일 경로가 있습니다.', name);
    if (entries.has(name)) fail('ZIP_DUPLICATE', 'ZIP에 중복 파일 경로가 있습니다.', name);
    total += size;
    const limit = fileByteLimit(name);
    if (!size || size > limit || total > MAX_PACKAGE_BYTES)
      fail('ZIP_SIZE', '패키지 파일 크기 한도를 초과했습니다.', name);
    const local = view.getUint32(cursor + 42, true);
    if (local + 30 > view.getUint32(end + 16, true) || view.getUint32(local, true) !== 0x04034b50)
      fail('ZIP_FORMAT', 'ZIP 파일 위치 정보가 맞지 않습니다.', name);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (start + view.getUint32(cursor + 20, true) > view.getUint32(end + 16, true))
      fail('ZIP_FORMAT', 'ZIP 압축 데이터가 잘렸습니다.', name);
    entries.set(name, { size, crc: view.getUint32(cursor + 16, true) });
    cursor = next;
  }
  if (cursor !== end) fail('ZIP_FORMAT', 'ZIP 파일 목록 길이가 맞지 않습니다.');
  let inflated: Record<string, Uint8Array>;
  try {
    inflated = unzipSync(bytes, {
      filter: (file) =>
        entries.has(file.name) && entries.get(file.name)!.size === file.originalSize,
    });
  } catch {
    fail('ZIP_DECODE', 'ZIP 압축 데이터를 읽을 수 없습니다.');
  }
  const files = new Map(Object.entries(inflated));
  if (files.size !== entries.size)
    fail('ZIP_FORMAT', 'ZIP 파일 목록과 실제 데이터가 맞지 않습니다.');
  for (const [path, info] of entries) {
    const file = files.get(path);
    if (!file || file.length !== info.size || crc32(file) !== info.crc)
      fail('ZIP_CHECKSUM', '파일이 손상되었거나 크기가 맞지 않습니다.', path);
  }
  return files;
}

export function checkZipFiles(files: ReadonlyMap<string, Uint8Array>): number {
  if (files.size > MAX_PACKAGE_FILES)
    fail('ZIP_SIZE', '패키지에 최대 512개 파일을 넣을 수 있습니다.');
  let total = 0;
  for (const [path, bytes] of files) {
    if (!isPackagePath(path) || !bytes.length || bytes.length > fileByteLimit(path))
      fail('ZIP_SIZE', '패키지 경로 또는 파일 크기를 확인해 주세요.', path);
    total += bytes.length;
    if (total > MAX_PACKAGE_BYTES) fail('ZIP_SIZE', '압축 전 패키지는 128MiB 이하여야 합니다.');
  }
  return total;
}
function zipEntries(files: ReadonlyMap<string, Uint8Array>): Zippable {
  checkZipFiles(files);
  const entries: Zippable = Object.create(null);
  for (const [path, bytes] of files)
    entries[path] = [bytes, { level: path.endsWith('.json') ? 6 : 0 }];
  return entries;
}
function checkZipSize(bytes: Uint8Array) {
  if (bytes.length > MAX_ZIP_BYTES)
    fail('ZIP_SIZE', '생성한 ZIP 파일이 64MiB 한도를 초과했습니다.');
  return bytes;
}
export function writeZipSync(files: ReadonlyMap<string, Uint8Array>) {
  return checkZipSize(zipSync(zipEntries(files), { level: 6 }));
}
export async function writeZip(files: ReadonlyMap<string, Uint8Array>): Promise<Blob> {
  const entries = zipEntries(files);
  const bytes = await new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    zip(entries, { level: 6 }, (error, bytes) =>
      error ? reject(error) : resolve(bytes as Uint8Array<ArrayBuffer>),
    );
  });
  checkZipSize(bytes);
  return new Blob([bytes], { type: 'application/zip' });
}
