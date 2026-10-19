import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { validationPlugin } from './scripts/validation-plugin';
import { pagesBase, publicContentPlugin } from './scripts/content-plugin';

export default defineConfig({
  plugins: [validationPlugin(), react(), publicContentPlugin()],
  base: pagesBase(process.env.PAGES_BASE),
  build: { outDir: 'dist' },
});
