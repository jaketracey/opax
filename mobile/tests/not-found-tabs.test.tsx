// Sweep 2, item 2: an unknown link opens "This page isn't in the app" inside
// a tab's stack, through the shared folder's own +not-found, so the tab bar
// stays. The root +not-found is only the fallback.
import { act } from 'react';
import { Stack, Tabs, router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { Text as NativeText } from 'react-native';
import RootNotFound from '../src/app/+not-found';
import TabNotFound from '../src/app/(tabs)/(today,your-mp,bills,search,ask)/+not-found';
import { ContentUnavailable } from '../src/design/states';

jest.mock('react-native-gesture-handler', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./gesture-mock');
});

const app = {
  _layout: () => <Stack />,
  '+not-found': RootNotFound,
  '(tabs)/_layout': () => <Tabs />,
  '(tabs)/(today,search)/_layout': () => <Stack />,
  '(tabs)/(today,search)/index': () => <NativeText>Today</NativeText>,
  '(tabs)/(today,search)/person/[slug]': () => <NativeText>Person</NativeText>,
  '(tabs)/(today,search)/+not-found': TabNotFound,
};

test('the shared folder draws the same page as the root fallback', () => {
  expect(TabNotFound).toBe(RootNotFound);
});

test.each(['/(tabs)/(today)/no-such-page', '/no-such-page', '/person/a/b'])(
  'an unknown link (%s) opens inside the tabs, not over them',
  async (path) => {
    const rendered = renderRouter(app);
    await act(async () => router.push(path as never));
    expect(rendered.getSegments()).toEqual(['(tabs)', '(today)', '+not-found']);
    const state = rendered.UNSAFE_root.findByType(ContentUnavailable);
    expect(state.props.title).toBe("This page isn't in the app");
    expect(state.props.action.label).toBe('Go back');
    await act(async () => rendered.unmount());
  },
);
