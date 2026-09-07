import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
await build({
  entryPoints: [fileURLToPath(new URL('./index.js', import.meta.url))],
  outfile: fileURLToPath(new URL('../public/analytics.js', import.meta.url)),
  bundle: true, minify: true, format: 'iife', target: 'es2022',
});
