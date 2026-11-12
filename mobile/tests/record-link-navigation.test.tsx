import { act, Children, isValidElement, useState } from 'react';
import {
  Link,
  Stack,
  router,
  useLocalSearchParams,
  type Href,
} from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import {
  Platform,
  Pressable,
  ScrollView,
  Text as NativeText,
} from 'react-native';
import { apiClient } from '../src/api/runtime';
import { Screen } from '../src/design/layout';
import { LinkRow } from '../src/design/rows';
import { RowLink } from '../src/design/row-link';
import MoneyRecordScreen from '../src/features/money/MoneyRecord';
import { forgetMoneyGraphs } from '../src/features/money/lookup';
import { isCurrentRecord } from '../src/navigation/record-link';
import { useBillNavigation } from '../src/features/bills/navigation';
import { useRecordNavigation as useReaderNavigation } from '../src/features/records/navigation';
import { useRecordNavigation as usePaneNavigation } from '../src/features/split/entry';
import { rootBackTitle } from '../src/navigation/stack/screen';
import LegacyMoneyNode from '../src/app/(tabs)/(today,your-mp,bills,search,ask)/money-node';

jest.mock('../src/api/runtime', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('../src/design/environment', () => ({
  ...jest.requireActual('../src/design/environment'),
  isE2E: false,
}));
jest.mock('react-native-gesture-handler', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./gesture-mock');
});
let nextHref: Href = '/';
function RecordProbe() {
  const params = useLocalSearchParams();
  const [offset, setOffset] = useState(0);
  return (
    <Screen onScroll={setOffset}>
      <NativeText testID="probe-offset">{offset}</NativeText>
      <NativeText>{JSON.stringify(params)}</NativeText>
      <LinkRow title="Next record" href={nextHref} testID="next-record" />
    </Screen>
  );
}
const cases = [
  ['money-record', { node: 'donor:first' }, { node: 'party:Labor' }],
  [
    'money-item',
    { kind: 'contract', agency: 'a', id: 'one' },
    { kind: 'supplier', agency: 'a', supplier: 'two' },
  ],
  ['money-node', { node: 'one' }, { node: 'two' }],
  [
    'grant-program',
    { id: 'one', jur: 'federal', seat: 'Example' },
    { id: 'one', jur: 'federal' },
  ],
  ['source', { key: 'one' }, { key: 'two' }],
  [
    'record-list',
    { person: 'one', kind: 'speech' },
    { party: 'Labor', kind: 'speech' },
  ],
  ['electorate-date', { id: 'one' }, { id: 'two' }],
  ['election', { seat: 'one', key: '2022' }, { seat: 'one', key: '2025' }],
  ['seat', { scope: 'vic' }, { scope: 'federal' }],
  ['rule', { key: 'one' }, { key: 'two' }],
  ['talk/record', { path: '/doc/one' }, { path: '/doc/two' }],
  ['members', { seat: 'one' }, { seat: 'two' }],
  [
    'grants',
    { jur: 'federal', view: 'seats' },
    { jur: 'federal', seat: 'Example', state: 'VIC' },
  ],
  ['licences', {}, {}],
  ['person/[slug]', { slug: 'one' }, { slug: 'two' }],
  ['bill/[key]', { key: 'one' }, { key: 'two' }],
  ['party/[slug]', { slug: 'one' }, { slug: 'two' }],
  ['electorate/[id]', { id: 'one' }, { id: 'two' }],
  ['topic/[slug]', { slug: 'one' }, { slug: 'two' }],
  ['doc/[slug]', { slug: 'one' }, { slug: 'two' }],
  ['bill-text/[key]', { key: 'one' }, { key: 'two' }],
  ['account/sources/dataset/[id]', { id: 'one' }, { id: 'two' }],
  ['licence/[id]', { id: 'one' }, { id: 'two' }],
  [
    'licence/sources/[...path]',
    { path: ['dataset', 'one'] },
    { path: ['dataset', 'two'] },
  ],
  ['agency', { id: 'one' }, { id: 'two' }],
  ['connection', { id: 'one' }, { id: 'two' }],
  ['lead/[id]', { id: 'one' }, { id: 'two' }],
] as const;
const href = (path: string, params: object): Href =>
  ({ pathname: `/${path}`, params }) as Href;
