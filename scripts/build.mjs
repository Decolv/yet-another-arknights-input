import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/arknights-name-input.js',
  bundle: true,
  minify: true,
  sourcemap: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  legalComments: 'eof',
});
