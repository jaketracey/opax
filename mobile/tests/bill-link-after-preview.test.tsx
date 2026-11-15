import { act, useEffect } from 'react';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
  StackActions,
  getActionFromState,
  getStateFromPath,
} from 'expo-router/react-navigation';
import { store } from 'expo-router/build/global-state/router-store';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';
import { redirectSystemPath } from '../src/app/+native-intent';
import { dropStalePreviews } from '../src/navigation/stale-previews';
import { useLinkReadiness } from '../src/navigation/useLinkReadiness';

jest.mock('../src/analytics', () => ({ track: jest.fn() }));

/**
 * Backlog D-billlink: with the Bills tab open and scrolled on the Duo's
 * outer display, opax://bill/au-federal-r7534 opened nothing. The slow
 * scroll began as a long press on a row, which opened that row's native
 * preview; the preview preloaded `bill/[key]` in the Bills stack and left
 * it there. A link into the open app is dispatched as a navigate that pops
 * to an existing route, and Expo Router 57.0.24 matched it to the preloaded
 * route, found no such route in the stack, and added nothing.
 */
let listMounts = 0;
function List() {
  useEffect(() => {
    listMounts++;
  }, []);
  return <Text testID="bills-screen">Bills</Text>;
}
function Bill() {
  const { key } = useLocalSearchParams<{ key: string }>();
  return <Text testID="bill-screen">{key}</Text>;
}
function Root() {
  // The app's root layout registers the container the same way.
  useLinkReadiness(true);
  return <Stack />;
}
const app = {
  _layout: Root,
  '(tabs)/_layout': () => <Stack />,
  '(tabs)/(today)/_layout': () => <Stack />,
  '(tabs)/(today)/index': () => <Text testID="today-screen">Today</Text>,
  '(tabs)/(bills)/_layout': {
    default: () => <Stack />,
    unstable_settings: { initialRouteName: 'bills' },
  },
  '(tabs)/(bills)/bills': List,
  '(tabs)/(bills)/bill/[key]': Bill,
};

/** A link arriving while the app is open, as React Navigation routes it. */
async function openWarmLink(url: string) {
  // Expo Router awaits the redirect before it routes the link.
  let path = '';
  await act(async () => {
    const redirected = redirectSystemPath({ path: url, initial: false });
    // renderRouter installs fake timers: let the redirect's turn pass.
    jest.runOnlyPendingTimers();
    path = await redirected;
  });
  await act(async () => {
    const linking = store.linking!;
    const state = (linking.getStateFromPath ?? getStateFromPath)(
      path,
      linking.config as never,
    );
    const action = getActionFromState(state as never, linking.config as never);
    store.navigationRef.current!.dispatch(action as never);
  });
}
function billsStack() {
  let state = store.navigationRef.current!.getRootState() as {
    index: number;
    key: string;
    routes: { name: string; key: string; state?: unknown }[];
    preloadedRoutes?: unknown[];
  };
  while (state.routes[state.index]?.name !== 'bills' || state.index !== 0) {
    const next = state.routes.find((route) => route.state)?.state;
    if (!next || state.routes.some((route) => route.name === 'bills')) break;
    state = next as typeof state;
  }
  return state;
}

beforeEach(() => {
  listMounts = 0;
});

it.each([
  ['after a row preview left its bill preloaded', true],
  ['with nothing preloaded', false],
])(
  'a bill link from the Bills tab opens the bill %s, and Back returns to the same list',
  async (_name, previewed) => {
    const rendered = renderRouter(app, {
      initialUrl: '/(tabs)/(bills)/bills',
    });
    const listKey = billsStack().routes[0]!.key;
    // What LinkWithPreview's onWillPreviewOpen does for the pressed row.
    if (previewed) {
      await act(async () =>
        router.prefetch('/(tabs)/(bills)/bill/au-federal-r7105'),
      );
      expect(billsStack().preloadedRoutes).toHaveLength(1);
    }
    await openWarmLink('opax://bill/au-federal-r7534');
    expect(rendered.getPathname()).toBe('/bill/au-federal-r7534');
    expect(rendered.getByTestId('bill-screen').props.children).toBe(
      'au-federal-r7534',
    );
    expect(billsStack().routes.map((route) => route.name)).toEqual([
      'bills',
      'bill/[key]',
    ]);
    // The list under it is the same mounted screen, so its scroll is kept.
    expect(billsStack().routes[0]!.key).toBe(listKey);
    expect(listMounts).toBe(1);
    await act(async () => router.back());
    expect(rendered.getPathname()).toBe('/bills');
    expect(billsStack().routes[0]!.key).toBe(listKey);
    expect(listMounts).toBe(1);
    rendered.unmount();
  },
);

