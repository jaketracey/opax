// b69 on Android: the A to Z glossary and the expense glossary showed "This
// page couldn't be shown" ("Rendered more hooks than during the previous
// render"). Both set `header` from the screen through RouteOptions, after the
// stack's first render, and native-stack calls `header(props)` as a plain
// function: a header component with its own hooks then added them to the
// stack's render. Each screen now passes a header that renders the measured
// header as an element. This draws both screens inside a real stack.
import { act } from 'react';
import { Stack } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import GlossaryScreen from '../src/features/learn/GlossaryScreen';
import ExpenseGlossary from '../src/features/people/ExpenseGlossary';
import { AndroidReadingHeader } from '../src/navigation/AndroidReadingHeader';

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

const app = {
  _layout: () => <Stack />,
  index: GlossaryScreen,
  'expense-glossary': ExpenseGlossary,
};

let rendered: ReturnType<typeof renderRouter> | undefined;
afterEach(async () => {
  await act(async () => rendered?.unmount());
  rendered = undefined;
});

test('the A to Z glossary draws on Android with its measured header', async () => {
  rendered = renderRouter(app, { initialUrl: '/' });
  await act(async () => undefined);
  expect(screen.getByTestId('learn-glossary')).toBeTruthy();
  // The header the screen set is drawn (its title is the bar's text).
  expect(screen.getAllByText('A to Z glossary').length).toBeGreaterThan(0);
});

test('the expense glossary draws on Android with its measured header', async () => {
  rendered = renderRouter(app, { initialUrl: '/expense-glossary' });
  await act(async () => undefined);
  expect(screen.getByTestId('expense-glossary')).toBeTruthy();
  expect(screen.getAllByText('Expense categories').length).toBeGreaterThan(0);
});

test('a header set from a screen is never the bare hook component', () => {
  // native-stack calls `header` as a function; only a component that is
  // drawn as an element may use hooks. Guard the two screens' options.
  const seen: unknown[] = [];
  const spy = jest
    .spyOn(jest.requireActual('../src/navigation/preview'), 'RouteOptions')
    .mockImplementation((props: unknown) => {
      seen.push((props as { options?: { header?: unknown } }).options?.header);
      return null;
    });
  try {
    renderRouter(app, { initialUrl: '/' }).unmount();
    renderRouter(app, { initialUrl: '/expense-glossary' }).unmount();
  } finally {
    spy.mockRestore();
  }
  expect(seen.length).toBeGreaterThan(0);
  for (const header of seen) {
    expect(header).toBeDefined();
    expect(header).not.toBe(AndroidReadingHeader);
  }
});
