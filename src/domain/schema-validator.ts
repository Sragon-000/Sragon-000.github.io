import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from '../../spec/schemas/portfolio.schema.json' with { type: 'json' };
import type { Portfolio } from './types';

// Node tests use the schema directly. Vite replaces this module with standalone validation code.
const ajv = new Ajv2020({
  strict: true,
  inlineRefs: false,
  allErrors: true,
  validateFormats: true,
});
addFormats(ajv);
export default ajv.compile<Portfolio>(schema);
