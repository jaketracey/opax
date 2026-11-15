import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const folder = mkdtempSync(join(tmpdir(), 'media-route-'))
await build({ entryPoints: [new URL('../src/media.ts', import.meta.url).pathname], outdir: folder, bundle: true, platform: 'node', format: 'esm', logLevel: 'error' })
const { serveMedia } = await import(pathToFileURL(join(folder, 'media.js')))
test.after(() => rmSync(folder, { recursive: true, force: true }))

const bytes = new Uint8Array(100).map((_, i) => i)
// A small stand-in for an R2 bucket: ranged reads like R2's (offset/length or suffix), a throw for a range past the end.
const bucket = {
  reads: [],
  async head(name) { return name === 'demo.mp4' ? { size: bytes.length, httpEtag: '"e1"' } : null },
  async get(name, options = {}) {
    this.reads.push(name)
    if (name !== 'demo.mp4') return null
    const header = options.range?.get?.('range')
    if (!header) return { size: bytes.length, httpEtag: '"e1"', body: bytes }
    const m = /^bytes=(\d*)-(\d*)$/.exec(header)
    const range = m[1] === '' ? { suffix: Number(m[2]) } : { offset: Number(m[1]), ...(m[2] ? { length: Number(m[2]) - Number(m[1]) + 1 } : {}) }
    if (range.offset !== undefined && range.offset >= bytes.length) throw new Error('InvalidRange')
    const start = range.suffix !== undefined ? bytes.length - range.suffix : range.offset
    const end = range.length !== undefined ? start + range.length : bytes.length
    return { size: bytes.length, httpEtag: '"e1"', body: bytes.slice(start, end), range }
  },
}
const get = (path, headers = {}, method = 'GET') => serveMedia(new Request('https://opax.com.au' + path, { method, headers }), bucket, path)

test('/media serves a whole video with its type, length and range support', async () => {
  const r = await get('/media/demo.mp4')
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('content-type'), 'video/mp4')
  assert.equal(r.headers.get('accept-ranges'), 'bytes')
  assert.equal(r.headers.get('content-length'), '100')
  assert.equal((await r.arrayBuffer()).byteLength, 100)
})

test('/media answers byte ranges with 206 and Content-Range, including open and suffix ranges', async () => {
  for (const [range, want, body] of [['bytes=0-9', 'bytes 0-9/100', 10], ['bytes=90-', 'bytes 90-99/100', 10], ['bytes=-5', 'bytes 95-99/100', 5]]) {
    const r = await get('/media/demo.mp4', { range })
    assert.equal(r.status, 206, range)
    assert.equal(r.headers.get('content-range'), want, range)
    assert.equal(r.headers.get('content-length'), String(body), range)
    const got = new Uint8Array(await r.arrayBuffer())
    assert.equal(got.length, body, range)
    assert.equal(got[0], Number(want.split(' ')[1].split('-')[0]), range)
  }
  const past = await get('/media/demo.mp4', { range: 'bytes=500-' })
  assert.equal(past.status, 416)
  assert.equal(past.headers.get('content-range'), 'bytes */100')
})

test('/media HEAD gives the size without a body; other names and methods are refused before any read', async () => {
  const head = await get('/media/demo.mp4', {}, 'HEAD')
  assert.equal(head.status, 200)
  assert.equal(head.headers.get('content-length'), '100')
  assert.equal(head.body, null)
  bucket.reads.length = 0
  for (const path of ['/media/../secret.mp4', '/media/Demo.MP4', '/media/demo.exe', '/media/', '/media/a/b.mp4']) assert.equal((await get(path)).status, 404, path)
  assert.equal(bucket.reads.length, 0, 'a refused name never reaches the bucket')
  assert.equal((await get('/media/demo.mp4', {}, 'POST')).status, 405)
  assert.equal((await get('/media/missing.mp4')).status, 404)
  assert.equal((await serveMedia(new Request('https://opax.com.au/media/demo.mp4'), undefined, '/media/demo.mp4')).status, 404, 'no bucket bound')
  const down = { head: async () => { throw new Error('R2 down') }, get: async () => { throw new Error('R2 down') } }
  assert.equal((await serveMedia(new Request('https://opax.com.au/media/demo.mp4'), down, '/media/demo.mp4')).status, 503, 'a store failure on a plain GET is a 503, not a 416')
})

// ---- itemised expenses JSON ---------------------------------------------------------------------------------------
const json = new TextEncoder().encode('{"meta":{"name":"Jane Example"},"columns":[],"lines":[]}')
const dataBucket = {
  async head(name) { return name === 'expenses/v1/11029/2026.json' ? { size: json.length, httpEtag: '"j1"' } : null },
  async get(name, options = {}) {
    if (name !== 'expenses/v1/11029/2026.json') return null
    // like R2: a matched If-None-Match returns the object without a body
    return options.onlyIf?.get?.('if-none-match') === '"j1"' ? { size: json.length, httpEtag: '"j1"' } : { size: json.length, httpEtag: '"j1"', body: json }
  },
}
const getData = (path, headers = {}, method = 'GET', store = dataBucket) => serveMedia(new Request('https://opax.com.au' + path, { method, headers }), store, path)

test('/media serves itemised expenses as JSON with an ETag and cache headers', async () => {
  const r = await getData('/media/expenses/v1/11029/2026.json')
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('content-type'), 'application/json; charset=utf-8')
  assert.equal(r.headers.get('etag'), '"j1"')
  assert.match(r.headers.get('cache-control'), /^public, max-age=3600/)
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
  assert.equal((await r.json()).meta.name, 'Jane Example')
  const head = await getData('/media/expenses/v1/11029/2026.json', {}, 'HEAD')
  assert.equal(head.status, 200)
  assert.equal(head.headers.get('content-length'), String(json.length))
})

test('/media answers a matching If-None-Match for expenses with 304 and no body', async () => {
  const r = await getData('/media/expenses/v1/11029/2026.json', { 'if-none-match': '"j1"' })
  assert.equal(r.status, 304)
  assert.equal(r.headers.get('etag'), '"j1"')
  assert.equal(await r.text(), '')
})

test('/media refuses expense paths outside the fixed pattern, other methods, and reports a store failure as 503', async () => {
  for (const path of ['/media/expenses/v1/11029/2099.json', '/media/expenses/v1/../demo.mp4', '/media/expenses/v1/11029/2026.json.bak', '/media/expenses/v2/11029/2026.json', '/media/expenses/v1/11029/index.json', '/media/expenses/v1/a/b/2026.json']) {
    assert.equal((await getData(path)).status, 404, path)
  }
  assert.equal((await getData('/media/expenses/v1/11029/2026.json', {}, 'POST')).status, 405)
  const broken = { async head() { throw new Error('down') }, async get() { throw new Error('down') } }
  assert.equal((await getData('/media/expenses/v1/11029/2026.json', {}, 'GET', broken)).status, 503)
})
