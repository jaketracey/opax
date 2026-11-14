// b69 on Android: the A to Z glossary showed "This page couldn't be shown"
// ("Rendered more hooks than during the previous render"). It sets `header`
// from the screen through RouteOptions, after the stack's first render, and
// native-stack calls `header(props)` as a plain function: a header with its
// own hooks then added them to the stack's render. The expense glossary sets
// the same header over its sheet's, so swapping in any other function would
// drop those hooks instead. The exported header now has no hooks and draws the
// measured header as an element. These draw both screens inside the app's own
// stack registrations.
import { act, isValidElement } from 'react';
import { Stack } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import GlossaryScreen from '../src/features/learn/GlossaryScreen';
import ExpenseGlossary from '../src/features/people/ExpenseGlossary';
import { AndroidReadingHeader } from '../src/navigation/AndroidReadingHeader';
import { learnScreens } from '../src/navigation/stack/learn';
import { peopleScreens } from '../src/navigation/stack/people';

jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  Object.defineProperty(rn.Platform, 'OS', { get: () => 'android' });
  return rn;
});
jest.mock('react-native-gesture-handler', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./gesture-mock');
});
jest.mock('../src/api/runtime', () => ({
  // Never settles: the expense glossary draws its loading state under the header.
  catalogs: { expenseCategories: () => new Promise(() => {}) },
}));

// The two routes' own registrations: the expense glossary's carries the
// sheet options, which already set the reading header on Android.
const ROUTES = ['learn/glossary', 'expense-glossary'];
const registered = [...learnScreens(), ...peopleScreens()].filter((s) =>
  ROUTES.includes((s.props as { name?: string }).name ?? ''),
);

const app = {
  _layout: () => <Stack>{registered}</Stack>,
  'learn/glossary': GlossaryScreen,
  'expense-glossary': ExpenseGlossary,
};

let rendered: ReturnType<typeof renderRouter> | undefined;
afterEach(async () => {
  await act(async () => rendered?.unmount());
  rendered = undefined;
});

test('the A to Z glossary draws on Android with its measured header', async () => {
  expect(registered).toHaveLength(ROUTES.length);
  rendered = renderRouter(app, { initialUrl: '/learn/glossary' });
  await act(async () => undefined);
  expect(screen.getByTestId('learn-glossary')).toBeTruthy();
  // The header the screen set is drawn (its title is the bar's text).
  expect(screen.getAllByText('A to Z glossary').length).toBeGreaterThan(0);
});

test('the expense glossary draws on Android over its sheet header', async () => {
  rendered = renderRouter(app, { initialUrl: '/expense-glossary' });
  await act(async () => undefined);
  expect(screen.getByTestId('expense-glossary')).toBeTruthy();
  expect(screen.getAllByText('Expense categories').length).toBeGreaterThan(0);
});

test('the reading header runs no hooks when called as a plain function', () => {
  // native-stack calls `header(props)` outside any component of the header's
  // own. A hook here throws outside a render, and in the stack's render it
  // changes the hook count whenever a screen adds or swaps its header.
  const props = {
    navigation: { goBack: () => undefined },
    options: { title: 'A to Z glossary' },
    route: { key: 'glossary', name: 'learn/glossary' },
  } as unknown as Parameters<typeof AndroidReadingHeader>[0];
  let element: unknown;
  expect(() => {
    element = AndroidReadingHeader(props);
  }).not.toThrow();
  expect(isValidElement(element)).toBe(true);
});
