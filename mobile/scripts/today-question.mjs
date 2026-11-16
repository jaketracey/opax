// Today's question: one fact a day from the public record, never about
// OPAX itself. Bills (did it become law, which portfolio), third-reading
// votes, grant programs and Commonwealth contracts, each read from one field
// of one record in the portal's public exports. Deterministic: no model, no
// network. See src/features/explore/README.md.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { questionId } from './explore-engine.mjs';

/** The grants year the money questions ask about: the last complete one. */
export const GRANT_YEAR = '2025-26';
/** Contracts that start in this calendar year (AusTender's year basis). */
export const CONTRACT_YEAR = '2026';

/**
 * Subjects Today's question never touches: royal commissions (RCDVS and
 * other RC acronyms in bill titles), the Victorian Big Build commission,
 * class actions (named for a lead applicant, a private person), hearings and
 * transcripts, and anything Victorian while the state election rules apply.
 */
export const BLOCKED =
  /royal commission|\bRC[A-Z]{2,}\b|RCIMCP|class action|transcript|hearing|victoria|big build/i;
/** Words about OPAX's own holdings or outputs, never in a question's text. */
export const BANNED =
  /\bopax\b|\breports?\b|\bspeech(es)?\b|\btranscripts?\b|\bhearings?\b|royal commission|\bin the record\b|\bon record\b|\bfound\b|\bfinds?\b/i;

/** Daily order: neighbouring days ask about different kinds of record. */
export const ROTATION = [
  'bill-became-law',
  'grant-program-agency',
  'division-third-reading',
  'contract-largest-supplier',
  'bill-portfolio',
  'grant-program-year-total',
  'division-third-reading',
  'contract-largest-value',
];
const ROUNDS = 10;
const LAW_TURNS = ['bill-became-law:true', 'bill-became-law:false'];
/** bill, division, grant or contract. */
const family = (template) => template.split('-')[0];
/** One answer may be the right option at most this often in a deck. */
const ANSWER_CAP = 2;

