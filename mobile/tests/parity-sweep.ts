// Full public-data parity runs outside Jest's VM sandbox. Keep the original
// web functions and complete inputs; isolation limits cross-VM heap pressure.
import { equal } from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { decodeBill, decodeVotes } from '../src/api/catalogs';
import {
  billDedupeDivisions,
  billNoteLinks,
  billQuestionParts,
  billSponsorFromPortfolio,
  billPortfolio,
  billSponsorName,
  billPartyName,
  billDisplay,
} from '../src/api/bill-transforms';
import { voteTotals } from '../src/api/transforms';
import { sponsorSlug } from '../src/features/bills/sponsors';
import { bills, catalogs, pinned, files, roster, slugs } from './pinned';
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
function same(actual: unknown, expected: unknown, label: string) {
  // JSON projections have no behavioural properties; compare every exported
  // field while removing foreign-VM prototypes before strict deep comparison.
  equal(JSON.stringify(actual), JSON.stringify(expected), label);
}
const report = {
  pinnedVoteGroups: 0,
  localVoteGroups: 0,
  pinnedBills: 0,
  localBills: 0,
  indexRows: bills.bills.length,
  noteLinks: 0,
  linkedSponsors: 0,
  differences: 0,
};
const voteSource = fn('renderPersonVotes');
const computations = voteSource.slice(
  voteSource.indexOf('  const sum ='),
  voteSource.indexOf('  // data-bill-name'),
);
const totals = voteSource.slice(
  voteSource.indexOf('  const total = sum'),
  voteSource.indexOf('  const span ='),
);
const originalVotes = runInNewContext(
  `(recs) => { ${computations}\n${totals}\nreturn { total, ayes, noes, ayePct, years, jurisdictions: jurs, for: side('for'), against: side('against') }; }`,
) as typeof voteTotals;
const voteInputs = [
  catalogs.votes!,
  decodeVotes(
    JSON.parse(
      readFileSync(
        resolve(__dirname, '../../portal/public/votes.json'),
        'utf8',
      ),
    ),
  ),
];
for (const [i, votes] of voteInputs.entries()) {
  if (i === 0) report.pinnedVoteGroups = Object.keys(votes.names).length;
  else report.localVoteGroups = Object.keys(votes.names).length;
  for (const [name, keys] of Object.entries(votes.names)) {
    const recs = keys.map((k) => votes.records[k]!);
    const expected = originalVotes(recs),
      actual = voteTotals(recs);
    same(
      { ...actual, ayePct: actual.ayePct ?? 0 },
      {
        ...expected,
        years: expected.years.length
          ? [Math.min(...expected.years), Math.max(...expected.years)]
          : [],
      },
      `votes: ${name}`,
    );
  }
}
const originalSponsor = runInNewContext(
  [
    constant('BILL_MEMBER'),
    fn('titleCaseName'),
    fn('billSponsorFromPortfolio'),
    constant('billPortfolio'),
    fn('billSponsorName'),
    fn('billPartyName'),
    '({ billSponsorFromPortfolio, billPortfolio, billSponsorName, billPartyName })',
  ].join('\n'),
) as {
  billSponsorFromPortfolio: typeof billSponsorFromPortfolio;
  billPortfolio: typeof billPortfolio;
  billSponsorName: typeof billSponsorName;
  billPartyName: typeof billPartyName;
};
const dedupeSource = [
  'BILL_DESCRIPTION',
  'BILL_PLACEHOLDER',
  'BILL_MD_LINK',
  'billPlain',
  'billFlat',
]
  .map(constant)
  .concat(
    [
      'billNoteRepair',
      'billStripStage',
      'billQuestionParts',
      'billStripTitle',
      'billDedupeDivisions',
    ].map(fn),
  )
  .join('\n');
