import { act, type ReactElement } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import * as d from '../src/api/catalogs';
import { billSplits } from '../src/api/bill-transforms';
import {
  BillRow,
  OptionRow,
  PartySplits,
  splitLabel,
} from '../src/features/bills/parts';
import { bills, pinned } from './pinned';

function render(element: ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer.root;
}
// Pressable is a memo component: find it by its props, not its type.
const press = (root: ReactTestInstance, testID: string) =>
  act(() =>
    root
      .find(
        (node) =>
          node.props.testID === testID &&
          typeof node.props.onPress === 'function',
      )
      .props.onPress(),
  );
const labels = (root: ReactTestInstance) =>
  root
    .findAll(
      (node) =>
        typeof node.type === 'string' &&
        typeof node.props.accessibilityLabel === 'string',
    )
    .map((node) => node.props.accessibilityLabel as string);

const bill = d.decodeBill(pinned('/bills/au-federal-r7534.json'));
const division = d.billFor(bill, bills).divisions.data!.rows[0]!;

test('party splits are a disclosure whose rows read their counts in words', () => {
  const root = render(
    <PartySplits
      splits={division.splits}
      basisNote={bills.meta.party_basis_note}
      testID="splits"
    />,
  );
  const toggle = root.find(
    (node) => typeof node.type === 'string' && node.props.testID === 'splits',
  );
  expect(toggle.props.accessibilityState).toEqual({ expanded: false });
  expect(toggle.props.accessibilityLabel).toBe(
    `Party splits, ${division.splits.drawn.length + division.splits.folded.length} parties`,
  );
  expect(labels(root)).not.toContain('Labor, no ayes, 21 noes');
  press(root, 'splits');
  const open = labels(root);
  expect(open).toContain('Labor, no ayes, 21 noes');
  expect(open).toContain('Greens, 9 ayes, no noes');
  expect(open).toContain('Independent, 1 aye, no noes');
  // Every drawn party has its own element, counted from the data.
  for (const split of division.splits.drawn)
    expect(open).toContain(splitLabel(split));
});

test('folded small parties keep a spoken list of every count', () => {
  const synthetic = billSplits({
    ...bill.divisions[0]!,
    party_splits: {
      Labor: { ayes: 0, noes: 21 },
      Greens: { ayes: 9, noes: 0 },
      Liberal: { ayes: 0, noes: 3 },
      Nationals: { ayes: 0, noes: 3 },
      'One Nation': { ayes: 0, noes: 3 },
      JLN: { ayes: 1, noes: 0 },
      Independent: { ayes: 0, noes: 1 },
    },
  });
  const root = render(
    <PartySplits splits={synthetic} basisNote="note" testID="splits" />,
  );
  press(root, 'splits');
  expect(labels(root)).toContain(
    'Also Independent, no ayes, 1 no; JLN, 1 aye, no noes.',
  );
});

test('a division without a recorded split says so', () => {
  const root = render(
    <PartySplits
      splits={billSplits({ ...bill.divisions[0]!, party_splits: {} })}
      basisNote="note"
      testID="splits"
    />,
  );
  expect(
    root.findAll((node) => typeof node.props.onPress === 'function'),
  ).toHaveLength(0);
  expect(
    root.find(
      (node) =>
        typeof node.type === 'string' && node.props.testID === 'splits-none',
    ).props.children,
  ).toBe('Party split not recorded for this division.');
});

test('a bill row is one element naming the bill, its dated status and where it began', () => {
  const row = d
    .billsFor(bills)
    .data!.find((b) => b.key === 'au-federal-r6850')!;
  const root = render(<BillRow bill={row} onPress={() => undefined} />);
  const element = root.find(
    (node) =>
      typeof node.type === 'string' &&
      node.props.testID === 'bill-row-au-federal-r6850',
  );
  expect(element.props.accessibilityRole).toBe('button');
  expect(element.props.accessibilityLabel).toBe(
    'Commonwealth Electoral Amendment (Cleaning up Political Donations) Bill 2022, Lapsed, as at 11 April 2022, House of Representatives, Introduced 14 February 2022, Andrew Wilkie, Independent',
  );
});

test('a filter option reads its count and says when it is chosen', () => {
  const root = render(
    <OptionRow
      label="Before parliament"
      count={119}
      selected
      onPress={() => undefined}
      testID="option"
    />,
  );
  const option = root.find(
    (node) => typeof node.type === 'string' && node.props.testID === 'option',
  );
  expect(option.props.accessibilityLabel).toBe('Before parliament, 119 bills');
  expect(option.props.accessibilityState).toEqual({ selected: true });
});
