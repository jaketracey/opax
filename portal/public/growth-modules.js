/* Record-based landing modules. No generated answers or guessed identities. */
import { sourceLineHTML } from './labels.js';
import { sponsorPerson } from './sponsor-person.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text = value => typeof value === 'string' ? value.trim() : '';
export const ASSOCIATION_NOTE = 'An association does not prove influence.';
export const correctionHTML = () => '<p class="growth-correction"><a href="/support#support-report">Report a data correction</a> · response target: 48 hours.</p>';
export const associationHTML = () => `<p class="growth-association">${ASSOCIATION_NOTE}</p>`;
export const moduleAttrs = (module, pageType, position) => `data-module="${esc(module)}" data-page-type="${esc(pageType)}" data-module-position="${position}"`;
export function askEntry(question, pageType) {
  return `/ask?${new URLSearchParams({q:question,from:pageType})}`;
}
/** Counted topics only; a topic inferred from a title is not a most-frequent topic. */
export function personQuestions({name, topics = [], votes = [], interests = null} = {}) {
  if (!text(name)) return [];
  const questions = [];
  const topic = [...topics].filter(t => text(t.name) && Number(t.count)>0).sort((a,b)=>Number(b.count)-Number(a.count)||a.name.localeCompare(b.name))[0];
  if (topic) questions.push(`What has ${name} said about ${topic.name}?`);
  const latest = latestBillVotes(votes)[0];
  if (latest) questions.push(`How did ${name} vote on ${latest.name}?`);
  if (Number(interests?.total)>0 && interests?.buckets && Object.values(interests.buckets).some(b=>Number(b.count)>0)) questions.push(`What interests has ${name} declared?`);
  return questions;
}
export function billQuestions(bill = {}) {
  const name = text(bill.title) || text(bill.short_title);
  if (!name) return [];
  const questions = [];
  if ((bill.sources || []).some(s=>['em','billhome','text'].includes(s.kind) && /^https?:\/\//.test(s.url || ''))) questions.push(`What changes does the ${name} propose?`);
  if ((bill.divisions || []).length) questions.push(`How did each party vote on the ${name}?`);
  else if ((bill.speeches || []).some(s=>s.slug)) questions.push(`What has parliament said about the ${name}?`);
  return questions.slice(0,2);
}
export function askBlockHTML({name = '', bill = null, questions = [], pageType, seed} = {}) {
  const heading = bill ? 'Ask what this bill changes' : `Ask about ${name}`;
  return `<section class="growth-ask" ${moduleAttrs('ask',pageType,1)} aria-labelledby="growth-ask-title">
    <h3 id="growth-ask-title">${esc(heading)}</h3>
    <form class="growth-ask-form" action="/ask" method="get">
      <label class="visually-hidden" for="growth-ask-input">Your question</label>
      <textarea class="ui-input grow-field" id="growth-ask-input" name="q" rows="1" autocomplete="off" required>${esc(seed)}</textarea>
      <input type="hidden" name="from" value="${esc(pageType)}">
      <button class="ui-button" data-variant="primary" type="submit">Ask</button>
    </form>
    <ul class="growth-questions" role="list">${questionsHTML(questions,pageType)}</ul>
  </section>`;
}
export function questionsHTML(questions, pageType) {
  return questions.map(q=>`<li><a class="ui-button" href="${esc(askEntry(q,pageType))}" rel="nofollow">${esc(q)}</a></li>`).join('');
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
/** Organisation classification follows the existing public donor directory. Unknown stays unlinked. */
export function organisationDonor(donor) {
  return donor?.kind === 'donor' && !!text(donor.industry) && !['individual','individuals','person','other','unknown'].includes(text(donor.industry).toLowerCase());
}
export const normalisedName = name => String(name || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const abnKey = value => String(value || '').replace(/\s/g,'');
export function exactOrganisationDonors(supplier, donors = []) {
  const name = normalisedName(supplier?.name);
  if (!name) return [];
  return donors.filter(d=>organisationDonor(d) && normalisedName(d.label)===name &&
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
