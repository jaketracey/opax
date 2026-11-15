// npm run build:graph shares public/chunks/ with the voice build and with older
// money map chunks kept on purpose. It used to empty the directory; it now
// removes only its own stale chunks (graph/chunks.mjs).
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import { pruneChunks, readManifest, writeManifest } from '../graph/chunks.mjs'
import { secureThreeUuid, secureThreeUuids } from '../graph/three-uuid.mjs'

const portal = new URL('..', import.meta.url).pathname

function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'opax-chunks-'))
  mkdirSync(join(dir, 'chunks'))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
  return dir
}

test('a rebuild removes only its own chunks that nothing imports any more', () => {
  const dir = tree({
    'money-map.js': 'import{a}from"./chunks/chunk-NEW11111.js";import("./chunks/evidence-NEW22222.js")',
    'voice.js': 'import{v}from"./chunks/voice-chunk-AAAA1111.js";import("./chunks/voice-sdk-BBBB2222.js")',
    'other.js': 'import("./chunks/evidence-OLD33333.js")',
    'chunks/chunk-NEW11111.js': '', 'chunks/evidence-NEW22222.js': 'import{a}from"./chunk-NEW11111.js"',
    'chunks/voice-chunk-AAAA1111.js': '', 'chunks/voice-sdk-BBBB2222.js': 'import{v}from"./voice-chunk-AAAA1111.js"',
    // The previous build's chunks: one orphaned, one a live script still imports,
    // and one only that kept chunk imports.
    'chunks/chunk-OLD44444.js': '',
    'chunks/evidence-OLD33333.js': 'import{h}from"./chunk-OLD55555.js"',
    'chunks/chunk-OLD55555.js': '',
    // An older chunk kept on purpose: never in the manifest, imported by nothing here.
    'chunks/evidence-KEPT6666.js': '',
  })
  const { removed, kept } = pruneChunks({
    publicDir: dir,
    previous: ['chunk-OLD44444.js', 'evidence-OLD33333.js', 'chunk-OLD55555.js', 'chunk-GONE7777.js'],
    current: ['chunk-NEW11111.js', 'evidence-NEW22222.js'],
  })
  assert.deepEqual(removed, ['chunk-OLD44444.js'])
  assert.deepEqual(kept, ['chunk-OLD55555.js', 'evidence-OLD33333.js'])
  assert.deepEqual(readdirSync(join(dir, 'chunks')).sort(), [
    'chunk-NEW11111.js', 'chunk-OLD55555.js', 'evidence-KEPT6666.js', 'evidence-NEW22222.js',
    'evidence-OLD33333.js', 'voice-chunk-AAAA1111.js', 'voice-sdk-BBBB2222.js',
  ])
})

test('the first build, with no manifest, removes nothing', () => {
  const dir = tree({ 'chunks/voice-chunk-AAAA1111.js': '', 'chunks/evidence-KEPT6666.js': '' })
  const manifest = join(dir, 'chunks.json')
  assert.deepEqual(readManifest(manifest), [])
  assert.deepEqual(pruneChunks({ publicDir: dir, previous: readManifest(manifest), current: ['chunk-NEW11111.js'] }).removed, [])
  writeManifest(manifest, ['evidence-NEW22222.js', 'chunk-NEW11111.js'])
  assert.deepEqual(readManifest(manifest), ['chunk-NEW11111.js', 'evidence-NEW22222.js'])
})

test('a manifest can only name files inside public/chunks', () => {
  const dir = tree({})
  writeFileSync(join(dir, 'chunks.json'), JSON.stringify({ chunks: ['../app.js'] }))
  assert.throws(() => readManifest(join(dir, 'chunks.json')), /chunk file names/)
})

test('graph/chunks.json names exactly the chunks the committed money map and explain load', () => {
  const listed = readManifest(join(portal, 'graph/chunks.json'))
  const loaded = new Set()
  const queue = ['money-map.js', 'explain.js']
  while (queue.length) {
    const file = queue.shift()
    const text = readFileSync(join(portal, 'public', file), 'utf8')
    for (const [, name] of text.matchAll(/["'](?:\.\/chunks\/|\.\/)([A-Za-z0-9_-]+-[A-Z0-9]{8}\.js)["']/g)) {
      if (loaded.has(name)) continue
      loaded.add(name)
      queue.push(`chunks/${name}`)
    }
  }
  assert.deepEqual([...loaded].sort(), listed)
  for (const name of listed) assert.ok(existsSync(join(portal, 'public/chunks', name)), `${name} is committed`)
  assert.ok(!listed.some((n) => n.startsWith('voice-')), 'the voice chunks belong to voice/build.mjs')
})

// three.js generateUUID drew from Math.random(); graph/three-uuid.mjs swaps the
// draw for Web Crypto while bundling (CodeQL js/insecure-randomness).
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test('the graph build gives three.js UUIDs from Web Crypto, in the same v4 format', async () => {
  const core = readFileSync(join(portal, 'node_modules/three/build/three.core.js'), 'utf8')
  const patched = secureThreeUuid(core)
  assert.ok(!/Math\.random\(\) \* 0xffffffff/.test(patched), 'the Math.random() UUID draw is gone')
  assert.ok(patched.includes('crypto.getRandomValues( new Int32Array( 4 ) )'), 'the Web Crypto draw is in')
  assert.throws(() => secureThreeUuid(patched), /found 0/)

  const out = await build({
    stdin: { contents: "import { MathUtils } from 'three'; export const ids = Array.from({ length: 64 }, () => MathUtils.generateUUID())", resolveDir: portal },
    bundle: true, format: 'esm', write: false, logLevel: 'silent', plugins: [secureThreeUuids],
  })
  const text = out.outputFiles[0].text
  assert.ok(!/Math\.random\(\) \* 0xffffffff/.test(text), 'the bundle still has the Math.random() UUID draw')
  const { ids } = await import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`)
  for (const id of ids) assert.match(id, UUID_V4)
  assert.equal(new Set(ids).size, ids.length)
})

test('no committed graph chunk draws a three.js UUID from Math.random()', () => {
  for (const name of readManifest(join(portal, 'graph/chunks.json'))) {
    const text = readFileSync(join(portal, 'public/chunks', name), 'utf8')
    assert.ok(!/Math\.random\(\)\*4294967295\|0/.test(text), `${name} still has the Math.random() UUID draw`)
  }
})
