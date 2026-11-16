// Today's question: one fact a day from the public record, never about
// OPAX itself. Bills (did it become law, which portfolio), third-reading
// votes, grant programs and Commonwealth contracts, each read from one field
// of one record in the portal's public exports. Deterministic: no model, no
// network. See src/features/explore/README.md.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { decidingDivision } from '../../portal/public/bill-division.js';
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
  // "7.50" reads "7.5", "10.0" reads "10".
  const trim = (s) => s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
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
/**
 * One word inside the other ("Sport" in "Sporting", "Communications" in
 * "Telecommunications") or a shared stem ("Financial", "Finance").
 */
function sameStem(a, b) {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 5 && long.includes(short)) return true;
  let i = 0;
  while (i < short.length && short[i] === long[i]) i++;
  return i >= 6;
}
export const shareWord = (a, b) =>
  words(a).some((w) => words(b).some((v) => sameStem(w, v)));

// ---------- bills ----------
const billTitle = (b) => (b.short_title || b.title || '').trim();
/** A government bill's portfolio; a private member's bill names its member. */
const govPortfolio = (b) =>
  b.portfolio && !/^\(|\bMP\b|Senator/.test(b.portfolio) ? b.portfolio : null;
/** The year in a bill's title ("… Bill (No. 2) 2026"), or null. */
const titleYear = (b) => {
  const years = billTitle(b).match(/\b(?:19|20)\d{2}\b/g);
  return years ? Number(years.at(-1)) : null;
};
const usableBill = (b) =>
  b.jurisdiction === 'federal' &&
  !!govPortfolio(b) &&
  billTitle(b).length > 0 &&
  billTitle(b).length <= 90 &&
  !BLOCKED.test(billTitle(b)) &&
  !BANNED.test(billTitle(b)) &&
  // A title dated after the bill's introduction reads as an error.
  !(b.introduced && titleYear(b) > Number(b.introduced.slice(0, 4)));
/** "the Treasury portfolio", "the Attorney-General's portfolio". */
const portfolioPhrase = (p) =>
  `the ${p === 'Attorney-General' ? "Attorney-General's" : p} portfolio`;
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
    explanation: `The ${title} is a government bill from ${portfolioPhrase(answer)}, introduced on ${longDate(b.introduced)}.`,
    source: 'ParlInfo bill record',
    link: { href: `/bill/${b.key}`, label: title },
    record: billRecord(b),
    uses: [b.key],
  };
}

// ---------- third-reading votes ----------
const HOUSES = {
  senate: { name: 'Senate', members: 'senators' },
  representatives: {
    name: 'House of Representatives',
    members: 'members of the House',
  },
};

/**
 * The vote that decided a bill, by the shared rule (portal/public/
 * bill-division.js, also behind the daily post's vote slide): the third
 * reading in the second house, else its latest third reading, read from the
 * question the Chair put, never a closure or other procedural motion filed
 * under the same name. Null when that is not a third reading, when its
 * division file is missing, or when it decided a package of bills at once.
 */
/**
 * Whether a division's name says it decided several bills at once:
 * "Bills — A Bill 2026, B Bill 2026; Third Reading" names each one, and They
 * Vote For You's "A Bill 2025 and another - Third Reading - Pass the bills"
 * (federal-senate-10151) names one and counts the rest.
 */
export function packageVote(name) {
  const text = name ?? '';
  return (
    (text.match(/\bBill\b/g)?.length ?? 0) > 1 ||
    /\band (?:another|others|\d+ others)\b|\bpass the bills\b/i.test(text)
  );
}

export function billThirdReading(bill, divisionFiles) {
  const listed = (bill.divisions ?? []).map((d) => ({
    ...d,
    ...(divisionFiles.get(d.key) ?? {}),
  }));
  const deciding = decidingDivision(listed, {
    originatingHouse: bill.originating_house ?? null,
  });
  if (!deciding || deciding.reading !== 'third') return null;
  const d = divisionFiles.get(deciding.division.key);
  if (!d || !HOUSES[d.house]) return null;
  if (packageVote(d.name)) return null;
  return { d, outcome: deciding.outcome };
}

