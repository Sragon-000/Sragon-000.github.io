import { fail } from './types';
import { MAX_JSON_BYTES } from './policy';

const decoder = new TextDecoder('utf-8', { fatal: true });
export const jsonBytes = (data: unknown) => new TextEncoder().encode(JSON.stringify(data, null, 2));

export function parseJson(bytes: Uint8Array | undefined, path: string): unknown {
  if (!bytes || bytes.length > MAX_JSON_BYTES)
    fail('JSON_FILE', '자료 파일이 없거나 2MiB 한도를 초과했습니다.', path);
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    fail('JSON_FILE', 'JSON 파일의 UTF-8 인코딩과 문법을 확인해 주세요.', path);
  }
}
