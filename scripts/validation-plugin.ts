import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import standaloneCode from 'ajv/dist/standalone/index.js';
import type { Plugin } from 'vite';

export function standaloneValidator(schema: object) {
  const ajv = new Ajv2020({
    strict: true,
    inlineRefs: false,
    allErrors: true,
    validateFormats: true,
    code: { source: true, esm: true },
  });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const imports = new Map<string, string>();
  // Ajv standalone emits only its explicit runtime helpers and ajv-formats requirements.
  const code = standaloneCode(ajv, validate).replace(
    /require\("([^"]+)"\)/gu,
    (_match, path: string) => {
      if (!path.startsWith('ajv/dist/runtime/') && path !== 'ajv-formats/dist/formats')
        throw new Error(`지원하지 않는 검증 런타임: ${path}`);
      if (!imports.has(path)) imports.set(path, `schemaRuntime${imports.size}`);
      return imports.get(path)!;
    },
  );
  return (
    [...imports].map(([path, name]) => `import ${name} from '${path}.js';`).join('\n') + '\n' + code
  );
}
export function validationPlugin(): Plugin {
  const schemas = new Map([
    [resolve('src/domain/schema-validator.ts'), resolve('spec/schemas/portfolio.schema.json')],
    [
      resolve('src/packages/manifest-validator.ts'),
      resolve('spec/schemas/export-manifest.schema.json'),
    ],
    [resolve('src/packages/backup-validator.ts'), resolve('spec/schemas/backup.schema.json')],
  ]);
  return {
    name: 'standalone-schema-validation',
    enforce: 'pre',
    async load(id) {
      const schema = schemas.get(id);
      if (!schema) return;
      this.addWatchFile(schema);
      return standaloneValidator(JSON.parse(await readFile(schema, 'utf8')));
    },
  };
}
