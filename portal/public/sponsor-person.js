/** Who a bill's sponsor is in the roster: the row a sponsor link should open,
 * or null for plain text.
 *
 * The register prints sponsors as "FARUQI, Sen Mehreen", "KATTER, Bob, Jnr,
 * MP" or "Bob Jnr Katter", and the roster holds some people twice: a full-name
 * row and a surname print from committee transcripts ("Faruqi"), or curly and
 * straight spellings (O'Connor). A link must never open someone other than
 * the person named, and never a surname print, which can hold several people.
 *
 * With the bill's person ID, the ID decides: a full-name row holding it whose
 * name agrees with the print (same surname; the first name or its short form,
 * Chris/Christopher). Where only a surname print holds the ID, its recorded
 * full name must be the printed name, and the link goes to the full-name row
 * of that name. A full-name row of the printed name holding another ID
 * contradicts the bill. Without an ID the print must name exactly one
 * full-name roster person.
 *
 * Shared by the bill page (public/app.js) and the Worker's crawlable bill
 * answers (src/seo-content.ts); test/sponsor-person.test.mjs. The iOS app's
 * resolver (mobile/src/features/bills/sponsors.ts) follows the same rules.
 */
const LEADING = new Set('the hon senator sen dr mr mrs ms miss prof professor sir dame'.split(' '))
const TRAILING = new Set('mp mhr mlc mla am ao ac oam qc sc kc jnr jr snr sr'.split(' '))
const GENERATION = new Set(['jnr', 'snr'])

/** Diacritics, case, apostrophes, full stops, hyphens and spacing folded away. */
export function sponsorFold(name) {
  return String(name ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/['’‘ʼ`.]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/** A print as a matching key: "SURNAME, Given, Jnr, MP" read as "given surname", titles dropped. */
export function sponsorKey(name) {
  const parts = String(name ?? '').split(',').map((part) => part.trim())
  const titled = (part) => sponsorFold(part).split(' ').every((w) => LEADING.has(w) || TRAILING.has(w))
  const ordered = parts.length > 1 && parts[0] && parts[1]
    ? [...parts.slice(1).filter((part) => !titled(part)), parts[0]].join(' ')
    : String(name ?? '')
  const words = sponsorFold(ordered).split(' ').filter(Boolean)
  while (words.length > 1 && LEADING.has(words[0])) words.shift()
  while (words.length > 1 && TRAILING.has(words[words.length - 1])) words.pop()
  return words.filter((w, i) => i === 0 || !GENERATION.has(w)).join(' ')
}

/** scripts/roster_identity.py agrees(): one surname, and a first name, its short form or initials. */
export function sponsorNamesAgree(a, b) {
  const n = sponsorKey(a).split(' ').filter(Boolean)
  const o = sponsorKey(b).split(' ').filter(Boolean)
  if (!n.length || !o.length || n[n.length - 1] !== o[o.length - 1]) return false
  let tail = 1
  while (tail < n.length && tail < o.length && n[n.length - 1 - tail] === o[o.length - 1 - tail]) tail++
  const given = n.slice(0, -tail), owner = o.slice(0, -tail)
  if (!given.length) return !owner.length
  if (!owner.length) return false
  if (given.every((t) => t.length === 1)) {
    const x = given.join(''), y = owner.map((t) => t[0]).join('')
    return x.startsWith(y) || y.startsWith(x)
  }
  const first = given[0]
  return owner.some((t) => t === first || (Math.min(t.length, first.length) >= 3 && (t.startsWith(first) || first.startsWith(t))))
}

export function sponsorPerson(printed, pid, people) {
  const wanted = sponsorKey(printed)
  if (!wanted.includes(' ')) return null
  const full = (p) => p.name.trim().includes(' ')
  const names = (p) => [p.name, p.full].filter((n) => !!n && !!n.trim())
  const named = people.filter((p) => full(p) && names(p).some((n) => sponsorKey(n) === wanted))
  let found
  if (pid) {
    if (named.some((p) => p.pid && p.pid !== pid)) return null
    const holders = people.filter((p) => p.pid === pid && full(p) && names(p).some((n) => sponsorNamesAgree(printed, n)))
    const exact = holders.filter((p) => named.includes(p))
    const vouched = people.some((p) => p.pid === pid && !!p.full && sponsorKey(p.full) === wanted)
    found = exact.length ? exact : holders.length ? holders : vouched ? named : []
  } else {
    // Rows without an ID cannot be told apart, so each counts as its own person.
    found = new Set(named.map((p, i) => p.pid ?? `row-${i}`)).size === 1 ? named : []
  }
  if (!found.length) return null
  // Spellings of one person (curly/straight twins): the most-recorded one.
  const pages = new Set(found.map((p) => sponsorFold(p.name)))
  if (pages.size > 1 && !pid) return null
  return [...found].sort((a, b) => (b.speeches ?? 0) - (a.speeches ?? 0))[0]
}