const originalDedupe = runInNewContext(
  `${dedupeSource}\nbillDedupeDivisions`,
) as typeof billDedupeDivisions;
const dir = resolve(__dirname, '../../portal/public/bills');
const local = readdirSync(dir).filter(
  (f) => f !== 'index.json' && f.endsWith('.json'),
);
const pinnedPaths = Object.keys(files).filter(
  (p) => p.startsWith('/bills/') && p !== '/bills/index.json',
);
report.localBills = local.length;
report.pinnedBills = pinnedPaths.length;
const detailInputs = [
  ...pinnedPaths.map((p) => decodeBill(pinned(p))),
  ...local.map((f) =>
    decodeBill(JSON.parse(readFileSync(resolve(dir, f), 'utf8'))),
  ),
];
for (const bill of detailInputs)
  same(
    billDedupeDivisions(bill.divisions, bill),
    originalDedupe(bill.divisions, bill),
    `divisions: ${bill.key}`,
  );
// A division note's citations: the web's billNoteHTML links, in order, with
// the same labels and destinations (relative links on They Vote For You).
// The dedupe source above defines the helpers billNoteHTML calls.
const noteHTML = runInNewContext(
  [
    dedupeSource,
    fn('esc'),
    fn('safeUrl'),
    constant('BILL_NOTE_BASE'),
    fn('billNoteHTML'),
    'billNoteHTML',
  ].join('\n'),
) as (text: string) => string;
const unescape = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
for (const bill of detailInputs)
  for (const division of bill.divisions) {
    const { note } = billQuestionParts(division, bill);
    if (!note) continue;
    const expected = [
      ...noteHTML(note).matchAll(/<a href="([^"]*)"[^>]*>([^<]*)&nbsp;/g),
    ].map((m) => ({ label: unescape(m[2]!), url: unescape(m[1]!) }));
    const actual = billNoteLinks(note);
    same(actual, expected, `note links: ${bill.key} ${division.key}`);
    report.noteLinks += actual.length;
  }
// A sponsor link never names anyone but the person on screen: whenever a
// sponsor resolves, the directory's name for that slug is the displayed name
// or the roster's recorded full name for the same person.
const fold = (n: string) =>
  n
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-AU')
    .replace(/[’‘ʼ`']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
for (const bill of detailInputs) {
  const members = billDisplay(bill).sponsorMembers;
  for (const member of members) {
    const slug = sponsorSlug(
      member.name,
      roster,
      slugs,
      members.length === 1 ? bill.sponsor_person_id : null,
    );
    if (!slug) continue;
    const linked = slugs.slugs[slug]!;
    const rows = roster.people.filter((r) => fold(r.name) === fold(linked));
    const names = [linked, ...rows.flatMap((r) => (r.full ? [r.full] : []))];
    equal(
      names.some((n) => fold(n) === fold(member.name)),
      true,
      `sponsor link: ${bill.key} ${member.name} -> ${slug}`,
    );
    report.linkedSponsors += 1;
  }
}
for (const b of [...bills.bills, ...detailInputs]) {
  same(
    billSponsorFromPortfolio(b.portfolio),
    originalSponsor.billSponsorFromPortfolio(b.portfolio),
    `portfolio sponsor: ${b.key}`,
  );
  equal(
    billPortfolio(b),
    originalSponsor.billPortfolio(b),
    `portfolio: ${b.key}`,
  );
  equal(
    billSponsorName(b.sponsor),
    originalSponsor.billSponsorName(b.sponsor),
    `sponsor: ${b.key}`,
  );
  equal(
    billPartyName(b.sponsor_party),
    originalSponsor.billPartyName(b.sponsor_party),
    `party: ${b.key}`,
  );
  const display = billDisplay(b);
  equal(
    display.sponsor,
    b.sponsor
      ? originalSponsor.billSponsorName(b.sponsor)
      : originalSponsor
          .billSponsorFromPortfolio(b.portfolio)
          ?.map((m) => m.name)
          .join(', ') || null,
    `display sponsor: ${b.key}`,
  );
  equal(
    display.portfolio,
    originalSponsor.billPortfolio(b) || null,
    `display portfolio: ${b.key}`,
  );
}
console.log(JSON.stringify(report));
