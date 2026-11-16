/* The register view: one page for each party on the VEC's register of political parties, the
   same page for all of them. A party name on a Victorian candidate list links here and nowhere else.

   It shows only what the VEC publishes: the registered name, the registration dates, the registered
   abbreviated name, and the party's 2026 candidates by seat, in the VEC's order (districts, then
   regions; ballot paper order within a seat). It has no receipts, donors, members, bills, party
   colour or portraits, and it does not link to a party page: whether a registered Victorian party
   and a party in the parliamentary or money record are one organisation is not sourced here, and
   until polls close the page gives no party more than another (hub ruling on pull request 455).

   The register is a saved copy (scripts/fetch_vec_parties.py), bundled with the Worker so the view
   never depends on a second published file. A candidate's party is its register entry when the two
   names are the same apart from the dash they are written with; no alias table is consulted. */
import register from '../../scripts/hubs/vic-registered-parties-2026.json' with {type:'json'}
import {sourceLineHTML} from '../public/party-page.js'
import {shortDate} from '../public/format.js'
import {VIC_ELECTION_PATH} from '../public/vic-election.js'
import {escapeHtml as esc} from './seo-content'
import type {VicElection} from './vic-election'

export interface RegisteredParty { name: string; first_registered: string; re_registered: string | null; abbreviation: string | null; acronym: string | null }
export const VIC_REGISTER: {source: string; url: string; licence: string; retrieved: string; parties: RegisteredParty[]} = register

/** One name, whichever dash the register or a candidate list writes it with. */
const nameKey = (name: string) => name.normalize('NFKC').replace(/[‐-―]/g,'-').replace(/\s+/g,' ').trim().toLowerCase()
const byName = new Map(VIC_REGISTER.parties.map(p => [nameKey(p.name),p]))
/** A registered name as an address segment: lower case, apostrophes and full stops dropped, other runs a hyphen. */
const partySlug = (name: string) => name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/['\u2018\u2019\u02bc`.]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')
/** The last segment of a register view's address: "party-" and the registered name's slug. */
const PREFIX = 'party-'

/** The register entry a candidate's party names, or null: a blank party, "Independent", or a name not on the register. */
export const registeredParty = (name: string | null | undefined): RegisteredParty | null => name ? byName.get(nameKey(name)) ?? null : null
/** The register view's address for a registered party. */
export const registeredPartyPath = (p: RegisteredParty) => `${VIC_ELECTION_PATH}/${PREFIX}${partySlug(p.name)}`
/** Where a candidate's party label links: its register view, or null when the name is not on the register. */
export function candidatePartyPath(name: string | null | undefined): string | null {
  const party = registeredParty(name)
  return party ? registeredPartyPath(party) : null
}

/** `html` with each party label in it (labels.js partyLabelHTML), in order, linked to the matching address
 *  in `hrefs`; the label's own markup and text are unchanged. Every label is linked or none is: a count
 *  that does not match, or an address that is missing, links nothing, so no row is treated differently.
 *  test/vic-party-pages.test.mjs fails when that happens on any seat page. */
export function linkPartyLabels(html: string, hrefs: (string | null)[]): string {
  const spans: [number, number][] = []
  for (let at = 0; ;) {
    const start = html.indexOf('<span class="ui-party', at)
    if (start < 0) break
    // The label's closing tag: the one that balances its own opening, past the spans inside it.
    const tag = /<(\/?)span\b[^>]*>/g
    tag.lastIndex = start
    let depth = 0, end = -1
    for (let m; (m = tag.exec(html));) { depth += m[1] ? -1 : 1; if (!depth) { end = tag.lastIndex; break } }
    if (end < 0) return html
    spans.push([start, end])
    at = end
  }
  if (spans.length !== hrefs.length || hrefs.some(href => !href)) return html
  let out = '', at = 0
  for (const [i, [start, end]] of spans.entries()) {
    out += `${html.slice(at, start)}<a class="party-link" href="${esc(hrefs[i]!)}">${html.slice(start, end)}</a>`
    at = end
  }
  return out + html.slice(at)
}

