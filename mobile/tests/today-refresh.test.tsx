import { act, type ReactElement } from 'react';
import { RefreshControl } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { catalogs as runtime } from '../src/api/runtime';
import {
  decodeRecentInterests,
  recentBillsFor,
  recentDeclarationsFor,
} from '../src/api/catalogs';
import { Screen } from '../src/design/primitives';
import Today from '../src/features/Today';
import { bills, catalogs, pinned } from './pinned';

jest.mock('../src/api/runtime', () => ({
  catalogs: {
    today: jest.fn(),
    todayEdition: jest.fn(() =>
      Promise.resolve({
        status: 'missing',
        data: null,
        asAt: null,
        sources: [],
        stale: false,
        savedAt: null,
      }),
    ),
  },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

test('initial feed loading leaves native refresh idle; a user refresh forces a fetch and settles', async () => {
  const ready = {
    bills: recentBillsFor(bills, 6),
    declarations: recentDeclarationsFor(
      decodeRecentInterests(pinned('/interests/recent.json')),
      6,
      catalogs,
    ),
  };
  let initial!: (value: typeof ready) => void;
  let refreshed!: (value: typeof ready) => void;
  jest
    .mocked(runtime.today)
    .mockImplementationOnce(() => new Promise((resolve) => (initial = resolve)))
    .mockImplementationOnce(
      () => new Promise((resolve) => (refreshed = resolve)),
    );
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<Today />);
  });
  const control = () =>
    renderer.root.findByType(Screen).props.refreshControl as ReactElement<{
      refreshing: boolean;
      onRefresh: () => void;
    }>;
  expect(control().type).toBe(RefreshControl);
  expect(control().props.refreshing).toBe(false);
  expect(runtime.today).toHaveBeenLastCalledWith(6, false);
  expect(runtime.todayEdition).toHaveBeenLastCalledWith(false);
  await act(async () => initial(ready));
  expect(control().props.refreshing).toBe(false);
  await act(async () => control().props.onRefresh());
  expect(control().props.refreshing).toBe(true);
  expect(runtime.today).toHaveBeenLastCalledWith(6, true);
  expect(runtime.todayEdition).toHaveBeenLastCalledWith(true);
  await act(async () => refreshed(ready));
  expect(control().props.refreshing).toBe(false);
  await act(async () => renderer.unmount());
});
