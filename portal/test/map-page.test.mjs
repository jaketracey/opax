import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const html = readFileSync(new URL('../public/map.html', import.meta.url), 'utf8')
const source = readFileSync(new URL('../public/map-page.js', import.meta.url), 'utf8')

test('standalone map starts through a same-origin module allowed by the CSP', () => {
  assert.match(html, /<script type="module" src="\/map-page.js"><\/script>/)
  assert.doesNotMatch(html, /<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/)
})

async function boot({ search = '', importError, mountError } = {}) {
  const calls = []
  const host = { replaceChildren() { this.cleared = true }, append(node) { this.error = node } }
  const status = { remove() { this.removed = true } }
  const description = {}
  const load = async () => {
    if (importError) throw importError
    return { mountMoneyMap: async (...args) => { calls.push(args); if (mountError) throw mountError } }
  }
  await runInNewContext(`(async () => {${source.replace(/import\('[^']+'\)/, 'load()')}})()`, {
    load, URLSearchParams, location: { search }, console: { error() {}, log() {} },
    document: {
      getElementById: id => id === 'map' ? host : status,
      querySelector: () => description,
      createElement: () => ({ setAttribute(key, value) { this[key] = value } }),
    },
  })
  return { calls, host, status, description }
}

test('standalone map mounts federal data and preserves focus and chrome options', async () => {
  const { calls, status } = await boot({ search: '?focus=party:Labor&chrome=mini' })
  assert.equal(calls[0][1], '/graph/money.json')
  assert.equal(calls[0][2].focus, 'party:Labor')
  assert.equal(calls[0][2].chrome, 'mini')
  assert.equal(status.removed, true)
})

test('standalone map preserves state jurisdiction data and attribution', async () => {
  const { calls, description } = await boot({ search: '?jur=qld' })
  assert.equal(calls[0][1], '/graph/money.qld.json')
  assert.match(description.textContent, /Electoral Commission of Queensland/)
})

for (const failure of ['importError', 'mountError']) {
  test(`${failure} displays a recoverable error instead of leaving the loading screen`, async () => {
    const { host } = await boot({ [failure]: new Error('failed') })
    assert.equal(host.cleared, true)
    assert.equal(host.error.role, 'alert')
    assert.match(host.error.textContent, /reload the page/)
  })
}
