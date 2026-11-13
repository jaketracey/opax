import TestRenderer, { act } from 'react-test-renderer';
import { LinkRow, MoneyRow } from '../src/design/rows';
import type { MoneyGraph } from '../src/features/money/data';
import {
  donationsCaveat,
  partialYearFrom,
  receiptSectionWords,
  typedReceiptsScope,
} from '../src/features/money/records';

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  const Wrap = (props: object) => React.createElement(View, props);
  return {
    Link: Object.assign(Wrap, {
      Trigger: Wrap,
      Preview: () => null,
      Menu: Wrap,
      MenuAction: Wrap,
    }),
    useRouter: () => ({ push: jest.fn() }),
  };
});

const graph = (meta: Partial<MoneyGraph['meta']>, years: number[]) =>
  ({
    meta: {
      generated: '2026-09-21',
      coverage: 'financial years 1998-99 to 2025-26',
      source: 'Fixture returns',
      ...meta,
    },
    nodes: [
      {
        id: 'party:Fixture Party',
        label: 'Fixture Party',
        kind: 'party',
        group: 'parties',
        industry: 'party',
        total: 1,
        count: 1,
        firstYear: years[0]!,
        lastYear: years.at(-1)!,
        byYear: Object.fromEntries(years.map((y) => [String(y), [1, 1]])),
      },
    ],
    edges: [],
  }) as MoneyGraph;

test('a party section names what its total counts: all receipts, as disclosure records', () => {
  const words = receiptSectionWords(
    'party',
    graph({ receipt_types: { available: true } }, [2024]),
    false,
  );
  expect(words.title).toBe('Money received');
  expect(words.title).not.toMatch(/donation/i);
  expect([words.one, words.many]).toEqual([
    'disclosure record',
    'disclosure records',
  ]);
  expect(words.caveat).toMatch(/one gift can appear twice/);
  expect(words.caveat).toMatch(/transfers within the party/);
  expect(words.barsTitle).toBe('Money received by year');
  // A graph without the receipt-type notes keeps the plain caveat.
  expect(receiptSectionWords('party', graph({}, [2024]), false).caveat).toBe(
    donationsCaveat,
  );
});

test("a donor's typed figure is money to parties across receipt types; untyped stays donations", () => {
  const typed = receiptSectionWords('donor', graph({}, [2024]), true);
  expect(typed.title).toBe('Money to parties');
  expect(typed.caveat.startsWith(typedReceiptsScope)).toBe(true);
  expect(receiptSectionWords('donor', graph({}, [2024]), false)).toMatchObject({
    title: 'Donations to parties',
    caveat: donationsCaveat,
  });
  for (const text of Object.values(typed)) expect(text).not.toMatch(/—/);
});

test('the year whose returns are not yet published is partial, and only that year', () => {
  // Exported 21 Sep 2026: 2024-25 returns came out in February 2026; 2025-26's
  // come out in February 2027.
  const years = [2022, 2023, 2024, 2025];
  expect(partialYearFrom(graph({}, years), years)).toBe(3);
  const later = graph({ generated: '2027-02-02' }, years);
  expect(partialYearFrom(later, years)).toBeUndefined();
  expect(partialYearFrom(graph({}, years), [2022, 2023])).toBeUndefined();
});

test('a compact money row reads one way, and says the full amount', () => {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <>
        <MoneyRow name="Wattle Holdings" amount={18_300_000} compact />
        <MoneyRow name="Banksia Pty Ltd" amount={12_000_000} compact />
        <MoneyRow name="Grevillea Group" amount={9_370_963} compact />
        <MoneyRow name="Hakea Pty Ltd" amount={9_370_963} />
      </>,
    );
  });
  const rows = r.root.findAllByType(LinkRow);
  expect(rows.map((row) => row.props.value)).toEqual([
    '$18.3m',
    '$12m',
    '$9.4m',
    '$9,370,963',
  ]);
  expect(rows[2]!.props.accessibilityLabel).toBe(
    'Grevillea Group, 9,370,963 dollars',
  );
});
