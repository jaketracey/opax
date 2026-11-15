import { act, useEffect } from 'react';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
  getActionFromState,
  getStateFromPath,
} from 'expo-router/react-navigation';
import { store } from 'expo-router/build/global-state/router-store';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';
import { redirectSystemPath } from '../src/app/+native-intent';
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
