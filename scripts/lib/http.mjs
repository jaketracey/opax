import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const USER_AGENT = readFileSync(new URL('../../parli/ingest/user-agent.txt', import.meta.url), 'utf8').trim()
const pausedHosts = new Set(['www.aph.gov.au', 'parlinfo.aph.gov.au', 'data.parliament.qld.gov.au', 'hansardsearch.parliament.sa.gov.au', 'api.firecrawl.dev'])
const nextAt = new Map()
const logged = new Set()
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
export class SourceRefused extends Error {}

export async function runSource(main) {
  try { return await main() }
  catch (error) {
    if (!(error instanceof SourceRefused)) throw error
    process.exitCode = 4
  }
}

export function pauseSource(url, reason) {
  const host = new URL(url).hostname
  const source = process.env.OPAX_SOURCE_NAME || host
  const path = process.env.OPAX_SOURCE_STATUS_FILE || join(homedir(), '.cache/autoresearch/pipeline/source-access.json')
  let state = {}
  try { state = JSON.parse(readFileSync(path, 'utf8')) } catch {}
  state[source] = { status: 'paused', reason, host, checked_at: new Date().toISOString(), permission: 'permission requested' }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path + '.tmp', JSON.stringify(state, null, 2) + '\n')
  renameSync(path + '.tmp', path)
  if (!logged.has(source)) {
    console.error(`source paused: honest agent refused (awaiting permission); source=${source}; reason=${reason}; existing data kept`)
    logged.add(source)
  }
  process.exitCode = 4
  throw new SourceRefused(reason)
}

export function retryAfter(value, now = Date.now()) {
  if (!value) return 0
  const seconds = Number(value)
  return Math.max(0, Number.isFinite(seconds) ? seconds * 1000 : (Date.parse(value) - now) || 0)
}

export async function honestFetch(url, options = {}) {
  url = String(url)
  const headers = new Headers(options.headers)
  headers.set('user-agent', USER_AGENT)
  for (let attempt = 0, redirects = 0; attempt < 3;) {
    const host = new URL(url).hostname
    if (logged.has(process.env.OPAX_SOURCE_NAME || host)) pauseSource(url, 'source already paused this run')
    if (pausedHosts.has(host)) pauseSource(url, 'source access paused; permission requested')
    await sleep(Math.max(0, (nextAt.get(host) || 0) - Date.now()))
    nextAt.set(host, Date.now() + 1000)
    const response = await fetch(url, { ...options, headers, redirect: 'manual' })
    if ([401, 403].includes(response.status)) pauseSource(url, `HTTP ${response.status}`)
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.get('location')) {
      if (++redirects > 5) throw new Error('source redirect limit reached')
      const redirected = new URL(response.headers.get('location'), url)
      if (redirected.hostname !== host) {
        headers.delete('authorization'); headers.delete('cookie')
      }
      if (response.status === 303 || ([301, 302].includes(response.status) && options.method === 'POST')) options = { ...options, method: 'GET', body: undefined }
      url = String(redirected)
      continue
    }
    if ([429, 503].includes(response.status)) {
      if (++attempt === 3) pauseSource(url, `HTTP ${response.status}; retry next run`)
      await sleep(Math.max(retryAfter(response.headers.get('retry-after')), 1000 * 2 ** attempt))
      continue
    }
    if ((response.headers.get('content-type') || '').includes('html')) {
      const sample = (await response.clone().text()).slice(0, 131072)
      if (/<title[^>]*>\s*(just a moment|access denied|request blocked|attention required)|cf-chl-|challenge-platform|verify (that )?you are (a )?human|the request is blocked|web application firewall/i.test(sample)) pauseSource(url, 'challenge/WAF page')
    }
    return response
  }
}
