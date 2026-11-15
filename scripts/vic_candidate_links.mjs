// Which VEC candidates are people already on OPAX's Victorian roster.
//
//   node scripts/vic_candidate_links.mjs          rewrite scripts/hubs/vic-candidate-links-2026.json
//   node scripts/vic_candidate_links.mjs --check  fail if the committed file differs
//
// A wrong link puts someone else's parliamentary record beside a candidate, so the
// matcher only proposes; the committed file is what the election build reads, and the
// build re-runs the matcher and leaves out any entry the current data no longer supports.
//
// A pair is verified only when all of these hold:
//   1. the VEC name equals the roster name (or a roster alias) after folding case,
//      accents, apostrophes and punctuation;
//   2. the candidate stands in the seat the member held on the roster;
//   3. the VEC registered party and the roster party are the same party;
//   4. nothing else makes the identity uncertain: the name is on the VEC lists once,
//      matches one roster member, and has no record in another parliament.
// Every other name match is ambiguous: it is listed for a person to check, and is linked
// only once a person records a public source that names the member and the seat contested.
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {personIndex} from '../portal/src/person-slug.ts';
import {personNameKey} from '../portal/public/canonical-urls.js';
import {partyShortName} from '../portal/public/party-page.js';

export const VIC_CANDIDATE_LINKS = 'vic-candidate-links-2026.json';

