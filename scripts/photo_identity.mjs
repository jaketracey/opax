#!/usr/bin/env node
/**
 * Identity check for the portrait map, portal/public/photos/people.json
 * (lowercased display name -> photo key). Every page that shows a face reads it,
 * so a name on the wrong key shows somebody else's face. (Records never join on
 * this key: votes, expenses, interests and pay take the roster's verified pid.)
 *
 *   node scripts/photo_identity.mjs            # report; exit 1 on a corrupt mapping
 *   node scripts/photo_identity.mjs --strict   # exit 1 on any problem (the photo scripts)
 *   node scripts/photo_identity.mjs --deploy   # exit 1 on a corrupt mapping; otherwise ship
 *                                              # the map without the roster warnings' names
 *
 * Both `npm run deploy` and `npm run deploy:staging` run --deploy before Wrangler;
 * portal/test/photo-identity.test.mjs fails on a corrupt mapping and lists the
 * warnings. backfill_photos_oa.py, fetch_commons_portraits.py and
 * recrop_commons_portraits.py end with --strict.
 *
 * Corrupt, the map itself is wrong (docs/PHOTOS.md, "Identity check"):
 *  - a name that does not agree with the person who owns its key: the
 *    TheyVoteForYou name for a numeric key (votes.json, else pay.json), the
 *    Wikidata label for a wd- key (credits.json). Surnames equal; a first name
 *    agrees by prefix either way (Phil/Phillip); initials agree with the owner's.
 *    scripts/person_identity.json lists the verified exceptions (same_person);
 *  - a name on a file listed as wrong_face there; a key with no file; two keys
 *    holding byte-identical files.
 * Roster, true of the map only while the roster says so (the weekly export can
 * change it under an untouched map), so a warning, and the deploy leaves it out:
 *  - a surname-only or initials print ("Cox", "T Smith") that spans more than one
 *    parliament, includes committee-witness rows, or on a numeric key lacks that
 *    pid in the roster (scripts/roster_identity.py gives a print holding more than
 *    one person no pid);
 *  - a full name the roster gives another pid; a key holding names the roster
 *    gives different pids; a key whose owner is unknown.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const PUBLIC = join(ROOT, 'portal', 'public')

const TITLES = new Set(['hon', 'the', 'dr', 'mr', 'mrs', 'ms', 'sir', 'jr', 'am', 'ao', 'mp', 'mlc', 'mla', 'kc', 'qc'])

/** Lowercased name tokens without accents, dots or honorifics: "K.J. Maher" -> ["k", "j", "maher"]. */
export function nameParts(name) {
  return String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’‘`]/g, "'").replace(/\./g, ' ').split(/[\s,]+/).filter((t) => t && !TITLES.has(t))
}

/** True for a print with no real first name: "Burke", "T Smith", "K.J. Maher". */
export function isWeakName(name) {
  return nameParts(name).slice(0, -1).every((t) => t.length === 1)
}

/** Does this display name agree with the name of the person who owns the key? */
export function nameAgrees(name, owner) {
  const n = nameParts(name)
  const o = nameParts(owner)
  if (!n.length || !o.length || n.at(-1) !== o.at(-1)) return false
  // The shared tail is the surname, however many words ("van Holst Pellekaan").
  let tail = 1
  while (tail < n.length && tail < o.length && n.at(-1 - tail) === o.at(-1 - tail)) tail++
  const given = n.slice(0, -tail)
  const ownerGiven = o.slice(0, -tail)
  if (!given.length) return true
  if (!ownerGiven.length) return false
  if (given.every((t) => t.length === 1)) {
    const a = given.join('')
    const b = ownerGiven.map((t) => t[0]).join('')
    return a.startsWith(b) || b.startsWith(a)
  }
  const first = given[0]
  return ownerGiven.some((t) => t === first ||
    (Math.min(t.length, first.length) >= 3 && (t.startsWith(first) || first.startsWith(t))))
}

/** Key -> owner's name: TheyVoteForYou names for numeric keys, Wikidata labels for wd- keys. */
export function photoOwners({ votes = {}, pay = {}, credits = {} }) {
  const owners = new Map()
  for (const [key, rec] of Object.entries(votes)) if (/^\d+$/.test(key) && rec?.name) owners.set(key, rec.name)
  for (const rec of Object.values(pay?.people || {})) {
    if (/^\d+$/.test(String(rec?.pid || '')) && rec.name && !owners.has(String(rec.pid))) owners.set(String(rec.pid), rec.name)
  }
  for (const [key, rec] of Object.entries(credits)) if (rec?.label) owners.set(key, rec.label)
  return owners
}

/**
 * Every identity problem in the map: {level, message, names}. level "corrupt" is a fact about the map
 * itself (a name on another person's key, a quarantined file, a missing file, one face under two keys)
 * and fails the check; level "roster" depends on the roster, which the weekly export can change under a
 * map nobody touched, so a deploy leaves those names out of the map it ships and says so (servedPhotoMap).
 * people: name -> key; owners: Map key -> name; roster: parliamentarians.json people;
 * identity: {same_person, wrong_face}; bytesOf(key): Buffer, or null when the file is missing.
 */
export function auditPhotoMap({ people, owners, roster = [], identity = {}, bytesOf }) {
  const problems = []
  const corrupt = (message, names) => problems.push({ level: 'corrupt', message, names })
  const drift = (message, names) => problems.push({ level: 'roster', message, names })
  const same = identity.same_person || {}
  const wrong = identity.wrong_face || {}
  const rows = new Map(roster.map((p) => [String(p.name).trim().toLowerCase(), p]))
  const rosterPid = (name) => { const pid = String(rows.get(name)?.pid ?? ''); return /^\d+$/.test(pid) ? pid : null }
  const byKey = new Map()
  for (const [name, key] of Object.entries(people)) {
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(name)
  }

  for (const [name, key] of Object.entries(people)) {
    const owner = owners.get(key)
    if (wrong[key]) corrupt(`"${name}" maps to ${key}, whose file shows someone else: ${wrong[key]}`, [name])
    if (!owner) { drift(`"${name}" maps to ${key}, whose owner is unknown (not in votes.json, pay.json or credits.json)`, [name]); continue }
    if (same[name]?.key === key) continue
    if (!nameAgrees(name, owner)) { corrupt(`"${name}" maps to ${key}, which is ${owner}`, [name]); continue }
    const row = rows.get(name)
    if (!row) continue
    const pid = rosterPid(name)
    const numeric = /^\d+$/.test(key)
    if (isWeakName(name)) {
      // A print holds whoever Hansard printed that way; it is one person only on dated evidence.
      const states = row.states || []
      if (states.length > 1) drift(`"${name}" is a surname or initials print spanning ${states.join('+')}: more than one person`, [name])
      else if (row.witness_rows) drift(`"${name}" is a surname or initials print that includes ${row.witness_rows} committee-witness rows`, [name])
      else if (numeric && pid !== key) drift(`"${name}" is a surname or initials print the roster gives to ${pid ?? 'no one'}, not ${key} (${owner})`, [name])
    } else if (pid && pid !== key && (numeric || !owners.has(pid) || !nameAgrees(owners.get(pid), owner))) {
      drift(`"${name}" maps to ${key} (${owner}), but the roster gives it ${pid} (${owners.get(pid) ?? 'unknown'})`, [name])
    }
  }

  for (const [key, names] of byKey) {
    const pids = [...new Set(names.map(rosterPid).filter(Boolean))]
    if (pids.length > 1) drift(`${key} holds names the roster gives different people: ${names.map((n) => `"${n}" (${rosterPid(n) ?? '-'})`).join(', ')}`,
      names.filter((n) => rosterPid(n) && rosterPid(n) !== key))
  }

  const byHash = new Map()
  for (const key of byKey.keys()) {
    const bytes = bytesOf(key)
    if (!bytes) { corrupt(`${key} has no file (named by ${byKey.get(key).map((n) => `"${n}"`).join(', ')})`, byKey.get(key)); continue }
    const hash = createHash('sha256').update(bytes).digest('hex')
    if (!byHash.has(hash)) byHash.set(hash, [])
    byHash.get(hash).push(key)
  }
  for (const keys of byHash.values()) {
    if (keys.length > 1) corrupt(`${keys.join(' and ')} are byte-identical files: one face on ${keys.map((k) => owners.get(k) ?? k).join(' and ')}`,
      keys.flatMap((k) => byKey.get(k)))
  }
  return problems
}

/** The map a deploy ships: every name a roster-level problem names is left out (no face, not a wrong one). */
export function servedPhotoMap(people, problems) {
  const out = new Set(problems.filter((p) => p.level === 'roster').flatMap((p) => p.names))
  return Object.fromEntries(Object.entries(people).filter(([name]) => !out.has(name)))
}

/** people.json as the photo scripts write it (Python json.dump, indent=0, sort_keys). */
export function formatPhotoMap(people) {
  const keys = Object.keys(people).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return `{\n${keys.map((k) => `${JSON.stringify(k)}: ${JSON.stringify(people[k])}`).join(',\n')}\n}`
}

const IDENTITY_FILE = join(ROOT, 'scripts', 'person_identity.json')

/** The audit over the shipped files. */
export function auditShippedPhotoMap(publicDir = PUBLIC, identityFile = IDENTITY_FILE) {
  const json = (path) => JSON.parse(readFileSync(join(publicDir, path), 'utf8'))
  const photos = join(publicDir, 'photos')
  return auditPhotoMap({
    people: json('photos/people.json'),
    owners: photoOwners({ votes: json('votes.json'), pay: json('pay.json'), credits: json('photos/credits.json') }),
    roster: json('parliamentarians.json').people,
    identity: JSON.parse(readFileSync(identityFile, 'utf8')),
    bytesOf: (key) => (/^[\w-]+$/.test(key) && existsSync(join(photos, `${key}.webp`)) ? readFileSync(join(photos, `${key}.webp`)) : null),
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Set(process.argv.slice(2))
  const problems = auditShippedPhotoMap()
  const bad = problems.filter((p) => p.level === 'corrupt')
  const drifted = problems.filter((p) => p.level === 'roster')
  for (const p of bad) console.error(`[photos] ERROR ${p.message}`)
  for (const p of drifted) console.error(`[photos] ${args.has('--strict') ? 'ERROR' : 'warning'} ${p.message}`)
  if (bad.length || (args.has('--strict') && drifted.length)) {
    console.error(`[photos] ${bad.length + (args.has('--strict') ? drifted.length : 0)} identity problem(s) in photos/people.json; nothing deployed`)
    process.exit(1)
  }
  if (args.has('--deploy') && drifted.length) {
    const file = join(PUBLIC, 'photos', 'people.json')
    const served = servedPhotoMap(JSON.parse(readFileSync(file, 'utf8')), problems)
    writeFileSync(file, formatPhotoMap(served))
    console.error(`[photos] the deployed map leaves out ${drifted.flatMap((p) => p.names).length} name(s) the roster no longer vouches for; fix photos/people.json`)
  }
  console.error(drifted.length ? `[photos] identity check: no corrupt mappings, ${drifted.length} roster warning(s)` : '[photos] identity check: ok')
}
