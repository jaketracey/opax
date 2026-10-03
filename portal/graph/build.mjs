// Bundles the three.js modules once, together: money-map.js and explain.js share
// a single three chunk under public/chunks/, so the page never loads two copies
// of the library (the THREE "multiple instances" warning). Run from portal/:
//   node graph/build.mjs
// public/chunks/ also holds the voice chunks and any older chunk kept for a page
// still holding an earlier money map, so only this build's own stale chunks are
// removed (graph/chunks.mjs); graph/chunks.json records what it wrote.
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pruneChunks, readManifest, writeManifest } from './chunks.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const pub = join(here, '..', 'public')
const chunks = join(pub, 'chunks')
const manifest = join(here, 'chunks.json')
mkdirSync(chunks, { recursive: true })

const result = await build({
  entryPoints: { 'money-map': join(here, 'index.ts'), explain: join(here, 'explain.ts') },
  bundle: true, splitting: true, minify: true, format: 'esm', target: 'es2022',
  outdir: pub, chunkNames: 'chunks/[name]-[hash]', metafile: true, logLevel: 'warning',
})
for (const [file, meta] of Object.entries(result.metafile.outputs)) {
  if (file.endsWith('.js')) console.log(`${file}  ${(meta.bytes / 1024).toFixed(0)} kB`)
}

const written = Object.keys(result.metafile.outputs)
  .map((file) => resolve(file))
  .filter((file) => dirname(file) === resolve(chunks))
  .map((file) => basename(file))
const { removed, kept } = pruneChunks({ publicDir: pub, previous: readManifest(manifest), current: written })
writeManifest(manifest, [...written, ...kept])
for (const name of removed) console.log(`removed chunks/${name}`)
for (const name of kept) console.log(`kept chunks/${name} (still imported)`)
