import { act, useEffect } from 'react';
import TestRenderer from 'react-test-renderer';

const listeners = new Set<() => void>();
const cleanup = jest.fn();
let pending: ReturnType<typeof setTimeout> | undefined;

function SubscribedRow() {
  useEffect(() => {
    const listener = jest.fn();
    listeners.add(listener);
    pending = setTimeout(listener, 60_000);
    return () => {
      listeners.delete(listener);
      clearTimeout(pending);
      pending = undefined;
      cleanup();
    };
  }, []);
  return null;
}

test('a raw renderer can leave a subscription mounted at test completion', async () => {
  // Deliberately omit manual unmount, as Search's seat menu regression did.
  await act(async () => {
    TestRenderer.create(<SubscribedRow />);
  });
  expect(listeners.size).toBe(1);
  expect(pending).toBeDefined();
});

test('shared teardown unmounts the tree and cancels its outstanding effects', () => {
  expect(listeners.size).toBe(0);
  expect(pending).toBeUndefined();
  expect(cleanup).toHaveBeenCalledTimes(1);
});

test('explicit unmount still cleans up exactly once', async () => {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<SubscribedRow />);
  });
  await act(async () => tree.unmount());
  expect(cleanup).toHaveBeenCalledTimes(2);
});

test('shared teardown does not repeat an explicit unmount', () => {
  expect(cleanup).toHaveBeenCalledTimes(2);
});
