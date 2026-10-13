// Run the real CLI/lock/atomic saves, with every request redirected to a loopback fixture.
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const base = new URL(process.env.OPAX_BATCH_FIXTURE_URL!)
if (base.protocol !== 'http:' || base.hostname !== '[::1]') throw Error('loopback fixture required')
const fetchLocal = globalThis.fetch
globalThis.fetch = (input, init) => {
  const url = new URL(String(input))
  if (url.origin !== 'https://example.invalid') throw Error('unexpected fixture origin')
  return fetchLocal(new URL(url.pathname + url.search, base), init)
}
process.argv[1] = resolve(import.meta.dirname, '../../scripts/batch-path.ts')
await import(pathToFileURL(process.argv[1]).href)
