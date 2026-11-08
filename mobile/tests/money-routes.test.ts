import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fromWebPath } from '../src/navigation/routes';
import { leadsKindRoute } from '../src/navigation/routes/money-map';

// The money and leads route audit (w4-money-map-leads; journeys/money.md 12):
// no step leaves OPAX before an original register record. The only web exit
// in the money and leads screens is the ⋯ menu's "Open on opax.com.au"
// (features/money/menu.ts); a new openOnWeb or Linking.openURL fails here.

const root = resolve(__dirname, '..');
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
const shared = 'src/app/(tabs)/(today,your-mp,bills,search,ask)';
const routeFiles = [
  'money.tsx',
  'money-record.tsx',
  'money-donors.tsx',
  'money-node.tsx',
  'leads.tsx',
  'discover.tsx',
  'lead/[id].tsx',
].map((file) => join(root, shared, file));
const audited = [
  ...sources(join(root, 'src/features/money')),
  ...sources(join(root, 'src/features/leads')),
  ...routeFiles,
];
const read = (path: string) => readFileSync(path, 'utf8');
const rel = (path: string) => relative(root, path).split('\\').join('/');

test('the only web exit in money and leads is the ⋯ menu', () => {
  const exits = audited.flatMap((path) => {
    const text = read(path);
    return [
      /\bopenOnWeb\s*\(/.test(text) ? `${rel(path)}: openOnWeb` : null,
      /\bLinking\s*\.\s*openURL\b/.test(text)
        ? `${rel(path)}: Linking.openURL`
        : null,
      /\bopenURL\s*\(/.test(text) && !/Linking/.test(text)
        ? `${rel(path)}: openURL`
        : null,
    ].filter((x): x is string => !!x);
  });
  expect(exits).toEqual(['src/features/money/menu.ts: openOnWeb']);
  // And the menu offers it only as "Open on opax.com.au", not on cards.
  const menu = read(join(root, 'src/features/money/menu.ts'));
  expect(menu).toContain('copy.openOnWeb');
  expect(menu).toMatch(/moneyCardMenu[\s\S]*slice\(0, 2\)/);
});

test('no code path reads the money summary file', () => {
  const offenders = sources(join(root, 'src')).filter((path) =>
    /money\.summary\.json/.test(read(path)),
  );
  expect(offenders.map(rel)).toEqual([]);
});

test('no Ask entry and no "why" drafts on money or leads screens', () => {
  const offenders = audited.filter((path) =>
    /routes\/ask['"]|askRoute\s*\(|pathname:\s*['"]\/ask/.test(read(path)),
  );
  expect(offenders.map(rel)).toEqual([]);
});

test('money routes open native pages', () => {
  const read = (path: string) => fromWebPath(path);
  expect(read('/money?node=party%3ALabor')).toEqual(
    expect.objectContaining({
      pathname: '/money-record',
      params: expect.objectContaining({ node: 'party:Labor' }),
    }),
  );
  expect(read('/money?party=Labor')).toEqual(
    expect.objectContaining({
      pathname: '/money',
      params: expect.objectContaining({ focus: 'party:Labor' }),
    }),
  );
  expect(read('/discover?category=recipient_concentration')).toEqual(
    expect.objectContaining({
      pathname: '/leads',
      params: expect.objectContaining({ category: 'recipient_concentration' }),
    }),
  );
  expect(leadsKindRoute('recipient_concentration', 'lead-1')).toEqual({
    pathname: '/leads',
    params: { category: 'recipient_concentration', item: 'lead-1' },
  });
});

test('route files point at the money and leads screens', () => {
  const text = (file: string) => read(join(root, shared, file));
  expect(text('money.tsx')).toContain('features/money/MoneyScreen');
  expect(text('money-record.tsx')).toContain('features/money/MoneyRecord');
  expect(text('money-donors.tsx')).toContain('features/money/MoneyDonors');
  expect(text('leads.tsx')).toContain('features/leads/Leads');
  expect(text('lead/[id].tsx')).toContain('features/leads/LeadDetail');
  // Discover is a redirect into Leads carrying only its kind and lead.
  expect(text('discover.tsx')).toMatch(/<Redirect/);
  expect(text('discover.tsx')).toMatch(/category[\s\S]*item/);
  expect(text('money-node.tsx')).toMatch(/<Redirect/);
});