function divisionVote({ d, outcome }, bill) {
  const title = billTitle(bill);
  const house = HOUSES[d.house];
  const ayes = Number(d.ayes);
  const noes = Number(d.noes);
  const on = longDate(d.date);
  return {
    template: 'division-third-reading',
    deck: 'words',
    kind: 'slider',
    prompt:
      outcome === 'Passed'
        ? `The ${title} passed the ${house.name} at its third reading on ${on}. How many ${house.members} voted for it?`
        : `The third reading of the ${title} was not agreed to in the ${house.name} on ${on}. How many ${house.members} voted for it?`,
    answer: ayes,
    min: 0,
    max: d.house === 'senate' ? 76 : 150,
    scale: 'linear',
    format: 'count',
    fact: `${outcome}: ${grouped(ayes)} for, ${grouped(noes)} against`,
    explanation: `The third reading is the final vote on a bill in each house. ${grouped(ayes)} ${house.members} voted for it and ${grouped(noes)} against.`,
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
        question: d.question ?? null,
        house: d.house,
        date: d.date,
        ayes: d.ayes,
        noes: d.noes,
        result: d.result,
        outcome,
        bill: bill.key,
        bill_lists_division: true,
        // Every division the bill lists, which the rule chose from.
        bill_divisions: (bill.divisions ?? []).map((x) => x.key),
      },
    },
    uses: [d.key, bill.key, `${d.house}:${d.date}`],
  };
}

// ---------- grant programs ----------
// GrantConnect publishes each funding round (a GO id) as its own record and
// reuses a program's name across its rounds. A question names a program, so
// it counts every round with that name: rounds with the same name and agency
// are one program here.
const nameKey = (n) => n.toLowerCase().replace(/\s+/g, ' ').trim();
const GENERIC = new Set([
  'program',
  'programme',
  'system',
  'scheme',
  'grant',
  'initiative',
  'the',
  'and',
  'for',
]);
/**
 * Twin names ("Incentive System", "Incentives Programme") share this key, so
 * the deck asks about one of them.
 */
const twinKey = (n) =>
  (n.toLowerCase().match(/[a-z]+/g) ?? [])
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .filter((w) => !GENERIC.has(w))
    .join(' ');
const yearMoney = (p) => p.by?.[GRANT_YEAR] ?? null;

/**
 * Programs with grants in GRANT_YEAR: every round that carries the name,
 * the largest first, with their summed total and count. The agency is the
 * one every round names, or null when the rounds disagree.
 */
export function grantPrograms(programs) {
  const byName = new Map();
  for (const p of programs)
    if (p.n && Array.isArray(yearMoney(p)))
      byName.set(nameKey(p.n), [...(byName.get(nameKey(p.n)) ?? []), p]);
  return [...byName.values()].map((list) => {
    const rounds = [...list].sort(
      (a, b) => yearMoney(b)[0] - yearMoney(a)[0] || a.id.localeCompare(b.id),
    );
    const agencies = new Set(rounds.map((p) => p.ag));
    const sole = rounds.every((p) => (p.agencies ?? []).length === 1);
    return {
      n: rounds[0].n,
      ag: agencies.size === 1 && sole ? rounds[0].ag : null,
      main: rounds[0],
      rounds,
      total: rounds.reduce((s, p) => s + yearMoney(p)[0], 0),
      count: rounds.reduce((s, p) => s + yearMoney(p)[1], 0),
      c: rounds.reduce((s, p) => s + (p.c ?? 0), 0),
      // The date the files its figures are read from were written.
      generated: rounds
        .map((p) => (p.generated ?? '').slice(0, 10))
        .sort()
        .at(-1),
    };
  });
}

/**
 * A program a reader can name: GrantConnect GO ids, a real name with no
 * acronyms, numbers or one-off projects, one current agency and enough
 * grants.
 */
