import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { routingQueue } from 'expo-router/build/global-state/routingQueue';
import { useImperativeApiEmitter } from 'expo-router/build/imperative-api';

jest.mock('expo-router/build/global-state/router', () => ({ router: {} }));
jest.mock('expo-router/build/global-state/getNavigationAction', () => ({
  getNavigateAction: () => ({
    type: 'NAVIGATE',
    payload: { name: 'party/[slug]' },
  }),
}));

beforeEach(() => {
  routingQueue.queue = [];
  routingQueue.subscribers.clear();
});

test('an empty navigation flush preserves the external-store snapshot', () => {
  const before = routingQueue.snapshot();
  routingQueue.run({ current: null });
  expect(routingQueue.snapshot()).toBe(before);
});

test('adding a navigation action publishes a new snapshot without mutating the previous one', () => {
  const before = routingQueue.snapshot();
  const changed = jest.fn();
  const unsubscribe = routingQueue.subscribe(changed);
  try {
    routingQueue.add({ type: 'GO_BACK' });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(routingQueue.snapshot()).not.toBe(before);
    expect(before).toEqual([]);
    expect(routingQueue.snapshot()).toEqual([{ type: 'GO_BACK' }]);
    const published = routingQueue.snapshot();
    routingQueue.run({
      current: { dispatch: jest.fn() },
    } as unknown as Parameters<typeof routingQueue.run>[0]);
    expect(published).toEqual([{ type: 'GO_BACK' }]);
  } finally {
    unsubscribe();
  }
});

test('the real Router emitter dispatches each link and Back once after settling', async () => {
  const dispatch = jest.fn();
  const ref = { current: { dispatch } } as unknown as Parameters<
    typeof useImperativeApiEmitter
  >[0];
  let renders = 0;
  function Emitter() {
    if (++renders > 30) throw new Error('navigation queue did not settle');
    useImperativeApiEmitter(ref);
    return null;
  }
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(React.createElement(Emitter));
  });
  try {
    await act(async () => {});
    expect(dispatch).not.toHaveBeenCalled();
    await act(async () => {
      routingQueue.add({
        type: 'ROUTER_LINK',
        payload: { href: '/(tabs)/(today)/party/labor', options: {} },
      });
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'NAVIGATE',
      payload: { name: 'party/[slug]' },
    });
    await act(async () => {
      routingQueue.add({ type: 'GO_BACK' });
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'GO_BACK' });
    await act(async () => {});
    expect(dispatch).toHaveBeenCalledTimes(2);
  } finally {
    act(() => tree.unmount());
  }
});
