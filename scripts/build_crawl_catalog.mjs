// Bounded, deterministic crawl assets, rebuilt alongside the search catalogue.
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { slugIndex } from '../portal/src/person-slug.ts';
import { splitSpeakers } from '../portal/public/speech-attribution.js';
import { TOPIC_NAMES } from '../portal/src/topic-names.mjs';
import { fileKey } from '../portal/public/grants.js';

import { catalogueComplete } from '../portal/public/instruments.js';

export const ORIGIN = 'https://opax.com.au';
export const SITEMAP_LIMIT = 49_999;
export const validId = id => typeof id === 'string' && !!id.trim() && !/^(null|undefined)$/i.test(id.trim());
export const exportDate = value => {
  const day = typeof value === 'string' ? value.slice(0, 10) : '';
  const time = Date.parse(day + 'T00:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day ? day : '';
};
const xml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const fold = s => s.normalize('NFKC').replace(/[‘’ʼ`]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function sitemapFiles(groups, limit = SITEMAP_LIMIT) {
  if (!Number.isInteger(limit) || limit < 1 || limit > SITEMAP_LIMIT) throw new Error('Invalid sitemap limit');
  const files = [], counts = {};
  for (const [type, entries] of Object.entries(groups)) {
    const rows = [...new Map(entries.map(r => [r.path, r])).values()].sort((a,b) => a.path.localeCompare(b.path, 'en'));
    counts[type] = rows.length;
    for (let offset = 0; offset < rows.length; offset += limit) {
      const chunk = rows.slice(offset, offset + limit);
      const path = `/sitemaps/${type}-${1 + offset / limit}.xml`;
      const lastmod = chunk.map(r => r.lastmod).filter(Boolean).sort().at(-1);
      const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${chunk.map(r => `<url><loc>${xml(ORIGIN + r.path)}</loc>${r.lastmod ? `<lastmod>${r.lastmod}</lastmod>` : ''}${r.priority != null ? `<priority>${r.priority}</priority>` : ''}</url>`).join('\n')}\n</urlset>\n`;
      if (Buffer.byteLength(body) >= 50 * 1024 * 1024) throw new Error(`Oversize sitemap: ${path}`);
      files.push({path,lastmod,body,count:chunk.length});
    }
  }
  const index = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${files.map(f => `<sitemap><loc>${ORIGIN}${f.path}</loc>${f.lastmod ? `<lastmod>${f.lastmod}</lastmod>` : ''}</sitemap>`).join('\n')}\n</sitemapindex>\n`;
  return {files,index,counts};
}

export function llmsText(corpus, grants, instruments = null) {
  return `# OPAX

> OPAX is an independent, non-partisan record of Australian parliament and public money. It connects parliamentary speeches, votes and bills with disclosed political funding, public contracts and grants.

Corpus snapshot: ${corpus.version}. Export dates describe snapshots, not live coverage. Collections have different date ranges and gaps. Machine-written summaries are labelled; check quotations and legal wording against original records. A grant award or contract value does not prove a payment, and an association does not prove influence. Individual grant recipients are excluded from crawl discovery.

Cite the canonical OPAX URL and the original source URL shown on the record. Include the record date, jurisdiction and access date. For a specific grant award, preserve its \`?award=GA…\` parameter. Do not cite a search or generated answer as the authoritative source.

OPAX code is AGPL-3.0. Source data retains its own terms: parliamentary material and interests can have CC BY-NC-ND restrictions; compiled TheyVoteForYou divisions use ODbL; AEC disclosures use CC BY 4.0; GrantConnect uses CC BY 3.0 AU; Queensland grants use CC BY 4.0; Federal Register of Legislation instrument metadata uses CC BY 4.0 with Coat of Arms and marked third-party exceptions. Portraits have individual licences. Consult each record's source and the methods page before reuse.

## Corpus and coverage

- [Corpus manifest](${ORIGIN}/corpus.json): Snapshot ${corpus.version}; ${corpus.expected_resources} indexed resources. ${corpus.sources.map(s => s.name + ': ' + s.coverage).join('; ')}.
- [Corpus statistics](${ORIGIN}/stats): Collection counts and coverage.
- [Federal grants export](${ORIGIN}/graph/grants.federal.json): Export ${grants.federal.meta.generated}; ${grants.federal.meta.coverage}. Future agreement dates can appear in published records.
- [Queensland grants export](${ORIGIN}/graph/grants.qld.json): Export ${grants.qld.meta.generated}; ${grants.qld.meta.coverage}.
- [Methods, sources and licences](${ORIGIN}/methods): Source-specific restrictions, attribution, coverage and known limitations.

## Entity URL patterns

- [People](${ORIGIN}/subject/person): \`/subject/person/{slug}\`; parliamentary identity, recorded speeches and votes.
- [Parties](${ORIGIN}/subject/party): \`/subject/party/{encoded-name}\`; disclosed funding and parliamentary records.
- [Electorates](${ORIGIN}/subject/electorate): \`/subject/electorate/{slug}\`; jurisdiction-specific seat records.
- [Bills](${ORIGIN}/bills): \`/bill/{bill-key}\`; stages, original bill text and linked divisions.
${catalogueComplete(instruments) ? '- [Federal legislative instruments](' + ORIGIN + '/instruments): \`/instrument/{frl-id}\`; metadata only, with dates and links to authoritative FRL versions. No model summaries or person entities.\n' : ''}
- [Divisions and source records](${ORIGIN}/search): \`/doc/division-{division-key}\` for votes; \`/doc/{resource-slug}\` for speeches and other source records.
- [Grant programs and organisation recipients](${ORIGIN}/money/grants): Programs use \`/money/grants?jur={federal|qld}&program={encoded-program-id}\`; recipients use \`/money/grants/{federal|qld}/recipient/{encoded-recipient-id}\`; a particular award adds \`?award={award-id}\`.
- [Donors](${ORIGIN}/subject/donor): \`/subject/donor/{encoded-name}\`.
- [Suppliers](${ORIGIN}/subject/supplier): \`/subject/supplier/{supplier-id}\`; named AusTender profiles, award values rather than expenditure.
- [Agencies](${ORIGIN}/subject/agency): \`/subject/agency/{agency-id}\`.
- [Campaigners](${ORIGIN}/subject/campaigner): \`/subject/campaigner/{encoded-name}\`.
- [Topics](${ORIGIN}/subject/topic): \`/subject/topic/{topic-slug}\`.
- [Reports](${ORIGIN}/reports): \`/reports/{report-slug}\`; source-backed investigations.
- [Sitemap index](${ORIGIN}/sitemap.xml): Canonical discovery URLs, grouped by type with export lastmod dates.
`;
}

