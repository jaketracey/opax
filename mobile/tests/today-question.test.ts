// Today's question asks about the public record, never about OPAX: bills,
// third-reading votes, grant programs and Commonwealth contracts, one fact
// from one record each (scripts/today-question.mjs). These tests check the
// bundled deck against the record excerpts its generator wrote, its stored
// shape against the deck build 57 shipped, and the generator's rules on
// small records.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import frontPage from '../src/features/explore/quiz-front-page.json';
import sources from '../src/features/explore/quiz-front-page-sources.json';
import { quizDestination } from '../src/features/explore/quiz-links';
import {
  formatGuess,
  grade,
  quizId,
  type FrontPageQuestion,
} from '../src/features/explore/quiz-model';
import { quizPublisher } from '../src/features/explore/quiz-source';
import { frontPageDeck, questionAsOf } from '../src/features/explore/quiz/data';
import { questionIndex } from '../src/features/today/rules';
import { fromWebPath } from '../src/navigation/routes';
import records from './fixtures/today-question-records.json';

const deck = frontPage as FrontPageQuestion[];
type Excerpt = { path: string; fields: Record<string, unknown> };
const record = (q: FrontPageQuestion) =>
  (records as Record<string, Excerpt>)[q.id]!;
const right = (q: FrontPageQuestion) =>
  q.options?.find((o) => o.correct)?.label;
const texts = (q: FrontPageQuestion) => [
  q.prompt,
  q.fact,
  q.explanation,
  q.source,
  q.link.label,
  ...(q.options ?? []).map((o) => o.label),
];

// Written here, not imported from the generator, so a change there cannot
// loosen the check.
const BANNED =
  /\bopax\b|\breports?\b|\bspeech(es)?\b|\btranscripts?\b|\bhearings?\b|royal commission|\bin the record\b|\bon record\b|\bfound\b|\bfinds?\b/i;
