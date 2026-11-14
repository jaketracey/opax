import { act } from 'react';
import { ActivityIndicator } from 'react-native';
import TestRenderer from 'react-test-renderer';
import PhotoViewer from '../src/features/explore/PhotoViewer';
import { withNavigationOptions } from './navigation-options';

const mockRead: { record: unknown; error: unknown; retry: jest.Mock } = {
  record: null,
  error: null,
  retry: jest.fn(),
};
jest.mock('../src/api/useRead', () => ({ useRead: () => mockRead }));
jest.mock('../src/features/explore/runtime', () => ({ explore: {} }));
jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useSegments: () => [],
  useLocalSearchParams: () => ({ year: '1990' }),
}));

function draw() {
  let view!: TestRenderer.ReactTestRenderer;
  act(() => {
    view = TestRenderer.create(
      withNavigationOptions(<PhotoViewer />, () => {}),
    );
  });
  return view;
}
const byID = (view: TestRenderer.ReactTestRenderer, id: string) =>
  view.root.findAll((node) => node.props.testID === id);
const strings = (view: TestRenderer.ReactTestRenderer) =>
  JSON.stringify(view.toJSON());

test('the photo viewer shows progress while the photographs load', () => {
  Object.assign(mockRead, { record: null, error: null });
  const view = draw();
  expect(view.root.findByType(ActivityIndicator).props.accessibilityLabel).toBe(
    'Loading photographs',
  );
});

test('a failed photographs read offers Try again rather than a black page', () => {
  Object.assign(mockRead, { record: null, error: new Error('offline') });
  const view = draw();
  expect(strings(view)).toContain('Photographs couldn’t be loaded');
  act(() => byID(view, 'photo-viewer-retry')[0]!.props.onPress());
  expect(mockRead.retry).toHaveBeenCalled();
});

test('a year without photographs says so', () => {
  Object.assign(mockRead, {
    record: { data: {}, stale: false, savedAt: 1, asOf: null },
    error: null,
  });
  const view = draw();
  expect(strings(view)).toContain('No photographs for this year');
  expect(byID(view, 'photo-viewer-retry')).toHaveLength(0);
});
