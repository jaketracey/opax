import { personUrl, partyUrl } from '../public/canonical-urls.js'
import {sponsorPerson} from '../public/sponsor-person.js'
import {renderDivisionMarkdown, divisionPlain, billNoteRepair, billStripTitle, billStripStage} from '../public/division-markdown.js'
/** Crawlable answers from the same static projections the application reads.
 * All lists are bounded; source strings and URLs cross one escaping boundary. */
export type ReadAsset = <T>(path: string) => Promise<T>
export interface RenderedContent { html: string; description?: string; prev?: string; next?: string; page?: number }
interface Person {
  name: string; full?: string; pid?: string; party?: string | null; party_now?: string | null;
  current?: boolean; states: string[]; chambers: string[]; speeches?: number | null;
  speech_scope?: unknown;
  representation?: { electorate: string; jurisdiction: string; chamber: string }[];
}
interface Seat { slug: string; name: string; url: string; jurisdiction: string; chamber: string }
interface Bill {
  key: string; title: string; short_title?: string; status?: string; status_as_of?: string;
  sponsor?: string; sponsor_person_id?: string; sponsor_party?: string; portfolio?: string; introduced?: string;
  sources?: { kind: string; url: string }[]; key_dates?: { stage: string; date: string; house: string; url: string }[];
  divisions?: Division[];
  summary?: { attribution?: string; sentences?: string[]; changes?: string[]; affected?: string; as_of?: string };
}
export interface Division {
  key: string; slug?: string; name?: string; question?: string; date?: string; house?: string;
  jurisdiction?: string; ayes?: number; noes?: number; result?: string; outcome?: string;
  source_url?: string; url?: string; stage?: string;
  members?: { name: string; person_id?: string; person_slug?: string; party?: string; vote: string }[];
  bills?: { key: string; title: string; url?: string }[];
}
interface Vote { question?: string; name?: string; title?: string; stage?: string; date?: string; vote?: string; division_slug?: string; source_url?: string }
interface Votes { name: string; jurisdiction: string; for?: Vote[]; against?: Vote[] }
interface RecentVotes { _meta: { schema: number; source: string; coverage: string }; people: Record<string, { name: string; jurisdiction: string; recent: Vote[] }> }
interface Interest {
  source_url?: string; total: number; as_at?: string; ocr_rows?: number; unread_pages?: number;
  buckets: Record<string, { count: number; items: { description: string; holder?: string; page?: number }[] }>;
}
interface MoneyNode { id: string; label: string; kind: string; industry?: string; total: number }
interface MoneyGraph { meta: { sourceShort?: string; source?: string; coverage?: string; source_url?: string }; nodes: MoneyNode[]; edges: { source: string; target: string; total: number; grant?: boolean; flow?: string }[] }
const PAGE_SIZE = 50
export const escapeHtml = (value: unknown): string => String(value ?? '').slice(0,5000).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const fold = (s: string) => s.normalize('NFKC').replace(/[‘’ʼ`]/g, "'").replace(/\s+/g,' ').trim().toLowerCase()
const human = (s: string) => s.replace(/_/g,' ')
const count = (n: number) => n.toLocaleString('en-AU')
const currency = (n: number) => new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(n)
const chamber = (s = '') => ({senate:'Senate',representatives:'House of Representatives',nsw_la:'NSW Legislative Assembly',nsw_lc:'NSW Legislative Council',vic_la:'Victorian Legislative Assembly',vic_lc:'Victorian Legislative Council',qld_la:'Queensland Legislative Assembly'}[s] || human(s))
export function safeHref(value: string): string | null {
  if(value.length>2048) return null
  if (/^\/(?!\/)/.test(value)) return value
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : null } catch { return null }
}
const link = (href: string, label: string, rel = '') => {
  const safe = safeHref(href)
  return safe ? `<a href="${escapeHtml(safe)}"${rel ? ` rel="${rel}"` : ''}>${escapeHtml(label)}</a>` : escapeHtml(label)
}
const original = (url?: string) => url && safeHref(url) ? `<p>${link(url,'View original','noopener noreferrer')}</p>` : ''
export function answerBlock(title: string, description: string, kicker: string, body = ''): string {
  return `<section id="prerender" class="wrap"><p class="kicker">${escapeHtml(kicker)}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p>${body}</section>`
}
export function partyLine(p: Person): string {
  // Preserve the roster's tri-state: false is former; missing is not evidence of retirement.
  const party = p.party_now || p.party
  if (!party) return 'Party not recorded'
  if (p.current === false) return `Formerly ${party}`
  const former = p.party_now && p.party && fold(p.party_now) !== fold(p.party) ? `; formerly ${p.party}` : ''
  return `${party}${former}${p.current === undefined ? ' (recorded affiliation)' : ''}`
}
const personHref = (p: Person, slugs: Map<string,string>) => `/subject/person/${slugs.get(p.name) || personUrl(p.name).split('/').at(-1)}`
function paginate(url: URL, rows: { href: string; label: string; detail?: string }[], title: string, description: string): RenderedContent {
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const requested = Number(url.searchParams.get('page') || 1)
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested,pageCount) : 1
  const href = (n: number) => { const next = new URL(url); next.searchParams.set('page', String(n)); return next.pathname + next.search }
  const prev = page > 1 ? href(page - 1) : undefined, next = page < pageCount ? href(page + 1) : undefined
  const body = `<p>${count(rows.length)} entries. Page ${page} of ${pageCount}.</p><ul>${rows.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE).map(r => `<li>${link(r.href,r.label)}${r.detail ? ` — ${escapeHtml(r.detail)}` : ''}</li>`).join('')}</ul>` +
    `<nav aria-label="Directory pages">${prev ? link(prev,'Previous page','prev') : ''}${prev && next ? ' · ' : ''}${next ? link(next,'Next page','next') : ''}</nav>`
  return { html: answerBlock(title,description,'Directory',body), prev, next, page }
}
const optional = async <T>(read: ReadAsset, path: string): Promise<T | null> => read<T>(path).catch(() => null)

export async function renderPersonAnswer(p: Person, read: ReadAsset, slugs: Map<string,string>, profileUrl?: string): Promise<RenderedContent> {
  const [voteData, interests, seats, bills, sponsored, recentData] = await Promise.all([
    optional<Record<string, Votes | Record<string,string[]>>>(read,'/votes.json'),
    optional<{people: Record<string,unknown>; _by_name: Record<string,string>}>(read,'/interests/index.json'),
    optional<{index_url: string}>(read,'/electorates/manifest.json').then(m => m ? optional<{electorates: Seat[]}>(read,m.index_url) : null),
    optional<{bills: Bill[]}>(read,'/bills/index.json'),
    optional<{sponsored: Record<string,string[]>}>(read,'/seo-links.json'),
    optional<RecentVotes>(read,'/seo/recent-votes.json'),
  ])
  const display = p.full && p.speech_scope ? p.full : p.name
  const description = `${display}. ${partyLine(p)}. ${(p.representation || []).map(r=>`${r.electorate}, ${chamber(r.chamber)}`).join('; ') || p.chambers.map(chamber).join(', ')}.`
  let body = '<h2>Party and representation</h2><ul>'
  const party = p.party_now || p.party
  body += `<li>${party ? link(partyUrl(party),partyLine(p)) : 'Party not recorded'}</li>`
  for (const r of p.representation || []) {
    const seat = seats?.electorates.find(e=>fold(e.name)===fold(r.electorate) && e.jurisdiction===r.jurisdiction && e.chamber===r.chamber)
    body += `<li>${seat ? link(seat.url,r.electorate) : escapeHtml(r.electorate)} — ${escapeHtml(chamber(r.chamber))}, ${escapeHtml(r.jurisdiction)}</li>`
  }
  body += `</ul>${original(profileUrl)}<p>${link('/parliamentarians.json','Parliamentarian data export')}. Recorded representation can include historical seats; affiliation with no current-roster flag is not verified as current or former.</p>`
  if (!p.speech_scope) {
    const names = voteData?._names as Record<string,string[]> | undefined
    const keys = [...new Set([p.pid,...(names?.[fold(p.name)] || [])].filter((k): k is string => !!k))]
    const records = keys.map(k=>voteData?.[k] as Votes | undefined).filter((r): r is Votes => !!r?.name)
    const recent = recentData?._meta?.schema===1 && recentData._meta.source==='opax-parli-db' && recentData._meta.coverage==='recorded'
      ? keys.flatMap(k=> { const r=recentData.people?.[k]; return r && fold(r.name)===fold(p.name) && Array.isArray(r.recent) ? r.recent : [] }) : []
    const hasRecent = recent.length>0
    const votes = (hasRecent ? recent : records.flatMap(r=>[...(r.for || []).map(v=>({...v,vote:'For the bill'})),...(r.against || []).map(v=>({...v,vote:'Against the bill'}))]))
      .sort((a,b)=>String(b.date || '').localeCompare(String(a.date || ''))).slice(0,10)
    if (votes.length) {
      body += `<h2>${hasRecent ? (votes.length===10 ? 'Last 10 recorded votes' : 'Recorded votes') : 'Latest exported bill votes'}</h2>`
      body += `<ol>${votes.map(v=>`<li>${v.division_slug ? link(`/doc/${v.division_slug}`,divisionPlain(v.title || v.name || 'Division')) : link(v.source_url || `/ask?view=search&q=${encodeURIComponent(v.name || v.title || '')}`,divisionPlain(v.name || v.title || 'Division'))} — ${escapeHtml(v.date)}, ${escapeHtml(v.stage || '')}: ${escapeHtml(v.vote)}${v.question ? `<div class="division-markdown">${renderDivisionMarkdown(v.question)}</div>` : ''}${original(v.source_url)}</li>`).join('')}</ol>`
      body += `<p>Source: ${hasRecent ? link('/seo/recent-votes.json','OPAX recorded-vote export') : `${link('/votes.json','OPAX bill-vote export')} (They Vote For You and state Hansard)`}.</p>`
    }
    const id = p.pid && interests?.people[p.pid] ? p.pid : interests?._by_name[fold(p.name)]
    const register = id && /^[\w-]+$/.test(id) ? await optional<Interest>(read,`/interests/${id}.json`) : null
    body += '<h2>Declared interests</h2>'
    if (register) {
      body += `<p>${count(register.total)} recorded entries${register.as_at ? ` in the latest register snapshot, as at ${escapeHtml(register.as_at)}` : ''}.</p><ul>`
      for (const [name,bucket] of Object.entries(register.buckets).slice(0,20)) body += `<li>${escapeHtml(human(name))}: ${count(bucket.count)}<ul>${bucket.items.slice(0,3).map(i=>`<li>${escapeHtml(i.description)}${i.holder ? ` (${escapeHtml(i.holder)})` : ''}${i.page ? `, source page ${escapeHtml(i.page)}` : ''}</li>`).join('')}</ul></li>`
      body += `</ul>${original(register.source_url)}`
      if (register.ocr_rows || register.unread_pages) body += `<p>Some entries use OCR. ${register.unread_pages || 0} unread source pages; check the original register.</p>`
    } else body += '<p>No register of interests in this export.</p>'
  }
  body += '<h2>Donors to their party</h2><p>Donations to a party are not personal donations to this member. An association does not prove influence.</p>'
  if (party) for (const [path,source] of [['/graph/money.json','AEC'],['/graph/money.qld.json','ECQ'],['/graph/money.vic.json','VEC']]) {
    const graph = await optional<MoneyGraph>(read,path)
    const node = graph?.nodes.find(n=>n.kind==='party' && fold(n.label)===fold(party))
    if (!graph || !node) continue
    const donors = new Map(graph.nodes.filter(n=>n.kind==='donor').map(n=>[n.id,n]))
    const flows = graph.edges.filter(e=>e.target===node.id && !e.grant && !e.flow && donors.has(e.source))
    const individuals = new Set(flows.filter(e=>donors.get(e.source)?.industry==='individual').map(e=>e.source)).size
    // Unknown/other classifications do not establish that an entity is an organisation.
    const organisations = flows.filter(e=>!['individual','individuals','other','unknown',''].includes(donors.get(e.source)?.industry || '')).sort((a,b)=>b.total-a.total).slice(0,10)
    body += `<h3>${escapeHtml(source)} disclosed receipts</h3><p>${individuals} individual donors in this export. ${escapeHtml(graph.meta.coverage || '')}</p><ul>${organisations.map(e=>`<li>${link(`/subject/donor/${encodeURIComponent(donors.get(e.source)!.label)}`,donors.get(e.source)!.label)} — ${currency(e.total)}</li>`).join('')}</ul>`
    body += `<p>Source: ${escapeHtml(graph.meta.sourceShort || graph.meta.source || source)}. Federal and state returns are shown separately and never summed.</p>${original(graph.meta.source_url || (source==='AEC' ? 'https://transparency.aec.gov.au/' : source==='ECQ' ? 'https://disclosures.ecq.qld.gov.au/' : 'https://disclosures.vec.vic.gov.au/'))}`
  }
  const owned = sponsored?.sponsored[p.pid || p.name] || []
  body += `<h2>Bills sponsored</h2>${owned.length ? `<ul>${owned.slice(0,30).map(key=>`<li>${link(`/bill/${key}`,bills?.bills.find(b=>b.key===key)?.title || key)}</li>`).join('')}</ul>` : '<p>No sponsored bills recorded in this export.</p>'}`
  return {html:answerBlock(display,description,'Parliamentarian',body),description}
}

/** The roster row a bill's printed sponsor opens: public/sponsor-person.js, never a surname print. */
export function sponsorFor(b: Bill, people: Person[]): Person | null {
  return b.sponsor ? sponsorPerson(b.sponsor, b.sponsor_person_id, people) : null
}
export function renderBillAnswer(b: Bill, people: Person[], slugs: Map<string,string>, related: Bill[] = []): RenderedContent {
  const title = b.short_title || b.title
  const sponsor = sponsorFor(b,people)
  const party = b.sponsor_party || sponsor?.party
  const stageLabel = (stage: string) => ({introduced:'Introduced',second_reading:'Second reading',third_reading:'Third reading',passed_one_house:'Passed one house',passed_both:'Passed both houses',assented:'Assented',withdrawn:'Withdrawn',lapsed:'Lapsed'}[stage] || human(stage))
  const description = `${human(b.status || 'Status not recorded')}${b.status_as_of ? `, as at ${b.status_as_of}` : ''}. ${b.portfolio ? `${b.portfolio} portfolio.` : ''}`
  let body = `<dl><dt>Sponsor</dt><dd>${sponsor ? link(personHref(sponsor,slugs),sponsor.name) : escapeHtml(b.sponsor || 'Not recorded')}</dd>${party ? `<dt>Sponsor's recorded party</dt><dd>${link(partyUrl(party),party)}</dd>` : ''}<dt>Portfolio</dt><dd>${escapeHtml(b.portfolio || 'Not recorded')}</dd></dl>`
  if (b.key_dates?.length) body += `<h2>Recorded stages</h2><ul>${b.key_dates.map(d=>`<li>${escapeHtml(stageLabel(d.stage))} — ${escapeHtml(d.date)} (${escapeHtml(chamber(d.house))})${original(d.url)}</li>`).join('')}</ul>`
  body += '<h2>Divisions</h2>'
  const divisions = b.divisions || []
  body += divisions.length ? `<ul>${divisions.map(d=>`<li>${link(`/doc/${d.key.startsWith('division-') ? d.key : `division-${d.key}`}`,d.stage || 'Division')}<div class="division-markdown">${renderDivisionMarkdown(billStripStage(billStripTitle(billNoteRepair(d.question),b),d.stage))}</div> — ${escapeHtml(d.date)}, ${escapeHtml(chamber(d.house))}: ${escapeHtml(d.outcome || 'Result not recorded')}, ayes ${escapeHtml(d.ayes ?? 'not recorded')}, noes ${escapeHtml(d.noes ?? 'not recorded')}${original(d.source_url || d.url)}${divisionVotes(d,people,slugs)}</li>`).join('')}</ul>` : '<p>No divisions recorded. Most questions are decided on the voices; this does not establish that a bill was unopposed.</p>'
  if (b.summary) body += `<h2>Plain-language summary</h2><p>${escapeHtml(b.summary.attribution || 'Written by a model; not the record')}${b.summary.as_of ? `, as at ${escapeHtml(b.summary.as_of)}` : ', date not recorded'}.</p>${(b.summary.sentences || []).slice(0,10).map(s=>`<p>${escapeHtml(s)}</p>`).join('')}<ul>${(b.summary.changes || []).slice(0,10).map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ul>${b.summary.affected ? `<p>${escapeHtml(b.summary.affected)}</p>` : ''}`
  else body += '<h2>Plain-language summary</h2><p>No machine-written summary in this export.</p>'
  const sameSponsor = related.filter(r=>r.key!==b.key && !!b.sponsor && fold(r.sponsor || '')===fold(b.sponsor)).slice(0,20)
  const samePortfolio = related.filter(r=>r.key!==b.key && !!b.portfolio && fold(r.portfolio || '')===fold(b.portfolio)).slice(0,20)
  for(const [label,rows] of [['Other bills from this sponsor',sameSponsor],['Other bills in this portfolio',samePortfolio]] as const) {
    body += `<h2>${label}</h2>${rows.length ? `<ul>${rows.map(r=>`<li>${link(`/bill/${r.key}`,r.short_title || r.title)} — introduced ${escapeHtml(r.introduced || 'date not recorded')}, ${escapeHtml(human(r.status || 'status not recorded'))}</li>`).join('')}</ul>` : '<p>No other bills with this recorded field in the export.</p>'}`
  }
  body += `<p>Stage dates describe the parliamentary progress recorded by the source. They do not establish when provisions commence. A bill before parliament is a proposal; its text can change before passage. Division totals describe the recorded question on that date. A procedural division does not necessarily establish support for every provision of a bill. Check the official bill text and explanatory memorandum for the wording.</p><p>${link(`/bills/${b.key}.json`,'Bill data export')} · ${link('/bills','Browse bills')} · ${link('/ask','Ask about the parliamentary record')} · ${link('/methods','Sources and methods')}</p>`
  body += `<h2>Sources</h2>${(b.sources || []).map(s=>`<p>${escapeHtml(human(s.kind))}</p>${original(s.url)}`).join('')}`
  return {html:answerBlock(title,description,'Bill',body)}
}
function divisionVotes(d: Division, people: Person[], slugs: Map<string,string>): string {
  const members = d.members || []
  if (!members.length) return '<p>Per-member votes and party tallies are not present in this export. Consult the original division record.</p>'
  const parties = [...new Set(members.filter(m=>m.party).map(m=>m.party!))]
  const ayes=members.filter(m=>m.vote==='aye').length, noes=members.filter(m=>m.vote==='no').length
  let html = `<h3>How each party voted</h3><p>Party labels are those recorded for this division, rather than current affiliations.${ayes!==d.ayes || noes!==d.noes ? ` The member list is partial: ${ayes} recorded ayes and ${noes} recorded noes; the official tally above remains the source total.` : ''}</p>`
  html += parties.length ? `<ul>${parties.map(party=>{const rows=members.filter(m=>m.party===party);const sides=[...new Set(rows.map(m=>m.vote))];return `<li>${link(partyUrl(party),party)}: ${sides.map(side=>`${human(side)} ${rows.filter(m=>m.vote===side).length}`).join(', ')}</li>`}).join('')}</ul>` : '<p>Party affiliation on the division date is not recorded in the member export.</p>'
  if(members.some(m=>!m.party)) html+=`<p>Party affiliation is not recorded for ${members.filter(m=>!m.party).length} members in this export.</p>`
  for(const side of [...new Set(members.map(m=>m.vote))]) {
    html += `<h3>${side==='aye' ? 'Ayes' : side==='no' ? 'Noes' : human(side)}</h3><ul>${members.filter(m=>m.vote===side).map(m=>{const p=people.find(p=>m.person_id && p.pid===m.person_id?.replace(/^tvfy_/, '')) || people.find(p=>fold(p.name)===fold(m.name));return `<li>${link(p ? personHref(p,slugs) : personUrl(m.name),m.name)}${m.party ? ` (${escapeHtml(m.party)})` : ''} — ${escapeHtml(side)}</li>`}).join('')}</ul>`
  }
  return html
}

export function renderDivisionAnswer(d: Division, people: Person[], slugs: Map<string,string>): RenderedContent {
  const title = divisionPlain(d.name || d.question || 'Parliamentary division').split(/(?<=[.!?])\s/)[0]
  const description = `${chamber(d.house)}, ${d.date || 'Date not recorded'}. ${d.result || d.outcome || 'Result not recorded'}: ayes ${d.ayes ?? 'not recorded'}, noes ${d.noes ?? 'not recorded'}.`
  let body = `<h2>Question</h2><div class="division-markdown">${renderDivisionMarkdown(d.question || d.name || 'Question not recorded')}</div>${original(d.source_url || d.url)}<h2>How each member voted</h2>`
  body += divisionVotes(d,people,slugs)
  body += `<h2>Related bills</h2><ul>${(d.bills || []).map(b=>`<li>${link(`/bill/${b.key}`,b.title)}</li>`).join('')}</ul><p>Only formal divisions leave a per-member record. A procedural vote is not necessarily a vote for or against a bill.</p>`
  return {html:answerBlock(title,description,'Division',body),description}
}

export async function renderDirectory(dir: string, url: URL, read: ReadAsset, people: Person[], slugs: Map<string,string>, topics: Record<string,string>): Promise<RenderedContent | null> {
  if (dir==='person') return paginate(url,people.map(p=>({href:personHref(p,slugs),label:p.name,detail:partyLine(p)})),'Parliamentarians','Parliamentarians in the exported parliamentary record, with speeches, votes and declared interests.')
  if (dir==='topic') return paginate(url,Object.entries(topics).map(([slug,name])=>({href:`/subject/topic/${slug}`,label:name})),'Topics','Browse topics in the parliamentary record.')
  if (dir==='electorate') {
    const manifest = await read<{index_url: string}>('/electorates/manifest.json')
    const data = await read<{electorates:Seat[]}>(manifest.index_url)
    return paginate(url,data.electorates.map(e=>({href:e.url,label:e.name,detail:`${e.jurisdiction}, ${chamber(e.chamber)}`})),'Electorates','Electorates, recorded representation and dated sources.')
  }
  if (dir==='bills') {
    const data = await read<{bills:Bill[]}>('/bills/index.json')
    return paginate(url,data.bills.map(b=>({href:`/bill/${b.key}`,label:b.short_title || b.title,detail:human(b.status || '')})),'Bills','Australian parliamentary bills: recorded stages, sponsors, divisions and machine-written summaries where available.')
  }
  if (dir==='grants') {
    const jurisdictions = url.searchParams.get('jur') === 'qld' ? ['qld'] : url.searchParams.get('jur') === 'federal' ? ['federal'] : ['federal','qld']
    const rows = (await Promise.all(jurisdictions.map(async jur=>{
      const data = await read<{recipients:{id:string;n:string;t:number;c:number}[]}>(`/graph/grants.${jur}.json`)
      return data.recipients.filter(r=>r.id && !r.id.startsWith('person:')).map(r=>({href:`/money/grants/${jur}/recipient/${encodeURIComponent(r.id)}`,label:r.n,detail:`${jur}, ${count(r.c)} awards, ${currency(r.t)} awarded value`}))
    }))).flat()
    return paginate(url,rows,'Grant recipients','Published grants by recipient. Awarded values are commitments, not payments. Source: GrantConnect and Queensland published grant records.')
  }
  if (dir==='party' || dir==='donor') {
    const graphs = await Promise.all(['/graph/money.json','/graph/money.qld.json','/graph/money.vic.json'].map(path=>read<MoneyGraph>(path)))
    const rows = new Map<string,{href:string;label:string}>()
    for (const graph of graphs) for (const n of graph.nodes) if (n.kind===dir && (dir==='party' || !['individual','individuals','other','unknown',''].includes(n.industry || ''))) rows.set(fold(n.label),{href:dir==='party' ? partyUrl(n.label) : `/subject/donor/${encodeURIComponent(n.label)}`,label:n.label})
    return paginate(url,[...rows.values()],dir==='party' ? 'Parties' : 'Organisational donors','Published political receipts from AEC, ECQ and VEC; federal and state returns remain separate.')
  }
  const sources: Record<string,[string,string,string]> = {supplier:['/suppliers.json','suppliers','Government suppliers'],agency:['/agencies.json','agencies','Government agencies'],campaigner:['/graph/campaigners.json','entities','Campaigners']}
  const source = sources[dir]
  if (source) {
    const data = await read<Record<string,{id?:string;name:string}[]>>(source[0])
    return paginate(url,(data[source[1]] || []).map(n=>({href:`/subject/${dir}/${encodeURIComponent(n.id || n.name)}`,label:n.name})),source[2],'Entries from the published data exports, with original sources on each profile.')
  }
  return null
}

interface Contract { id: string; title?: string; description?: string; agency?: string; amount: number; start_date?: string; published?: string; url?: string; link_scope?: string }
interface SupplierProfile { id: string; name: string; total: number; count: number; agencies: {name:string;total:number;count:number}[]; contracts: Contract[] }
interface AgencyProfile { id: string; name: string; profile_path: string }
export async function renderSupplierAnswer(id: string, read: ReadAsset): Promise<RenderedContent | null> {
  const [index,agencies] = await Promise.all([
    read<{meta:{generated_at:string;source:string};suppliers:{id:string;profile_path:string}[]}>('/suppliers.json'),
    read<{agencies:AgencyProfile[]}>('/agencies.json'),
  ])
  const row=index.suppliers.find(s=>s.id===id)
  if(!row) return null
  const profile=(await read<{profiles:Record<string,SupplierProfile>}>(row.profile_path)).profiles[id]
  if(!profile) return null
  const description=`${profile.name}: ${currency(profile.total)} in recorded Commonwealth contract awards across ${count(profile.count)} contracts and ${profile.agencies.length} agencies.`
  let body=`<p>Exported ${escapeHtml(index.meta.generated_at.slice(0,10))}. Source: ${escapeHtml(index.meta.source)}. Award values are not expenditure. One contract is counted at its latest recorded notice value; amendments are not added together. Coverage is limited to the available notices.</p><h2>Agencies contracted</h2><ul>`
  const matches=profile.agencies.map(a=>({a,record:agencies.agencies.find(r=>r.name===a.name)}))
  body+=matches.map(({a,record})=>`<li>${record ? link(`/subject/agency/${record.id}`,a.name) : escapeHtml(a.name)} — ${count(a.count)} contracts, ${currency(a.total)}</li>`).join('')+'</ul><h2>Largest recorded contracts</h2><ol>'
  body+=[...profile.contracts].sort((a,b)=>b.amount-a.amount).slice(0,10).map(c=>{
    const agency=agencies.agencies.find(a=>a.name===c.agency)
    const notice=c.link_scope==='source_register' ? `https://www.tenders.gov.au/Search/KeywordSearch?keyword=${encodeURIComponent(c.id)}` : c.url
    return `<li>${escapeHtml(c.title || c.id)}${c.description ? ` — ${escapeHtml(c.description)}` : ''}. ${currency(c.amount)}. Start date: ${escapeHtml(c.start_date || 'Not recorded')}. Published: ${escapeHtml(c.published || 'Not recorded')}. Agency: ${agency ? link(`/subject/agency/${agency.id}`,agency.name) : escapeHtml(c.agency || 'Not recorded')}. ${notice ? link(notice,`AusTender notice ${c.id}`,'noopener noreferrer') : escapeHtml(c.id)}.</li>`
  }).join('')+'</ol><h2>Other suppliers to these agencies</h2>'
  for(const {a,record} of matches.slice(0,10)) {
    if(!record) continue
    const data=await optional<{suppliers:{id:string;name:string;total:number}[]}>(read,record.profile_path)
    const rows=(data?.suppliers || []).filter(s=>s.id!==id).sort((a,b)=>b.total-a.total).slice(0,10)
    body+=`<h3>${escapeHtml(a.name)}</h3><ul>${rows.map(s=>`<li>${link(`/subject/supplier/${s.id}`,s.name)} — ${currency(s.total)} in recorded awards from this agency</li>`).join('')}</ul>`
  }
  body+=`<p>An association does not prove influence.</p><p>${link('/subject/supplier','Browse suppliers')} · ${link('/methods','Sources and methods')}</p>`
  return {html:answerBlock(profile.name,description,'Commonwealth contracts',body),description}
}

