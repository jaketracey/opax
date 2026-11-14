/* global beforeEach, afterEach */
// Raw react-test-renderer has no automatic cleanup. A leaked Search seat row
// stayed subscribed to the follows store and rendered after Jest tore down its
// module registry, then React's Node error reporter hit window.dispatchEvent.
// Track the actual module too, since some tests use jest.requireActual().
const mounted = new Set();
const instrumented = new WeakSet();
const { auditTree, finishAudit } = require('./screen-a11y-runner');

beforeEach(() => {
  const renderer = require('react-test-renderer');
  if (instrumented.has(renderer)) return;
  instrumented.add(renderer);
  const create = renderer.create;
  renderer.create = (...args) => {
    const tree = create(...args);
    let platform =
      require.cache[require.resolve('react-native')]?.exports?.Platform?.OS ??
      'ios';
    const update = tree.update;
    tree.update = (...args) => {
      auditTree(tree, platform);
      platform =
        require.cache[require.resolve('react-native')]?.exports?.Platform?.OS ??
        platform;
      return update.apply(tree, args);
    };
    const entry = { tree, act: renderer.act };
    mounted.add(entry);
    const unmount = tree.unmount;
    tree.unmount = () => {
      auditTree(tree, platform);
      mounted.delete(entry);
      return unmount.call(tree);
    };
    return tree;
  };
});

afterEach(async () => {
  // Async act drains pending React work and effect cleanups before teardown.
  // Do not suppress errors or discard arbitrary timers: failures remain visible
  // and components must cancel their own effects when they are unmounted.
  for (const { tree, act } of [...mounted]) {
    await act(async () => tree.unmount());
  }
  finishAudit();
});
