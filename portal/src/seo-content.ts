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
  sponsor?: string; sponsor_person_id?: string; portfolio?: string; introduced?: string;
  sources?: { kind: string; url: string }[]; key_dates?: { stage: string; date: string; house: string; url: string }[];
  divisions?: Division[];
  summary?: { attribution?: string; sentences?: string[]; changes?: string[]; affected?: string; as_of?: string };
}
export interface Division {
  key: string; slug?: string; name?: string; question?: string; date?: string; house?: string;
  jurisdiction?: string; ayes?: number; noes?: number; result?: string; outcome?: string;
  source_url?: string; url?: string; stage?: string;
  members?: { name: string; person_id?: string; person_slug?: string; vote: string }[];
  bills?: { key: string; title: string; url?: string }[];
}
interface Vote { name?: string; title?: string; stage?: string; date?: string; vote?: string; division_slug?: string; source_url?: string }
interface Votes { name: string; jurisdiction: string; recent?: Vote[]; for?: Vote[]; against?: Vote[] }
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
const personHref = (p: Person, slugs: Map<string,string>) => `/subject/person/${slugs.get(p.name) || encodeURIComponent(p.name)}`
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
  const [voteData, interests, seats, bills, sponsored] = await Promise.all([
    optional<Record<string, Votes | Record<string,string[]>>>(read,'/votes.json'),
    optional<{people: Record<string,unknown>; _by_name: Record<string,string>}>(read,'/interests/index.json'),
    optional<{index_url: string}>(read,'/electorates/manifest.json').then(m => m ? optional<{electorates: Seat[]}>(read,m.index_url) : null),
    optional<{bills: Bill[]}>(read,'/bills/index.json'),
    optional<{sponsored: Record<string,string[]>}>(read,'/seo-links.json'),
  ])
  const display = p.full && p.speech_scope ? p.full : p.name
  const description = `${display}. ${partyLine(p)}. ${(p.representation || []).map(r=>`${r.electorate}, ${chamber(r.chamber)}`).join('; ') || p.chambers.map(chamber).join(', ')}.`
  let body = '<h2>Party and representation</h2><ul>'
  const party = p.party_now || p.party
  body += `<li>${party ? link(`/subject/party/${encodeURIComponent(party)}`,partyLine(p)) : 'Party not recorded'}</li>`
  for (const r of p.representation || []) {
    const seat = seats?.electorates.find(e=>fold(e.name)===fold(r.electorate) && e.jurisdiction===r.jurisdiction && e.chamber===r.chamber)
    body += `<li>${seat ? link(seat.url,r.electorate) : escapeHtml(r.electorate)} — ${escapeHtml(chamber(r.chamber))}, ${escapeHtml(r.jurisdiction)}</li>`
  }
  body += `</ul>${original(profileUrl)}<p>${link('/parliamentarians.json','Parliamentarian data export')}. Recorded representation can include historical seats; affiliation with no current-roster flag is not verified as current or former.</p>`
  if (!p.speech_scope) {
    const names = voteData?._names as Record<string,string[]> | undefined
    const keys = [...new Set([p.pid,...(names?.[fold(p.name)] || [])].filter((k): k is string => !!k))]
    const records = keys.map(k=>voteData?.[k] as Votes | undefined).filter((r): r is Votes => !!r?.name)
    const hasRecent = records.some(r=>Array.isArray(r.recent))
    const votes = records.flatMap(r=>hasRecent ? (r.recent || []) : [...(r.for || []).map(v=>({...v,vote:'For the bill'})),...(r.against || []).map(v=>({...v,vote:'Against the bill'}))])
      .sort((a,b)=>String(b.date || '').localeCompare(String(a.date || ''))).slice(0,10)
    body += `<h2>${hasRecent ? 'Last 10 recorded votes' : 'Latest exported bill votes'}</h2>`
    body += votes.length ? `<ol>${votes.map(v=>`<li>${v.division_slug ? link(`/doc/${v.division_slug}`,v.title || v.name || 'Division') : link(v.source_url || `/search?q=${encodeURIComponent(v.name || v.title || '')}`,v.name || v.title || 'Division')} — ${escapeHtml(v.date)}, ${escapeHtml(v.stage || '')}: ${escapeHtml(v.vote)}${original(v.source_url)}</li>`).join('')}</ol>` : '<p>No per-member votes in this export.</p>'
    if (!hasRecent) body += '<p>The current export samples up to six bill questions on each side; it is not a complete list of recent divisions. Procedural votes are excluded.</p>'
    body += `<p>Sources: They Vote For You and state Hansard. ${link('/votes.json','Voting data export')}. Most questions decided on the voices have no per-member record.</p>`
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
  body += '<h2>Donors to their party</h2><p>Donations to a party are not personal donations to this member. Published receipts do not establish influence.</p>'
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

export function sponsorFor(b: Bill, people: Person[]): Person | null {
  const sponsorName=(b.sponsor || '').replace(/\b(?:Senator|Sen|MP|Hon|Dr|Mrs|Mr|Ms)\b\.?\s*/gi,'').trim()
  const parts=sponsorName.split(',').map(s=>s.trim()).filter(Boolean)
  const normal=parts.length===2 ? `${parts[1]} ${parts[0]}` : sponsorName
  const matches=people.filter(p=>fold(p.name)===fold(normal))
  return people.find(p=>p.pid===b.sponsor_person_id && !!b.sponsor_person_id) || (matches.length===1 ? matches[0] : null)
}
export function renderBillAnswer(b: Bill, people: Person[], slugs: Map<string,string>): RenderedContent {
  const title = b.short_title || b.title
  const sponsor = sponsorFor(b,people)
  const description = `${human(b.status || 'Status not recorded')}${b.status_as_of ? `, as at ${b.status_as_of}` : ''}. ${b.portfolio ? `${b.portfolio} portfolio.` : ''}`
  let body = `<dl><dt>Sponsor</dt><dd>${sponsor ? link(personHref(sponsor,slugs),sponsor.name) : escapeHtml(b.sponsor || 'Not recorded')}</dd><dt>Portfolio</dt><dd>${escapeHtml(b.portfolio || 'Not recorded')}</dd></dl>`
  if (b.key_dates?.length) body += `<h2>Recorded stages</h2><ul>${b.key_dates.slice(-20).map(d=>`<li>${escapeHtml(human(d.stage))} — ${escapeHtml(d.date)}${original(d.url)}</li>`).join('')}</ul>`
  body += '<h2>Divisions</h2>'
  const divisions = b.divisions || []
  body += divisions.length ? `<ul>${divisions.slice(-50).map(d=>`<li>${link(`/doc/division-${d.key}`,d.question || d.stage || 'Division')} — ${escapeHtml(d.date)}, ${escapeHtml(chamber(d.house))}: ${escapeHtml(d.outcome || 'Result not recorded')}, ayes ${escapeHtml(d.ayes ?? 'not recorded')}, noes ${escapeHtml(d.noes ?? 'not recorded')}${original(d.url)}</li>`).join('')}</ul>` : '<p>No divisions recorded. Most questions are decided on the voices; this does not establish that a bill was unopposed.</p>'
  if (divisions.length>50) body += `<p>Showing the latest 50 of ${divisions.length} divisions. ${link(`/bills/${b.key}.json`,'All exported divisions')}.</p>`
  if (b.summary) body += `<h2>Plain-language summary</h2><p>${escapeHtml(b.summary.attribution || 'Machine-written summary; not the record')}${b.summary.as_of ? `, as at ${escapeHtml(b.summary.as_of)}` : ''}.</p>${(b.summary.sentences || []).slice(0,10).map(s=>`<p>${escapeHtml(s)}</p>`).join('')}<ul>${(b.summary.changes || []).slice(0,10).map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ul>${b.summary.affected ? `<p>${escapeHtml(b.summary.affected)}</p>` : ''}`
  else body += '<h2>Plain-language summary</h2><p>No machine-written summary in this export.</p>'
  body += `<h2>Sources</h2>${(b.sources || []).map(s=>`<p>${escapeHtml(human(s.kind))}</p>${original(s.url)}`).join('')}`
  return {html:answerBlock(title,description,'Bill',body)}
}
export function renderDivisionAnswer(d: Division, people: Person[], slugs: Map<string,string>): RenderedContent {
  const title = d.name || d.question || 'Parliamentary division'
  const description = `${chamber(d.house)}, ${d.date || 'Date not recorded'}. ${d.result || d.outcome || 'Result not recorded'}: ayes ${d.ayes ?? 'not recorded'}, noes ${d.noes ?? 'not recorded'}.`
  let body = `<h2>Question</h2><p>${escapeHtml(d.question || d.name || 'Question not recorded')}</p>${original(d.source_url || d.url)}<h2>How each member voted</h2>`
  for (const side of [...new Set(['aye','no','paired','absent','abstain','abstention',...(d.members || []).map(m=>m.vote)])]) {
    const members = (d.members || []).slice(0,1000).filter(m=>m.vote===side)
    if (!members.length) continue
    body += `<h3>${side==='aye' ? 'Ayes' : side==='no' ? 'Noes' : human(side)}</h3><ul>${members.map(m=>{const p=people.find(p=>m.person_id && p.pid===m.person_id) || people.find(p=>fold(p.name)===fold(m.name)); return `<li>${link(m.person_slug ? `/subject/person/${m.person_slug}` : p ? personHref(p,slugs) : `/subject/person/${encodeURIComponent(m.name)}`,m.name)} — ${escapeHtml(side)}</li>`}).join('')}</ul>`
  }
  if (!d.members?.length) body += '<p>Per-member votes are not present in this static export. Consult the original division record.</p>'
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
    for (const graph of graphs) for (const n of graph.nodes) if (n.kind===dir && (dir==='party' || !['individual','individuals','other','unknown',''].includes(n.industry || ''))) rows.set(fold(n.label),{href:`/subject/${dir}/${encodeURIComponent(n.label)}`,label:n.label})
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
