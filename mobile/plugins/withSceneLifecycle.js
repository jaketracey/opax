const { withBuildProperties } = require('expo-build-properties');
const { withAppDelegate } = require('expo/config-plugins');
const tokens = require('../../docs/design/design-tokens.json');

const paper = tokens.color.surface.paper.$value;
const rgb = paper.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
if (!rgb) throw new Error('Scene lifecycle: paper must be a six-digit colour');
const fallback = `UIColor(red: ${parseInt(rgb[1], 16)}.0 / 255.0, green: ${parseInt(rgb[2], 16)}.0 / 255.0, blue: ${parseInt(rgb[3], 16)}.0 / 255.0, alpha: 1)`;
// The splash asset also resolves the dark capture build's paper colour.
const launchPaper = `UIColor(named: "SplashScreenBackground") ?? ${fallback}`;
const windowProperty = '  var window: UIWindow?';
const windowSetup = `${windowProperty} {
    didSet {
      // OPAX launch window: Expo assigns this before starting React Native.
      window?.backgroundColor = ${launchPaper}
    }
  }`;
const delegate = 'class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {';
const rootSetup = `
  // OPAX launch root: colour the surface before it is attached to the window.
  override func customize(_ rootView: UIView) {
    super.customize(rootView)
    rootView.backgroundColor = ${launchPaper}
  }
`;

function configureLaunchBackground(contents) {
  if (contents.includes(windowSetup) && contents.includes(rootSetup))
    return contents;
  if (
    !contents.includes(`${windowProperty}\n`) ||
    !contents.includes(delegate) ||
    /override func customize\(/.test(contents)
  )
    throw new Error(
      'Scene lifecycle: missing standard Expo window or root delegate',
    );
  return contents
    .replace(`${windowProperty}\n`, `${windowSetup}\n`)
    .replace(delegate, delegate + rootSetup);
}

// SDK 57's supported opt-in wires ExpoAppSceneDelegate to the app's React
// Native factory and writes the scene manifest on every prebuild. Expo owns
// scene windows, lifecycle subscribers and cold/warm Linking delivery.
module.exports = function withSceneLifecycle(config, props = {}) {
  config = withBuildProperties(config, {
    ...props,
    ios: { ...props.ios, enableSceneSupport: true },
  });
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift')
      throw new Error('Scene lifecycle: expected a Swift AppDelegate');
    mod.modResults.contents = configureLaunchBackground(
      mod.modResults.contents,
    );
    return mod;
  });
};
module.exports.configureLaunchBackground = configureLaunchBackground;
