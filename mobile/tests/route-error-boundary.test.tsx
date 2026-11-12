import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Try } from 'expo-router/build/views/Try';
import { routeErrorCopy } from '../src/design/route-error';
import { RouteErrorBoundary } from '../src/navigation/RouteErrorBoundary';
import * as rootLayout from '../src/app/_layout';
import * as tabLayout from '../src/app/(tabs)/(today,your-mp,bills,search,ask)/_layout';

jest.mock('../src/analytics', () => ({ useRouteErrorReporting: jest.fn() }));

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);
jest.mock('../src/navigation/KeyboardShortcuts', () => ({
  KeyboardShortcuts: () => null,
}));
jest.mock('../src/features/account/store', () => ({
  useAccount: () => ({ status: null }),
}));

afterEach(() => jest.restoreAllMocks());

test('root and tab stack layouts catch a page that fails to draw', () => {
  expect(rootLayout).toHaveProperty('ErrorBoundary', RouteErrorBoundary);
  expect(tabLayout).toHaveProperty('ErrorBoundary', RouteErrorBoundary);
});

test('a page that throws while drawing shows a recoverable state, and Try again draws it again', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  let broken = true;
  function Page() {
    if (broken) throw new Error('Fixture render failure');
    return null;
  }
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <Try catch={RouteErrorBoundary}>
        <Page />
      </Try>,
    );
  });
  expect(tree.root.findAllByProps({ testID: 'route-error' })).not.toHaveLength(
    0,
  );
  const text = JSON.stringify(tree.toJSON());
  expect(text).toContain(routeErrorCopy.title);
  expect(text).not.toContain('Fixture render failure');
  broken = false;
  const retry = tree.root.findAll(
    (node) => node.props.testID === 'route-error-retry' && !!node.props.onPress,
  )[0];
  await act(async () => retry.props.onPress());
  expect(tree.root.findAllByProps({ testID: 'route-error' })).toHaveLength(0);
  act(() => tree.unmount());
});
