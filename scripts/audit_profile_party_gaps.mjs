#!/usr/bin/env node
/** Offline audit. Public output uses hashes, never unresolved/private names.
 * Usage: node scripts/audit_profile_party_gaps.mjs before.json after.json report.json
 * A local HTML crawl may be supplied as the fourth/fifth arguments for parity.
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {rosterFold, rosterSeatParty, rosterListParty, rosterServiceParty} from '../portal/public/roster-party.js';
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const [beforePath, afterPath, output, htmlBeforePath, htmlAfterPath] = process.argv.slice(2);
const publicRead = p => read(new URL('../portal/public/' + p.replace(/^\//, ''), import.meta.url));
const before = read(beforePath), after = read(afterPath);
const manifest = publicRead('electorates/manifest.json');
const seats = publicRead(manifest.index_url).electorates;
const lists = publicRead('data/roster-list-parties.json').observations;
const sources = read(new URL('./roster_party_evidence.json', import.meta.url)).people;
const own = p => !!(p.party || p.party_now);
const missing = p => !own(p) && !rosterSeatParty(p,seats) && !rosterListParty(p,lists) && !rosterServiceParty(p);
const key = n => rosterFold(n).replaceAll('.', ' ').replace(/\s+/g, ' ');
const byName = new Map(after.people.map(p => [p.name,p]));
const rows = [];
for (const p of before.people.filter(p => !own(p))) {
  const held = sources.filter(s => key(s.name) === key(p.name) && p.states.length === 1 && p.states[0] === s.jurisdiction &&
    p.chambers.includes(s.chamber) && +s.start.slice(0,4) <= p.last && +(s.end || s.as_of).slice(0,4) >= p.first);
  const recorded = held.flatMap(s => s.basis.startsWith('Parliamentary Handbook')
    ? [...s.undated, ...s.periods.map(p => p.party)] : s.source_party && !/coalition/i.test(s.source_party) ? [s.source_party] : []);
  const fallback = !!(rosterSeatParty(p,seats) || rosterListParty(p,lists));
  const category = fallback ? 'a' : recorded.some(p => /independent/i.test(p)) ? 'd' : recorded.length ? 'a' : held.length ? 'b' : 'c';
  const reason = category !== 'c' ? (fallback ? 'already supplied by a dated roster fallback' : 'full-name same-house dated source identity')
    : p.chambers.every(c => /committee/.test(c)) ? 'committee-only print without a verified parliamentary identity'
    : !p.name.includes(' ') || /^(?:[A-Z]\.?(?:\s|\.)+)+\S+$/.test(p.name) ? 'surname or initials print without a safe full-name identity'
    : 'no exact full-name identity with overlapping dated service in the held roster sources';
  const q = byName.get(p.name);
  if (!q) throw new Error('Audit must not lose profiles');
  rows.push({profile_key_sha256:createHash('sha256').update(key(p.name)).digest('hex'),
    jurisdiction:p.states.length === 1 ? p.states[0] : 'multiple', class:category, reason,
    raw_before:!own(p), raw_after:!own(q), rendered_before:missing(p), rendered_after:missing(q)});
}
const tally = selected => ({raw_before:selected.filter(r=>r.raw_before).length,raw_after:selected.filter(r=>r.raw_after).length,
  rendered_before:selected.filter(r=>r.rendered_before).length,rendered_after:selected.filter(r=>r.rendered_after).length});
const jurisdictions = ['federal','act','nsw','nt','qld','sa','tas','vic','wa','multiple'];
const table = jurisdictions.map(jurisdiction=>({jurisdiction,...tally(rows.filter(r=>r.jurisdiction===jurisdiction)),
  classes:Object.fromEntries(['a','b','c','d'].map(c=>[c,tally(rows.filter(r=>r.jurisdiction===jurisdiction&&r.class===c))]))}));
const parity = (path, people) => {
  if (!path) return null;
  const html = read(path), index = new Map(html.map(r=>[r.name,r]));
  const mismatches = people.filter(p=>!index.has(p.name)||index.get(p.name).noParty!==missing(p));
  if (html.some(r=>r.status!==200||r.partyItem===null)||mismatches.length) throw new Error('HTML parity failed');
  return {profiles:html.length,reference_only:html.filter(r=>r.referenceOnly).length,no_party:html.filter(r=>r.noParty).length,errors:0};
};
const doc = {meta:{baseline:'00150690c',unit:'one exported profile; multiple jurisdictions counted once under multiple',
  identifiers:'SHA256 of folded name with dots replaced by spaces; no unresolved names published',
  classification:'a: held party (includes already working roster fallbacks); b: dated identity but no single party in held data; c: unresolved print; d: source explicitly Independent',
  sources:['portal/public/parliamentarians.json','portal/public/electorates/manifest.json','portal/public/data/roster-list-parties.json','scripts/roster_party_evidence.json']},
  profiles:{before:before.people.length,after:after.people.length},totals:tally(rows),by_jurisdiction:table,
  by_class:Object.fromEntries(['a','b','c','d'].map(c=>[c,tally(rows.filter(r=>r.class===c))])),
  html:{before:parity(htmlBeforePath,before.people),after:parity(htmlAfterPath,after.people)},rows};
writeFileSync(output,JSON.stringify(doc,null,2)+'\n');
console.log(JSON.stringify({profiles:doc.profiles,totals:doc.totals,by_class:doc.by_class,html:doc.html}));