/** No map boot state is exposed to crawlers. Totals retain separate jurisdictions. */
export async function renderMoneyAnswer(title: string, read: ReadAsset): Promise<RenderedContent> {
  let body='<p>Published political receipts, Commonwealth contracts and grant awards are separate records. Award values are not verified expenditure, and an association does not prove influence.</p>'
  for(const [path,label] of [['/graph/money.json','Federal'],['/graph/money.qld.json','Queensland'],['/graph/money.vic.json','Victoria']]) {
    const graph=await read<MoneyGraph & {meta:{generated:string}}>(path)
    const parties=graph.nodes.filter(n=>n.kind==='party')
    // Count donation edges, excluding public contracts, grants and other flow kinds.
    const ids=new Set(graph.nodes.filter(n=>n.kind==='donor').map(n=>n.id))
    const receipts=graph.edges.filter(e=>ids.has(e.source) && !e.grant && !e.flow)
    body+=`<h2>${label} disclosed receipts</h2><p>${currency(receipts.reduce((sum,e)=>sum+e.total,0))} across ${count(receipts.length)} donor-to-party aggregates in this map export. ${parties.length} parties. Export date: ${escapeHtml(graph.meta.generated)}. Coverage: ${escapeHtml(graph.meta.coverage || 'See the source export')}. Source: ${escapeHtml(graph.meta.sourceShort || graph.meta.source || label)}.</p><ul>${parties.map(p=>`<li>${link(partyUrl(p.label),p.label)}</li>`).join('')}</ul><p>${link(path,`${label} map data export`)}</p>`
  }
  const suppliers=await read<{meta:{generated_at:string;total:number;contract_count:number;source:string;published_from:string;published_to:string}}>('/suppliers.json')
  const m=suppliers.meta
  body+=`<h2>Commonwealth contracts</h2><p>${currency(m.total)} in recorded awards across ${count(m.contract_count)} contracts. Notices published ${escapeHtml(m.published_from)} to ${escapeHtml(m.published_to)}. Exported ${escapeHtml(m.generated_at.slice(0,10))}. Source: ${escapeHtml(m.source)}.</p><p>${link('/subject/supplier','Government suppliers')} · ${link('/subject/agency','Government agencies')} · ${link('/money/grants','Grant records')} · ${link('/ask','Ask about the record')} · ${link('/methods','Sources and methods')}</p>`
  return {html:answerBlock(title,'Public disclosure records, dated totals and original sources. Federal and state returns are never summed.','Public money',body)}
}