const app = {
  _layout: () => <Stack />,
  index: () => <NativeText>Today</NativeText>,
  ...Object.fromEntries(cases.map(([path]) => [path, RecordProbe])),
};
let rendered: ReturnType<typeof renderRouter>;
const originalOS = Platform.OS;
beforeEach(() => {
  Platform.OS = 'ios';
  forgetMoneyGraphs();
});
afterEach(async () => {
  await act(async () => rendered?.unmount());
  Platform.OS = originalOS;
  jest.clearAllMocks();
});
function focused() {
  let state = rendered.getRouterState();
  while (state.routes[state.index]?.state)
    state = state.routes[state.index]!.state! as typeof state;
  return state;
}
function currentRow(id = 'next-record') {
  const key = focused().routes[focused().index]!.key;
  return rendered.UNSAFE_root.findAllByType(RowLink).find((row) => {
    if (row.props.children.props.testID !== id) return false;
    let node = row.parent;
    while (node) {
      if (node.props.route?.key === key) return true;
      node = node.parent;
    }
    return false;
  })!;
}
function scrollFor(row: ReturnType<typeof currentRow>) {
  let node = row.parent;
  while (node && node.type !== ScrollView) node = node.parent;
  if (!node) throw new Error('Missing record scroll view');
  return node;
}
async function tap(row = currentRow()) {
  const event = {
    button: 0,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  // Native preview hosts render null in Jest. Drive the action chosen by the
  // rendered Link, including its preventDefault guard, through the real router.
  const link = row.findByType(Link);
  await act(async () => {
    link.props.onPress?.(event);
    if (!event.defaultPrevented)
      router[link.props.push ? 'push' : 'navigate'](link.props.href);
  });
}

test.each(cases)(
  '%s pushes a new record, preserves Back history and ignores the same record on top',
  async (path, first, second) => {
    nextHref = href(path, second);
    rendered = renderRouter(app);
    await act(async () => router.push(href(path, first)));
    const before = focused();
    expect(currentRow().findByType(Link).props.push).toBe(true);
    await tap();
    const after = focused();
    if (path === 'licences') {
      expect(after.routes).toEqual(before.routes);
      return;
    }
    expect(after.routes).toHaveLength(before.routes.length + 1);
    expect(after.routes.slice(0, -1)).toEqual(before.routes);
    expect(after.routes.at(-1)!.params).toMatchObject(second);
    await tap();
    expect(focused().routes).toEqual(after.routes);
    expect(
      Children.toArray(currentRow().findByType(Link).props.children).some(
        (child) => isValidElement(child) && child.type === Link.Preview,
      ),
    ).toBe(false);
    nextHref = href(path, first);
    await act(async () => router.setParams({ name: 'Loaded title' }));
    await tap();
    expect(focused().routes).toHaveLength(after.routes.length + 1);
    await act(async () => router.back());
    expect(focused().routes.at(-1)!.key).toBe(after.routes.at(-1)!.key);
    await act(async () => router.back());
    expect(focused().routes.at(-1)!.key).toBe(before.routes.at(-1)!.key);
  },
);

test('a newly pushed record mounts at scroll offset 0 and Back keeps the previous scroll position', async () => {
  nextHref = href('money-record', { node: 'party:Labor' });
  rendered = renderRouter(app);
  await act(async () =>
    router.push(href('money-record', { node: 'donor:example' })),
  );
  const donorScroll = scrollFor(currentRow());
  await act(async () =>
    donorScroll.props.onScroll({
      nativeEvent: { contentOffset: { x: 0, y: 780 } },
    }),
  );
  expect(
    donorScroll.findByProps({ testID: 'probe-offset' }).props.children,
  ).toBe(780);
  await tap();
  const partyScroll = scrollFor(currentRow());
  expect(partyScroll).not.toBe(donorScroll);
  expect(
    partyScroll.findByProps({ testID: 'probe-offset' }).props.children,
  ).toBe(0);
  await act(async () => router.back());
  expect(scrollFor(currentRow())).toBe(donorScroll);
  expect(
    donorScroll.findByProps({ testID: 'probe-offset' }).props.children,
  ).toBe(780);
});

test('the party row on a donor pushes and Back from the party returns to the donor', async () => {
  const figures = {
    total: 1000,
    count: 1,
    firstYear: 2024,
    lastYear: 2024,
    byYear: { '2024': [1000, 1] },
  };
  const graph = {
    meta: { generated: '2026-11-10', coverage: '2024–25', source: 'AEC' },
    nodes: [
      {
        ...figures,
        id: 'donor:example',
        kind: 'donor',
        label: 'Example Organisation Pty Ltd',
        group: 'other',
        industry: 'other',
      },
      {
        ...figures,
        id: 'party:Labor',
        kind: 'party',
        label: 'Labor',
        group: 'party',
        industry: 'party',
      },
    ],
    edges: [{ ...figures, source: 'donor:example', target: 'party:Labor' }],
  };
  jest.mocked(apiClient.get).mockImplementation(async (_path, decode) => ({
    data: decode(graph),
    stale: false,
    asOf: '2026-11-10',
    savedAt: 1,
  }));
  rendered = renderRouter({ ...app, 'money-record': MoneyRecordScreen });
  await act(async () =>
    router.push(href('party/[slug]', { slug: 'liberal', name: 'Liberal' })),
  );
  await act(async () =>
    router.push(
      href('money-record', {
        node: 'donor:example',
        name: 'Example Organisation Pty Ltd',
        via: 'map',
      }),
    ),
  );
  const donor = focused().routes.at(-1)!;
  const row = currentRow('money-focus-flow-0');
  expect(row.props.href.params).toMatchObject({
    node: 'party:Labor',
    via: 'map',
  });
  expect(row.findByType(Link).props.push).toBe(true);
  const donorScroll = scrollFor(row);
  await tap(row);
  const party = focused().routes.at(-1)!;
  expect(party.key).not.toBe(donor.key);
  expect(focused().routes.at(-2)).toEqual(donor);
  expect(rootBackTitle({ getState: focused }, party.key)).toBe(
    'Example Organisation Pty Ltd',
  );
  await act(async () => router.back());
  expect(focused().routes.at(-1)).toEqual(donor);
  expect(scrollFor(currentRow('money-focus-flow-0'))).toBe(donorScroll);
});

test('record identity accepts concrete URLs, grouped routes and loaded labels', () => {
  const state = {
    index: 0,
    routes: [{ name: 'money-record', params: { node: 'party:Labor' } }],
  };
  expect(
    isCurrentRecord(
      '/(tabs)/(today)/money-record?node=party%3ALabor&name=Labor&via=map',
      state,
    ),
  ).toBe(true);
  expect(
    isCurrentRecord('/person/example', {
      routes: [{ name: 'person/[slug]', params: { slug: 'example' } }],
    }),
  ).toBe(true);
  expect(isCurrentRecord('/account', state)).toBe(false);
});

test('dynamic record kinds chain to each other and Back returns one step at a time', async () => {
  rendered = renderRouter(app);
  const keys: string[] = [];
  const destinations = cases.filter(
    ([path]) => path.includes('[') || ['agency', 'connection'].includes(path),
  );
  for (const [path, params] of destinations) {
    nextHref = href(path, params);
    if (!keys.length) await act(async () => router.push(nextHref));
    else {
      await act(async () => router.setParams({ name: path }));
      await tap();
    }
    keys.push(focused().routes.at(-1)!.key);
  }
  for (const key of keys.toReversed()) {
    expect(focused().routes.at(-1)!.key).toBe(key);
    await act(async () => router.back());
  }
});

test('party, donor, recipient and supplier links push each step', async () => {
  rendered = renderRouter(app);
  const destinations = [
    { node: 'party:Liberal' },
    { node: 'donor:first' },
    { node: 'party:Labor' },
    { node: 'party:Greens' },
    { node: 'donor:second' },
    { node: 'donor:third' },
    { rid: 'recipient:first', jur: 'federal' },
    { rid: 's-first', agency: 'a' },
    { rid: 's-second', agency: 'b' },
  ];
  const keys: string[] = [];
  for (const params of destinations) {
    nextHref = href('money-record', params);
    if (!keys.length) await act(async () => router.push(nextHref));
    else {
      await act(async () => router.setParams({ name: 'Loaded record' }));
      await tap();
    }
    keys.push(focused().routes.at(-1)!.key);
    expect(focused().routes).toHaveLength(keys.length + 1);
  }
  for (const key of keys.toReversed()) {
    expect(focused().routes.at(-1)!.key).toBe(key);
    await act(async () => router.back());
  }
});

test('non-record links retain their default navigation and split selections retain their callback', async () => {
  nextHref = '/account';
  rendered = renderRouter({ ...app, account: RecordProbe });
  await act(async () =>
    router.push(href('money-record', { node: 'donor:first' })),
  );
  expect(currentRow().findByType(Link).props.push).toBe(false);
  await tap();
  expect(rendered.getPathname()).toBe('/account');
  await act(async () => router.back());
  const before = focused().routes;
  const select = jest.fn();
  // The same callback branch used by an iPad split selection wins over push.
  const { create } = jest.requireActual('react-test-renderer');
  let selection: import('react-test-renderer').ReactTestRenderer;
  await act(async () => {
    selection = create(
      <RowLink
        href={href('money-record', { node: 'party:Labor' })}
        select={select}
      >
        <Pressable />
      </RowLink>,
    );
  });
  const event = { preventDefault: jest.fn() };
  await act(async () => selection!.root.findByType(Link).props.onPress(event));
  expect(event.preventDefault).toHaveBeenCalled();
  expect(select).toHaveBeenCalledTimes(1);
  expect(focused().routes).toEqual(before);
});

test.each(['bill', 'reader', 'pane'] as const)(
  '%s imperative actions ignore the record on top and push an earlier record',
  async (kind) => {
    function Actions() {
      const bill = useBillNavigation();
      const reader = useReaderNavigation();
      const pane = usePaneNavigation();
      const open: (key: string) => void =
        kind === 'bill'
          ? bill.openBill
          : kind === 'reader'
            ? reader.openDoc
            : (key) =>
                pane.open({
                  pathname: '/person/[slug]',
                  params: { slug: key },
                });
      return (
        <>
          {['one', 'two'].map((key) => (
            <LinkRow
              key={key}
              title={key}
              testID={`open-${key}`}
              onPress={() => open(key)}
            />
          ))}
        </>
      );
    }
    const path =
      kind === 'bill'
        ? 'bill/[key]'
        : kind === 'reader'
          ? 'doc/[slug]'
          : 'person/[slug]';
    rendered = renderRouter({ ...app, [path]: Actions });
    await act(async () =>
      router.push(
        href(path, kind === 'bill' ? { key: 'one' } : { slug: 'one' }),
      ),
    );
    const first = focused().routes.at(-1)!;
    const open = (key: string) =>
      rendered.UNSAFE_root.findAllByType(Actions)
        .at(-1)!
        .findAllByType(LinkRow)
        .find((row) => row.props.testID === `open-${key}`)!
        .props.onPress();
    await act(async () => open('one'));
    expect(focused().routes).toHaveLength(2);
    await act(async () => open('two'));
    expect(focused().routes).toHaveLength(3);
    await act(async () => open('one'));
    expect(focused().routes).toHaveLength(4);
    expect(focused().routes.at(-1)!.key).not.toBe(first.key);
  },
);

test('default navigate reproduces the query-only record reuse that a forward Link must avoid', async () => {
  rendered = renderRouter(app);
  await act(async () =>
    router.push(href('money-record', { node: 'donor:first' })),
  );
  const before = focused();
  await act(async () =>
    router.navigate(href('money-record', { node: 'party:Labor' })),
  );
  expect(focused().routes).toHaveLength(before.routes.length);
  expect(focused().routes.at(-1)!.key).toBe(before.routes.at(-1)!.key);
  expect(focused().routes.at(-1)!.params).toMatchObject({
    node: 'party:Labor',
  });
});

test('legacy money-node redirects preserve the source record and share its same-record guard', async () => {
  nextHref = href('money-node', { node: 'party:Labor' });
  rendered = renderRouter({ ...app, 'money-node': LegacyMoneyNode });
  await act(async () =>
    router.push(href('money-record', { node: 'donor:first' })),
  );
  const donor = focused().routes.at(-1)!;
  await tap();
  expect(rendered.getPathname()).toBe('/money-record');
  expect(focused().routes.at(-2)).toEqual(donor);
  expect(focused().routes).toHaveLength(3);
  await tap();
  expect(focused().routes).toHaveLength(3);
});
