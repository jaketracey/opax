import {
  individualDonorsLabel,
  isOrganisationDonor,
  publicTie,
  withholdIndividualDonors,
} from '../src/privacy/donorEntity';
import { aggregateWithheldDonors } from '../src/features/money/withheld';
import type { MoneyGraph } from '../src/features/money/data';

// Fictional names only. The cases mirror portal/test/donor-entity.test.mjs;
// the pinned exports' own donors are exercised in donor-privacy.test.tsx.
test('a donor is an organisation only with positive evidence in its name; the industry never counts', () => {
  for (const [label, industry] of [
    ['Jane Citizen', 'media'],
    ['Ann Example', 'fossil_fuels'],
    ['Mrs Jane Citizen AO', 'finance'],
    ['Citizen, Jane', 'media'],
    ['Bareword', 'other'],
    ['Betwell', 'gambling'],
    ['Coleman Example', 'retail'],
  ])
    expect([
      label,
      isOrganisationDonor({ label, industry, aliases: [] }),
    ]).toEqual([label, false]);
  for (const [label, industry] of [
    ['Clubs Example', 'gambling'],
    ['Example Energy Ltd', 'fossil_fuels'],
    ['CFMEU', 'unions'],
    ['SDA', 'unions'],
    ["Australian Workers' Union", 'unions'],
    ['Unions Example', 'unions'],
    ['Example Trades Hall Council', 'unions'],
    ['Example Trades  Hall', 'unions'],
    ['Example Holdings Pty Ltd', 'property'],
    ['Citizen Family Trust', 'other'],
    ['Example & Smith Lawyers', 'legal'],
    ['University of Example', 'education'],
    ['Royal Example College of Surgeons', 'education'],
    ['The Example Guild of Australia', 'pharmacy'],
    ['Example Pastoral Co', 'agriculture'],
    ['Smith & Co.', 'finance'],
  ])
    expect([
      label,
      isOrganisationDonor({ label, industry, aliases: [] }),
    ]).toEqual([label, true]);
  // An alias with a legal form is evidence; a personal name tagged as a union is not.
  expect(
    isOrganisationDonor({
      label: 'Exco',
      industry: 'media',
      aliases: ['Exco Communication Pty Ltd'],
    }),
  ).toBe(true);
  expect(
    isOrganisationDonor({ label: 'Mr John Citizen', industry: 'unions' }),
  ).toBe(false);
  expect(
    isOrganisationDonor({ label: 'Citizen, John', industry: 'unions' }),
  ).toBe(false);
  // An ABN or ACN is not evidence (sole traders have them), and no industry tag is.
  for (const node of [
    { label: 'ABN 12 345 678 901', industry: 'other' },
    { label: 'ACN 123 456 789', industry: 'other' },
    {
      label: 'Alex Example',
      industry: 'other',
      aliases: ['ABN 12 345 678 901'],
    },
    { label: 'Alex Example', industry: 'unions', aliases: [] },
    { label: 'Alex Example', industry: 'unions', aliases: ['12345678901'] },
  ])
    expect([node, isOrganisationDonor(node)]).toEqual([node, false]);
  // A label of one all-capitals token, 3-7 letters, is an acronym.
  for (const label of ['CFMEU', 'SDA', 'QIC', 'EXAMPLE'])
    expect([
      label,
      isOrganisationDonor({ label, industry: 'other', aliases: [] }),
    ]).toEqual([label, true]);
  for (const label of [
    'JOHN SMITH',
    'Smith, John',
    'SMITH, JOHN',
    'J SMITH',
    'Abc',
    'ABCDEFGH',
    'A',
    'ABN',
    'ACN',
    'ARBN',
    'TFN',
  ])
    expect([label, isOrganisationDonor({ label, industry: 'unions' })]).toEqual(
      [label, false],
    );
  // Never an acronym alias: it reads as initials or a registration note.
  for (const aliases of [['ABN'], ['RP'], ['CFMEU'], ['RPX'], ['ACN', 'TFN']])
    expect([
      aliases,
      isOrganisationDonor({
        label: 'Alex Example',
        industry: 'other',
        aliases,
      }),
    ]).toEqual([aliases, false]);
  // Two capitals read as initials, unless an alias carries a legal form.
  expect(
    isOrganisationDonor({ label: 'EY', industry: 'finance', aliases: [] }),
  ).toBe(false);
  expect(
    isOrganisationDonor({
      label: 'EY',
      industry: 'finance',
      aliases: ['Example & Young Pty Ltd'],
    }),
  ).toBe(true);
  // Organisation words count only as whole tokens, and "Co" only as the last one.
  for (const label of [
    'Ingrid Bankston',
    'Trustwell',
    'Collegiate Smith',
    'Co Example',
    'Jane Lawyersmith',
    'Hallam Trades',
  ])
    expect([
      label,
      isOrganisationDonor({ label, industry: 'finance' }),
    ]).toEqual([label, false]);
  expect(isOrganisationDonor(null)).toBe(false);
  expect(isOrganisationDonor({ label: '  ', industry: 'unions' })).toBe(false);
  expect(isOrganisationDonor({ label: 42 })).toBe(false);
});

