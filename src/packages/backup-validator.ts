import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from '../../spec/schemas/backup.schema.json' with { type: 'json' };
import type { BackupMetadata } from './types';
const ajv = new Ajv2020({ strict: true, inlineRefs: false, allErrors: true });
addFormats(ajv);
export default ajv.compile<BackupMetadata>(schema);
