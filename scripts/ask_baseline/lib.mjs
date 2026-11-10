// Shared helpers for the Ask baseline set: seeded randomness, text folding, date wording,
// phrasing transforms and ground-truth references. Pure: no network, no model.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const PUBLIC = 'portal/public'

/** Deterministic 32-bit PRNG (mulberry32) seeded from a string. */
export function rngFrom(seed) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19) }
  let a = h >>> 0
  const next = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const rng = { next, int: (n) => Math.floor(next() * n), pick: (xs) => xs[Math.floor(next() * xs.length)],
    shuffle: (xs) => { const a2 = [...xs]; for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]] } return a2 },
    weighted: (pairs) => { const total = pairs.reduce((s, [, w]) => s + w, 0); let r = next() * total; for (const [v, w] of pairs) { if ((r -= w) < 0) return v } return pairs.at(-1)[0] } }
  return rng
}

/**
 * Pick n items spread across groups: shuffle within each group, then take one from each group in
 * turn (group order shuffled too), so no era, chamber or party crowds out the rest.
 */
export function spread(items, n, keyOf, rng) {
  const groups = new Map()
  for (const it of items) { const k = keyOf(it); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it) }
  const queues = rng.shuffle([...groups.keys()].sort()).map((k) => rng.shuffle(groups.get(k)))
  const out = []
  while (out.length < n && queues.some((q) => q.length)) for (const q of queues) { if (out.length >= n) break; if (q.length) out.push(q.shift()) }
  return out
}

export const fold = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[‘’ʼ`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim()
export const decode = (s) => String(s ?? '').replace(/&#39;/g, "'").replace(/&#34;|&quot;/g, '"').replace(/&amp;/g, '&')

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const monthName = (m) => MONTHS[m - 1]
/** 2013-03-14 → "14 March 2013" (Australian order). */
export function longDate(iso) { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}` }
export function weekday(iso) { return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(iso + 'T00:00:00Z').getUTCDay()] }
export const fyLabel = (start) => `${start}-${String((start + 1) % 100).padStart(2, '0')}`
export const eraOf = (year) => `era:${Math.floor(Number(year) / 10) * 10}s`
export const aud = (n) => '$' + Math.round(n).toLocaleString('en-AU')

/** "Bills — National Disability Insurance Scheme Bill 2012; Consideration in Detail" → readable division title. */
export function divisionTitle(name) {
  return decode(name).replace(/^(?:Bills|Motions|Business|Documents|Committees|Matters of Public Importance|Notices|Petitions|Questions|Regulations and Determinations)\s+[—–-]\s+/i, '').replace(/\s+/g, ' ').trim()
}

// ---------- ground-truth references ----------

const fileCache = new Map()
export function loadJson(rel) {
  if (!fileCache.has(rel)) fileCache.set(rel, JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8')))
  return fileCache.get(rel)
}
export const clearCache = () => fileCache.clear()

/** Walk a path of keys, indices and {field: value} selectors (first array element whose fields all match). */
export function walk(root, path) {
  let cur = root
  for (const seg of path) {
    if (cur == null) return undefined
    if (seg !== null && typeof seg === 'object') {
      const match = (x) => x && typeof x === 'object' && Object.entries(seg).every(([k, v]) => getField(x, k) === v)
      cur = Array.isArray(cur) ? cur.find(match) : Object.values(cur).find(match)
    } else cur = cur[seg]
  }
  return cur
}
export const getField = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)

export function deepEqual(a, b) {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a), kb = Object.keys(b)
  return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]))
}

/**
 * Majority vote per party (parties with at least `min` recorded votes), then members who voted the other way.
 * Independents are not a party, so they never count. Party labels in the division files are each member's
 * latest affiliation, not the one held on the day (see README, known limits).
 */
