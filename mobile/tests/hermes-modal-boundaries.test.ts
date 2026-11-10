import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';
import { createElement, act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Try } from 'expo-router/build/views/Try';
import * as account from '../src/app/account/_layout';
import * as talk from '../src/app/talk/_layout';
import * as community from '../src/app/community/_layout';
import * as licence from '../src/app/licence/_layout';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);
jest.mock('expo-router', () => ({
  Stack: () => null,
  useSegments: () => ['account'],
}));

test.each([
  ['account', account],
  ['talk', talk],
  ['community', community],
  ['licence', licence],
])(
  '%s catches a render error and lets the reader retry',
  async (_name, layout) => {
    const boundary = (
      layout as {
        ErrorBoundary?: typeof import('../src/design/route-error').RouteErrorBoundary;
      }
    ).ErrorBoundary;
    expect(typeof boundary).toBe('function');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    let broken = true;
    function Page() {
      if (broken) throw new TypeError('Fixture failure');
      return null;
    }
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        createElement(Try, { catch: boundary! }, createElement(Page)),
      );
    });
    expect(
      tree.root.findAllByProps({ testID: 'route-error' }).length,
    ).toBeGreaterThan(0);
    expect(JSON.stringify(tree.toJSON())).not.toContain('Fixture failure');
    broken = false;
    const retry = tree.root.findAll(
      (node) =>
        node.props.testID === 'route-error-retry' && !!node.props.onPress,
    )[0]!;
    await act(async () => retry.props.onPress());
    expect(tree.root.findAllByProps({ testID: 'route-error' })).toHaveLength(0);
    act(() => tree.unmount());
    jest.restoreAllMocks();
  },
);