const fictional = {
  meta: {},
  nodes: [
    {
      id: 'donor:jane citizen',
      label: 'Jane Citizen',
      kind: 'donor',
      industry: 'media',
      aliases: ['J Citizen'],
      profileUrl: '/subject/donor/Jane%20Citizen',
    },
    {
      id: 'donor:ann example',
      label: 'Ann Example',
      kind: 'donor',
      industry: 'individual',
    },
    {
      id: 'donor:example holdings',
      label: 'Example Holdings Pty Ltd',
      kind: 'donor',
      industry: 'property',
    },
    { id: 'party:Labor', label: 'Labor', kind: 'party' },
  ],
  edges: [
    {
      source: 'donor:jane citizen',
      target: 'party:Labor',
      total: 100,
      count: 1,
    },
    { source: 'donor:ann example', target: 'party:Labor', total: 50, count: 1 },
    {
      source: 'donor:example holdings',
      target: 'party:Labor',
      total: 25,
      count: 1,
    },
  ],
};
test('withheld donors are renamed, re-keyed and marked, never merged or dropped, and the input is not mutated', () => {
  const out = withholdIndividualDonors(fictional);
  const text = JSON.stringify(out);
  for (const name of [
    'Jane Citizen',
    'J Citizen',
    'jane citizen',
    'Jane%20Citizen',
    'Ann Example',
    'ann example',
  ])
    expect([name, text.includes(name)]).toEqual([name, false]);
  expect(out.nodes.map((n) => n.label)).toEqual([
    'Donor 1 (name withheld)',
    'Donor 2 (name withheld)',
    'Example Holdings Pty Ltd',
    'Labor',
  ]);
  expect(out.nodes.map((n) => n.withheld ?? false)).toEqual([
    true,
    true,
    false,
    false,
  ]);
  expect(out.edges.map((e) => [e.source, e.total])).toEqual([
    ['donor:withheld-1', 100],
    ['donor:withheld-2', 50],
    ['donor:example holdings', 25],
  ]);
  expect(JSON.stringify(fictional)).toContain('Jane Citizen');
  const clean = {
    nodes: [fictional.nodes[2]!, fictional.nodes[3]!],
    edges: [],
  };
  expect(withholdIndividualDonors(clean)).toBe(clean);
});
test('an anonymous id is keyed by the source id; a group is withheld only when no node carrying it is an organisation', () => {
  const donor = (id: string, label: string, aliases: string[] = []) => ({
    id,
    label,
    kind: 'donor',
    industry: 'media',
    aliases,
  });
  const out = withholdIndividualDonors({
    nodes: [
      donor('donor:a', 'Ann Example'),
      donor('donor:b', 'Bea Example'),
      donor('donor:b', 'Bea Example'),
      donor('donor:c', 'Cal Example'),
    ],
    edges: [
      { source: 'donor:a', target: 'party:L' },
      { source: 'donor:b', target: 'party:L' },
      { source: 'donor:c', target: 'party:L' },
    ],
  });
  expect(out.nodes.map((n) => n.id)).toEqual([
    'donor:withheld-1',
    'donor:withheld-2',
    'donor:withheld-2',
    'donor:withheld-3',
  ]);
  const mixed = withholdIndividualDonors({
    nodes: [
      donor('donor:x', 'Exco'),
      donor('donor:x', 'Exco', ['Exco Pty Ltd']),
    ],
    edges: [{ source: 'donor:x', target: 'party:L' }],
  });
  expect(mixed.edges.map((e) => e.source)).toEqual(['donor:x']);
});
test('the money map folds withheld donors into one "Individual donors (N)" node per cluster, keeping every amount', () => {
  const figures = (total: number, year: string) => ({
    total,
    count: 1,
    firstYear: Number(year),
    lastYear: Number(year),
    byYear: { [year]: [total, 1] as [number, number] },
  });
  const node = (
    id: string,
    label: string,
    kind: string,
    total: number,
    group = 'media',
  ) => ({ id, label, kind, group, industry: group, ...figures(total, '2024') });
  const graph = withholdIndividualDonors({
    meta: { generated: '2026-01-01', coverage: 'x', source: 'x' },
    nodes: [
      node('donor:a', 'Ann Example', 'donor', 100),
      node('donor:b', 'Bea Example', 'donor', 50),
      node('donor:c', 'Cal Example', 'donor', 7, 'mining'),
      node('donor:o', 'Example Holdings Pty Ltd', 'donor', 25),
      node('party:L', 'Labor', 'party', 182, 'parties'),
    ],
    edges: [
      { source: 'donor:a', target: 'party:L', ...figures(100, '2024') },
      {
        source: 'donor:b',
        target: 'party:L',
        ...figures(30, '2023'),
        total: 30,
      },
      {
        source: 'donor:b',
        target: 'party:L',
        flow: 'x',
        ...figures(20, '2024'),
      },
      { source: 'donor:c', target: 'party:L', ...figures(7, '2024') },
      { source: 'donor:o', target: 'party:L', ...figures(25, '2024') },
    ],
  }) as MoneyGraph;
  const out = aggregateWithheldDonors(graph);
  expect(
    out.nodes.map((n) => [n.label, n.total, n.withheldCount ?? null]),
  ).toEqual([
    ['Example Holdings Pty Ltd', 25, null],
    ['Labor', 182, null],
    [individualDonorsLabel(2), 150, 2],
    [individualDonorsLabel(1), 7, 1],
  ]);
  const media = out.nodes.find((n) => n.withheldCount === 2)!;
  const flows = out.edges.filter((e) => e.source === media.id);
  expect(flows.map((e) => [e.total, e.flow ?? null, e.byYear])).toEqual([
    [130, null, { '2024': [100, 1], '2023': [30, 1] }],
    [20, 'x', { '2024': [20, 1] }],
  ]);
  expect(out.edges.reduce((n, e) => n + e.total, 0)).toBe(182);
  expect(JSON.stringify(out)).not.toMatch(/Example"|Ann |Bea |Cal /);
});
test('a register tie that names a donor is kept only for an organisation; other ties stay', () => {
  expect(
    publicTie({
      organisation: 'Jane Citizen',
      kind: 'donor',
      kinds: ['donor'],
      donor_id: 'donor:jane citizen',
    }),
  ).toBe(false);
  expect(
    publicTie({
      organisation: 'Jane Citizen',
      kind: 'lobbyist',
      kinds: [],
      donor_id: 'donor:jane citizen',
    }),
  ).toBe(false);
  expect(
    publicTie({
      organisation: 'Example Holdings Pty Ltd',
      kind: 'donor',
      kinds: ['donor'],
    }),
  ).toBe(true);
  expect(
    publicTie({
      organisation: 'Example Lobbying',
      kind: 'lobbyist',
      kinds: ['lobbyist'],
    }),
  ).toBe(true);
});
