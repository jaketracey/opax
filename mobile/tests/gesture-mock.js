// A gesture-handler stand-in for component tests: every builder method
// returns the same builder, so a screen's gestures construct without a
// native handler; detectors and the root view are plain views.
const { View } = require('react-native');
const make = (kind) => () => {
  const value = { kind, handlers: {} };
  const proxy = new Proxy(value, {
    get(target, name) {
      if (name in target) return target[name];
      if (typeof name !== 'string') return undefined;
      return (...args) => {
        if (/^on[A-Z]/.test(name)) target.handlers[name] = args[0];
        else target[name] = args;
        return proxy;
      };
    },
  });
  return proxy;
};
module.exports = {
  GestureHandlerRootView: View,
  GestureDetector: View,
  Gesture: {
    Pan: make('pan'),
    Pinch: make('pinch'),
    Tap: make('tap'),
    LongPress: make('longPress'),
    Race: make('race'),
    Simultaneous: make('simultaneous'),
    Exclusive: make('exclusive'),
  },
};