export function rebels(members, min = 5) {
  const byParty = new Map()
  for (const m of members ?? []) { if (!m.party || m.party === 'Independent' || !['aye', 'no'].includes(m.vote)) continue; if (!byParty.has(m.party)) byParty.set(m.party, []); byParty.get(m.party).push(m) }
  const out = []
  for (const [party, ms] of byParty) {
    if (ms.length < min) continue
    const ayes = ms.filter((m) => m.vote === 'aye').length, noes = ms.length - ayes
    if (ayes === noes) continue
    const majority = ayes > noes ? 'aye' : 'no'
    for (const m of ms) if (m.vote !== majority) out.push({ name: m.name, party, vote: m.vote, party_vote: majority })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Recompute a derived value over the array a reference resolves to. Supported ops:
 * count (rows matching where/prefix/range), sum (of field), values (sorted unique field values),
 * rebels (floor-crossers in a members array), len (array length).
 */
export function derive(target, spec) {
  if (spec.op === 'len') return Array.isArray(target) ? target.length : undefined
  if (spec.op === 'rebels') return rebels(target, spec.min ?? 5).map((r) => r.name)
  if (!Array.isArray(target)) return undefined
  const rows = target.filter((x) => Object.entries(spec.where ?? {}).every(([k, v]) => getField(x, k) === v)
    && Object.entries(spec.prefix ?? {}).every(([k, v]) => String(getField(x, k) ?? '').startsWith(v))
    && Object.entries(spec.range ?? {}).every(([k, [lo, hi]]) => { const v = getField(x, k); return v != null && (lo == null || v >= lo) && (hi == null || v <= hi) }))
  if (spec.op === 'count') return rows.length
  if (spec.op === 'sum') return rows.reduce((s, x) => s + Number(getField(x, spec.field) ?? 0), 0)
  if (spec.op === 'values') return [...new Set(rows.map((x) => getField(x, spec.field)))].sort()
  return undefined
}

/** Resolve one reference → { ok, value, error }. */
export function resolveRef(ref) {
  let data
  try { data = loadJson(ref.file) } catch { return { ok: false, error: `file not readable: ${ref.file}` } }
  const target = walk(data, ref.path ?? [])
  if (target === undefined) return { ok: false, error: `path does not resolve: ${ref.file} ${JSON.stringify(ref.path)}` }
  const value = ref.derive ? derive(target, ref.derive) : target
  if (value === undefined) return { ok: false, error: `derivation failed: ${ref.file} ${JSON.stringify(ref.derive)}` }
  if ('value' in ref) {
    const same = typeof ref.value === 'number' && typeof value === 'number' ? Math.abs(ref.value - value) < 0.005 : deepEqual(ref.value, value)
    if (!same) return { ok: false, value, error: `value mismatch at ${ref.file} ${JSON.stringify(ref.path)}: expected ${JSON.stringify(ref.value).slice(0, 120)}, found ${JSON.stringify(value).slice(0, 120)}` }
  }
  return { ok: true, value }
}

// ---------- phrasing ----------

const KEYBOARD = { a: 's', s: 'a', e: 'r', r: 'e', i: 'o', o: 'i', t: 'r', n: 'm', m: 'n', l: 'k', d: 's', c: 'v', u: 'y', h: 'g', g: 'h', p: 'o', b: 'v', w: 'e', y: 't', k: 'l', f: 'g', v: 'c' }
/** One deterministic typo in a word: swap, drop or slip a key. */
export function typoWord(word, rng) {
  if (word.length < 4) return word
  const i = 1 + rng.int(word.length - 2), kind = rng.int(3)
  if (kind === 0) return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2)
  if (kind === 1) return word.slice(0, i) + word.slice(i + 1)
  const c = word[i].toLowerCase(); return KEYBOARD[c] ? word.slice(0, i) + KEYBOARD[c] + word.slice(i + 1) : word.slice(0, i) + word.slice(i + 1)
}

/**
 * Typo one or two ordinary words, leaving protected spans (names, titles) intact unless
 * `inName` is set, in which case one protected word gets the typo instead.
 */
export function addTypos(text, protect, rng, { inName = false } = {}) {
  const spans = []
  for (const p of protect.filter(Boolean)) { const at = text.indexOf(p); if (at >= 0) spans.push([at, at + p.length]) }
  const inside = (i) => spans.some(([a, b]) => i >= a && i < b)
  const words = [...text.matchAll(/[A-Za-z]{5,}/g)].map((m) => ({ w: m[0], at: m.index }))
  const pool = words.filter((x) => (inName ? inside(x.at) && /^[A-Z][a-z]+$/.test(x.w) : !inside(x.at) && /^[a-z]+$/.test(x.w)))
  if (!pool.length) return null
  const chosen = rng.shuffle(pool).slice(0, inName ? 1 : Math.min(2, pool.length)).sort((a, b) => b.at - a.at)
  let out = text
  for (const { w, at } of chosen) out = out.slice(0, at) + typoWord(w, rng) + out.slice(at + w.length)
  return out === text ? null : out
}

export const casualise = (q) => q.replace(/\?$/, '').replace(/^(.)/, (c) => c.toLowerCase())
export const PHRASINGS = [['plain', 46], ['casual', 16], ['typo', 13], ['short', 11], ['long', 9], ['compound', 5]]
