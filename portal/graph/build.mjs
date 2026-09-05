// Bundles the three.js modules once, together: money-map.js and explain.js share
// a single three chunk under public/chunks/, so the page never loads two copies
// of the library (the THREE "multiple instances" warning). Run from portal/:
//   node graph/build.mjs
import { build } from 'esbuild'
import { readdirSync, rmSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pub = join(here, '..', 'public')
const chunks = join(pub, 'chunks')
mkdirSync(chunks, { recursive: true })
for (const f of readdirSync(chunks)) rmSync(join(chunks, f))

const result = await build({
  entryPoints: { 'money-map': join(here, 'index.ts'), explain: join(here, 'explain.ts') },
  bundle: true, splitting: true, minify: true, format: 'esm', target: 'es2022',
  outdir: pub, chunkNames: 'chunks/[name]-[hash]', metafile: true, logLevel: 'warning',
})
for (const [file, meta] of Object.entries(result.metafile.outputs)) {
  if (file.endsWith('.js')) console.log(`${file}  ${(meta.bytes / 1024).toFixed(0)} kB`)
}