// ---------- formatting ----------
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
/** "28 September 2026". */
export function longDate(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
const grouped = (n) =>
  String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** "$5.23 billion", "$431 million", "$1.3 million", "$950,000". */
export function moneyWords(value) {
  const v = Number(value);
  const trim = (s) => s.replace(/\.0+$/, '');
  if (v >= 1e9) return `$${trim((v / 1e9).toFixed(v >= 1e10 ? 1 : 2))} billion`;
  if (v >= 1e6) return `$${trim((v / 1e6).toFixed(v >= 1e8 ? 0 : 1))} million`;
  return `$${grouped(v)}`;
}
const the = (name) => (/^the /i.test(name) ? name : `the ${name}`);
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- deterministic choice ----------
function rng(key) {
  let a = parseInt(questionId({ template: 'seed', prompt: key }).slice(1), 16);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
/**
 * The answer and three wrong options, in a fixed order per record. No two
 * options are `alike` (a renamed department beside its new name, say).
 */
function choices(answer, wrong, key, alike = shareWord) {
  const random = rng(key);
  const picked = [];
  for (const option of shuffle(wrong, random))
    if (picked.length < 3 && !picked.some((p) => alike(p, option)))
      picked.push(option);
  if (picked.length < 3) return null;
  return shuffle([answer, ...picked], random).map((label) => ({
    label,
    correct: label === answer,
  }));
}
// Name words: two names that share one are too alike to be options together,
// and an answer whose words are in the question gives itself away.
const STOP = new Set([
  'department',
  'the',
  'and',
  'for',
  'australian',
  'national',
  'office',
  'agency',
  'commission',
  'authority',
  'council',
  'services',
  'australia',
]);
const words = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
const shareWord = (a, b) => words(a).some((w) => words(b).includes(w));

// ---------- bills ----------
const billTitle = (b) => (b.short_title || b.title || '').trim();
/** A government bill's portfolio; a private member's bill names its member. */
const govPortfolio = (b) =>
  b.portfolio && !/^\(|\bMP\b|Senator/.test(b.portfolio) ? b.portfolio : null;
const usableBill = (b) =>
  b.jurisdiction === 'federal' &&
  !!govPortfolio(b) &&
  billTitle(b).length > 0 &&
  billTitle(b).length <= 90 &&
  !BLOCKED.test(billTitle(b)) &&
  !BANNED.test(billTitle(b));
const assentDate = (b) =>
  (b.key_dates ?? []).find((k) => k.stage === 'royal_assent')?.date ?? null;
const latestDate = (b) =>
  (b.key_dates ?? []).reduce(
    (m, k) => (k.date && k.date > m ? k.date : m),
    b.introduced ?? '',
  );

/**
 * When a bill's ending happened: `status_as_of` when it is the date of the
 * bill's last recorded event. Otherwise the record holds no ending date (a
 * lapse at the end of a parliament carries a later export stamp), so null.
 */
export function endingDate(b) {
  const last = (b.key_dates ?? []).at(-1)?.date ?? null;
  return b.status_as_of && b.status_as_of === last ? b.status_as_of : null;
}

/**
 * How a bill that did not become law ended, from its `ended` field and
 * ending date, or null when the record cannot say. A lapse is never used:
 * the record does not date it, and a bill in the current parliament has not
 * lapsed by dissolution.
 */
export function billEnding(b) {
  const date = b.status === 'lapsed' ? endingDate(b) : null;
  if (!date) return null;
  const on = longDate(date);
  const offPaper =
    "That took it off parliament's list of business before it passed both houses, so it did not become law.";
  switch (b.ended) {
    case 'negatived':
      return {
        fact: `False. It was voted down on ${on}.`,
        explanation:
          'A vote in parliament went against the bill, so it did not become law.',
      };
    case 'discharged':
      return {
        fact: `False. It was discharged from the Notice Paper on ${on}.`,
        explanation: offPaper,
      };
    case 'removed':
      return {
        fact: `False. It was removed from the Notice Paper on ${on}.`,
        explanation: offPaper,
      };
    case 'not_proceeding':
      return {
        fact: `False. It was not proceeded with, as recorded on ${on}.`,
        explanation:
          'Parliament did not go on with the bill, so it did not become law.',
      };
    default:
      return null;
  }
}

const billRecord = (b) => ({
  path: `bills/${b.key}.json`,
  fields: {
    key: b.key,
    status: b.status,
    ended: b.ended ?? null,
    ended_label: b.ended_label ?? null,
    parliament: b.parliament,
    portfolio: b.portfolio ?? null,
    introduced: b.introduced ?? null,
    royal_assent: assentDate(b),
    status_as_of: b.status_as_of ?? null,
    last_key_date: (b.key_dates ?? []).at(-1)?.date ?? null,
  },
});

function billBecameLaw(b) {
  const assent = assentDate(b);
  const passed = b.status === 'passed' && !!assent;
  const ending = passed ? null : billEnding(b);
  if (!passed && !ending) return null;
  const title = billTitle(b);
  return {
    template: 'bill-became-law',
    deck: 'words',
    kind: 'tf',
    prompt: `True or false: The ${title} became law.`,
    options: [
      { label: 'True', correct: passed },
      { label: 'False', correct: !passed },
    ],
    fact: passed
      ? `True. It received Royal Assent on ${longDate(assent)}.`
      : ending.fact,
    explanation: passed
      ? 'A bill becomes law when both houses pass it and the Governor-General gives Royal Assent.'
      : ending.explanation,
    source: 'ParlInfo bill record',
    link: { href: `/bill/${b.key}`, label: title },
    record: billRecord(b),
    // One bill per ending event: a package discharged together asks once.
    uses: passed ? [b.key] : [b.key, `ended:${b.ended}:${endingDate(b)}`],
  };
}

function billPortfolio(b, portfolios) {
  const answer = govPortfolio(b);
  const title = billTitle(b);
  // Too easy when the portfolio's own words are in the title.
  if (!answer || shareWord(answer, title)) return null;
  const options = choices(
    answer,
    portfolios.filter(
      (p) => p !== answer && !shareWord(p, answer) && !shareWord(p, title),
    ),
    b.key,
  );
  if (!options) return null;
  return {
    template: 'bill-portfolio',
    deck: 'words',
    kind: 'mc',
    prompt: `Which government portfolio is responsible for the ${title}?`,
    options,
    fact: answer,
    explanation: `The ${title} is a government bill from the ${answer} portfolio, introduced on ${longDate(b.introduced)}.`,
    source: 'ParlInfo bill record',
    link: { href: `/bill/${b.key}`, label: title },
    record: billRecord(b),
    uses: [b.key],
  };
}

// ---------- third-reading votes ----------
/** "Bills — X Bill 2026; Third Reading" → "X Bill 2026", or null. */
export function thirdReadingBill(name) {
  if (!/; Third Reading$/i.test(name ?? '')) return null;
  const title = name
    .replace(/^bills\s*[-—–]\s*/i, '')
    .replace(/; Third Reading$/i, '')
    .trim();
  // A package of bills voted together names more than one.
  return title.includes(',') ? null : title;
}

function divisionVote(d, bill) {
  const title = billTitle(bill);
  const senate = d.house === 'senate';
  const ayes = Number(d.ayes);
  const noes = Number(d.noes);
  const agreed = d.result === 'affirmative';
  return {
    template: 'division-third-reading',
    deck: 'words',
    kind: 'slider',
    prompt: `How many ${senate ? 'senators' : 'members of the House'} voted for the third reading of the ${title} on ${longDate(d.date)}?`,
    answer: ayes,
    min: 0,
    max: senate ? 76 : 150,
    scale: 'linear',
    format: 'count',
    fact: `${grouped(ayes)} for, ${grouped(noes)} against`,
    explanation: `The third reading is the final vote on a bill in each house. It was ${agreed ? 'agreed to' : 'not agreed to'}, ${ayes} votes to ${noes}.`,
    source: 'Division record from They Vote For You',
    link: {
      href: `/bill/${bill.key}?section=divisions&division=${d.key}`,
      label: `${title}, third reading`,
    },
    record: {
      path: `divisions/division-${d.key}.json`,
      fields: {
        key: d.key,
        name: d.name,
        house: d.house,
        date: d.date,
        ayes: d.ayes,
        noes: d.noes,
        result: d.result,
        bill: bill.key,
        bill_lists_division: true,
      },
    },
    uses: [d.key, bill.key, `${d.house}:${d.date}`],
  };
}

// ---------- grant programs ----------
/**
 * A program a reader can name: a GrantConnect GO id, a real name with no
 * acronyms, numbers or one-off projects, one agency and enough grants.
 */
const usableProgram = (p) =>
  /^GO\d+$/.test(p.id) &&
  p.n &&
  p.n !== p.id &&
  p.n.length <= 70 &&
  !/\s-\s|\(|\b[A-Z]{2,}\b|\d|\bSppt\b|\bProject\b/.test(p.n) &&
  !BLOCKED.test(p.n) &&
  p.ag &&
  (p.agencies ?? []).length === 1 &&
  p.c >= 10 &&
  Array.isArray(p.by?.[GRANT_YEAR]) &&
  p.by[GRANT_YEAR][1] >= 5;
/** "the Medicare Urgent Care Clinics program", "the Industry Growth Program". */
const programName = (n) =>
  /\b(program|programme|fund|scheme|initiative)$/i.test(n)
    ? `the ${n}`
    : `the ${n} program`;
const programRecord = (p) => ({
  path: `grants/federal/programs/${p.key}.json`,
  fields: {
    id: p.id,
    n: p.n,
    ag: p.ag,
    agencies: (p.agencies ?? []).length,
    [`by.${GRANT_YEAR}`]: p.by[GRANT_YEAR],
  },
});

function programAgency(p, agencies) {
  if (shareWord(p.ag, p.n)) return null;
  const options = choices(
    p.ag,
    agencies.filter(
      (a) => a !== p.ag && !shareWord(a, p.ag) && !shareWord(a, p.n),
    ),
    p.id,
  );
  if (!options) return null;
  const [total, count] = p.by[GRANT_YEAR];
  return {
    template: 'grant-program-agency',
    deck: 'money',
    kind: 'mc',
    prompt: `Which agency runs ${programName(p.n)}?`,
    options,
    fact: p.ag,
    explanation: `The program awarded ${grouped(count)} grants worth ${moneyWords(total)} in ${GRANT_YEAR}.`,
    source: 'GrantConnect grant awards',
    link: { href: `/money/grants?program=${p.id}`, label: p.n },
    record: programRecord(p),
    // One question per program name: GrantConnect repeats some names.
    uses: [p.id, `program:${p.n.toLowerCase()}`],
  };
}

function programYearTotal(p) {
  const [total, count] = p.by[GRANT_YEAR];
  return {
    template: 'grant-program-year-total',
    deck: 'money',
    kind: 'slider',
    prompt: `How much did ${programName(p.n)} award in grants in ${GRANT_YEAR}?`,
    answer: Math.round(total),
    min: 1_000_000,
    max: 10_000_000_000,
    scale: 'log',
    format: 'money',
    fact: `${moneyWords(total)} across ${grouped(count)} grants`,
    explanation: `${capital(the(p.ag))} runs it. The figure counts grants published on GrantConnect for the ${GRANT_YEAR} financial year.`,
    source: 'GrantConnect grant awards',
    link: { href: `/money/grants?program=${p.id}`, label: p.n },
    record: programRecord(p),
    // One question per program name: GrantConnect repeats some names.
    uses: [p.id, `program:${p.n.toLowerCase()}`],
  };
}

// ---------- contracts ----------
const COMPANY =
  /\b(Pty\.? Ltd|Pty\.? Limited|Limited|Ltd\.?|Corporation|Inc\.?|LLC|plc)$/i;
const TRUST = /\btrust(ee)?s?\b/i;
const firstWord = (s) =>
  s
    .toLowerCase()
    .replace(/^the /, '')
    .split(/[^a-z0-9]+/)[0];
/**
 * A supplier the question may name: the record says it is a company (the
 * app shows no person's name as a supplier), and its name reads as one.
 */
const isCompany = (supplier) =>
  supplier?.identity?.kind === 'company' &&
  COMPANY.test(supplier.name.trim()) &&
  !TRUST.test(supplier.name) &&
  !shouting(supplier.name);
/** A name written all in capitals ("ACME PTY LTD") reads as shouting. */
const shouting = (name) => {
  const letters = name.replace(/[^A-Za-z]/g, '');
  return (
    letters.length > 0 &&
    letters.replace(/[^A-Z]/g, '').length / letters.length > 0.8
  );
};
const supplierOf = (agency, contract) =>
  (agency.suppliers ?? []).find((s) => s.id === contract.supplier_id) ?? null;
/** The agency's contracts, filtered to the contract's supplier. */
const contractsLink = (agency, contract) => ({
  href: `/subject/agency/${agency.id}?section=contracts&supplier=${contract.supplier_id}`,
  label: agency.name,
});

/** Each agency's largest contract that starts in CONTRACT_YEAR, or null. */
export function largestContract(agency) {
  const starts = (agency.contracts ?? []).filter((c) =>
    (c.start_date ?? '').startsWith(CONTRACT_YEAR),
  );
  if (starts.length < 50) return null;
  const sorted = [...starts].sort(
    (a, b) => Number(b.amount) - Number(a.amount),
  );
  const [top, next] = sorted;
  // A tie has no single largest contract.
  if (next && Number(next.amount) === Number(top.amount)) return null;
  return {
    top,
    runnerUp: next ? Number(next.amount) : 0,
    count: starts.length,
  };
}

const contractRecord = (agency, largest, optionNames) => ({
  path: `agencies/${agency.id}.json`,
  fields: {
    agency: agency.id,
    agency_name: agency.name,
    contract: {
      id: largest.top.id,
      supplier: largest.top.supplier,
      supplier_id: largest.top.supplier_id,
      supplier_kind: supplierOf(agency, largest.top)?.identity?.kind ?? null,
      amount: largest.top.amount,
      start_date: largest.top.start_date,
      end_date: largest.top.end_date,
    },
    runner_up_amount: largest.runnerUp,
    contracts_starting: largest.count,
    suppliers: optionNames,
  },
});

function contractSupplier(agency, largest) {
  const { top } = largest;
  if (!isCompany(supplierOf(agency, top))) return null;
  const others = (agency.suppliers ?? [])
    .filter(
      (s) =>
        s.name !== top.supplier &&
        isCompany(s) &&
        firstWord(s.name) !== firstWord(top.supplier),
    )
    .slice(0, 8)
    .map((s) => s.name);
  const options = choices(
    top.supplier,
    others,
    top.id,
    (a, b) => firstWord(a) === firstWord(b),
  );
  if (!options) return null;
  return {
    template: 'contract-largest-supplier',
    deck: 'money',
    kind: 'mc',
    prompt: `Which company holds the largest ${agency.name} contract that starts in ${CONTRACT_YEAR}? It is worth ${moneyWords(top.amount)}.`,
    options,
    fact: top.supplier,
    explanation: `Contract ${top.id} runs from ${longDate(top.start_date)} to ${longDate(top.end_date)}. The other companies are among the agency's largest suppliers.`,
    source: 'AusTender contract notices',
    link: contractsLink(agency, top),
    record: contractRecord(
      agency,
      largest,
      options.map((o) => o.label),
    ),
    uses: [agency.id, top.id],
  };
}

function contractValue(agency, largest) {
  const { top } = largest;
  if (!isCompany(supplierOf(agency, top))) return null;
  return {
    template: 'contract-largest-value',
    deck: 'money',
    kind: 'slider',
    prompt: `How much is the largest ${agency.name} contract that starts in ${CONTRACT_YEAR} worth?`,
    answer: Math.round(Number(top.amount)),
    min: 1_000_000,
    max: 10_000_000_000,
    scale: 'log',
    format: 'money',
    fact: moneyWords(top.amount),
    explanation: `Contract ${top.id} with ${top.supplier} runs from ${longDate(top.start_date)} to ${longDate(top.end_date)}. Values are contract awards published on AusTender, not money spent.`,
    source: 'AusTender contract notices',
    link: contractsLink(agency, top),
    record: contractRecord(agency, largest, []),
    uses: [agency.id, top.id],
  };
}

// ---------- the deck ----------
/** Every text a reader sees in a question. */
export const questionTexts = (q) => [
  q.prompt,
  q.fact,
  q.explanation,
  q.source,
  q.link.label,
  ...(q.options ?? []).map((o) => o.label),
];

/**
 * Builds the deck from loaded records (see loadTodayInputs). Returns the
 * deck in the stored front-page shape, each question's record excerpt keyed
 * by id, and each source's as-at date.
 */
export function buildTodayDeck(inputs) {
  const { bills, divisions, programs, agencies } = inputs;
  const currentParliament = Math.max(...bills.map((b) => b.parliament ?? 0));
  const current = bills.filter(
    (b) => b.parliament === currentParliament && usableBill(b),
  );
  const newestFirst = (a, b) =>
    latestDate(b).localeCompare(latestDate(a)) || a.key.localeCompare(b.key);

  // Portfolios that brought at least five bills this parliament.
  const portfolioCounts = new Map();
  for (const b of current)
    portfolioCounts.set(
      govPortfolio(b),
      (portfolioCounts.get(govPortfolio(b)) ?? 0) + 1,
    );
  const portfolios = [...portfolioCounts]
    .filter(([, n]) => n >= 5)
    .map(([p]) => p);

  const passed = current.filter((b) => b.status === 'passed').sort(newestFirst);
  const ended = bills
    .filter((b) => usableBill(b) && billEnding(b))
    .sort(newestFirst);

  const billsByTitle = new Map(
    current.map((b) => [billTitle(b).toLowerCase(), b]),
  );
  const votes = divisions
    .map((d) => {
      const title = thirdReadingBill(d.name);
      const bill = title && billsByTitle.get(title.toLowerCase());
      return bill && (bill.divisions ?? []).some((x) => x.key === d.key)
        ? { d, bill }
        : null;
    })
    .filter(Boolean)
    .sort(
      (x, y) =>
        y.d.date.localeCompare(x.d.date) || x.d.key.localeCompare(y.d.key),
    );

  const yearPrograms = programs
    .filter(usableProgram)
    .sort(
      (a, b) =>
        b.by[GRANT_YEAR][0] - a.by[GRANT_YEAR][0] || a.id.localeCompare(b.id),
    );
  const programAgencies = [
    ...new Set(
      programs.filter((p) => p.by?.[GRANT_YEAR] && p.ag).map((p) => p.ag),
    ),
  ].sort();

  const largest = agencies
    .filter((a) => !BLOCKED.test(a.name))
    .map((a) => ({ agency: a, largest: largestContract(a) }))
    .filter((x) => x.largest)
    .sort(
      (x, y) => Number(y.largest.top.amount) - Number(x.largest.top.amount),
    );

  const pools = {
    // True and False in turn (see LAW_TURNS), so neither is a safe guess.
    'bill-became-law:true': passed.map(billBecameLaw),
    'bill-became-law:false': ended.map(billBecameLaw),
    'bill-portfolio': [...current]
      .sort(newestFirst)
      .map((b) => billPortfolio(b, portfolios)),
    'division-third-reading': votes.map(({ d, bill }) => divisionVote(d, bill)),
    'grant-program-agency': yearPrograms.map((p) =>
      programAgency(p, programAgencies),
    ),
    'grant-program-year-total': yearPrograms.map(programYearTotal),
    'contract-largest-supplier': largest.map((x) =>
      contractSupplier(x.agency, x.largest),
    ),
    'contract-largest-value': largest.map((x) =>
      contractValue(x.agency, x.largest),
    ),
  };

  const deck = [];
  const records = {};
  const used = new Set();
  const answers = new Map();
  const cursor = Object.fromEntries(Object.keys(pools).map((t) => [t, 0]));
  const rightLabel = (q) => q.options?.find((o) => o.correct)?.label;
  const fits = (q) =>
    q.uses.every((k) => !used.has(k)) &&
    !used.has(questionId(q)) &&
    !(q.kind === 'mc' && (answers.get(rightLabel(q)) ?? 0) >= ANSWER_CAP) &&
    questionTexts(q).every((t) => !BLOCKED.test(t) && !BANNED.test(t));
  const next = (template) => {
    const pool = pools[template];
    while (cursor[template] < pool.length) {
      const q = pool[cursor[template]++];
      if (q && fits(q)) return q;
    }
    return null;
  };
  // The law slot asks True, then False, and only moves on once it has
  // asked: when one side runs out, the slot stops, one question at most out
  // of balance.
  let lawTurn = 0;
  for (let round = 0; round < ROUNDS; round++)
    for (const template of ROTATION) {
      // When a pool runs dry, two slots of one family can meet: skip.
      if (deck.length && family(template) === family(deck.at(-1).template))
        continue;
      const law = template === 'bill-became-law';
      const q = next(law ? LAW_TURNS[lawTurn % 2] : template);
      if (!q) continue;
      if (law) lawTurn++;
      [...q.uses, questionId(q)].forEach((k) => used.add(k));
      if (q.kind === 'mc')
        answers.set(rightLabel(q), (answers.get(rightLabel(q)) ?? 0) + 1);
      const { record, uses, ...stored } = q;
      const id = questionId(stored);
      for (const text of questionTexts(stored))
        if (BANNED.test(text))
          throw new Error(`${id}: banned word in "${text}"`);
      deck.push({ id, ...stored });
      records[id] = record;
    }
  // The deck wraps: its last day is followed by its first.
  while (
    deck.length > 1 &&
    family(deck.at(-1).template) === family(deck[0].template)
  )
    delete records[deck.pop().id];

  const asOf = {
    bill: inputs.billsAsOf,
    division: divisions.reduce((m, d) => (d.date > m ? d.date : m), ''),
    grant: programs
      .reduce((m, p) => ((p.generated ?? '') > m ? p.generated : m), '')
      .slice(0, 10),
    contract: inputs.contractsAsOf,
  };
  return { deck, records, asOf };
}

// ---------- reading the exports ----------
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/**
 * Reads the records the deck draws on from a portal checkout's `public/`
 * directory, with a SHA-256 over each family's files.
 */
export function loadTodayInputs(publicRoot) {
  const at = (...parts) => resolve(publicRoot, ...parts);
  const hashes = {};
  const digest = (family, names, read) => {
    const hash = createHash('sha256');
    const out = names.sort().map((name) => {
      const bytes = readFileSync(read(name));
      hash.update(name).update(bytes);
      return JSON.parse(bytes);
    });
    hashes[family] = hash.digest('hex');
    return out;
  };

  const bills = digest(
    'bills',
    readdirSync(at('bills')).filter((f) =>
      /^au-federal-[rs]\d+\.json$/.test(f),
    ),
    (f) => at('bills', f),
  );
  const billsAsOf = (
    readJson(at('bills', 'index.json')).generated_at ?? ''
  ).slice(0, 10);

  const divisions = digest(
    'divisions',
    readdirSync(at('divisions')).filter((f) =>
      f.startsWith('division-federal-'),
    ),
    (f) => at('divisions', f),
  )
    .filter((d) => d.jurisdiction === 'federal')
    .map(({ key, name, house, date, ayes, noes, result }) => ({
      key,
      name,
      house,
      date,
      ayes,
      noes,
      result,
    }));

  const programs = digest(
    'grants',
    readdirSync(at('grants', 'federal', 'programs')).filter((f) =>
      f.endsWith('.json'),
    ),
    (f) => at('grants', 'federal', 'programs', f),
  );

  const index = readJson(at('agencies.json'));
  const agencies = digest(
    'agencies',
    index.agencies.map((a) => a.profile_path.replace(/^\//, '')),
    (p) => at(p),
  ).map(({ id, name, contracts, suppliers }) => ({
    id,
    name,
    contracts,
    suppliers,
  }));
  const contractsAsOf = (index.meta?.generated_at ?? '').slice(0, 10);

  return {
    bills,
    billsAsOf,
    divisions,
    programs,
    agencies,
    contractsAsOf,
    hashes,
  };
}
