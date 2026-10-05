#!/usr/bin/env node
/**
 * Identity check for the portrait map, portal/public/photos/people.json
 * (lowercased display name -> photo key). Every page that shows a face, and the
 * person page's votes, expenses and interests, reads a person's key from that
 * map, so a name on the wrong key shows somebody else's face and record.
 *
 *   node scripts/photo_identity.mjs     # print every problem, exit 1 if any
 *
 * portal/test/photo-identity.test.mjs runs the same audit on the shipped files,
 * so a deploy fails while the map is wrong. Run this after backfill_photos_oa.py,
 * fetch_commons_portraits.py or recrop_commons_portraits.py (each calls it).
 *
 * The rules (docs/PHOTOS.md, "Identity check"):
 *  - a name agrees with the person who owns its key: the TheyVoteForYou name for
 *    a numeric key (votes.json, else pay.json), the Wikidata label for a wd- key
 *    (credits.json). Surnames equal; a first name agrees by prefix either way
 *    (Phil/Phillip, Deb/Deborah); initials agree with the owner's initials.
 *    scripts/photo_identity.json lists the verified exceptions (same_person);
 *  - a surname-only or initials-only print ("Burke", "T Smith") on a numeric key
 *    needs the roster to give that print the same pid: such a print can hold
 *    several people, and the roster's pid is the only identity it has;
 *  - a roster name the roster gives a numeric pid sits on that pid's key, or on a
 *    wd- key whose label is that pid's owner;
 *  - no key holds roster names the roster gives different pids;
 *  - no two keys hold byte-identical files, every key has a file, and no name
 *    maps to a file listed as wrong_face in scripts/photo_identity.json.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
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
 * Every identity problem in the map, as sentences naming the name, the key and why.
 * people: name -> key; owners: Map key -> name; roster: [{name, pid}];
 * identity: {same_person, wrong_face}; bytesOf(key): Buffer, or null when the file is missing.
 */
export function auditPhotoMap({ people, owners, roster = [], identity = {}, bytesOf }) {
  const problems = []
  const same = identity.same_person || {}
  const wrong = identity.wrong_face || {}
  const rosterPid = new Map(roster.map((p) => [String(p.name).trim().toLowerCase(), /^\d+$/.test(String(p.pid ?? '')) ? String(p.pid) : null]))
  const byKey = new Map()
  for (const [name, key] of Object.entries(people)) {
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(name)
  }

  for (const [name, key] of Object.entries(people)) {
    const owner = owners.get(key)
    if (wrong[key]) problems.push(`"${name}" maps to ${key}, whose file shows someone else: ${wrong[key]}`)
    if (!owner) { problems.push(`"${name}" maps to ${key}, whose owner is unknown (not in votes.json, pay.json or credits.json)`); continue }
    if (same[name]?.key === key) continue
    if (!nameAgrees(name, owner)) { problems.push(`"${name}" maps to ${key}, which is ${owner}`); continue }
    if (!rosterPid.has(name)) continue
    const pid = rosterPid.get(name)
    const numeric = /^\d+$/.test(key)
    if (numeric && isWeakName(name) && pid !== key) {
      problems.push(`"${name}" is a surname or initials print the roster gives to ${pid ?? 'no one'}, not ${key} (${owner})`)
    } else if (pid && pid !== key && (numeric || !owners.has(pid) || !nameAgrees(owners.get(pid), owner))) {
      problems.push(`"${name}" maps to ${key} (${owner}), but the roster gives it ${pid} (${owners.get(pid) ?? 'unknown'})`)
    }
  }

  for (const [key, names] of byKey) {
    const pids = [...new Set(names.map((n) => rosterPid.get(n)).filter(Boolean))]
    if (pids.length > 1) problems.push(`${key} holds names the roster gives different people: ${names.map((n) => `"${n}" (${rosterPid.get(n) ?? '-'})`).join(', ')}`)
  }

  const byHash = new Map()
  for (const key of byKey.keys()) {
    const bytes = bytesOf(key)
    if (!bytes) { problems.push(`${key} has no file (named by ${byKey.get(key).map((n) => `"${n}"`).join(', ')})`); continue }
    const hash = createHash('sha256').update(bytes).digest('hex')
    if (!byHash.has(hash)) byHash.set(hash, [])
    byHash.get(hash).push(key)
  }
  for (const keys of byHash.values()) {
    if (keys.length > 1) problems.push(`${keys.join(' and ')} are byte-identical files: one face on ${keys.map((k) => owners.get(k) ?? k).join(' and ')}`)
  }
  return problems
}

/** The audit over the shipped files. */
export function auditShippedPhotoMap(publicDir = PUBLIC, identityFile = join(ROOT, 'scripts', 'photo_identity.json')) {
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
  const problems = auditShippedPhotoMap()
  for (const p of problems) console.error(`[photos] ${p}`)
  console.error(problems.length ? `[photos] ${problems.length} identity problem(s) in photos/people.json` : '[photos] identity check: ok')
  process.exit(problems.length ? 1 : 0)
}
