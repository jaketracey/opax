import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import rounds from '../src/features/explore/quiz-rounds.json';
import frontPage from '../src/features/explore/quiz-front-page.json';
import type { Question } from '../src/features/explore/quiz-model';

const engineModule = pathToFileURL(
  resolve(__dirname, '../scripts/explore-engine.mjs'),
).href;
const runNode = (code: string) =>
  JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', code], {
      encoding: 'utf8',
    }),
  );

test('the generator imports quiz.js by file URL, so its relative imports resolve', () => {
  // An invented engine that, like the web's, imports a sibling module with a
  // cache-busting query. A data: URL import cannot resolve './figures.js'.
  const dir = mkdtempSync(join(tmpdir(), 'explore-engine-'));
  try {
    const pub = join(dir, 'public');
    mkdirSync(pub);
    writeFileSync(
      join(pub, 'figures.js'),
      "export const recordTotal = (name) => ({ 'Example Gas Ltd': 1234567 })[name];\n",
    );
    writeFileSync(
      join(pub, 'quiz.js'),
      [
        "import { recordTotal } from './figures.js?v=abc123';",
        'export const createRng = (seed) => () => seed;',
        "export const buildRound = () => [{ template: 'money-donor-figure', prompt: 'How much?', answer: recordTotal('Example Gas Ltd') }];",
        'export const validateQuestion = (q) => q.answer != null;',
        // Browser-only code after the engine must not run on import.
        'async function fetchJson(url) { return (await fetch(url)).json(); }',
        '',
      ].join('\n'),
    );
    const out = runNode(
      `import { loadEngine } from ${JSON.stringify(engineModule)};
       const { engine, hash } = await loadEngine(${JSON.stringify(pub)});
       const round = engine.buildRound({}, engine.createRng(1), 1, 'money');
       console.log(JSON.stringify({ hash, round, valid: round.every(engine.validateQuestion) }));`,
    );
    expect(out.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(out.round).toEqual([
      {
        template: 'money-donor-figure',
        prompt: 'How much?',
        answer: 1234567,
      },
    ]);
    expect(out.valid).toBe(true);

    // A portal without the engine's exports fails loudly.
    writeFileSync(join(pub, 'quiz.js'), 'export const createRng = 1;\n');
    expect(() =>
      runNode(
        `import { loadEngine } from ${JSON.stringify(engineModule)};
         await loadEngine(${JSON.stringify(pub)}).catch((e) => { console.error(e.message); process.exit(3); });`,
      ),
    ).toThrow();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the generator writes the front-page deck the README rule describes', () => {
  const out = runNode(
    `import { frontPageDeck } from ${JSON.stringify(engineModule)};
     import { readFileSync } from 'node:fs';
     const snap = JSON.parse(readFileSync(${JSON.stringify(
       resolve(__dirname, '../src/features/explore/quiz-rounds.json'),
     )}, 'utf8'));
     console.log(JSON.stringify(frontPageDeck(snap.rounds)));`,
  );
  expect(out).toEqual(frontPage);
});

// The record each receipt counted once (portal donor-disclosure.js receiptGraph
// over graph/money.json), pinned to the money export the deck was built from.
// Regenerating from a newer export changes the hash: re-read these totals from
// the donor records in that checkout and update them with it.
const PINNED_MONEY_HASH =
  '9cef355eb257683ac610c395f5645344ca4a75da6cda4e625640dc3af0788c7f';
const RECORD: Record<string, { total: number; display: string }> = {
  'Santos Limited': { total: 2371462, display: '$2.4 million' },
  'Pratt Holdings Pty Ltd': { total: 19572876, display: '$19.6 million' },
};

test("the shipped deck's donor figures match the pinned donor records", () => {
  expect(rounds.hashes['graph/money.json']).toBe(PINNED_MONEY_HASH);
  const questions = Object.values(rounds.rounds).flat(2) as Question[];
  for (const [name, record] of Object.entries(RECORD)) {
    const numbers: number[] = [];
    const displays: string[] = [];
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`${escaped}: (\\$[\\d.,]+(?: million)?)`, 'g'),
      new RegExp(`(\\$[\\d.,]+(?: million)?) from ${escaped}`, 'g'),
    ];
    for (const q of questions) {
      for (const text of [q.fact, q.explanation])
        for (const pattern of patterns)
          for (const match of text.matchAll(pattern)) displays.push(match[1]!);
      for (const option of q.options ?? [])
        if (option.label === name && option.value != null)
          numbers.push(option.value);
      if (q.comparison?.shownLabel === name)
        displays.push(q.comparison.shownDisplay);
      if (q.comparison?.hiddenLabel === name)
        displays.push(q.comparison.hiddenDisplay);
      if (q.template === 'money-donor-figure' && q.fact.startsWith(`${name}:`))
        numbers.push(q.answer as number);
    }
    expect(numbers.length + displays.length).toBeGreaterThan(0);
    for (const n of numbers) expect(n).toBe(record.total);
    for (const d of displays) expect(d).toBe(record.display);
  }
});

test("the generator's report links open the app's topic pages", () => {
  const { topicReport } = jest.requireActual(
    '../src/features/reports/model',
  ) as typeof import('../src/features/reports/model');
  const out = runNode(
    `import { REPORT_TOPICS, topicLinks } from ${JSON.stringify(engineModule)};
     const link = { href: '/reports/climate', label: 'Read the Climate report' };
     let unknown = null;
     try { topicLinks({ link: { href: '/reports/elsewhere', label: 'x' } }); }
     catch (e) { unknown = e.message; }
     console.log(JSON.stringify({ REPORT_TOPICS, climate: topicLinks({ link }), unknown }));`,
  );
  expect(out.REPORT_TOPICS).toEqual(
    Object.fromEntries(
      Object.entries(topicReport).map(([topic, report]) => [report, topic]),
    ),
  );
  expect(out.climate.link).toEqual({
    href: '/subject/topic/climate-environment',
    label: 'Read the Climate report',
  });
  expect(out.unknown).toMatch(/No topic page for report elsewhere/);
  for (const q of [
    ...Object.values(rounds.rounds).flat(2),
    ...frontPage,
  ] as Question[])
    expect(q.link.href).not.toMatch(/^\/reports\//);
});

test('the generator links each party by its name, as the app resolves it', () => {
  const out = runNode(
    `import { partyLinks } from ${JSON.stringify(engineModule)};
     const q = (href, label) => partyLinks({ link: { href, label } }).link;
     let bad = null;
     try { q('/subject/party/x', 'Read more'); } catch (e) { bad = e.message; }
     console.log(JSON.stringify({
       katter: q('/subject/party/katters-australian-party', "Open Katter's Australian Party in the record"),
       topic: q('/subject/topic/housing', 'Read the Housing report'),
       bad,
     }));`,
  );
  expect(out.katter.href).toBe("/subject/party/Katter's%20Australian%20Party");
  expect(out.topic.href).toBe('/subject/topic/housing');
  expect(out.bad).toMatch(/No party name/);
  for (const q of [
    ...Object.values(rounds.rounds).flat(2),
    ...frontPage,
  ] as Question[])
    if (q.link.href.startsWith('/subject/party/'))
      expect(decodeURIComponent(q.link.href.split('/')[3]!)).toBe(
        /^Open (.+) in the record$/.exec(q.link.label)![1],
      );
});
