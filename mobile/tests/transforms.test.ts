import { decodeBill, decodeMoney, decodeExpenses } from '../src/api/catalogs';
import { assertReceiptsLookup } from './receipts';
import {
  billDedupeDivisions,
  billFoldText,
  billParty,
  billSentenceCase,
  billSplits,
  billStage,
  billStageRuns,
} from '../src/api/bill-transforms';
import {
  samePartyLabel,
  partyReceiptsFor,
  receiptParties,
} from '../src/api/party-transforms';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { shape, count } from '../src/api/validation';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import {
  billTitleIndex,
  expenseBenchmarks,
  payNameKey,
  payPersonRecord,
} from '../src/api/transforms';
import { bills, catalogs, pinned, files } from './pinned';
const web = readFileSync(
  resolve(__dirname, '../../portal/public/app.js'),
  'utf8',
);
const ast = ts.createSourceFile(
  'app.js',
  web,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JS,
);
function fn(name: string) {
  const node = ast.statements.find(
    (s) => ts.isFunctionDeclaration(s) && s.name?.text === name,
  );
  if (!node) throw new Error(`Web function missing: ${name}`);
  return node.getText(ast);
}
function constant(name: string) {
  const node = ast.statements.find(
    (s) =>
      ts.isVariableStatement(s) &&
      s.declarationList.declarations.some((d) => d.name.getText(ast) === name),
  );
  if (!node) throw new Error(`Web constant missing: ${name}`);
  return node.getText(ast);
}
const paySource = readFileSync(
  resolve(__dirname, '../../portal/src/pay-records.mjs'),
  'utf8',
).replace(/export /g, '');
const originalPay = runInNewContext(`${paySource}; ({ payPersonRecord })`) as {
  payPersonRecord: typeof payPersonRecord;
};
test.each(['R36', '00AOU', '008CH'])(
  'pay record %s matches the original web transform on the same input',
  (id) => {
    const raw = pinned('/pay.json') as Parameters<typeof payPersonRecord>[0];
    expect(payPersonRecord(catalogs.pay!, id)).toEqual(
      originalPay.payPersonRecord(raw, id),
    );
  },
);
test('every exported pay projection matches the web text and numbers', () => {
  const raw = pinned('/pay.json') as Parameters<typeof payPersonRecord>[0];
  for (const id of Object.keys(catalogs.pay!.people))
    expect(payPersonRecord(catalogs.pay!, id)).toEqual(
      originalPay.payPersonRecord(raw, id),
    );
});
test('pay name normalisation is identical to the web for all names', () => {
  const original = runInNewContext(
    `${fn('payNameKey')}; payNameKey`,
  ) as typeof payNameKey;
  for (const p of catalogs.roster.people)
    expect(payNameKey(p.name)).toBe(original(p.name));
});
test('expense cohort, medians and category baselines match the web', () => {
  const source = `${fn('median')}\n${fn('getExpenseBenchmarks')}\ngetExpenseBenchmarks()`;
  const raw = pinned('/expenses.json');
  const expected = runInNewContext(source, {
    expensesData: raw,
    expenseBenchmarks: null,
  }) as ReturnType<typeof expenseBenchmarks>;
  const actual = expenseBenchmarks(catalogs.expenses!);
  expect({ ...actual, byCategory: [...actual.byCategory] }).toEqual({
    ...expected,
    byCategory: [...expected.byCategory],
  });
});
const decodeSweep = shape({
  pinnedVoteGroups: count,
  localVoteGroups: count,
  pinnedBills: count,
  localBills: count,
  indexRows: count,
  noteLinks: count,
  linkedSponsors: count,
  differences: count,
});
let sweep: ReturnType<typeof decodeSweep> | undefined;
function completeSweep() {
  if (!sweep)
    sweep = decodeSweep(
      JSON.parse(
        execFileSync(
          process.execPath,
          ['--import', 'tsx', resolve(__dirname, 'parity-sweep.ts')],
          {
            cwd: resolve(__dirname, '..'),
            timeout: 45000,
            maxBuffer: 1024 * 1024,
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        ).toString(),
      ),
    );
  return sweep;
}
test('vote counts, date span and bill rows match the actual web calculations for every name group', () => {
  const report = completeSweep();
  expect(report.pinnedVoteGroups).toBe(
    Object.keys(catalogs.votes!.names).length,
  );
  expect(report.localVoteGroups).toBeGreaterThan(0);
  expect(report.differences).toBe(0);
}, 50000);
test('sponsor, portfolio and party ports match the web on every pinned and local bill', () => {
  const report = completeSweep();
  expect(report.indexRows).toBe(bills.bills.length);
  expect(report.pinnedBills).toBe(
    Object.keys(files).filter(
      (p) => p.startsWith('/bills/') && p !== '/bills/index.json',
    ).length,
  );
  expect(report.localBills).toBeGreaterThan(0);
  expect(report.differences).toBe(0);
}, 50000);
test('division deduplication matches the web on every local bill file', () => {
  const report = completeSweep();
  expect(report.localBills).toBeGreaterThan(0);
  expect(report.differences).toBe(0);
}, 50000);
test('division note citations match the web links on every local bill file', () => {
  // The sweep compares each note's links with the web's billNoteHTML.
  expect(completeSweep().noteLinks).toBeGreaterThan(1000);
}, 50000);
test('no sponsor link names anyone but the person on screen, across every local bill', () => {
  expect(completeSweep().linkedSponsors).toBeGreaterThan(100);
}, 50000);
test('samePartyLabel matches the actual web rule for all roster party pairs', () => {
  const original = runInNewContext(
    `${constant('PARTY_MAP')}\n${fn('samePartyLabel')}\nsamePartyLabel`,
  ) as typeof samePartyLabel;
  for (const row of catalogs.roster.people) {
    expect(samePartyLabel(row.party_now ?? '', row.party ?? '')).toBe(
      original(row.party_now ?? '', row.party ?? ''),
    );
  }
});
test('the link-only party projection matches the pinned register and web URL selection', () => {
  const raw = pinned('/graph/money.json') as {
    meta: { generated: string };
    nodes: { kind: string; label: string; aliases?: string[] }[];
  };
  expect(receiptParties).toEqual({
    generated: raw.meta.generated,
    parties: raw.nodes
      .filter((n) => n.kind === 'party')
      .map((n) => ({ label: n.label, aliases: n.aliases ?? [] })),
  });
  const original = runInNewContext(
    `${fn('normName')}\n${fn('findMoneyNode')}\nfindMoneyNode`,
    { moneyData: raw },
  ) as (kind: string, name: string) => { label: string } | null;
  for (const row of catalogs.people.people)
    for (const seat of row.electorates.filter((s) => s.current)) {
      const node = seat.party ? original('party', seat.party) : null;
      expect(partyReceiptsFor(seat.party).url).toBe(
        node && seat.party
          ? `/subject/party/${encodeURIComponent(seat.party)}`
          : '/money',
      );
      expect(partyReceiptsFor(seat.party).party).toBe(node?.label ?? null);
    }
});
test('receipts drift from the pinned or current money graph fails with deliberate repin instructions', () => {
  const graph = decodeMoney(pinned('/graph/money.json'));
  expect(() => assertReceiptsLookup(graph)).not.toThrow();
  expect(() =>
    assertReceiptsLookup(
      decodeMoney(
        JSON.parse(
          readFileSync(
            resolve(__dirname, '../../portal/public/graph/money.json'),
            'utf8',
          ),
        ),
      ),
      'current',
    ),
  ).not.toThrow();
  const party = graph.nodes.find((n) => n.kind === 'party')!;
  for (const changed of [
    { ...graph, nodes: graph.nodes.filter((n) => n !== party) },
    {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n === party ? { ...n, aliases: [n.label] } : n,
      ),
    },
  ]) {
    expect(() => assertReceiptsLookup(changed)).toThrow(
      /Repin.*sourceCommit.*README/,
    );
    expect(() => assertReceiptsLookup(changed, 'current')).toThrow(
      /Repin.*sourceCommit.*README/,
    );
  }
});
test('current money graph regeneration preserves receipts parity when only its date changes', () => {
  const graph = decodeMoney(pinned('/graph/money.json'));
  const regenerated = {
    ...graph,
    meta: { ...graph.meta, generated: catalogs.manifest.generated },
  };
  expect(regenerated.meta.generated).not.toBe(graph.meta.generated);
  expect(() => assertReceiptsLookup(regenerated, 'current')).not.toThrow();
  expect(() => assertReceiptsLookup(regenerated)).toThrow(
    /Repin.*sourceCommit.*README/,
  );
});
test('bill title/alias joins match the web map for the complete pinned index', async () => {
  const titleLine = web
    .split('\n')
    .find((l) => l.startsWith('const titleKey ='))!;
  const original = (await runInNewContext(
    `${titleLine}\n${fn('billTitleIndex')}\nbillTitleIndex()`,
    { billsTitleIndex: null, loadBillsIndex: async () => bills },
  )) as Map<string, unknown>;
  expect([...billTitleIndex(bills)]).toEqual([...original]);
});

