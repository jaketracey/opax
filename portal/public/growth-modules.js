/* Record-based landing modules. No generated answers or guessed identities. */
import { shortDate } from './format.js';
import { isOrganisationDonor } from './donor-entity.js?v=01f8f2c44b';
export { isOrganisationDonor };
import { sourceLineHTML } from './labels.js?v=804befe8de';
import { sponsorPerson, sponsorKey } from './sponsor-person.js?v=74d9a1f8cf';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text = value => typeof value === 'string' ? value.trim() : '';
export const ASSOCIATION_NOTE = 'An association does not prove influence.';
export const correctionHTML = () => '<p class="growth-correction"><a href="/support#support-report">Report a data correction</a> · response target: 48 hours.</p>';
export const associationHTML = () => `<p class="growth-association">${ASSOCIATION_NOTE}</p>`;
export const moduleAttrs = (module, pageType, position) => `data-module="${esc(module)}" data-page-type="${esc(pageType)}" data-module-position="${position}"`;
export function askEntry(question, pageType, record = {}) {
  const scoped = pageType==='bill' && text(record.title) && text(record.key)
    ? `${question}\nBill: ${record.title} (${record.key}).` : question;
  return `/ask?${new URLSearchParams({q:scoped,from:pageType})}`;
}
export async function growthSummaryPath(kind, identity) {
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity));
  const key = [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,24);
  return `/growth/${kind}/${key}.json`;
}
export function sponsorSummaryPath(bill) {
  return text(bill?.sponsor) ? growthSummaryPath('sponsors',`${bill.jurisdiction || ''}:${sponsorKey(bill.sponsor)}:${bill.sponsor_person_id || ''}`) : Promise.resolve(null);
}
export function noDivisionsHeading(bill) {
  const advanced = (bill.acts || []).length || (bill.key_dates || []).some(d=>['third_reading','passed','royal_assent'].includes(d.stage));
  return !advanced && ['before_parliament','not_yet_debated','introduced'].includes(bill.status) ? 'Not yet voted' : 'No formal divisions recorded';
}
export function summaryWrittenHTML(summary = {}) {
  const day = String(summary.generated_at || '').slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day))) return '<p class="fineprint">Summary written date not recorded.</p>';
  const date = shortDate(day);
  return `<p class="fineprint">Summary written <time datetime="${esc(day)}">${esc(date)}</time>.</p>`;
}
/** Counted topics only; a topic inferred from a title is not a most-frequent topic. */
export function personQuestions({name, topics = [], votes = [], bills = [], interests = null} = {}) {
  if (!text(name)) return [];
  const questions = [];
  const topic = [...topics].filter(t => text(t.name) && Number(t.count)>0).sort((a,b)=>Number(b.count)-Number(a.count)||a.name.localeCompare(b.name))[0];
  if (topic) questions.push(suggestion(`What has ${name} said about ${topic.name}?`));
  const latest = latestBillVotes(votes)[0];
  if (latest) {
    // Typography differs between Hansard and the bill export; identity still
    // requires an exact title in the same jurisdiction, with one match.
    const key = value => text(value).replace(/[’‘]/g,"'").replace(/\s+/g,' ').toLowerCase();
    const matches = bills.filter(b=>b.jurisdiction===latest.jur && [b.title,...(b.aliases || [])].some(t=>key(t)===key(latest.name)));
    const record = matches.length===1 ? matches[0] : latest;
    const short = text(record.short_title) || text(record.title) || latest.name;
    questions.push(suggestion(`How did ${name} vote on ${latest.name}?`,`How did ${name} vote on ${short}?`));
  }
  if (Number(interests?.total)>0 && interests?.buckets && Object.values(interests.buckets).some(b=>Number(b.count)>0)) questions.push(suggestion(`What interests has ${name} declared?`));
  return questions;
}
export function billQuestions(bill = {}, people = []) {
  const name = text(bill.title) || text(bill.short_title);
  if (!name) return [];
  const short = text(bill.short_title) || name;
  const questions = [];
  if ((bill.divisions || []).length) questions.push(suggestion(`How did each party vote on the ${name}?`,`How did each party vote on the ${short}?`));
  const sponsor = sponsorPerson(bill.sponsor,bill.sponsor_person_id,people);
  if (sponsor && (bill.speeches || []).some(s=>text(s.slug) && [sponsor.name,sponsor.full].filter(Boolean).some(n=>sponsorKey(n)===sponsorKey(s.speaker)))) {
    questions.push(suggestion(`What has ${sponsor.name} said about the ${name}?`,`What has ${sponsor.name} said about the ${short}?`));
  }
  return questions.slice(0,2);
}
/** Only the drawn label is shortened; Ask receives the complete question. */
export function questionLabel(value, limit = 100) {
  const label = text(value).replace(/\s+/g,' ');
  if (label.length<=limit) return label;
  const words = label.slice(0,limit).replace(/\s+\S*$/,'').trimEnd();
  return (words || label.split(' ')[0])+'…';
}
const suggestion = (question,label=question) => ({question,label:questionLabel(label)});
const questionKey = value => text(value).replace(/\s+/g,' ').toLowerCase();
export function askBlockHTML({name = '', bill = null, questions = [], pageType, seed = ''} = {}) {
  const heading = bill ? 'Ask what this bill changes' : `Ask about ${name}`;
  return `<section class="growth-ask" ${moduleAttrs('ask',pageType,1)} aria-labelledby="growth-ask-title">
    <h3 id="growth-ask-title">${esc(heading)}</h3>
    <form class="growth-ask-form" action="/ask" method="get"${bill ? ` data-record-title="${esc(bill.title || bill.short_title)}" data-record-key="${esc(bill.key)}"` : ''}>
      <label class="visually-hidden" for="growth-ask-input">Your question</label>
      <textarea class="ui-input grow-field" id="growth-ask-input" name="q" rows="1" autocomplete="off" placeholder="${bill ? 'What does this bill change?' : 'Your question about '+esc(name)}" required>${esc(bill ? '' : seed)}</textarea>
      <input type="hidden" name="from" value="${esc(pageType)}">
      <button class="ui-button" data-variant="primary" type="submit">Ask</button>
    </form>
    <ul class="growth-questions" role="list">${questionsHTML(questions,pageType,bill ? '' : seed)}</ul>
  </section>`;
}
export function questionsHTML(questions, pageType, seed = '') {
  const seen = new Set([questionKey(seed)]);
  return questions.flatMap(q=>{
    const {question,label} = typeof q==='string' ? suggestion(q) : q;
    const key = questionKey(question);
    if (seen.has(key)) return [];
    seen.add(key);
    return [`<li><a class="ui-button" href="${esc(askEntry(question,pageType))}" rel="nofollow">${esc(questionLabel(label || question))}</a></li>`];
  }).join('');
}
/** Latest vote per bill, including both sides, without changing votes.json. */
export function latestBillVotes(votes = []) {
  const seen = new Set();
  return [...votes].filter(v=>text(v.name) && /^\d{4}-\d{2}-\d{2}$/.test(v.date || '')).sort((a,b)=>b.date.localeCompare(a.date)).filter(v=>{const k=(v.jur || '')+':'+v.name.replace(/\s+/g,' ').trim().toLowerCase();if(seen.has(k))return false;seen.add(k);return true;});
}
export function recentSittingSpeeches(speeches = []) {
  const dated = speeches.filter(s=>/^\d{4}-\d{2}-\d{2}/.test(s.date || '')).sort((a,b)=>b.date.localeCompare(a.date));
  if (!dated.length) return {week:'',speeches:[]};
  const monday = iso => {const d=new Date(iso.slice(0,10)+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);};
  const week = monday(dated[0].date);
  return {week,speeches:dated.filter(s=>monday(s.date)===week)};
}
/** Privacy filtering happens before grouping, names, declarations or party flows. */
export function publicOrganisationTies(ties = []) {
  return ties.filter(tie=>{
    const kinds = tie.kinds || [tie.kind];
    if (!kinds.includes('donor') && !tie.donor_id) return true;
    return isOrganisationDonor({...tie,label:tie.organisation});
  });
}
export const normalisedName = name => String(name || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const abnKey = value => String(value || '').replace(/\s/g,'');
export function exactOrganisationDonors(supplier, donors = []) {
  const name = normalisedName(supplier?.name);
  if (!name) return [];
  return donors.filter(d=>d.kind==='donor' && isOrganisationDonor(d) && normalisedName(d.label)===name &&
    (!supplier.abn || !d.abn || abnKey(supplier.abn)===abnKey(d.abn)));
}
export function donationRegisterHTML(supplier, donors) {
  const matches = exactOrganisationDonors(supplier,donors);
  // An ambiguous name cannot identify a single donor record.
  if (matches.length !== 1) return '';
  return `<div class="growth-donor" ${moduleAttrs('donations_register','supplier',3)}><p>Also in the donations register: <a href="/subject/donor/${encodeURIComponent(matches[0].label)}">${esc(matches[0].label)}</a>.</p>${associationHTML()}${sourceLineHTML({source:'AEC annual returns',originals:[{label:'AEC Transparency Register',href:'https://transparency.aec.gov.au/'}],notes:['Exact normalised name, and matching ABN where both registers carry one. Organisation records only.']})}${correctionHTML()}</div>`;
}
export function otherSponsorBills(bill, bills, people) {
  const person = sponsorPerson(bill.sponsor,bill.sponsor_person_id,people);
  if (!person) return [];
  return bills.filter(b=>b.key!==bill.key && b.jurisdiction===bill.jurisdiction && sponsorPerson(b.sponsor,b.sponsor_person_id,people)?.name===person.name)
    .sort((a,b)=>String(b.introduced||'').localeCompare(String(a.introduced||''))).slice(0,5);
}
export function pageTypeOf(value) {
  const path = new URL(value,'https://opax.com.au').pathname;
  const parts = path.split('/').filter(Boolean);
  if (parts[0]==='subject') return ['person','bill','supplier','agency','party','donor','electorate','topic','campaigner'].includes(parts[1]) ? parts[1] : 'index';
  if (parts[0]==='bill') return 'bill';
  if (!parts.length) return 'home';
  if (parts[0]==='money' && parts[1]==='grants') return 'grant';
  return ['ask','chat','search','reports','money','doc','discover','explore','declared'].includes(parts[0]) ? parts[0] : 'other';
}
export function askPageType(value) {
  const url = new URL(value,'https://opax.com.au');
  const origin = url.pathname==='/ask' ? url.searchParams.get('from') : null;
  return ['person','bill','supplier'].includes(origin) ? origin : pageTypeOf(value);
}
