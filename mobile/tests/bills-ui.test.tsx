import { act, type ReactElement } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import * as d from '../src/api/catalogs';
import { billNoteLinks, billSplits } from '../src/api/bill-transforms';
import {
  BillRow,
  DivisionNote,
  MachineBrief,
  NOTE_INLINE_LIMIT,
  OptionRow,
  PartySplits,
  noteCitations,
  splitLabel,
} from '../src/features/bills/parts';
import { useCatalogRecord } from '../src/features/bills/useCatalogRecord';
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

const byID = (root: ReactTestInstance, testID: string) =>
  root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );

describe('long division notes and briefs', () => {
  const long = bill.divisions.find((d) => d.question.length > 1000)!;
  const row = d
    .billFor(bill, bills)
    .divisions.data!.rows.find((r) => r.note.length > NOTE_INLINE_LIMIT)!;

  test('a long note folds behind a labelled disclosure, collapsed by default', () => {
    expect(long).toBeDefined();
    const root = render(
      <DivisionNote note={row.note} links={row.noteLinks} testID="note" />,
    );
    const toggle = byID(root, 'note')[0]!;
    expect(toggle.props.accessibilityRole).toBe('button');
    expect(toggle.props.accessibilityState).toEqual({ expanded: false });
    expect(toggle.props.accessibilityLabel).toMatch(
      /^Division note, \d+ words$/,
    );
    expect(byID(root, 'note-text')).toHaveLength(0);
    press(root, 'note');
    expect(byID(root, 'note')[0]!.props.accessibilityState).toEqual({
      expanded: true,
    });
    // Every word of the note is kept once it is open.
    expect(byID(root, 'note-text')[0]!.props.children).toBe(row.note);
  });

  test('a short note reads inline with no disclosure', () => {
    const root = render(
      <DivisionNote note="The majority voted against." links={[]} testID="n" />,
    );
    expect(byID(root, 'n-text')[0]!.props.children).toBe(
      'The majority voted against.',
    );
    expect(
      root.findAll((node) => typeof node.props.onPress === 'function'),
    ).toHaveLength(0);
  });

  test("a note's citations open through the source-link policy", () => {
    // A synthetic note in They Vote For You's Markdown: an HTTPS citation, the
    // same one again, a relative link, plain HTTP and an OPAX Ask route.
    const note =
      'Read the [bills digest](https://www.aph.gov.au/digest/1). ' +
      'The [same digest](https://www.aph.gov.au/digest/1) again. ' +
      'See the _[policy](/policies/21)_ and [old page](http://example.org/a). ' +
      'Not [this](https://opax.com.au/ask?q=x).';
    const links = billNoteLinks(note);
    expect(links).toEqual([
      { label: 'bills digest', url: 'https://www.aph.gov.au/digest/1' },
      { label: 'same digest', url: 'https://www.aph.gov.au/digest/1' },
      { label: 'policy', url: 'https://theyvoteforyou.org.au/policies/21' },
      { label: 'old page', url: 'http://example.org/a' },
      { label: 'this', url: 'https://opax.com.au/ask?q=x' },
    ]);
    expect(noteCitations(links)).toEqual([
      {
        label: 'bills digest',
        url: 'https://www.aph.gov.au/digest/1',
        host: 'aph.gov.au',
      },
      {
        label: 'policy',
        url: 'https://theyvoteforyou.org.au/policies/21',
        host: 'theyvoteforyou.org.au',
      },
    ]);
    const root = render(
      <DivisionNote note="Short." links={links} testID="cited" />,
    );
    expect(labels(root)).toEqual(
      expect.arrayContaining([
        'bills digest, aph.gov.au',
        'policy, theyvoteforyou.org.au',
      ]),
    );
    expect(byID(root, 'cited-link-2')).toHaveLength(0);
  });

  test('a long machine brief keeps its label and folds its text', () => {
    const brief = 'Moved a motion. '.repeat(40).trim();
    const root = render(
      <MachineBrief label="Machine brief" brief={brief} testID="b" />,
    );
    expect(byID(root, 'b-label')[0]!.props.accessibilityLabel).toBe(
      'Machine-written. An automated summary written by a model; not the record.',
    );
    expect(byID(root, 'b-text')).toHaveLength(0);
    expect(byID(root, 'b-more')[0]!.props.accessibilityLabel).toBe(
      'Read the machine brief, 120 words',
    );
    press(root, 'b-more');
    expect(byID(root, 'b-text')[0]!.props.children).toBe(brief);
    const short = render(
      <MachineBrief label="Machine brief" brief="Moved a motion." testID="s" />,
    );
    expect(byID(short, 's-text')[0]!.props.children).toBe('Moved a motion.');
  });
});

describe('refreshing a saved copy', () => {
  type Rec = { stale: boolean; n: number };
  function Probe({
    load,
    out,
  }: {
    load: () => Promise<Rec>;
    out: { current?: ReturnType<typeof useCatalogRecord<Rec>> };
  }) {
    out.current = useCatalogRecord(load);
    return null;
  }
  const flush = () => act(async () => {});

  test('Try again and pull to refresh replace a saved copy with a fresh one', async () => {
    const results: Rec[] = [
      { stale: true, n: 1 },
      { stale: false, n: 2 },
    ];
    const load = jest.fn(() => Promise.resolve(results.shift()!));
    const out: { current?: ReturnType<typeof useCatalogRecord<Rec>> } = {};
    render(<Probe load={load} out={out} />);
    await flush();
    expect(out.current!.record).toEqual({ stale: true, n: 1 });
    act(() => out.current!.refresh());
    expect(out.current!.refreshing).toBe(true);
    await flush();
    expect(out.current!.record).toEqual({ stale: false, n: 2 });
    expect(out.current!.refreshing).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });

  test('a failed refresh keeps the saved copy readable', async () => {
    let fail = false;
    const load = jest.fn(() =>
      fail
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({ stale: true, n: 1 }),
    );
    const out: { current?: ReturnType<typeof useCatalogRecord<Rec>> } = {};
    render(<Probe load={load} out={out} />);
    await flush();
    fail = true;
    act(() => out.current!.refresh());
    await flush();
    expect(out.current!.record).toEqual({ stale: true, n: 1 });
    expect(out.current!.refreshing).toBe(false);
  });

  test('returning to the app with a saved copy on screen tries again', async () => {
    let listener: ((state: AppStateStatus) => void) | undefined;
    const spy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, handler) => {
        listener = handler as (state: AppStateStatus) => void;
        return { remove: jest.fn() } as never;
      });
    const results: Rec[] = [
      { stale: true, n: 1 },
      { stale: false, n: 2 },
    ];
    const load = jest.fn(() => Promise.resolve(results.shift()!));
    const out: { current?: ReturnType<typeof useCatalogRecord<Rec>> } = {};
    render(<Probe load={load} out={out} />);
    await flush();
    expect(listener).toBeDefined();
    act(() => listener!('active'));
    await flush();
    expect(out.current!.record).toEqual({ stale: false, n: 2 });
    spy.mockRestore();
  });
});
