import { act } from 'react';
import { View } from 'react-native';
import TestRenderer from 'react-test-renderer';

// Lane 2 (Search, Ask, directories on iPad): the record pane's entries, the
// split list's Return and cursor keys, and the rows' selected state. The
// test sets the region `useLayout()` reports; useFocusEffect runs on mount.
const mockLayout = { regular: true, width: 1180 };
jest.mock('../src/design/adaptive', () => {
  const actual = jest.requireActual('../src/design/adaptive');
  return {
    ...actual,
    useLayout: () => ({
      size: mockLayout.regular ? 'regular' : 'compact',
      regular: mockLayout.regular,
      wide: mockLayout.width >= 1100,
      width: mockLayout.width,
      height: 800,
      window: { width: mockLayout.width, height: 800 },
      landscape: true,
    }),
  };
});
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), setParams: jest.fn() },
  useFocusEffect: (effect: () => void | (() => void)) => {
    jest.requireActual('react').useEffect(effect, []);
  },
}));

import { dispatchKeyCommand, keyCommandSpecs } from '../src/design/keyboard';
import { SplitLayout, useSplitCursor } from '../src/design/split';
import { LinkRow } from '../src/design/rows';
import {
  decodeEntry,
  encodeEntry,
  entryForRoute,
  entryForWebPath,
  entryLabel,
  sharePath,
} from '../src/features/split/entry';
import {
  billRoute,
  billTextRoute,
  docRoute,
  electorateRoute,
  partyRoute,
  personRoute,
} from '../src/navigation/routes';

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
});

describe('record pane entries', () => {
  test('the open parameter round-trips, keys may hold colons', () => {
    const entry = { kind: 'party', key: 'Labor: NSW' } as const;
    expect(encodeEntry(entry)).toBe('party:Labor: NSW');
    expect(decodeEntry('party:Labor: NSW')).toEqual(entry);
    expect(decodeEntry('person-name:Sarah Witty')).toEqual({
      kind: 'person-name',
      key: 'Sarah Witty',
    });
  });
  test('an unknown kind, a missing key or no parameter opens nothing', () => {
    expect(decodeEntry(undefined)).toBeNull();
    expect(decodeEntry('')).toBeNull();
    expect(decodeEntry('report:climate')).toBeNull();
    expect(decodeEntry('person:')).toBeNull();
    expect(decodeEntry(':x')).toBeNull();
  });
  test('native record routes become pane entries; dated or sectioned ones keep their route', () => {
    expect(entryForRoute(personRoute('mary-aldred'))).toEqual({
      kind: 'person',
      key: 'mary-aldred',
    });
    expect(entryForRoute(partyRoute('Australian Labor Party'))).toEqual({
      kind: 'party',
      key: 'Australian Labor Party',
    });
    expect(entryForRoute(electorateRoute('el_1'), 'Grayndler')).toEqual({
      kind: 'electorate',
      key: 'el_1',
      title: 'Grayndler',
    });
    expect(entryForRoute(billRoute('au-federal-r7534'))?.kind).toBe('bill');
    expect(entryForRoute(billTextRoute('au-federal-r7534'))?.kind).toBe('text');
    expect(entryForRoute(docRoute('hansard-1'))?.kind).toBe('doc');
    expect(entryForRoute(electorateRoute('el_1', '2022-05-21'))).toBeNull();
    expect(
      entryForRoute(billRoute('au-federal-r7534', 'divisions')),
    ).toBeNull();
    expect(entryForRoute(billTextRoute('au-federal-r7534', 'v2'))).toBeNull();
    expect(entryForRoute({ pathname: '/reports' })).toBeNull();
  });
  test('answer sources on the site map to the record they name', () => {
    expect(entryForWebPath('/bill/au-federal-r7534', 'A bill')).toEqual({
      kind: 'bill',
      key: 'au-federal-r7534',
      title: 'A bill',
    });
    expect(entryForWebPath('/subject/person/mary-aldred')?.kind).toBe('person');
    expect(entryForWebPath('/subject/party/The%20Greens')).toEqual({
      kind: 'party',
      key: 'The Greens',
    });
    // Another site, or a page the app has no native screen for, is no entry.
    expect(entryForWebPath('https://example.com/bill/au-federal-r7534')).toBe(
      null,
    );
    expect(entryForWebPath('/reports')).toBeNull();
  });
  test('Back labels and share paths come from the entry alone', () => {
    expect(entryLabel({ kind: 'bill', key: 'x' })).toBe('Bill');
    expect(entryLabel({ kind: 'text', key: 'x' })).toBe('Bill text');
    expect(entryLabel({ kind: 'person', key: 'x', title: 'Mary Aldred' })).toBe(
      'Mary Aldred',
    );
    expect(sharePath({ kind: 'bill', key: 'au-federal-r7534' })).toBe(
      '/bill/au-federal-r7534',
    );
    expect(sharePath({ kind: 'party', key: 'The Greens' })).toBe(
      '/subject/party/The%20Greens',
    );
    // A person's public slug is not known from the pane's key: no Share.
    expect(sharePath({ kind: 'person', key: 'x' })).toBeNull();
  });
});

