// Bounded, deterministic crawl assets, rebuilt alongside the search catalogue.
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { personSlug, slugIndex, personIndex } from '../portal/src/person-slug.ts';
import { personNameKey } from '../portal/public/canonical-urls.js';
import { splitSpeakers } from '../portal/public/speech-attribution.js';
import { TOPIC_NAMES } from '../portal/src/topic-names.mjs';
import { fileKey } from '../portal/public/grants.js';

import { catalogueComplete, unpack } from '../portal/public/instruments.js';
import { auditComplete } from '../portal/public/audit.js';

export const ORIGIN = 'https://opax.com.au';
export const SITEMAP_LIMIT = 49_999;
export const validId = id => typeof id === 'string' && !!id.trim() && !/^(null|undefined)$/i.test(id.trim());
export const exportDate = value => {
  const day = typeof value === 'string' ? value.slice(0, 10) : '';
  const time = Date.parse(day + 'T00:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day ? day : '';
};
export const latestDate = (dates, cutoff) => dates.map(exportDate).filter(day=>day && (!exportDate(cutoff) || day<=exportDate(cutoff))).sort().at(-1) || '';
export const billLastmod = (bill, cutoff) => latestDate([bill.updated_at,bill.status_as_of,bill.introduced,bill.summary?.generated_at,...(bill.key_dates || []).map(d=>d.date),...(bill.divisions || []).map(d=>d.date),...(bill.speeches || []).map(d=>d.date)],cutoff);

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

export function llmsText(corpus, grants, instruments = null, audit = null) {
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
- [Parties](${ORIGIN}/subject/party): \`/subject/party/{slug}\`; disclosed funding and parliamentary records.
- [Electorates](${ORIGIN}/subject/electorate): \`/subject/electorate/{slug}\`; jurisdiction-specific seat records.
- [Bills](${ORIGIN}/bills): \`/bill/{bill-key}\`; stages, original bill text and linked divisions.
${catalogueComplete(instruments) ? '- [Federal legislative instruments](' + ORIGIN + '/instruments): \`/instrument/{frl-id}\`; metadata only, with dates and links to authoritative FRL versions. No model summaries or person entities.\n' : ''}
${auditComplete(audit) ? '- [Queensland audit reports](' + ORIGIN + '/audit): \`/audit/{report-id}\`; report index and numbered HTML recommendations, QAO source text under CC BY 4.0 with State of Queensland attribution. Per-report exceptions withhold bodies. PDF bodies, entity responses and the app surface are phase 2.\n' : ''}
- [Divisions and source records](${ORIGIN}/ask): \`/doc/division-{division-key}\` for votes; \`/doc/{resource-slug}\` for speeches and other source records.
- [Grant programs and organisation recipients](${ORIGIN}/money/grants): Programs use \`/money/grants?jur={federal|qld}&program={encoded-program-id}\`; recipients use \`/money/grants/{federal|qld}/recipient/{encoded-recipient-id}\`; a particular award adds \`?award={award-id}\`.
- [Donors](${ORIGIN}/subject/donor): \`/subject/donor/{encoded-name}\`.
- [Suppliers](${ORIGIN}/subject/supplier): \`/subject/supplier/{supplier-id}\`; named AusTender profiles, award values rather than expenditure.
- [Agencies](${ORIGIN}/subject/agency): \`/subject/agency/{agency-id}\`.
- [Campaigners](${ORIGIN}/subject/campaigner): \`/subject/campaigner/{encoded-name}\`.
- [Topics](${ORIGIN}/subject/topic): \`/subject/topic/{topic-slug}\`.
- [Reports](${ORIGIN}/reports): \`/reports/{report-slug}\`; source-backed investigations.
- [Sitemap index](${ORIGIN}/sitemap.xml): Canonical discovery URLs, grouped by type with record dates and counted export-date fallbacks.
`;
}

/** Metadata catalogue discovery uses source ids only, never title/person fields. */
export function instrumentCrawlEntries(manifest) {
  if (!catalogueComplete(manifest)) return [];
  const ids = Object.keys(manifest.lookup);
  if (!manifest.metadata_only || !ids.length || ids.length !== (manifest.exported ?? manifest.count) || manifest.count !== manifest.odata_count) throw new Error('Unreconciled instruments export');
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

export function auditCrawlEntries(manifest) {
  if (!auditComplete(manifest)) return [];
  const lastmod = exportDate(manifest.generated_at);
  if (!lastmod) throw new Error('Invalid audit export date');
  return Object.keys(manifest.lookup).map(id => ({path: `/audit/${id}`, lastmod}));
}

export function addAuditDiscovery(groups, manifest) {
  if (!auditComplete(manifest)) return;
  groups.audit = auditCrawlEntries(manifest);
  groups.static.push({path:'/audit', lastmod:exportDate(manifest.generated_at)});
}

export async function buildCrawl(root) {
  const read = async p => JSON.parse(await readFile(join(root,p.replace(/^\//,'')), 'utf8'));
  const optional = async p => { try { return await read(p); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
  const [roster, seatManifest, bills, suppliers, agencies, reports, corpus, votes, campaigners] = await Promise.all([
    read('parliamentarians.json'), read('electorates/manifest.json'), read('bills/index.json'), read('suppliers.json'), read('agencies.json'), read('reports/index.json'), read('corpus.json'), read('votes.json'), optional('graph/campaigners.json')
  ]);
  const [seats, seatPeople] = await Promise.all([read(seatManifest.index_url), read(seatManifest.people_url)]);
  const people = [...roster.people];
  const known = new Set(people.flatMap(p => [p.name,...splitSpeakers(p)].map(personNameKey)));
  for (const p of seatPeople.people) {
    if ([p.name,...p.aliases].some(n => known.has(personNameKey(n)))) continue;
    const current = p.electorates.filter(e => e.current);
    if (!current.length) continue;
    people.push({name:p.name,pid:p.legacy_person_id || p.person_id,speeches:0,party:current[0].party || null,states:[...new Set(current.map(e=>e.jurisdiction))],chambers:[...new Set(current.map(e=>e.chamber))],first:null,last:null,rosterOnly:{asOf:current[0].as_of,seats:current.map(e=>e.name)}});
    known.add(personNameKey(p.name));
  }
  const identity = personIndex(people);
  const personPaths = { exact: Object.fromEntries([...identity.byName].map(([name,p])=>[name,`/subject/person/${identity.slugOf.get(p.name)}`])), folded: Object.fromEntries([...identity.byFold].map(([name,p])=>[name,`/subject/person/${identity.slugOf.get(p.name)}`])) };
  await writeFile(join(root,'person-paths.js'), '// Generated from the roster and reviewed aliases by build:crawl.\nexport const PERSON_PATHS = '+JSON.stringify(personPaths)+';\n');
  const groups = Object.fromEntries(['people','parties','electorates','bills','divisions','grant-programs','grant-recipients','topics-reports','static','suppliers','donors','campaigners','agencies'].map(t=>[t,[]]));
  const fallbacks=Object.fromEntries(Object.keys(groups).map(type=>[type,0]));
  const fallbackPaths=new Set();
  const add = (type,path,date,priority,fallback) => {
    if (!path || path.split('/').some(s => /^(null|undefined)$/i.test(decodeURIComponent(s)))) return;
    let lastmod = exportDate(date);
    if(!lastmod) { lastmod=exportDate(fallback); if(!fallbackPaths.has(path)) { fallbacks[type]=(fallbacks[type] || 0)+1; fallbackPaths.add(path); } }
    if (!lastmod) throw new Error(`Missing record/export date: ${type} ${path}`);
    groups[type].push({path,lastmod,...(priority != null ? {priority} : {})});
  };
  const snapshot = new Map();
  const instruments = await optional('instruments/manifest.json').catch(() => null);
  addInstrumentDiscovery(groups, instruments);
  if(groups.instruments) {
    const dates=new Map();
    for(const chunk of instruments.chunks) {
      const data=await read(chunk.path);
      for(const raw of data.records) {
        const r=unpack(raw,instruments.schemas,instruments.strings).source;
        dates.set(r.id,latestDate([r.asMadeRegisteredAt,...(r.versions || []).map(v=>v.registeredAt),...(r.statusHistory || []).map(v=>v.start),...(r.nameHistory || []).map(v=>v.start)],instruments.generated_at));
      }
    }
    fallbacks.instruments=0;
    for(const entry of groups.instruments) {
      const date=dates.get(entry.path.split('/').at(-1));
      if(date) entry.lastmod=date; else fallbacks.instruments++;
    }
    fallbacks.static++; // the instrument directory uses its export snapshot
  }
  const audit = await optional('audit/manifest.json');
  addAuditDiscovery(groups, audit);
  if(groups.audit) { fallbacks.audit=groups.audit.length; fallbacks.static++; } // audit pages use the export snapshot until per-report tabled dates are read
  const slugs = slugIndex(people).slugOf;
  const peopleDate = [roster.meta.generated,roster.meta.representation?.updated,seatManifest.generated].filter(Boolean).sort().at(-1);
  const recent=await optional('seo/recent-votes.json');
  for (const p of people) {
    if (!validId(p.name) || p.name.length > 120) continue;
    const path = `/subject/person/${slugs.get(p.name) || personSlug(p.name)}`;
    const interest = p.pid ? await optional(`interests/${p.pid}.json`) : null;
    const record=votes[p.pid];
    add('people',path,latestDate([p.last_changed_at,p.updated_at,p.last_speech_date,interest?.as_at,...Object.values(interest?.buckets || {}).flatMap(b=>b.items?.map(i=>i.date) || []),...(record?.for || []).map(v=>v.date),...(record?.against || []).map(v=>v.date),...(recent?.people?.[p.pid]?.recent || []).map(v=>v.date),p.rosterOnly?.asOf],peopleDate),undefined,peopleDate);
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
  for (const p of partyLabels.values()) if (p.label.length <= 120) add('parties',`/subject/party/${personSlug(p.label)}`,null,undefined,p.date);
  for (const p of donors.values()) if (p.label.length <= 120) add('donors',`/subject/donor/${encodeURIComponent(p.label)}`,null,undefined,p.date);
  for (const s of seats.electorates) add('electorates',s.url,latestDate([s.updated_at,s.representation_as_of,s.latest_election,s.abolished,s.established],seatManifest.generated),undefined,seatManifest.generated);
  const divisions = new Map();
  for (const row of bills.bills) {
    if (!validId(row.key)) continue;
    const bill = await read(`bills/${row.key}.json`);
    const path = `/bill/${encodeURIComponent(row.key)}`;
    add('bills',path,billLastmod(bill,bills.generated_at),undefined,bills.generated_at);
    snapshot.set(path,hash(bill));
    for (const d of bill.divisions || []) if (validId(d.key)) divisions.set(d.key,d);
  }
  // The division export is authoritative and includes votes unrelated to bills.
  const indexnowDivisions=new Map(divisions);
  const divisionIndex=await read('divisions/index.json');
  for(const row of divisionIndex.divisions) {
    const d=await read(`divisions/${row.slug || `division-${row.key}`}.json`);
    divisions.set(d.key,d);
  }
  for (const [key,d] of divisions) {
    const path = `/doc/${encodeURIComponent(key.startsWith('division-') ? key : `division-${key}`)}`;
    add('divisions',path,latestDate([d.updated_at,d.date],bills.generated_at),undefined,bills.generated_at);
    if(indexnowDivisions.has(key)) snapshot.set(path,hash(indexnowDivisions.get(key)));
  }
  const grants = {};
  for (const jur of ['federal','qld']) {
    const data = grants[jur] = await read(`graph/grants.${jur}.json`);
    const recipientRecords=new Map();
    const shards=[...new Set(data.recipients.map(r=>r.sh))];
    for(const sh of shards) {
      const shard=await read(`grants/${jur}/shard-${String(sh).padStart(2,'0')}.json`);
      for(const r of Object.values(shard)) recipientRecords.set(r.id,r);
    }
    for (const r of data.recipients) {
      if (!validId(r.id) || ['individual','person','undisclosed'].includes(r.k)) continue;
      add('grant-recipients',`/money/grants/${jur}/recipient/${encodeURIComponent(r.id)}`,latestDate((recipientRecords.get(r.id)?.grants || []).flatMap(g=>[g.published,g.updated_at,g.s]),data.meta.generated),undefined,data.meta.generated);
    }
    for (const p of data.programs || []) {
      if (!validId(p.id)) continue;
      // Only indexed programs with an actual exported profile get discovery URLs.
      const profile=await read(`grants/${jur}/programs/${p.key || fileKey(p.id).replace(/^x-/, '')}.json`);
      add('grant-programs','/money/grants?' + new URLSearchParams({jur,program:p.id}),latestDate((profile.grants || []).flatMap(g=>[g.published,g.updated_at,g.s]),data.meta.generated),undefined,data.meta.generated);
    }
  }
  const supplierShards=new Map();
  for (const s of suppliers.suppliers) if (validId(s.id) && validId(s.name) && s.profile_path) {
    if(!supplierShards.has(s.profile_path)) supplierShards.set(s.profile_path,await read(s.profile_path));
    const profile=supplierShards.get(s.profile_path).profiles[s.id];
    add('suppliers',`/subject/supplier/${encodeURIComponent(s.id)}`,latestDate([profile.updated_at,...(profile.contracts || []).flatMap(c=>[c.published,c.start_date])],suppliers.meta.generated_at),0.2,suppliers.meta.generated_at);
  }
  for (const a of agencies.agencies) if (validId(a.id)) {
    const profile=await read(a.profile_path);
    add('agencies',`/subject/agency/${encodeURIComponent(a.id)}`,latestDate([profile.updated_at,...(profile.contracts || []).flatMap(c=>[c.published,c.start_date])],agencies.meta.generated_at),undefined,agencies.meta.generated_at);
  }
  const campaignerNames = new Map();
  for (const c of campaigners?.entities || []) if (validId(c.name) && c.name.length <= 200) {
    const previous = campaignerNames.get(fold(c.name));
    if (!previous || (c.years?.length || 0) > (previous.years?.length || 0)) campaignerNames.set(fold(c.name),c);
  }
  for (const c of campaignerNames.values()) add('campaigners',`/subject/campaigner/${encodeURIComponent(c.name)}`,latestDate([c.updated_at,c.filed_at],campaigners.meta.generated),undefined,campaigners.meta.generated);
  for (const r of reports.reports) add('topics-reports',`/reports/${r.slug}`,r.updated,undefined,r.generated_at || corpus.version);
  for (const slug of Object.keys(TOPIC_NAMES)) add('topics-reports',`/subject/topic/${slug}`,null,undefined,corpus.version);
  for (const path of ['/','/ask','/money','/money/receipts','/money/grants','/bills','/connections','/map','/reports','/explore','/discover','/about','/methods','/stats','/declared','/expenses','/privacy','/support','/subject/topic',...['person','party','donor','campaigner','supplier','agency','electorate'].map(d=>`/subject/${d}`)]) add('static',path,null,undefined,corpus.version);
  const result = sitemapFiles(groups);
  const out = join(root,'crawl');
  await rm(out,{recursive:true,force:true});
  await mkdir(join(out,'sitemaps'),{recursive:true});
  await writeFile(join(out,'sitemap.xml'),result.index);
  for (const f of result.files) await writeFile(join(out,f.path.slice(1)),f.body);
  await writeFile(join(out,'llms.txt'),llmsText(corpus,grants,instruments,audit));
  const entries = [...snapshot].sort(([a],[b])=>a.localeCompare(b,'en'));
  await writeFile(join(out,'indexnow.json'),JSON.stringify({entries}));
  await writeFile(join(out,'manifest.json'),JSON.stringify({counts:result.counts,lastmodFallbacks:fallbacks,files:result.files.map(({body,...f})=>f)},null,2)+'\n');
  return result.counts;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const counts = await buildCrawl(fileURLToPath(new URL('../portal/public/',import.meta.url)));
  console.log('Crawl sitemap counts:',JSON.stringify(counts));
}