it('a bill link from another tab still opens the bill over the Bills list', async () => {
  const rendered = renderRouter(app, { initialUrl: '/(tabs)/(today)' });
  await openWarmLink('opax://bill/au-federal-r7534');
  expect(rendered.getPathname()).toBe('/bill/au-federal-r7534');
  await act(async () => router.back());
  expect(rendered.getPathname()).toBe('/bills');
  rendered.unmount();
});

/**
 * Follow-up (rv-duo-fix7 P3 1): inside the app, `router.replace` and
 * `router.dismissTo` (and a `Redirect`) reuse a leftover preload with the
 * peeked record's own params, so they opened the peeked bill. The preload
 * goes when its peek closes (`usePeekCleanup`, wired in RowLink and tested
 * in row-link-accessibility); here that cleanup is run as the closed peek
 * runs it.
 */
const peeked = '/(tabs)/(bills)/bill/au-federal-r7105';
const asked = '/(tabs)/(bills)/bill/au-federal-r7534';
it.each([
  ['replace', () => router.replace(asked)],
  ['dismissTo', () => router.dismissTo(asked)],
  ['navigate', () => router.navigate(asked)],
  ['push', () => router.push(asked)],
] as const)(
  'router.%s to a bill opens that bill after a closed peek of another',
  async (_name, go) => {
    const rendered = renderRouter(app, {
      initialUrl: '/(tabs)/(bills)/bills',
    });
    await act(async () => router.prefetch(peeked));
    // The peek closes without being opened.
    await act(async () => {
      dropStalePreviews();
    });
    expect(billsStack().preloadedRoutes).toHaveLength(0);
    await act(async () => go());
    expect(rendered.getPathname()).toBe('/bill/au-federal-r7534');
    expect(rendered.getByTestId('bill-screen').props.children).toBe(
      'au-federal-r7534',
    );
    rendered.unmount();
  },
);

/**
 * Follow-up (P3 2): the reset is built from the state at dispatch time, so
 * a navigation made just before it is kept, whether it was dispatched (the
 * state already holds it) or queued through `router` (applied afterwards).
 */
it.each([
  [
    'dispatched',
    () =>
      store.navigationRef.current!.dispatch({
        ...StackActions.push('bill/[key]', { key: 'au-federal-r7534' }),
        target: billsStack().key,
      }),
  ],
  ['queued', () => router.push(asked)],
] as const)(
  'dropping preloads keeps a navigation %s in the same turn',
  async (_name, go) => {
    const rendered = renderRouter(app, {
      initialUrl: '/(tabs)/(bills)/bills',
    });
    const listKey = billsStack().routes[0]!.key;
    await act(async () => router.prefetch(peeked));
    await act(async () => {
      go();
      // A dispatched push has already taken the preload for its own route.
      dropStalePreviews();
    });
    expect(rendered.getPathname()).toBe('/bill/au-federal-r7534');
    expect(billsStack().routes.map((route) => route.name)).toEqual([
      'bills',
      'bill/[key]',
    ]);
    expect(billsStack().routes[0]!.key).toBe(listKey);
    expect(billsStack().preloadedRoutes).toHaveLength(0);
    rendered.unmount();
  },
);

it('clears preloads in every stack, each from the current state', async () => {
  const rendered = renderRouter(app, { initialUrl: '/(tabs)/(bills)/bills' });
  await act(async () => router.prefetch(peeked));
  await act(async () => router.navigate('/(tabs)/(today)'));
  await act(async () => router.prefetch('/(tabs)/(bills)/bills'));
  const preloads = () =>
    JSON.stringify(store.navigationRef.current!.getRootState()).match(
      /"preloadedRoutes":\[[^\]]/g,
    ) ?? [];
  expect(preloads().length).toBeGreaterThan(0);
  await act(async () => {
    expect(dropStalePreviews()).toBe(true);
  });
  expect(preloads()).toHaveLength(0);
  expect(rendered.getPathname()).toBe('/');
  expect(dropStalePreviews()).toBe(false);
  rendered.unmount();
});