describe('split list keys', () => {
  beforeEach(() => {
    mockLayout.regular = true;
  });
  type Entry = { key: string };
  function render(element: React.ReactElement) {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(element);
    });
    mounted.push(tree);
    return tree;
  }
  test('Return is registered with its discoverability title', () => {
    const spec = keyCommandSpecs.find((s) => s.id === 'list-open');
    expect(spec).toMatchObject({
      input: 'return',
      modifiers: [],
      title: 'Open focused row',
    });
  });
  test('Return selects the first row when nothing is selected', () => {
    const onSelect = jest.fn();
    render(
      <SplitLayout<Entry>
        id="t"
        list={<View />}
        selected={null}
        onSelect={onSelect}
        entryKey={(e) => e.key}
        renderDetail={() => null}
        keys={['a', 'b']}
        entryForKey={(key) => ({ key })}
        empty={null}
      />,
    );
    act(() => {
      dispatchKeyCommand('list-open');
    });
    expect(onSelect).toHaveBeenCalledWith({ key: 'a' });
  });
  test('cursor mode: arrows move a highlight without opening, Return opens it, Escape clears it', () => {
    const onOpenKey = jest.fn();
    const onCursor = jest.fn();
    const seen: (string | null)[] = [];
    function Rows() {
      seen.push(useSplitCursor());
      return null;
    }
    const onSelect = jest.fn();
    render(
      <SplitLayout<Entry>
        id="t"
        list={<Rows />}
        selected={null}
        onSelect={onSelect}
        entryKey={(e) => e.key}
        renderDetail={() => null}
        keys={['a', 'b', 'c']}
        onOpenKey={onOpenKey}
        onCursor={onCursor}
        empty={null}
      />,
    );
    act(() => {
      dispatchKeyCommand('list-down');
    });
    act(() => {
      dispatchKeyCommand('list-down');
    });
    expect(seen.at(-1)).toBe('b');
    expect(onCursor).toHaveBeenLastCalledWith('b');
    expect(onOpenKey).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    act(() => {
      dispatchKeyCommand('list-up');
    });
    act(() => {
      dispatchKeyCommand('list-open');
    });
    expect(onOpenKey).toHaveBeenCalledWith('a');
    act(() => {
      dispatchKeyCommand('list-escape');
    });
    expect(seen.at(-1)).toBeNull();
  });
  test('compact width takes no keys (the phone list is unchanged)', () => {
    mockLayout.regular = false;
    const onOpenKey = jest.fn();
    render(
      <SplitLayout<Entry>
        id="t"
        list={<View />}
        selected={null}
        onSelect={jest.fn()}
        entryKey={(e) => e.key}
        renderDetail={() => null}
        keys={['a']}
        onOpenKey={onOpenKey}
        empty={null}
      />,
    );
    expect(dispatchKeyCommand('list-down')).toBe(false);
    expect(dispatchKeyCommand('list-open')).toBe(false);
  });
});

describe('split rows', () => {
  const pressable = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root.find((node) => node.props.accessibilityRole === 'button');
  test('an ordinary row keeps its chevron and has no selected state', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <LinkRow title="Grayndler" onPress={jest.fn()} />,
      );
    });
    mounted.push(tree);
    expect(pressable(tree).props.accessibilityState).toEqual({
      disabled: false,
    });
    expect(
      tree.root.findAll((node) => node.props.name === 'chevron.right').length,
    ).toBeGreaterThan(0);
  });
  test('a split row says selected and drops the chevron: the pane is the destination', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <LinkRow title="Grayndler" onPress={jest.fn()} selected />,
      );
    });
    mounted.push(tree);
    expect(pressable(tree).props.accessibilityState).toEqual({
      disabled: false,
      selected: true,
    });
    expect(
      tree.root.findAll((node) => node.props.name === 'chevron.right'),
    ).toHaveLength(0);
  });
});