/** A registered party's candidates on the VEC's lists, grouped by seat in the lists' order. */
export function registeredCandidates(d: VicElection, p: RegisteredParty) {
  const seats = [...d.seats.filter(s => s.kind === 'district'), ...d.seats.filter(s => s.kind === 'region')]
  return seats.map(s => ({seat:s, names:(s.candidates?.list ?? []).filter(c => registeredParty(c.party)?.name === p.name).map(c => c.name)})).filter(row => row.names.length)
}

const day = (iso: string) => shortDate(iso)
/** The register view's body: the one function every registered party's page is drawn by. */
export function registerViewHTML(d: VicElection, p: RegisteredParty): string {
  const rows = registeredCandidates(d,p), count = rows.reduce((n,row) => n + row.names.length,0)
  const published = d.seats.map(s => s.candidates?.published || '').sort().at(-1) || ''
  const fact = (term: string, value: string) => `<div><dt>${esc(term)}</dt><dd>${esc(value)}</dd></div>`
  const seatName = (row: (typeof rows)[number]) => `${row.seat.name} ${row.seat.kind === 'region' ? 'Region' : 'District'}`
  return `<div class="vic-hub vic-register">`
    + `<div class="ui-page-head"><h1>${esc(p.name)}</h1><p class="ui-page-meta">Registered political party, Victoria. From the Victorian Electoral Commission's register.</p></div>`
    + `<section class="ui-section hub-section" id="registration"><h2 class="ui-section-title">Registration</h2>`
    + `<dl class="vic-facts">${fact('Registered name',p.name)}${fact('First registered',day(p.first_registered))}`
    + `${fact('Re-registered',p.re_registered ? day(p.re_registered) : 'Not recorded on the register')}`
    + `${fact('Registered abbreviated name',p.abbreviation || 'None on the register')}</dl></section>`
    + `<section class="ui-section hub-section" id="candidates"><h2 class="ui-section-title">Candidates at the 2026 Victorian state election</h2>`
    + `<p class="ui-section-note">${count ? `${count.toLocaleString('en-AU')} candidate${count === 1 ? '' : 's'}, by seat: districts, then regions, in ballot paper order within a seat.` : 'No candidates on the VEC\'s lists.'}</p>`
    + `<ul class="vic-register-seats" role="list">${rows.map(row => `<li><a href="${esc(row.seat.path)}#candidates">${esc(seatName(row))}</a><ul role="list">${row.names.map(name => `<li>${esc(name)}</li>`).join('')}</ul></li>`).join('')}</ul>`
    + sourceLineHTML({updated:VIC_REGISTER.retrieved, dateLabel:'Register read', source:'Victorian Electoral Commission',
      originals:[{href:VIC_REGISTER.url,label:'Register of political parties'},{href:d.sources.election,label:'2026 State election'}],
      notes:[esc(`Registered names, dates and abbreviated names are the register's own.${published ? ` Candidates are those the VEC published on ${day(published)}.` : ''} Every registered party has this page, with the same contents.`)],
      licence:esc(VIC_REGISTER.licence)})
    + `</section>`
    + `<ul class="hub-links"><li><a href="${esc(VIC_ELECTION_PATH)}">Victorian election 2026</a></li></ul>`
    + `</div>`
}

/** The register view for a page id ("party-victorian-socialists"), or null when the id names no registered party. */
export function registerView(id: string, d: VicElection) {
  const p = id.startsWith(PREFIX) ? VIC_REGISTER.parties.find(x => partySlug(x.name) === id.slice(PREFIX.length)) : undefined
  if (!p) return null
  const count = registeredCandidates(d,p).reduce((n,row) => n + row.names.length,0)
  return {party:p, title:`${p.name} · Registered party · Victorian election 2026`,
    description:`${p.name}: registered with the Victorian Electoral Commission on ${day(p.first_registered)}. ${count ? `${count} candidate${count === 1 ? '' : 's'}` : 'No candidates'} at the 2026 Victorian state election, by seat.`,
    body:registerViewHTML(d,p)}
}
