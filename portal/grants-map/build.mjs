import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';
await build({ entryPoints: ['grants-map/index.js'], outfile: 'public/grants-map.js', bundle: true,
  format: 'esm', minify: true, target: ['safari15', 'es2020'], loader: { '.png': 'dataurl' }, legalComments: 'eof' });
await copyFile('node_modules/leaflet/LICENSE', 'public/grants-map-LICENSE.txt');
