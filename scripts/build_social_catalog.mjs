// The daily edition's grant files, drawn only from records the site already publishes.
// Dates are agreement start dates, never inferred publication or payment dates.
//   social/grants.json          a shortlist of recent organisation awards (the `grant` kind)
//   social/programs.json        programs told by seat: where each one's money went, by the party
//                               holding the seat on the grant date (the `program` kind, and the
//                               program page's "By the party holding the seat" block)
//   social/grants-largest.json  the largest awards by agreement-start month (the `largest` kind
//                               and its page, /money/grants?jur=federal&largest=YYYY-MM)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { seatTimelines, programSeatSplit, programEligible, programRecord, largestByMonth, PARTY_GROUPS } from './social_grants_lib.mjs';
const root = fileURLToPath(new URL('../portal/public/', import.meta.url));
const read = (path) => JSON.parse(readFileSync(root + path.replace(/^\//, ''), 'utf8'));
const graph = read('graph/grants.federal.json');
const asOf = graph.meta.generated.slice(0, 10);
const until = Date.parse(asOf + 'T00:00:00Z');
const grants = [];
const awards = new Map();
for (let i = 0; i < graph.meta.shards; i++) {
  const shard = read(`grants/federal/shard-${String(i).padStart(2, '0')}.json`);
  for (const recipient of Object.values(shard)) {
    for (const g of recipient.grants || []) {
      if (/^abn:\d{11}$/.test(recipient.id)) awards.set(g.id, { ...g, rid: recipient.id, rn: recipient.n, k: recipient.k });
    }
    if (!/^abn:\d{11}$/.test(recipient.id) || recipient.k === 'person') continue;
    for (const g of recipient.grants || []) {
      const start = Date.parse(g.s + 'T00:00:00Z');
      const purpose = String(g.desc || g.n || '').replace(/\s+/g, ' ').trim();
      if (!/^GA\d+(?:-A\d+)?$/.test(g.id) || !g.guid || !Number.isFinite(g.v) || g.v <= 0 || purpose.length < 55 || !Number.isFinite(start) || start > until || until - start > 365 * 86400000) continue;
      grants.push({ id: g.id, recipientId: recipient.id, recipient: recipient.n, amount: g.v, start: g.s, purpose, agency: g.ag, program: g.pr, category: g.cat, sourceUrl: `https://www.grants.gov.au/Ga/Show/${encodeURIComponent(g.guid)}` });
    }
  }
}
grants.sort((a, b) => b.start.localeCompare(a.start) || a.id.localeCompare(b.id));
mkdirSync(root + 'social', { recursive: true });
writeFileSync(root + 'social/grants.json', JSON.stringify({ asOf, basis: 'Published award values and agreement start dates; not payments.', grants: grants.slice(0, 1500) }) + '\n');
console.log(`Social grant shortlist: ${Math.min(grants.length, 1500)} source records, as of ${asOf}`);

// ---------------------------------------------------------------- seats
// The electorates release: AEC results and service records with dated party periods.
const manifest = read('electorates/manifest.json');
const index = read(manifest.index_url);
const details = index.electorates
  .filter(e => e.jurisdiction === 'federal' && e.chamber === 'representatives' && e.detail_url && existsSync(root + e.detail_url.replace(/^\//, '')))
  .map(e => read(e.detail_url));
const seats = seatTimelines(details);

// ---------------------------------------------------------------- programs
const programs = [];
const skipped = {};
const memo = new Map();
for (const row of graph.programs) {
  if (!row.key || !existsSync(root + `grants/federal/programs/${row.key}.json`)) continue;
  const program = read(`grants/federal/programs/${row.key}.json`);
  const split = programSeatSplit(program, seats, graph.meta, { memo });
  const why = programEligible(program, split);
  if (why) { skipped[why] = (skipped[why] ?? 0) + 1; continue; }
  programs.push(programRecord(program, split));
}
// Every program file's awards feed the largest list, beside the recipient shards; program-file
// awards also carry the seat's state.
for (const row of graph.programs) {
  if (!row.key || !existsSync(root + `grants/federal/programs/${row.key}.json`)) continue;
  const program = read(`grants/federal/programs/${row.key}.json`);
  for (const g of program.grants) {
    const known = awards.get(g.id);
    if (known) { if (!known.elst && g.elst) known.elst = g.elst; continue; }
    if (/^abn:\d{11}$/.test(g.rid ?? '')) awards.set(g.id, { ...g, pr: program.n, ag: program.ag });
  }
}
programs.sort((a, b) => a.key.localeCompare(b.key));
writeFileSync(root + 'social/programs.json', JSON.stringify({
  asOf,
  groups: PARTY_GROUPS,
  basis: [
    'Award values as published on GrantConnect, not payments.',
    "Seats come from each award's delivery or recipient postcode, so they are approximate where a postcode straddles a boundary.",
    'The party is the seat holder\'s on the grant date (agreement start, else approval), from parliamentary service records with dated party changes, and the AEC result where the records have no entry. Labor and the Coalition are the grants file\'s blocs; every other party and every independent is the crossbench.',
    'The share of seats is the share of House seats each group held on each grant\'s date, weighted by the grant\'s value.',
  ],
  programs,
}) + '\n');
const eras = programs.reduce((acc, p) => ({ ...acc, [p.era]: (acc[p.era] ?? 0) + 1 }), {});
console.log(`Social programs: ${programs.length} told by seat (${Object.entries(eras).map(([k, v]) => `${k} ${v}`).join(', ')}); skipped ${Object.entries(skipped).map(([k, v]) => `${v} ${k}`).join(', ')}`);

// ---------------------------------------------------------------- largest
const largest = largestByMonth([...awards.values()], asOf, seats);
const months = Object.keys(largest).sort();
writeFileSync(root + 'social/grants-largest.json', JSON.stringify({
  asOf,
  latest: months.at(-1) ?? null,
  basis: [
    'Awards whose agreements start in the month, as published on GrantConnect by the date above; a month is listed once 21 days have passed since its last day (the publication deadline).',
    'One row per recipient: its largest award that month, with a count of its others.',
    "Drawn from the awards OPAX publishes on recipient and program pages: every listed recipient's 40 largest awards and every listed program's 600 largest.",
    'Award values, not payments.',
  ],
  months: largest,
}) + '\n');
console.log(`Social largest awards: ${months.length} months, latest ${months.at(-1) ?? 'none'}`);
