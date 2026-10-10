import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import identity from '../../parli/ingest/user-agent.json' with { type: 'json' }
export const USER_AGENT = identity.user_agent
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

// Markup at the document root and challenge-specific tags/attributes are evidence;
// procurement descriptions mentioning a firewall are ordinary source data.
export function isChallenge(body) {
  const sample = body.slice(0, 131072)
  if (!/^\s*(?:<!doctype\s+html|<html|<head|<title|<body|<form|<div)\b/i.test(sample)) return false
  return /<title\b[^>]*>\s*(?:just a moment|access denied|request (?:blocked|rejected)|attention required|robot check)/i.test(sample) ||
    /<(?:script|iframe)\b[^>]*\bsrc\s*=\s*["'][^"']*(?:\/cdn-cgi\/challenge-platform\/|\/_Incapsula_Resource)/i.test(sample) ||
    /<[^>]+\b(?:id|class)\s*=\s*["'][^"']*\b(?:cf-chl-[\w-]*|challenge-form|challenge-running)\b/i.test(sample)
}

async function responseSample(response) {
  const reader = response.clone().body?.getReader()
  if (!reader) return ''
  const chunks = []
  let size = 0
  try {
    while (size < 131072) {
      const { value, done } = await reader.read()
      if (done) break
      const chunk = value.subarray(0, 131072 - size)
      chunks.push(chunk); size += chunk.length
    }
  } finally { void reader.cancel().catch(() => {}) }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return new TextDecoder().decode(bytes)
}

export async function honestFetch(url, options = {}) {
  url = String(url)
  const { expectedJson = false, ...requestOptions } = options
  options = requestOptions
  const headers = new Headers(options.headers)
  if (expectedJson) headers.set('accept', 'application/json')
  headers.set('user-agent', USER_AGENT)
  for (let attempt = 0, redirects = 0; attempt < 3;) {
    const host = new URL(url).hostname
    if (logged.has(process.env.OPAX_SOURCE_NAME || host)) pauseSource(url, 'source already paused this run')
    if (pausedHosts.has(host)) pauseSource(url, 'source access paused; permission requested')
    await sleep(Math.max(0, (nextAt.get(host) || 0) - Date.now()))
    nextAt.set(host, Date.now() + 1000)
    const response = await fetch(url, { ...options, headers, redirect: 'manual' })
    if ([401, 403].includes(response.status)) pauseSource(url, `HTTP ${response.status}`)
    if (response.headers.get('cf-mitigated') === 'challenge' || response.headers.has('x-sucuri-block')) pauseSource(url, 'challenge response header')
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
    const sample = await responseSample(response)
    if (isChallenge(sample)) pauseSource(url, 'challenge/WAF page')
    if ([429, 503].includes(response.status)) {
      if (++attempt === 3) pauseSource(url, `HTTP ${response.status}; retry next run`)
      await sleep(Math.max(retryAfter(response.headers.get('retry-after')), 1000 * 2 ** attempt))
      continue
    }
    // Inspect irrespective of MIME: challenge HTML is sometimes labelled plain text.
    const accept = headers.get('accept') || ''
    const wantsJson = expectedJson || (accept.includes('json') && !/html|\*\/\*/i.test(accept))
    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim()
    if (wantsJson && response.status === 200 && contentType && contentType !== 'application/json' && !contentType.endsWith('+json')) pauseSource(url, 'expected JSON but source returned a different content type')
    return response
  }
}