test.each(['au-federal-r7534', 'au-federal-r7549', 'au-federal-alrc-4437'])(
  'bill divisions %s collapse exactly as the web does',
  (key) => {
    const functions = [
      'billNoteRepair',
      'billStripStage',
      'billQuestionParts',
      'billStripTitle',
      'billDedupeDivisions',
    ]
      .map(fn)
      .join('\n');
    const constants = [
      'BILL_DESCRIPTION',
      'BILL_PLACEHOLDER',
      'BILL_MD_LINK',
      'billPlain',
      'billFlat',
    ]
      .map((name) => {
        const node = ast.statements.find(
          (s) =>
            ts.isVariableStatement(s) &&
            s.declarationList.declarations.some(
              (d) => d.name.getText(ast) === name,
            ),
        );
        if (!node) throw new Error(name);
        return node.getText(ast);
      })
      .join('\n');
    const raw = decodeBill(pinned(`/bills/${key}.json`));
    const original = runInNewContext(
      `${constants}\n${functions}\nbillDedupeDivisions(divisions, bill)`,
      { divisions: raw.divisions, bill: raw },
    );
    expect(billDedupeDivisions(raw.divisions, raw)).toEqual(original);
  },
);

// The bill list's search folding, labels, stage runs and party splits, run
// through the web's own functions on the pinned bills.
describe('bill list and detail transforms match the web', () => {
  const details = [
    'au-federal-r7534',
    'au-federal-r7549',
    'au-federal-ed-online-safety-digital-duty-of-care-2026',
    'au-federal-alrc-4437',
    'au-federal-r6850',
  ].map((key) => decodeBill(pinned(`/bills/${key}.json`)));
  const original = runInNewContext(
    [
      fn('foldText'),
      constant('sentenceCase'),
      fn('billStage'),
      constant('CHAMBER_NAMES'),
      constant('billHouse'),
      fn('billStageRuns'),
      fn('billPartyName'),
      constant('BILL_PARTY_LABELS'),
      constant('billParty'),
      constant('BILL_SPLIT_DRAWN'),
      constant('BILL_SPLIT_SMALL'),
      // Markup helpers: the parity check reads the words, not the HTML.
      'const esc = (s) => String(s);',
      'const partyDotHTML = () => "";',
      fn('billSplitHTML'),
      '({ foldText, sentenceCase, billStage, billStageRuns, billParty, billSplitHTML })',
    ].join('\n'),
  ) as {
    foldText: (s: string) => string;
    sentenceCase: (s: string) => string;
    billStage: (s: string) => string;
    billStageRuns: (
      dates: unknown[],
    ) => { stage: string; house: string; dates: { date: string }[] }[];
    billParty: (p: string) => string;
    billSplitHTML: (d: unknown) => string;
  };

  test('folding, statuses and stages read as the web reads them', () => {
    for (const b of bills.bills) {
      expect(billFoldText(b.title)).toBe(original.foldText(b.title));
      expect(billSentenceCase(b.status)).toBe(original.sentenceCase(b.status));
    }
    for (const bill of details)
      for (const k of bill.key_dates)
        expect(billStage(k.stage)).toBe(original.billStage(k.stage));
  });

  test('stage runs fold the same register rows the web folds', () => {
    for (const bill of details) {
      const mine = billStageRuns(bill.key_dates);
      const theirs = original.billStageRuns(
        bill.key_dates.slice().sort((a, b) => a.date.localeCompare(b.date)),
      );
      expect(mine.map((r) => [r.stage, r.dates.map((x) => x.date)])).toEqual(
        theirs.map((r) => [r.stage, r.dates.map((x) => x.date)]),
      );
    }
  });

  test('party splits name, order, fold and annotate as the web does', () => {
    let checked = 0;
    for (const bill of details)
      for (const division of bill.divisions) {
        const splits = billSplits(division);
        const html = original.billSplitHTML(division);
        const words = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        for (const s of splits.drawn) {
          expect(s.label).toBe(original.billParty(s.party));
          expect(words).toContain(`${s.label} ${s.ayes} – ${s.noes}`);
        }
        const drawnOrder = splits.drawn.map((s) =>
          words.indexOf(`${s.label} ${s.ayes} –`),
        );
        expect(drawnOrder).toEqual([...drawnOrder].sort((a, b) => a - b));
        if (splits.folded.length)
          expect(words).toContain(
            `Also ${splits.folded.map((s) => `${s.label} ${s.ayes}–${s.noes}`).join(', ')}.`,
          );
        else expect(words).not.toContain('Also ');
        for (const note of splits.notes) expect(words).toContain(note);
        checked++;
      }
    expect(checked).toBeGreaterThan(0);
    expect(original.billParty('PRES')).toBe(billParty('PRES'));
    expect(billParty('')).toBe('Not recorded');
  });
});

test('catalog-version indexes and benchmarks reuse only identical decoded catalogs', () => {
  const firstTitles = billTitleIndex(bills);
  expect(billTitleIndex(bills)).toBe(firstTitles);
  const replacement = { ...bills, bills: [...bills.bills] };
  expect(billTitleIndex(replacement)).not.toBe(firstTitles);
  expect(billTitleIndex(replacement)).toEqual(firstTitles);
  const expenses = decodeExpenses(pinned('/expenses.json'));
  const firstBenchmark = expenseBenchmarks(expenses);
  expect(expenseBenchmarks(expenses)).toBe(firstBenchmark);
  const next = { ...expenses, people: { ...expenses.people } };
  expect(expenseBenchmarks(next)).not.toBe(firstBenchmark);
  expect(expenseBenchmarks(next)).toEqual(firstBenchmark);
});