export const foldName = name => String(name ?? '').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase()
  .replace(/[’‘ʼ`'.]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const slug = name => foldName(name).replace(/ /g,'-');
export const candidateId = (kind, seat, name) => `${kind}:${slug(seat)}:${slug(name)}`;
const seatLabel = (kind, seat) => `${seat} ${kind === 'district' ? 'District' : 'Region'}`;
const sameParty = (a, b) => Boolean(a && b) && partyShortName(a) === partyShortName(b);

/** The 128 roster members, each with the seat held and whether the name has a record elsewhere. */
export function rosterMembers(index, roster, people) {
  const identity = personIndex(roster.people);
  const elsewhere = new Set(people.people.filter(p=>p.jurisdiction !== 'vic').flatMap(p=>[p.name,...p.aliases ?? []]).map(foldName));
  return index.electorates.filter(s=>s.jurisdiction === 'vic' && s.status === 'current' && ['vic_la','vic_lc'].includes(s.chamber))
    .flatMap(s=>s.representatives.map(({person,party})=>{
      const record = identity.byFold.get(personNameKey(person.name));
      // The same test the hub uses before it shows a speech count as Victorian only.
      const mixed = Boolean(record) && !(record.states.length === 1 && record.states[0] === 'vic' && !record.speech_scope && !record.speech_count_basis);
      return {person_id:person.person_id,name:person.name,aliases:person.aliases ?? [],party:party || null,
        seat:s.name,kind:s.chamber === 'vic_la' ? 'district' : 'region',source_url:person.source_url,as_of:s.representation_as_of,
        other_parliament:mixed || [person.name,...person.aliases ?? []].some(n=>elsewhere.has(foldName(n)))};
    }));
}

function candidateRows(nominated) {
  const rows = [];
  for (const [kind,key] of [['district','districts'],['region','regions']]) for (const [seat,list] of Object.entries(nominated[key] ?? {})) for (const c of list) {
    // The VEC prints "SURNAME, Given names". The few rows without a comma have no known surname.
    const parts = c.name.split(', ');
    const [surname,given] = parts.length === 2 ? parts.map(foldName) : [null,null];
    rows.push({id:candidateId(kind,seat,c.name),kind,seat,name:c.name,party:c.party || '',surname,given,
      full:surname === null ? foldName(c.name) : `${given} ${surname}`});
  }
  if (new Set(rows.map(r=>r.id)).size !== rows.length) throw new Error('Candidate ids are not unique');
  return rows;
}

const firstWord = text => text.split(' ')[0];
/** The roster has no surname field: a candidate shares it when the member's name ends with theirs. */
function sharesSurname(c, memberFold) {
  const last = memberFold.split(' ').at(-1);
  if (c.surname !== null) return memberFold.endsWith(' '+c.surname) || c.surname.split(' ').at(-1) === last;
  return c.full.split(' ').includes(last);
}
const candidateGiven = c => c.surname !== null ? c.given : firstWord(c.full);

export function matchVicCandidates(nominated, members) {
  const candidates = candidateRows(nominated);
  const names = members.map(m=>[m.name,...m.aliases].map(foldName));
  const pairs = [];
  for (const c of candidates) members.forEach((m,i)=>{
    const exact = names[i].includes(c.full);
    const a = firstWord(candidateGiven(c)), b = firstWord(names[i][0]);
    const variant = !exact && sharesSurname(c,names[i][0]) && Boolean(a && b) && (a.startsWith(b) || b.startsWith(a));
    if (exact || variant) pairs.push({c,m,exact});
  });
  const sameName = full => candidates.filter(c=>c.full === full);
  const verified = [], ambiguous = [];
  for (const {c,m,exact} of pairs) {
    const reasons = [];
    if (!exact) reasons.push(`Name variant: the VEC lists "${c.name}", the roster has "${m.name}"`);
    const twins = sameName(c.full);
    if (twins.length > 1) reasons.push(`Same name on the VEC lists in ${twins.length} seats: ${twins.map(t=>seatLabel(t.kind,t.seat)).join(', ')}`);
    if (pairs.filter(p=>p.c === c).length > 1) reasons.push('Name matches more than one roster member');
    if (pairs.filter(p=>p.m === m).length > 1) reasons.push('More than one candidate matches this roster member');
    if (c.kind !== m.kind || c.seat !== m.seat) reasons.push(`Different seat: standing in ${seatLabel(c.kind,c.seat)}, on the roster for ${seatLabel(m.kind,m.seat)}`);
    if (!c.party) reasons.push(`No registered party on the VEC list to check (roster: ${m.party || 'none'})`);
    else if (!sameParty(c.party,m.party)) reasons.push(`Party differs: VEC "${c.party}", roster "${m.party || 'none'}"`);
    if (m.other_parliament) reasons.push('The same name has a record in another parliament');
    const base = {candidate_id:c.id,person_id:m.person_id,seat:seatLabel(c.kind,c.seat),candidate:c.name,member:m.name};
    if (reasons.length) ambiguous.push({...base,reasons});
    else verified.push({...base,evidence:{name:'Same name after folding case and punctuation',
      seat:`Held ${seatLabel(m.kind,m.seat)} on the roster dated ${m.as_of}`,
      party:{vec:c.party,roster:m.party},roster_source:m.source_url}});
  }
  // "Not a candidate" needs the VEC lists to rule the member out, not just a missing name match.
  const linkedElsewhere = new Set(verified.map(v=>v.candidate_id));
  const not_candidate = [], unresolved = [];
  members.forEach((m,i)=>{
    if (pairs.some(p=>p.m === m)) return;
    const fold = names[i][0];
    const surname = candidates.filter(c=>!linkedElsewhere.has(c.id) && names[i].some(n=>sharesSurname(c,n)));
    const blockers = surname.filter(c=>c.kind === m.kind && c.seat === m.seat || sameParty(c.party,m.party)
      || candidateGiven(c)[0] === fold[0]);
    const base = {person_id:m.person_id,member:m.name,seat:seatLabel(m.kind,m.seat)};
    const shown = list => list.map(c=>({candidate:c.name,seat:seatLabel(c.kind,c.seat),party:c.party}));
    if (blockers.length) unresolved.push({...base,reason:'A candidate with the same surname shares the seat, the party or a first initial',candidates:shown(blockers)});
    else not_candidate.push({...base,same_surname_candidates:shown(surname)});
  });
  const matched = new Set(pairs.map(p=>p.c.id));
  return {verified,ambiguous,not_candidate,unresolved,
    counts:{candidates:candidates.length,members:members.length,verified:verified.length,ambiguous:ambiguous.length,
      unmatched:candidates.length - matched.size,not_candidate:not_candidate.length,unresolved:unresolved.length}};
}

const reviewed = entry => /^\d{4}-\d{2}-\d{2}$/.test(entry?.reviewed_on ?? '') && typeof entry.review_evidence === 'string' && entry.review_evidence.trim().length > 0;
const https = url => { try { return new URL(url).protocol === 'https:'; } catch { return false; } };
// A promoted link also needs a public source that names the person and the seat, with the words relied on.
const reviewedLink = entry => reviewed(entry) && Array.isArray(entry.sources) && entry.sources.length > 0
  && entry.sources.every(s=>https(s?.url) && typeof s.quote === 'string' && s.quote.trim().length > 0);
const pairKey = e => `${e.candidate_id} ${e.person_id}`;

/**
 * The links and "not a candidate" marks the build may publish: the committed file, checked
 * against a fresh match. A verified entry must still verify. A person may promote an
 * ambiguous pair only by recording the date, the evidence and a public source that names
 * the person and the seat; an unresolved member, by recording the date and the evidence.
 * An entry that fails is left out and reported, so the page falls back to plain text
 * and a later roster or VEC list never stops the election build.
 */
export function approvedLinks(file, match) {
  const verified = new Set(match.verified.map(pairKey)), ambiguous = new Set(match.ambiguous.map(pairKey));
  const links = new Map(), people = new Set(), dropped = [];
  for (const [list,allowed] of [[file.verified ?? [],e=>verified.has(pairKey(e))],[file.reviewed ?? [],e=>ambiguous.has(pairKey(e)) && reviewedLink(e)]]) for (const e of list) {
    if (!allowed(e)) dropped.push(`Unverified candidate link: ${e?.candidate_id}`);
    else if (links.has(e.candidate_id) || people.has(e.person_id)) dropped.push(`Duplicate candidate link: ${e.candidate_id}`);
    else { links.set(e.candidate_id,e.person_id); people.add(e.person_id); }
  }
  const ruledOut = new Set(match.not_candidate.map(e=>e.person_id)), open = new Set(match.unresolved.map(e=>e.person_id));
  const notCandidate = new Set();
  for (const e of file.not_candidate ?? []) {
    if (people.has(e?.person_id) || !(ruledOut.has(e?.person_id) || open.has(e?.person_id) && reviewed(e))) dropped.push(`Unconfirmed "not a candidate": ${e?.member}`);
    else notCandidate.add(e.person_id);
  }
  return {links,notCandidate,dropped};
}

/** The file to commit. A person's reviewed promotions are kept and leave the lists to check. */
export function linksFile(match, nominated, previous = {}) {
  const kept = (previous.reviewed ?? []).filter(e=>reviewedLink(e) && match.ambiguous.some(a=>pairKey(a) === pairKey(e)));
  const keptOut = (previous.not_candidate ?? []).filter(e=>reviewed(e) && match.unresolved.some(u=>u.person_id === e.person_id));
  const linked = new Set(kept.map(e=>e.person_id)), ambiguous = match.ambiguous.filter(a=>!kept.some(e=>pairKey(e) === pairKey(a)));
  const members_to_check = match.unresolved.filter(u=>!keptOut.some(e=>e.person_id === u.person_id));
  return {
    note:'Written by scripts/vic_candidate_links.mjs and reviewed before commit. The election build links only "verified" and "reviewed" pairs and shows "Not a candidate in 2026" only for "not_candidate" members; "ambiguous" and "members_to_check" are for a person to check and are never published. See docs/HUBS.md.',
    candidates_published:nominated.published,candidates_source:nominated.url,
    counts:{...match.counts,reviewed:kept.length,linked:match.verified.length + kept.length,ambiguous:ambiguous.length,
      not_candidate:match.not_candidate.length + keptOut.length,unresolved:members_to_check.length},
    verified:match.verified,reviewed:kept,ambiguous,
    not_candidate:[...match.not_candidate.filter(e=>!linked.has(e.person_id)),...keptOut],members_to_check,
  };
}

async function main() {
  const at = path => new URL(path,import.meta.url);
  const json = async url => JSON.parse(await readFile(url,'utf8'));
  const manifest = await json(at('../portal/public/electorates/manifest.json'));
  const asset = path => json(at('../portal/public/'+path.replace(/^\//,'')));
  const [index,people,roster,nominated] = await Promise.all([asset(manifest.index_url),asset(manifest.people_url),
    asset('parliamentarians.json'),json(at('./hubs/vic-candidates-2026.json'))]);
  const out = at('./hubs/'+VIC_CANDIDATE_LINKS);
  const previous = await readFile(out,'utf8').then(JSON.parse,e=>{if(e.code==='ENOENT')return {};throw e;});
  const file = linksFile(matchVicCandidates(nominated,rosterMembers(index,roster,people)),nominated,previous);
  const text = JSON.stringify(file,null,2)+'\n';
  if (process.argv.includes('--check')) {
    if (text !== await readFile(out,'utf8').catch(()=>'')) throw new Error(`${VIC_CANDIDATE_LINKS} is stale: run node scripts/vic_candidate_links.mjs and review the change`);
  } else await writeFile(out,text);
  console.log('Victorian candidate links:',JSON.stringify(file.counts));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
