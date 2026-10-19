import manifestSchema from '../../spec/schemas/export-manifest.schema.json' with { type: 'json' };

export const MAX_ZIP_BYTES = 64 * 1024 * 1024;
export const MAX_PACKAGE_BYTES = 128 * 1024 * 1024;
export const MAX_JSON_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_PACKAGE_FILES = manifestSchema.properties.files.maxItems + 1;
const listedPath = new RegExp(manifestSchema.properties.files.items.properties.path.pattern);
export function isPackagePath(path: string) {
  return path.length <= 160 && (path === 'export-manifest.json' || listedPath.test(path));
}
export function isPublicPath(path: string) {
  return (
    isPackagePath(path) &&
    (path === 'export-manifest.json' || path.startsWith('content/') || path.startsWith('assets/'))
  );
}
export function fileByteLimit(path: string) {
  return path.endsWith('.json') ? MAX_JSON_BYTES : MAX_IMAGE_BYTES;
}
