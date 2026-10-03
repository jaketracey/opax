const { withBuildProperties } = require('expo-build-properties');

// SDK 57's supported opt-in wires ExpoAppSceneDelegate to the app's React
// Native factory and writes the scene manifest on every prebuild. Expo owns
// scene windows, lifecycle subscribers and cold/warm Linking delivery.
module.exports = function withSceneLifecycle(config, props = {}) {
  return withBuildProperties(config, {
    ...props,
    ios: { ...props.ios, enableSceneSupport: true },
  });
};
