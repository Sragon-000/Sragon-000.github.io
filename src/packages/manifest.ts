import { fail, type ExportManifest } from './types';
import manifestCheck from './manifest-validator';

export function readManifest(input: unknown): ExportManifest {
  if (!manifestCheck(input))
    fail(
      'MANIFEST_SCHEMA',
      '패키지 버전과 파일 목록 형식을 확인해 주세요.',
      '/export-manifest.json',
    );
  const paths = new Set<string>();
  for (const file of input.files) {
    if (paths.has(file.path))
      fail('MANIFEST_DUPLICATE', '패키지 파일 목록에 중복 경로가 있습니다.', file.path);
    paths.add(file.path);
  }
  return input;
}
