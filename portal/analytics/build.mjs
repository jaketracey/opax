import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
await build({
  entryPoints: [fileURLToPath(new URL('./index.js', import.meta.url))],
  outfile: fileURLToPath(new URL('../public/analytics.js', import.meta.url)),
  bundle: true, minify: true, format: 'iife', target: 'es2022',
});

await build({
  entryPoints: [fileURLToPath(new URL('./events.js', import.meta.url))],
  outfile: fileURLToPath(new URL('../public/events.js', import.meta.url)),
  bundle: true, minify: true, format: 'iife', target: 'es2022',
});
await build({
  entryPoints: [fileURLToPath(new URL('./ga.js', import.meta.url))],
  outfile: fileURLToPath(new URL('../public/ga.js', import.meta.url)),
  bundle: true, minify: true, format: 'iife', target: 'es2022',
});