const usableProgram = (g, former) =>
  g.rounds.every((p) => /^GO\d+$/.test(p.id) && p.n !== p.id) &&
  g.n.length <= 70 &&
  !/\s-\s|\(|\b[A-Z]{2,}\b|\d|\bSppt\b|\bProject\b/.test(g.n) &&
  !BLOCKED.test(g.n) &&
  !!g.ag &&
  !former.has(g.ag) &&
  g.c >= 10 &&
  g.count >= 5;
/** "the Medicare Urgent Care Clinics program", "the Industry Growth Program". */
const programName = (n) =>
  /\b(program|programme|fund|scheme|initiative|system)$/i.test(n)
    ? `the ${n}`
    : `the ${n} program`;
const programRecord = (g) => ({
  path: `grants/federal/programs/${g.main.key}.json`,
  fields: {
    id: g.main.id,
    n: g.n,
    ag: g.ag,
    generated: g.generated,
    [`by.${GRANT_YEAR}`]: [g.total, g.count],
    // Every round with this name and grants in GRANT_YEAR.
    rounds: g.rounds.map((p) => ({
      path: `grants/federal/programs/${p.key}.json`,
      id: p.id,
      ag: p.ag,
      agencies: (p.agencies ?? []).length,
      [`by.${GRANT_YEAR}`]: yearMoney(p),
    })),
  },
});
const programLink = (g) => ({
  href: `/money/grants?program=${g.main.id}`,
  label: g.n,
});
// One question per program, and one of a pair of twin names.
const programUses = (g) => [
  ...g.rounds.map((p) => p.id),
  `program:${twinKey(g.n)}`,
];

function programAgency(g, agencies) {
  if (shareWord(g.ag, g.n)) return null;
  const options = choices(
    g.ag,
    agencies.filter(
      (a) => a !== g.ag && !shareWord(a, g.ag) && !shareWord(a, g.n),
    ),
    g.main.id,
  );
  if (!options) return null;
  const awarded = `${grouped(g.count)} grants worth ${moneyWords(g.total)}`;
  const published = `as published on GrantConnect by ${longDate(g.generated)}`;
  return {
    template: 'grant-program-agency',
    deck: 'money',
    kind: 'mc',
    prompt: `Which agency runs ${programName(g.n)}?`,
    options,
    fact: g.ag,
    explanation:
      g.rounds.length > 1
        ? `Across ${g.rounds.length} funding rounds with grants in ${GRANT_YEAR}, the program awarded ${awarded}, ${published}.`
        : `The program awarded ${awarded} in ${GRANT_YEAR}, ${published}.`,
    source: 'GrantConnect grant awards',
    link: programLink(g),
    record: programRecord(g),
    uses: programUses(g),
  };
}

/**
 * A program's GRANT_YEAR total. Asked only of a program with one round, so
 * the figure is the one its page shows.
 */
function programYearTotal(g) {
  if (g.rounds.length !== 1) return null;
  return {
    template: 'grant-program-year-total',
    deck: 'money',
    kind: 'slider',
    prompt: `How much did ${programName(g.n)} award in grants in ${GRANT_YEAR}?`,
    answer: Math.round(g.total),
    min: 1_000_000,
    max: 10_000_000_000,
    scale: 'log',
    format: 'money',
    fact: `${moneyWords(g.total)} across ${grouped(g.count)} grants`,
    explanation: `${capital(the(g.ag))} runs it. The figure counts grants published on GrantConnect by ${longDate(g.generated)} for the ${GRANT_YEAR} financial year.`,
    source: 'GrantConnect grant awards',
    link: programLink(g),
    record: programRecord(g),
    uses: programUses(g),
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

/** "Department of Foreign Affairs and Trade - Australian Aid Program" → its department. */
const departmentName = (name) => name.split(' - ')[0].trim();

/**
 * AusTender lists some departments under more than one agency record
 * ("Department of Foreign Affairs and Trade" and "Department of Foreign
 * Affairs and Trade - Australian Aid Program"). A reader takes them as one
 * department, so a department's contracts and suppliers are those of all its
 * records. Each contract keeps the record it is `listed` under.
 */
export function departments(agencies) {
  const byName = new Map();
  for (const a of agencies)
    byName.set(departmentName(a.name), [
      ...(byName.get(departmentName(a.name)) ?? []),
      a,
    ]);
  return [...byName].map(([name, records]) => {
    const suppliers = new Map();
    for (const s of records.flatMap((a) => a.suppliers ?? []))
      suppliers.set(
        s.id,
        suppliers.has(s.id)
          ? { ...s, total: suppliers.get(s.id).total + s.total }
          : s,
      );
    return {
      name,
      records,
      contracts: records.flatMap((a) =>
        (a.contracts ?? []).map((c) => ({ ...c, listed: a })),
      ),
      // The largest first, as each record lists them.
      suppliers:
        records.length === 1
          ? (records[0].suppliers ?? [])
          : [...suppliers.values()].sort(
              (a, b) => Number(b.total) - Number(a.total),
            ),
    };
  });
}

/**
 * Agency names AusTender still lists with past contracts but none starting
 * in CONTRACT_YEAR: departments since renamed, such as the Department of
 * Health and Aged Care. Never an answer or a wrong option.
 */
export function formerAgencyNames(agencies) {
  return new Set(
    agencies
      .filter(
        (a) =>
          (a.contracts ?? []).length > 0 &&
          !a.contracts.some((c) =>
            (c.start_date ?? '').startsWith(CONTRACT_YEAR),
          ),
      )
      .map((a) => a.name),
  );
}

/** A department's largest contract that starts in CONTRACT_YEAR, or null. */
export function largestContract(department) {
  const starts = (department.contracts ?? []).filter((c) =>
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

const contractRecord = (department, largest, optionNames, asOf) => ({
  path: `agencies/${largest.top.listed.id}.json`,
  fields: {
    agency: largest.top.listed.id,
    agency_name: largest.top.listed.name,
    department: department.name,
    // Every AusTender record of the department, largest counted across all.
    department_records: department.records.map((a) => a.id),
    contract: {
      id: largest.top.id,
      supplier: largest.top.supplier,
      supplier_id: largest.top.supplier_id,
      supplier_kind:
        supplierOf(largest.top.listed, largest.top)?.identity?.kind ?? null,
      // The supplier entry on the same record, and the ABN's legal name.
      supplier_entry_name:
        supplierOf(largest.top.listed, largest.top)?.name ?? null,
      abn: supplierOf(largest.top.listed, largest.top)?.abn ?? null,
      legal_name:
        supplierOf(largest.top.listed, largest.top)?.identity?.legal_name ??
        null,
      amount: largest.top.amount,
      start_date: largest.top.start_date,
      end_date: largest.top.end_date,
    },
    runner_up_amount: largest.runnerUp,
    // Internal: contracts starting in CONTRACT_YEAR in this export.
    contracts_starting: largest.count,
    export_date: asOf,
    suppliers: optionNames,
  },
});
/**
 * "DT GLOBAL ASIA PACIFIC PTY LTD" as "DT Global Asia Pacific Pty Ltd", and
 * "SMITH AND JONES PTY LTD" as "Smith and Jones Pty Ltd": other short words
 * stay as written, since they are often initials.
 */
const SUFFIX_CASE = { PTY: 'Pty', LTD: 'Ltd', LIMITED: 'Limited', INC: 'Inc' };
/** Joining words, lower case inside a name and capitalised at its start. */
const JOINING = new Set(['AND', 'OF', 'FOR', 'THE']);
export const legalCase = (name) =>
  name
    .split(/\s+/)
    .map(
      (w, i) =>
        SUFFIX_CASE[w.replace(/\W/g, '')] ??
        (JOINING.has(w)
          ? i === 0
            ? capital(w.toLowerCase())
            : w.toLowerCase()
          : w.length <= 3 || /\d/.test(w)
            ? w
            : w.charAt(0) + w.slice(1).toLowerCase()),
    )
    .join(' ');
const sameName = (a, b) => {
  const key = (s) =>
    s
      .toUpperCase()
      .replace(/\bLIMITED\b/g, 'LTD')
      .replace(/\bPROPRIETARY\b/g, 'PTY')
      .replace(/&/g, 'AND')
      .replace(/^THE\s+/, '')
      .replace(/[^A-Z0-9]/g, '');
  return key(a) === key(b);
};
/**
 * The supplier as the record the link opens names it: its contract row and
 * its supplier entry must agree, or the question is left out. When the ABN's
 * current legal name differs, the reveal says so.
 */
function namedSupplier(top) {
  const entry = supplierOf(top.listed, top);
  if (!isCompany(entry) || entry.name !== top.supplier) return null;
  const legal = entry.identity?.legal_name;
  return {
    entry,
    now:
      legal && !sameName(legal, entry.name)
        ? ` ${top.supplier} is now ${legalCase(legal)} (same ABN).`
        : '',
  };
}
/** The largest as at the export: more 2026 contracts may be published later. */
const largestAsOf = (asOf) =>
  ` Of the contracts starting in ${CONTRACT_YEAR} that AusTender had published by ${longDate(asOf)}, it is the largest.`;

/** Where the contract is listed, when that is not the department's own name. */
const listedUnder = (department, top) =>
  top.listed.name === department.name
    ? ''
    : ` AusTender lists it under ${the(top.listed.name)}.`;

function contractSupplier(department, largest, asOf) {
  const { top } = largest;
  const named = namedSupplier(top);
  if (!named) return null;
  const others = (department.suppliers ?? [])
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
    prompt: `Which company holds the largest ${department.name} contract that starts in ${CONTRACT_YEAR}? It is worth ${moneyWords(top.amount)}.`,
    options,
    fact: top.supplier,
    explanation: `Contract ${top.id} runs from ${longDate(top.start_date)} to ${longDate(top.end_date)}.${listedUnder(department, top)}${named.now}${largestAsOf(asOf)} The other companies are among the agency's largest suppliers.`,
    source: 'AusTender contract notices',
    link: contractsLink(top.listed, top),
    record: contractRecord(
      department,
      largest,
      options.map((o) => o.label),
      asOf,
    ),
    uses: [`agency:${department.name}`, top.id],
  };
}

function contractValue(department, largest, asOf) {
  const { top } = largest;
  const named = namedSupplier(top);
  if (!named) return null;
  return {
    template: 'contract-largest-value',
    deck: 'money',
    kind: 'slider',
    prompt: `How much is the largest ${department.name} contract that starts in ${CONTRACT_YEAR} worth?`,
    answer: Math.round(Number(top.amount)),
    min: 1_000_000,
    max: 10_000_000_000,
    scale: 'log',
    format: 'money',
    fact: moneyWords(top.amount),
    explanation: `Contract ${top.id} with ${top.supplier} runs from ${longDate(top.start_date)} to ${longDate(top.end_date)}.${listedUnder(department, top)}${named.now}${largestAsOf(asOf)} Values are contract awards, not money spent.`,
    source: 'AusTender contract notices',
    link: contractsLink(top.listed, top),
    record: contractRecord(department, largest, [], asOf),
    uses: [`agency:${department.name}`, top.id],
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
  // A package's bills share a portfolio and an introduction date. When a
  // sibling passed on the day a bill was dropped, the measure may have gone
  // through in the sibling (the Build to Rent bill, 28 November 2024), so
  // "it did not become law" misleads: no question.
  const packageOf = (b) => `${b.portfolio}|${b.introduced}`;
  const laws = new Map();
  for (const b of bills)
    if (b.status === 'passed' && assentDate(b) && b.introduced)
      laws.set(packageOf(b), [...(laws.get(packageOf(b)) ?? []), b]);
  const siblingPassedThatDay = (b) =>
    (laws.get(packageOf(b)) ?? []).some((s) =>
      (s.key_dates ?? []).some((k) => k.date === endingDate(b)),
    );
  const ended = bills
    .filter((b) => usableBill(b) && billEnding(b) && !siblingPassedThatDay(b))
    .sort(newestFirst);

  const divisionFiles = new Map(divisions.map((d) => [d.key, d]));
  const votes = current
    .map((bill) => ({ bill, vote: billThirdReading(bill, divisionFiles) }))
    .filter((x) => x.vote)
    .sort(
      (x, y) =>
        y.vote.d.date.localeCompare(x.vote.d.date) ||
        x.vote.d.key.localeCompare(y.vote.d.key),
    );

  const former = formerAgencyNames(agencies);
  const yearPrograms = grantPrograms(programs)
    .filter((g) => usableProgram(g, former))
    .sort((a, b) => b.total - a.total || a.main.id.localeCompare(b.main.id));
  // Wrong options: agencies with grants this year, under a current name.
  const programAgencies = [
    ...new Set(
      programs
        .filter((p) => yearMoney(p) && p.ag && !former.has(p.ag))
        .map((p) => p.ag),
    ),
  ].sort();

  const largest = departments(agencies)
    .filter((d) => !d.records.some((a) => BLOCKED.test(a.name)))
    .map((d) => ({ department: d, largest: largestContract(d) }))
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
    'division-third-reading': votes.map(({ vote, bill }) =>
      divisionVote(vote, bill),
    ),
    // A program with several rounds goes to the agency question, whose
    // answer does not hang on one round's total.
    'grant-program-agency': [
      ...yearPrograms.filter((g) => g.rounds.length > 1),
      ...yearPrograms.filter((g) => g.rounds.length === 1),
    ].map((g) => programAgency(g, programAgencies)),
    'grant-program-year-total': yearPrograms.map(programYearTotal),
    'contract-largest-supplier': largest.map((x) =>
      contractSupplier(x.department, x.largest, inputs.contractsAsOf),
    ),
    'contract-largest-value': largest.map((x) =>
      contractValue(x.department, x.largest, inputs.contractsAsOf),
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

  // Each template's source date, by the template's own name.
  const exported = {
    bill: inputs.billsAsOf,
    division: divisions.reduce((m, d) => (d.date > m ? d.date : m), ''),
    grant: programs
      .reduce((m, p) => ((p.generated ?? '') > m ? p.generated : m), '')
      .slice(0, 10),
    contract: inputs.contractsAsOf,
  };
  const asOf = Object.fromEntries(
    [...new Set(ROTATION)].map((t) => [t, exported[family(t)]]),
  );
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
    .map(({ key, name, question, bills, house, date, ayes, noes, result }) => ({
      key,
      name,
      question,
      bills,
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
