import { act } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import live from './fixtures/interests/live-2026-10-08.json';
import {
  decodeInterest,
  decodeInterestIndex,
  type InterestDetail,
} from '../src/api/catalogs';
import { assertAllowedPath } from '../src/api/policy';
import { isPartialCatalog } from '../src/api/validation';
import { DeclaredInterests } from '../src/features/people/DeclaredInterests';
import {
  registerEntry,
  registerTotalsLine,
} from '../src/features/your-mp/model';

// Real export rows, fetched unmodified from opax.com.au on 8 Oct 2026 (Jake's
// TestFlight report: every entry titled "unspecified", meta "statement").
// Senate (McKenzie, the reported page), House (French: self, spouse and
// children, deletions), Queensland (Perrett), a roster-keyed new senator
// (Bleyer) and OCR rows (Albanese). Together they cover every category.
const people = live.people as Record<string, unknown>;
// No placeholder anywhere, and no raw field value as a line or " · " part.
const placeholders = /\b(?:undefined|unspecified|null|NaN)\b/i;
const rawCodes = new Set([
  'statement',
  'addition',
  'deletion',
  'self',
  'spouse',
  'children',
  ...Object.values(people).flatMap((p) =>
    Object.keys((p as { buckets: object }).buckets),
  ),
]);

function strings(node: unknown): string[] {
  if (typeof node === 'string' || typeof node === 'number')
    return [String(node)];
  if (Array.isArray(node)) return node.flatMap(strings);
  return [];
}
function lines(r: TestRenderer.ReactTestRenderer) {
  return r.root
    .findAllByType(NativeText)
    .map((n) => strings(n.props.children).join('').replace(/\s+/g, ' '))
    .filter(Boolean);
}
async function renderOpen(register: InterestDetail) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<DeclaredInterests register={register} />);
  });
  for (const name of Object.keys(register.buckets))
    await act(async () => {
      r.root
        .find(
          (n) =>
            n.props.testID === `interest-bucket-${name}` &&
            typeof n.props.onPress === 'function',
        )
        .props.onPress();
    });
  return r;
}

test('the live index decodes whole, including roster-keyed members', () => {
  const index = decodeInterestIndex(live.index);
  // One unreadable key (aph_25813) used to mark every register block partial.
  expect(isPartialCatalog(index)).toBe(false);
  expect(Object.keys(index.people)).toHaveLength(
    Object.keys(live.index.people).length,
  );
  expect(index._by_name['vanessa bleyer']).toBe('aph_25813');
  expect(() => assertAllowedPath('/interests/aph_25813.json')).not.toThrow();
  expect(() => assertAllowedPath('/interests/aph_x.json')).toThrow();
});

const categories = new Set<string>();
test.each(Object.keys(people))(
  'every entry of %s reads as what was declared',
  async (key) => {
    const register = decodeInterest(people[key]);
    expect(isPartialCatalog(register)).toBe(false);
    const r = await renderOpen(register);
    const shown = lines(r);
    for (const line of shown) {
      expect(line).not.toMatch(placeholders);
      for (const part of line.split(' · '))
        expect(rawCodes.has(part.trim())).toBe(false);
    }
    for (const [name, bucket] of Object.entries(register.buckets)) {
      categories.add(name);
      bucket.items.forEach((row, i) => {
        const entry = registerEntry(row, register.statement_date);
        // The title is the first printed cell, never the holder.
        expect(entry.title).toBe(row.description.split(' · ')[0]!.trim());
        expect(shown).toContain(entry.title);
        if (entry.detail) expect(shown).toContain(entry.detail);
        expect(
          r.root.findAll(
            (n) => n.props.testID === `interest-entry-${name}-${i}`,
          ).length,
        ).toBeGreaterThan(0);
      });
      const more = r.root.findAll(
        (n) =>
          n.props.testID === `interest-bucket-${name}-more` &&
          n.type === NativeText,
      );
      expect(more.length).toBe(bucket.items.length < bucket.count ? 1 : 0);
    }
  },
);
test('the pinned members cover every register category', () =>
  expect([...categories].sort()).toEqual([
    'directorships',
    'gifts',
    'liabilities',
    'memberships',
    'other',
    'real_estate',
    'shareholdings',
    'travel',
    'trusts',
  ]));

test('Jake’s screenshot: Bridget McKenzie’s liability and totals', async () => {
  const register = decodeInterest(people['10758']);
  expect(registerTotalsLine(register)).toBe(
    '10 in the statement of interests · 101 added since',
  );
  expect(registerEntry(register.buckets.liabilities!.items[0]!)).toEqual({
    title: 'Mortgages on property',
    detail: 'ANZ',
    meta: 'In the statement of interests',
  });
  expect(registerEntry(register.buckets.gifts!.items[0]!).meta).toBe(
    'Added 29 Sep 2026',
  );
  const shown = lines(await renderOpen(register));
  expect(shown).toContain(
    'Showing the latest 6 of 84. View original has the full register.',
  );
});

test('House holders, deletions, pages and OCR are said in words', () => {
  const french = decodeInterest(people['11039']);
  const all = Object.values(french.buckets).flatMap((b) => b.items);
  const metas = all.map(
    (row) => registerEntry(row, french.statement_date).meta,
  );
  expect(metas.some((m) => m?.startsWith('Dependent children · '))).toBe(true);
  expect(metas.some((m) => m?.startsWith('Spouse or partner · '))).toBe(true);
  expect(
    metas.some((m) =>
      /^Spouse or partner · Removed \d+ \w{3} \d{4} · page \d+$/.test(m ?? ''),
    ),
  ).toBe(true);
  expect(metas).toContain('Member · In the statement of 19 Aug 2025 · page 2');
  const albanese = decodeInterest(people['10007']);
  const ocr = Object.values(albanese.buckets)
    .flatMap((b) => b.items)
    .find((row) => row.ocr)!;
  expect(registerEntry(ocr, albanese.statement_date).meta).toMatch(
    / · OCR transcription$/,
  );
});

test('an absent field adds nothing, never a placeholder', () => {
  expect(
    registerEntry({
      holder: 'unspecified',
      description: '',
      kind: 'amendment',
      page: null,
    }),
  ).toEqual({ title: null, detail: null, meta: null });
  expect(
    registerTotalsLine({ total: 3, alterations: { added: 3, deleted: 0 } }),
  ).toBe('3 added');
});