/** Metadata catalogue discovery uses source ids only, never title/person fields. */
export function instrumentCrawlEntries(manifest) {
  if (!catalogueComplete(manifest)) return [];
  const ids = Object.keys(manifest.lookup);
  if (!manifest.metadata_only || !ids.length || ids.length !== manifest.count || manifest.count !== manifest.odata_count) throw new Error('Unreconciled instruments export');
  const lastmod = exportDate(manifest.generated_at);
  if (!lastmod) throw new Error('Invalid instruments export date');
  return ids.map(id => {
    if (!/^[CF]\d{4}[A-Z]\d{5}$/.test(id)) throw new Error('Invalid FRL id');
    return {path: `/instrument/${id}`, lastmod};
  });
}

/** Optional type is absent until the manifest certifies a complete catalogue. */
export function addInstrumentDiscovery(groups, manifest) {
  if (!catalogueComplete(manifest)) return;
  groups.instruments = instrumentCrawlEntries(manifest);
  groups.static.push({ path: '/instruments', lastmod: exportDate(manifest.generated_at) });
}

export async function buildCrawl(root) {
  const read = async p => JSON.parse(await readFile(join(root,p.replace(/^\//,'')), 'utf8'));
  const optional = async p => { try { return await read(p); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
  const [roster, seatManifest, bills, suppliers, agencies, reports, corpus, votes, campaigners] = await Promise.all([
    read('parliamentarians.json'), read('electorates/manifest.json'), read('bills/index.json'), read('suppliers.json'), read('agencies.json'), read('reports/index.json'), read('corpus.json'), read('votes.json'), optional('graph/campaigners.json')
  ]);
  const [seats, seatPeople] = await Promise.all([read(seatManifest.index_url), read(seatManifest.people_url)]);
  const people = [...roster.people];
  const known = new Set(people.flatMap(p => [p.name,...splitSpeakers(p)].map(fold)));
  for (const p of seatPeople.people) {
    if ([p.name,...p.aliases].some(n => known.has(fold(n)))) continue;
    const current = p.electorates.filter(e => e.current);
    if (!current.length) continue;
    people.push({name:p.name,pid:p.legacy_person_id || p.person_id,speeches:0,party:current[0].party || null,states:[...new Set(current.map(e=>e.jurisdiction))],chambers:[...new Set(current.map(e=>e.chamber))],first:null,last:null,rosterOnly:{asOf:current[0].as_of,seats:current.map(e=>e.name)}});
    known.add(fold(p.name));
  }
  const groups = Object.fromEntries(['people','parties','electorates','bills','divisions','grant-programs','grant-recipients','topics-reports','static','suppliers','donors','campaigners','agencies'].map(t=>[t,[]]));
  const add = (type,path,date,priority) => {
    if (!path || path.split('/').some(s => /^(null|undefined)$/i.test(decodeURIComponent(s)))) return;
    const lastmod = exportDate(date);
    if (!lastmod) throw new Error(`Missing export date: ${type} ${path}`);
    groups[type].push({path,lastmod,...(priority != null ? {priority} : {})});
  };
  const snapshot = new Map();
  const instruments = await optional('instruments/manifest.json').catch(() => null);
  addInstrumentDiscovery(groups, instruments);
  const slugs = slugIndex(people).slugOf;
  const peopleDate = [roster.meta.generated,roster.meta.representation?.updated,seatManifest.generated].filter(Boolean).sort().at(-1);
  for (const p of people) {
    if (!validId(p.name) || p.name.length > 120) continue;
    const path = `/subject/person/${slugs.get(p.name) || encodeURIComponent(p.name)}`;
    add('people',path,peopleDate);
    const interest = p.pid ? await optional(`interests/${p.pid}.json`) : null;
    snapshot.set(path,hash({person:p,votes:votes[p.pid] || null,interest}));
  }
  const partyLabels = new Map(), donors = new Map();
  for (const name of ['money.json','money.qld.json','money.vic.json']) {
    const money = await read(`graph/${name}`);
    for (const n of money.nodes) {
      if (!validId(n.label)) continue;
      // Individual donors stay out of the sitemap, as individual grant recipients do.
      if (n.kind === 'donor' && n.industry === 'individual') continue;
      const map = n.kind === 'party' ? partyLabels : n.kind === 'donor' ? donors : null;
      if (map && !map.has(fold(n.label))) map.set(fold(n.label),{label:n.label,date:money.meta.generated});
    }
  }
  for (const p of people) if (validId(p.party) && !partyLabels.has(fold(p.party))) partyLabels.set(fold(p.party),{label:p.party,date:peopleDate});
  for (const p of partyLabels.values()) if (p.label.length <= 120) add('parties',`/subject/party/${encodeURIComponent(p.label)}`,p.date);
  for (const p of donors.values()) if (p.label.length <= 120) add('donors',`/subject/donor/${encodeURIComponent(p.label)}`,p.date);
  for (const s of seats.electorates) add('electorates',s.url,seatManifest.generated);
  const divisions = new Map();
  for (const row of bills.bills) {
    if (!validId(row.key)) continue;
    const bill = await read(`bills/${row.key}.json`);
    const path = `/bill/${encodeURIComponent(row.key)}`;
    add('bills',path,bills.generated_at);
    snapshot.set(path,hash(bill));
    for (const d of bill.divisions || []) if (validId(d.key)) divisions.set(d.key,d);
  }
  for (const [key,d] of divisions) {
    const path = `/doc/${encodeURIComponent(key.startsWith('division-') ? key : `division-${key}`)}`;
    add('divisions',path,bills.generated_at);
    snapshot.set(path,hash(d));
  }
  const grants = {};
  for (const jur of ['federal','qld']) {
    const data = grants[jur] = await read(`graph/grants.${jur}.json`);
    for (const r of data.recipients) {
      if (!validId(r.id) || ['individual','person','undisclosed'].includes(r.k)) continue;
      add('grant-recipients',`/money/grants/${jur}/recipient/${encodeURIComponent(r.id)}`,data.meta.generated);
    }
    for (const p of data.programs || []) {
      if (!validId(p.id)) continue;
      // Only indexed programs with an actual exported profile get discovery URLs.
      await read(`grants/${jur}/programs/${p.key || fileKey(p.id).replace(/^x-/, '')}.json`);
      add('grant-programs','/money/grants?' + new URLSearchParams({jur,program:p.id}),data.meta.generated);
    }
  }
  for (const s of suppliers.suppliers) if (validId(s.id) && validId(s.name) && s.profile_path) add('suppliers',`/subject/supplier/${encodeURIComponent(s.id)}`,suppliers.meta.generated_at,0.2);
  for (const a of agencies.agencies) if (validId(a.id)) add('agencies',`/subject/agency/${encodeURIComponent(a.id)}`,agencies.meta.generated_at);
  const campaignerNames = new Map();
  for (const c of campaigners?.entities || []) if (validId(c.name) && c.name.length <= 200) {
    const previous = campaignerNames.get(fold(c.name));
    if (!previous || (c.years?.length || 0) > (previous.years?.length || 0)) campaignerNames.set(fold(c.name),c);
  }
  for (const c of campaignerNames.values()) add('campaigners',`/subject/campaigner/${encodeURIComponent(c.name)}`,campaigners.meta.generated);
  for (const r of reports.reports) add('topics-reports',`/reports/${r.slug}`,r.generated_at || r.updated);
  for (const slug of Object.keys(TOPIC_NAMES)) add('topics-reports',`/subject/topic/${slug}`,corpus.version);
  for (const path of ['/','/ask','/search','/money','/money/receipts','/money/grants','/bills','/connections','/reports','/explore','/discover','/about','/methods','/stats','/declared','/expenses','/privacy','/support','/subject/topic',...['person','party','donor','campaigner','supplier','agency','electorate'].map(d=>`/subject/${d}`)]) add('static',path,corpus.version);
  const result = sitemapFiles(groups);
  const out = join(root,'crawl');
  await rm(out,{recursive:true,force:true});
  await mkdir(join(out,'sitemaps'),{recursive:true});
  await writeFile(join(out,'sitemap.xml'),result.index);
  for (const f of result.files) await writeFile(join(out,f.path.slice(1)),f.body);
  await writeFile(join(out,'llms.txt'),llmsText(corpus,grants,instruments));
  const entries = [...snapshot].sort(([a],[b])=>a.localeCompare(b,'en'));
  await writeFile(join(out,'indexnow.json'),JSON.stringify({entries}));
  await writeFile(join(out,'manifest.json'),JSON.stringify({counts:result.counts,files:result.files.map(({body,...f})=>f)},null,2)+'\n');
  return result.counts;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const counts = await buildCrawl(fileURLToPath(new URL('../portal/public/',import.meta.url)));
  console.log('Crawl sitemap counts:',JSON.stringify(counts));
}