const BLOCKED =
  /royal commission|\bRC[A-Z]{2,}\b|RCIMCP|class action|victoria|big build/i;
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
const longDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m! - 1]} ${y}`;
};

/** The keys each kind used in the front-page deck build 57 (1.1.3) shipped. */
const SHIPPED_KEYS: Record<string, string[]> = {
  slider: [
    'answer',
    'deck',
    'explanation',
    'fact',
    'format',
    'id',
    'kind',
    'link',
    'max',
    'min',
    'prompt',
    'scale',
    'source',
    'template',
  ],
  mc: [
    'deck',
    'explanation',
    'fact',
    'id',
    'kind',
    'link',
    'options',
    'prompt',
    'source',
    'template',
  ],
  tf: [
    'deck',
    'explanation',
    'fact',
    'id',
    'kind',
    'link',
    'options',
    'prompt',
    'source',
    'template',
  ],
};

test('the deck keeps the stored shape build 57 shipped', () => {
  expect(Array.isArray(frontPage)).toBe(true);
  expect(deck.length).toBeGreaterThanOrEqual(40);
  for (const q of deck) {
    expect(Object.keys(SHIPPED_KEYS)).toContain(q.kind);
    expect(Object.keys(q).sort()).toEqual(SHIPPED_KEYS[q.kind]);
    expect(Object.keys(q.link).sort()).toEqual(['href', 'label']);
    for (const o of q.options ?? [])
      expect(Object.keys(o).sort()).toEqual(['correct', 'label']);
    if (q.kind === 'slider') {
      expect(['count', 'money']).toContain(q.format);
      expect(['log', 'linear']).toContain(q.scale);
      expect(q.answer as number).toBeGreaterThanOrEqual(q.min!);
      expect(q.answer as number).toBeLessThanOrEqual(q.max!);
    }
    expect(['words', 'money']).toContain(q.deck);
    expect(q.id).toBe(quizId(q));
  }
  expect(new Set(deck.map((q) => q.id)).size).toBe(deck.length);
  // The app reads it as it reads the rounds: the same questions, by id.
  expect(frontPageDeck.map((q) => q.id)).toEqual(deck.map((q) => q.id));
});

test('no question is about OPAX, a royal commission, a hearing or Victoria', () => {
  for (const q of deck)
    for (const text of texts(q)) {
      expect(text).not.toMatch(BANNED);
      expect(text).not.toMatch(BLOCKED);
      expect(text).not.toMatch(/[—–]/);
    }
});

test("every answer is its record's field", () => {
  expect(Object.keys(records).sort()).toEqual(deck.map((q) => q.id).sort());
  for (const q of deck) {
    const { path, fields: f } = record(q);
    switch (q.template) {
      case 'bill-became-law': {
        expect(path).toBe(`bills/${f.key}.json`);
        expect(q.link.href).toBe(`/bill/${f.key}`);
        const law = f.status === 'passed' && !!f.royal_assent;
        expect(right(q)).toBe(law ? 'True' : 'False');
        if (law)
          expect(q.fact).toBe(
            `True. It received Royal Assent on ${longDate(f.royal_assent as string)}.`,
          );
        else {
          // A dated ending, read from the record: never a lapse.
          expect(f.status).toBe('lapsed');
          expect([
            'negatived',
            'discharged',
            'removed',
            'not_proceeding',
          ]).toContain(f.ended);
          expect(f.status_as_of).toBe(f.last_key_date);
          expect(q.fact).toContain(longDate(f.status_as_of as string));
          expect(q.fact).not.toMatch(/lapsed|dissol/i);
          expect(q.explanation).not.toMatch(/dissol|election/i);
        }
        break;
      }
      case 'bill-portfolio':
        expect(q.link.href).toBe(`/bill/${f.key}`);
        expect(right(q)).toBe(f.portfolio);
        expect(q.fact).toBe(f.portfolio);
        expect(q.explanation).toContain(longDate(f.introduced as string));
        break;
      case 'division-third-reading':
        expect(path).toBe(`divisions/division-${f.key}.json`);
        expect(f.name).toMatch(/; Third Reading$/);
        expect(f.bill_lists_division).toBe(true);
        expect(q.answer).toBe(Number(f.ayes));
        expect(q.fact).toBe(`${f.ayes} for, ${f.noes} against`);
        expect(q.prompt).toContain(longDate(f.date as string));
        expect(q.max).toBe(f.house === 'senate' ? 76 : 150);
        expect(q.link.href).toBe(
          `/bill/${f.bill}?section=divisions&division=${f.key}`,
        );
        break;
      case 'grant-program-agency':
        expect(right(q)).toBe(f.ag);
        expect(q.fact).toBe(f.ag);
        expect(f.agencies).toBe(1);
        expect(q.link.href).toBe(`/money/grants?program=${f.id}`);
        expect(q.prompt).toContain(f.n as string);
        break;
      case 'grant-program-year-total': {
        const [total, count] = f['by.2025-26'] as [number, number];
        expect(q.answer).toBe(Math.round(total));
        expect(q.fact).toMatch(
          new RegExp(` across ${count.toLocaleString('en-AU')} grants$`),
        );
        expect(q.link.href).toBe(`/money/grants?program=${f.id}`);
        break;
      }
      case 'contract-largest-supplier':
      case 'contract-largest-value': {
        const c = f.contract as Record<string, string>;
        expect(path).toBe(`agencies/${f.agency}.json`);
        expect(c.start_date).toMatch(/^2026-/);
        expect(c.supplier_kind).toBe('company');
        expect(Number(c.amount)).toBeGreaterThan(f.runner_up_amount as number);
        expect(q.link.href).toBe(
          `/subject/agency/${f.agency}?section=contracts&supplier=${c.supplier_id}`,
        );
        if (q.template === 'contract-largest-supplier') {
          expect(right(q)).toBe(c.supplier);
          expect(q.fact).toBe(c.supplier);
          expect(q.options!.map((o) => o.label)).toEqual(f.suppliers);
        } else expect(q.answer).toBe(Math.round(Number(c.amount)));
        break;
      }
      default:
        throw new Error(`Unknown template ${q.template}`);
    }
  }
});

test('every question has exactly one right answer, which grades as right', () => {
  for (const q of deck) {
    if (q.options) {
      expect(q.options.filter((o) => o.correct)).toHaveLength(1);
      expect(new Set(q.options.map((o) => o.label)).size).toBe(
        q.options.length,
      );
      expect(q.options).toHaveLength(q.kind === 'tf' ? 2 : 4);
    }
    const answer =
      q.kind === 'slider'
        ? (q.answer as number)
        : q.options!.findIndex((o) => o.correct);
    expect(grade(q, answer).correct).toBe(true);
  }
});

test('no two options are near twins (a department beside its old name)', () => {
  const head = (label: string) =>
    label
      .toLowerCase()
      .replace(/^(the|department|of|australian|national|office|\s)+/g, '')
      .split(/[^a-z0-9]+/)[0];
  for (const q of deck.filter((x) => x.kind === 'mc')) {
    const heads = q.options!.map((o) => head(o.label));
    expect(new Set(heads).size).toBe(heads.length);
    for (const o of q.options!)
      expect(o.label).not.toMatch(/\btrust(ee)?s?\b/i);
  }
});

test('True and False are equally likely, so neither is a safe guess', () => {
  const tf = deck.filter((q) => q.kind === 'tf');
  const yes = tf.filter((q) => right(q) === 'True').length;
  expect(tf.length).toBeGreaterThanOrEqual(6);
  expect(Math.abs(yes - (tf.length - yes))).toBeLessThanOrEqual(1);
});

test('neighbouring days ask about different records, and each record once', () => {
  const family = (q: FrontPageQuestion) => q.template.split('-')[0];
  for (let i = 1; i < deck.length; i++)
    expect(family(deck[i]!)).not.toBe(family(deck[i - 1]!));
  // The deck wraps: the last day is followed by the first.
  expect(family(deck.at(-1)!)).not.toBe(family(deck[0]!));
  const paths = deck.map((q) => record(q).path);
  expect(new Set(paths).size).toBe(paths.length);
  const answers = new Map<string, number>();
  for (const q of deck.filter((x) => x.kind === 'mc'))
    answers.set(right(q)!, (answers.get(right(q)!) ?? 0) + 1);
  expect(Math.max(...answers.values())).toBeLessThanOrEqual(2);
});

test("each question's record opens natively, named, from the reveal's source sheet", () => {
  const publishers: Record<string, string> = {
    bill: 'ParlInfo',
    division: 'They Vote For You',
    grant: 'GrantConnect',
    contract: 'AusTender',
  };
  for (const q of frontPageDeck) {
    const destination = quizDestination(q);
    expect(destination?.kind).toBe('original');
    if (destination?.kind !== 'original') continue;
    expect(destination.original.label).toBe(q.link.label);
    expect(destination.original.url).toBe(q.link.href);
    expect(fromWebPath(destination.original.url)).toEqual(destination.route());
    const family = q.template.split('-')[0]!;
    expect(quizPublisher(q)).toBe(publishers[family]);
    expect(questionAsOf(q)).toBe(
      (sources.asOf as Record<string, string>)[family],
    );
  }
  const vote = deck.find((q) => q.template === 'division-third-reading')!;
  const route = quizDestination(vote)!;
  expect(route.kind === 'original' && route.route()).toEqual({
    pathname: '/bill/[key]',
    params: expect.objectContaining({
      section: 'divisions',
      division: expect.stringMatching(/^federal-/),
    }),
  });
  const contract = deck.find(
    (q) => q.template === 'contract-largest-supplier',
  )!;
  const agency = quizDestination(contract)!;
  expect(agency.kind === 'original' && agency.route()).toEqual({
    pathname: '/agency',
    params: {
      id: record(contract).fields.agency as string,
      section: 'contracts',
      supplier: (record(contract).fields.contract as { supplier_id: string })
        .supplier_id,
    },
  });
});

test('a vote count reads in votes; money in dollars', () => {
  const vote = deck.find((q) => q.template === 'division-third-reading')!;
  expect(formatGuess(vote, 103)).toBe('103 votes');
  const money = deck.find((q) => q.template === 'grant-program-year-total')!;
  expect(formatGuess(money, 1500000)).toBe('$1,500,000');
});

test('Today still picks one question a day, in deck order', () => {
  // dailyQuestion (DailyPair) shows frontPageDeck[questionIndex(today)].
  expect(questionIndex('2026-01-01' as never, deck.length)).toBe(0);
  expect(questionIndex('2026-01-02' as never, deck.length)).toBe(1);
  expect(questionIndex('2026-11-17' as never, deck.length)).toBe(
    320 % deck.length,
  );
});

// ---------- the generator's rules, on small records ----------
const library = pathToFileURL(
  resolve(__dirname, '../scripts/today-question.mjs'),
).href;
const runNode = (code: string) =>
  JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', code], {
      encoding: 'utf8',
    }),
  );

const bill = (key: string, extra: Record<string, unknown>) => ({
  key,
  title: `${key} Amendment Bill 2026`,
  jurisdiction: 'federal',
  parliament: 48,
  introduced: '2026-02-12',
  portfolio: 'Treasury',
  status: 'passed',
  status_as_of: '2026-09-18',
  key_dates: [
    { stage: 'introduced', date: '2026-02-12' },
    { stage: 'royal_assent', date: '2026-09-18' },
  ],
  divisions: [],
  ...extra,
});

test('the generator dates each ending from the record and leaves out what it cannot date', () => {
  const ending = (b: Record<string, unknown>) =>
    runNode(
      `import { billEnding } from ${JSON.stringify(library)};
       console.log(JSON.stringify(billEnding(${JSON.stringify(b)})));`,
    );
  const ended = (ended: string, last = '2025-11-24', asOf = '2025-11-24') =>
    bill('Ended', {
      status: 'lapsed',
      ended,
      status_as_of: asOf,
      key_dates: [
        { stage: 'introduced', date: '2025-09-04' },
        { stage: 'other', date: last },
      ],
    });
  expect(ending(ended('discharged')).fact).toBe(
    'False. It was discharged from the Notice Paper on 24 November 2025.',
  );
  expect(ending(ended('negatived')).fact).toBe(
    'False. It was voted down on 24 November 2025.',
  );
  expect(ending(ended('not_proceeding')).fact).toBe(
    'False. It was not proceeded with, as recorded on 24 November 2025.',
  );
  // A lapse is never asked: its date is an export stamp, not the ending.
  expect(ending(ended('lapsed', '2025-03-01', '2025-07-21'))).toBeNull();
  expect(ending(ended('lapsed'))).toBeNull();
  // A status date that is not the last event's date is not an ending date.
  expect(ending(ended('discharged', '2025-11-20', '2025-11-24'))).toBeNull();
  expect(ending(ended('laid_aside'))).toBeNull();
});

test('the generator leaves out royal commissions, class actions, private members and people', () => {
  const law = (n: number) => bill(`Law${n}`, {});
  const off = (n: number) =>
    bill(`Off${n}`, {
      status: 'lapsed',
      ended: 'discharged',
      status_as_of: `2025-11-${10 + n}`,
      key_dates: [{ stage: 'other', date: `2025-11-${10 + n}` }],
    });
  const inputs = {
    bills: [
      ...[1, 2, 3, 4].map(law),
      ...[1, 2, 3, 4].map(off),
      bill('Rc', {
        title: 'Defence Amendment (RCDVS Implementation) Bill 2026',
      }),
      bill('Royal', { title: 'Royal Commissions Amendment Bill 2026' }),
      bill('Class', { title: 'Example Class Action (Facilitation) Bill 2026' }),
      bill('Member', { portfolio: '(s) EXAMPLE, Member, MP' }),
    ],
    billsAsOf: '2026-10-04',
    divisions: [],
    // Eight programs across four agencies: grant questions sit between the
    // bill questions, as a family never follows itself.
    programs: [
      'Bright',
      'Clean',
      'Strong',
      'Green',
      'Safe',
      'Smart',
      'Open',
      'Fair',
    ].map((word, i) => ({
      id: `GO${100 + i}`,
      key: `go${100 + i}`,
      n: `${word} Futures Grants`,
      ag: [
        'Department of Rivers',
        'Department of Hills',
        'Department of Coasts',
        'Department of Plains',
      ][i % 4],
      agencies: [['x', 1]],
      c: 20,
      by: { '2025-26': [5_000_000 + i, 20] },
      generated: '2026-11-11T01:05:18Z',
    })),
    agencies: [
      {
        id: 'a-1',
        name: 'Department of Examples',
        suppliers: [
          {
            id: 's-person',
            name: 'Example Person',
            identity: { kind: 'individual' },
          },
          ...['Alpha', 'Beta', 'Gamma', 'Delta'].map((n) => ({
            id: `s-${n}`,
            name: `${n} Pty Ltd`,
            identity: { kind: 'company' },
          })),
        ],
        contracts: Array.from({ length: 60 }, (_, i) => ({
          id: `CN${i}`,
          amount: String(1_000_000 + i),
          start_date: '2026-03-01',
          end_date: '2027-03-01',
          // The largest goes to a person: no contract question at all.
          supplier: i === 59 ? 'Example Person' : 'Alpha Pty Ltd',
          supplier_id: i === 59 ? 's-person' : 's-Alpha',
        })),
      },
    ],
    contractsAsOf: '2026-11-15',
  };
  const out = runNode(
    `import { buildTodayDeck } from ${JSON.stringify(library)};
     console.log(JSON.stringify(buildTodayDeck(${JSON.stringify(inputs)})));`,
  );
  const prompts = out.deck.map((q: FrontPageQuestion) => q.prompt).join('\n');
  expect(prompts).not.toMatch(/RCDVS|Royal Commissions|Class Action|Member/);
  expect(prompts).not.toMatch(/contract/);
  const tf = out.deck.filter((q: FrontPageQuestion) => q.kind === 'tf');
  expect(tf.map((q: FrontPageQuestion) => right(q))).toEqual([
    'True',
    'False',
    'True',
    'False',
    'True',
    'False',
    'True',
    'False',
  ]);
  expect(out.asOf).toEqual({
    bill: '2026-10-04',
    division: '',
    grant: '2026-11-11',
    contract: '2026-11-15',
  });
  const families = out.deck.map(
    (q: FrontPageQuestion) => q.template.split('-')[0],
  );
  for (let i = 1; i < families.length; i++)
    expect(families[i]).not.toBe(families[i - 1]);
  // The same records give the same deck.
  const again = runNode(
    `import { buildTodayDeck } from ${JSON.stringify(library)};
     console.log(JSON.stringify(buildTodayDeck(${JSON.stringify(inputs)})));`,
  );
  expect(again).toEqual(out);
});

test('the generator reads a portal checkout and names only company suppliers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'today-question-'));
  try {
    const pub = join(dir, 'public');
    const write = (path: string, value: unknown) => {
      mkdirSync(join(pub, path, '..'), { recursive: true });
      writeFileSync(join(pub, path), JSON.stringify(value));
    };
    write('bills/index.json', { generated_at: '2026-10-04T16:27:54+00:00' });
    write('bills/au-federal-r1.json', bill('au-federal-r1', {}));
    write('divisions/index.json', { count: '0' });
    write('grants/federal/programs/go1.json', {
      id: 'GO1',
      key: 'go1',
      n: 'Example Community Grants',
      ag: 'Department of Examples',
      agencies: [['Department of Examples', 1]],
      c: 40,
      by: { '2025-26': [12_500_000, 40] },
      generated: '2026-11-11T01:05:18Z',
    });
    write('agencies.json', {
      meta: { generated_at: '2026-11-15T16:39:04Z' },
      agencies: [{ id: 'a-1', profile_path: '/agencies/a-1.json' }],
    });
    write('agencies/a-1.json', {
      id: 'a-1',
      name: 'Department of Examples',
      suppliers: [
        ...['Alpha', 'Beta', 'Gamma', 'Delta'].map((n) => ({
          id: `s-${n}`,
          name: `${n} Pty Ltd`,
          identity: { kind: 'company' },
        })),
        {
          id: 's-trust',
          name: 'The Trustee for Example Trust Pty Ltd',
          identity: { kind: 'trust' },
        },
      ],
      contracts: Array.from({ length: 60 }, (_, i) => ({
        id: `CN${i}`,
        amount: String(2_000_000 + i),
        start_date: '2026-03-01',
        end_date: '2027-03-01',
        supplier: 'Alpha Pty Ltd',
        supplier_id: 's-Alpha',
      })),
    });
    const out = runNode(
      `import { buildTodayDeck, loadTodayInputs } from ${JSON.stringify(library)};
       const inputs = loadTodayInputs(${JSON.stringify(pub)});
       console.log(JSON.stringify({ ...buildTodayDeck(inputs), hashes: Object.keys(inputs.hashes) }));`,
    );
    expect(out.hashes.sort()).toEqual([
      'agencies',
      'bills',
      'divisions',
      'grants',
    ]);
    expect(out.asOf).toEqual({
      bill: '2026-10-04',
      division: '',
      grant: '2026-11-11',
      contract: '2026-11-15',
    });
    const supplier = out.deck.find(
      (q: FrontPageQuestion) => q.template === 'contract-largest-supplier',
    );
    expect(right(supplier)).toBe('Alpha Pty Ltd');
    expect(
      supplier.options.map((o: { label: string }) => o.label),
    ).not.toContain('The Trustee for Example Trust Pty Ltd');
    expect(supplier.link.href).toBe(
      '/subject/agency/a-1?section=contracts&supplier=s-Alpha',
    );
    const grant = out.deck.find(
      (q: FrontPageQuestion) => q.template === 'grant-program-year-total',
    );
    expect(grant.prompt).toBe(
      'How much did the Example Community Grants program award in grants in 2025-26?',
    );
    expect(grant.fact).toBe('$12.5 million across 40 grants');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
