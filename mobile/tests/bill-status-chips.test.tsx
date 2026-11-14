import { act, type ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { billDisplay, billSentenceCase } from '../src/api/bill-transforms';
import { StatusCapsule } from '../src/design/labels';
import { billStatusLabel as billStatus } from '../src/api/bill-status';
import { BillRow, SuggestionRow } from '../src/design/rows';
import { Text } from '../src/design/text';
import { colors } from '../src/design/tokens';
import { BillIndexRow } from '../src/features/bills/parts';
import { YearBills } from '../src/features/explore/YearBills';
import { FollowRow } from '../src/features/follows/FollowRow';
import { MatchRow } from '../src/features/search/rows';
import { BillFeed } from '../src/features/today/BillFeed';
import { bills } from './pinned';

jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useSegments: () => [],
  Link: Object.assign(({ children }: { children: unknown }) => children, {
    Trigger: ({ children }: { children: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));

function render(element: ReactElement) {
  let view!: TestRenderer.ReactTestRenderer;
  act(() => {
    view = TestRenderer.create(element);
  });
  return view.root;
}

function checkChip(
  root: ReactTestInstance,
  status: string,
  label: string,
  active: boolean,
) {
  const chip = root.findByType(StatusCapsule);
  expect(chip.props.status).toBe(status);
  expect(chip.findByType(Text).props.children).toBe(label);
  const box = chip.find(
    (node) =>
      typeof node.type === 'string' &&
      node.props.accessibilityElementsHidden !== undefined,
  );
  expect(StyleSheet.flatten(box.props.style).backgroundColor).toBe(
    active ? colors.billsWash : colors.sunken,
  );
  if (!chip.props.hidden)
    expect(box.props.accessibilityLabel).toBe(`Status: ${label}`);
}

describe.each([
  ['before_parliament', 'Before parliament', true],
  ['passed', 'Passed', false],
  ['assented', 'Assented', false],
  ['awaiting_review', 'Awaiting review', false],
] as const)('bill status %s', (status, label, active) => {
  const bill = {
    ...bills.bills[0]!,
    title: 'Robodebt Bill 2025',
    short_title: null,
    status,
    introduced: '2025-08-26',
  };
  const display = billDisplay(bill);
  const match = { kind: 'bills', key: bill.key, tier: 0, item: bill } as const;

  test('search hits show the detail label, retain the date and speak the label', () => {
    expect(billStatus(status)).toBe(billSentenceCase(status));
    const root = render(
      <MatchRow
        match={match}
        q="robodebt"
        sources={{}}
        variant="result"
        testID="bill-hit"
      />,
    );
    checkChip(root, status, label, active);
    const hit = root.find(
      (node) =>
        typeof node.type === 'string' && node.props.testID === 'bill-hit',
    );
    expect(hit.props.accessibilityLabel).toContain(label);
    expect(hit.props.accessibilityLabel).toContain('26 Aug 2025');
    if (status.includes('_'))
      expect(hit.props.accessibilityLabel).not.toContain(status);
  });

  test('search suggestions use the same label as hits and detail', () => {
    const root = render(
      <MatchRow match={match} q="robodebt" sources={{}} variant="suggestion" />,
    );
    expect(root.findByType(SuggestionRow).props.secondary).toBe(
      `${label} · Introduced 26 Aug 2025`,
    );
  });

  test('Bills, Today and year lists use the same label and raw colour key', () => {
    for (const element of [
      <BillIndexRow key="bills" bill={display} />,
      <BillFeed key="today" bills={[display]} />,
      <YearBills
        key="year"
        year={2025}
        read={{
          record: {
            data: { ...bills, bills: [bill] },
            stale: false,
            savedAt: 1,
            asOf: null,
          },
          error: null,
          retry: jest.fn(),
        }}
      />,
    ])
      checkChip(render(element), status, label, active);
  });

  test('followed bills use sentence case even with older marker words', () => {
    const root = render(
      <FollowRow
        follow={{
          kind: 'bill',
          id: bill.key,
          title: bill.title,
          followedAt: 1,
          seen: null,
          seenAt: null,
        }}
        state={{
          status: 'ready',
          title: bill.title,
          current: {
            status: { value: status, words: status, asAt: null },
          },
          keys: [],
          changes: [],
        }}
      />,
    );
    checkChip(root, status, label, active);
  });
});

test("a followed bill's pill reads the export's ending, as every bill row does", () => {
  const bill = bills.bills[0]!;
  const root = render(
    <FollowRow
      follow={{
        kind: 'bill',
        id: bill.key,
        title: bill.title,
        followedAt: 1,
        seen: null,
        seenAt: null,
      }}
      state={{
        status: 'ready',
        title: bill.title,
        current: {
          status: {
            value: 'lapsed',
            words: 'lapsed',
            asAt: null,
            ended: 'removed',
            ended_label: 'Removed from the Notice Paper',
          },
        },
        keys: [],
        changes: [],
      }}
    />,
  );
  checkChip(root, 'lapsed', 'Removed from the Notice Paper', false);
});

test('chip colour depends on the raw value independently of the label', () => {
  checkChip(
    render(
      <BillRow
        title="Fixture bill"
        status="Status not recorded"
        rawStatus="committee_review"
      />,
    ),
    'committee_review',
    'Status not recorded',
    true,
  );
});

test('a missing bill status has readable fallback words', () => {
  expect(billStatus('')).toBe('Status not recorded');
});
