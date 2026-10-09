import { act, type ReactElement } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import * as d from '../src/api/catalogs';
import { billSplits } from '../src/api/bill-transforms';
import {
  BillRow,
  DivisionQuestion,
  DivisionSplits,
  MachineBrief,
  OptionRow,
  divisionParties,
  openableUrl,
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
/** Every string a subtree draws, in order. */
const texts = (root: ReactTestInstance): string[] =>
  root.children.flatMap((child) =>
    typeof child === 'string' ? [child] : texts(child),
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

test('the three largest parties are drawn as rows that read their counts in words', () => {
  const parties = divisionParties(division.splits);
  expect(parties.shown.map((s) => s.label)).toEqual([
    'Labor',
    'Greens',
    'Liberal',
  ]);
  const root = render(
    <DivisionSplits splits={parties.shown} max={parties.max} testID="splits" />,
  );
  const spoken = labels(root);
  expect(spoken).toContain('Labor, no ayes, 21 noes');
  expect(spoken).toContain('Greens, 9 ayes, no noes');
  // Every drawn party has its own element, counted from the data.
  for (const split of parties.shown)
    expect(spoken).toContain(splitLabel(split));
  // On screen each reads ayes–noes beside its bar.
  expect(texts(byID(root, 'splits-labor')[0]!)).toContain('0–21');
  // The rest wait for the disclosure; nothing is lost.
  expect(
    [...parties.shown, ...parties.rest].map((s) => s.party).sort(),
  ).toEqual(
    [...division.splits.drawn, ...division.splits.folded]
      .map((s) => s.party)
      .sort(),
  );
});

test('a party row opens its party; a row for no party is not a link', () => {
  const synthetic = divisionParties(
    billSplits({
      ...bill.divisions[0]!,
      party_splits: {
        Labor: { ayes: 0, noes: 21 },
        PRES: { ayes: 0, noes: 1 },
        '': { ayes: 2, noes: 0 },
      },
    }),
  );
  const root = render(
    <DivisionSplits
      splits={synthetic.shown}
      max={synthetic.max}
      testID="splits"
    />,
  );
  expect(
    root.findAll(
      (node) =>
        typeof node.props.onPress === 'function' &&
        node.props.accessibilityRole === 'link',
    ),
  ).toHaveLength(1);
  expect(labels(root)).toEqual(
    expect.arrayContaining([
      'Presiding officer, no ayes, 1 no',
      'Not recorded, 2 ayes, no noes',
    ]),
  );
});

test('every bar measures against the largest party in the division', () => {
  const parties = divisionParties(division.splits);
  const largest = Math.max(
    ...[...division.splits.drawn, ...division.splits.folded].map(
      (s) => s.ayes + s.noes,
    ),
  );
  expect(parties.max).toBe(largest);
  const none = divisionParties(
    billSplits({ ...bill.divisions[0]!, party_splits: {} }),
  );
  expect(none.recorded).toBe(false);
  expect(none.shown).toEqual([]);
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
  // On screen the status is its label alone: the list's source line dates
  // the list, so no row repeats "as at".
  const drawn = texts(root);
  expect(drawn).toContain('Lapsed');
  expect(drawn.join(' ')).not.toMatch(/as at/);
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

describe('division questions and briefs', () => {
  test("a question's Markdown is drawn as blocks, never as raw marks", () => {
    const root = render(
      <DivisionQuestion
        text="### Motion text > *That the question be now put.*"
        testID="q"
      />,
    );
    const drawn = texts(root).join(' ');
    expect(drawn).not.toMatch(/###|(^|\s)>\s|\*/);
    expect(drawn).toContain('Motion text');
    expect(drawn).toContain('That the question be now put.');
    expect(
      root.findAll(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessibilityRole === 'header',
      ),
    ).toHaveLength(1);
  });

  test("a question's citations open through the source-link policy", () => {
    // A synthetic question in They Vote For You's Markdown: an HTTPS
    // citation, a relative link, plain HTTP and an OPAX Ask route.
    const root = render(
      <DivisionQuestion
        text={
          'Read the [bills digest](https://www.aph.gov.au/digest/1). ' +
          'See the _[policy](/policies/21)_ and [old page](http://example.org/a). ' +
          'Not [this](https://opax.com.au/ask?q=x).'
        }
      />,
    );
    const links = root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessibilityRole === 'link',
    );
    expect(links.map((node) => texts(node).join(''))).toEqual([
      'bills digest',
      'policy',
    ]);
    // The rest stay their words.
    const drawn = texts(root).join('');
    expect(drawn).toContain('old page');
    expect(drawn).toContain('this');
    expect(drawn).not.toContain('](');
    expect(openableUrl('http://example.org/a')).toBeNull();
    expect(openableUrl('https://theyvoteforyou.org.au/policies/21')).toBe(
      'https://theyvoteforyou.org.au/policies/21',
    );
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
