// Install @tanstack/table-core outside the worktree; set DT_BROWSER_TOOLS.
import {build} from 'esbuild';
import {gzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require = createRequire(resolve(process.env.DT_BROWSER_TOOLS || '/tmp/opax-dt-tools','package.json'));
const version = require(require.resolve('@tanstack/table-core/package.json')).version;
const entries = {
  'in-house (including donor privacy)':fileURLToPath(new URL('../public/datatable.js',import.meta.url)),
  [`TanStack table-core ${version}`]:require.resolve('@tanstack/table-core'),
  'table CSS':fileURLToPath(new URL('../public/datatable.css',import.meta.url)),
};
const result = {};
for (const [name,entry] of Object.entries(entries)) {
  const bundle = await build({entryPoints:[entry],bundle:true,minify:true,write:false,format:'esm',platform:'neutral',target:'es2022',legalComments:'none'});
  const bytes = bundle.outputFiles[0].contents, gzipBytes = gzipSync(bytes,{level:9}).length;
  result[name] = {minifiedBytes:bytes.length,gzipBytes,gzipKB:Number((gzipBytes / 1000).toFixed(2))};
}
console.log(JSON.stringify({settings:'full exported modules; esbuild 0.28.2, ES2022, ESM, neutral platform, minified, gzip level 9; decimal KB',result},null,2));
