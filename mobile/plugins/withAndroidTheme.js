const {
  AndroidConfig,
  withAndroidColors,
  withAndroidColorsNight,
  withAndroidStyles,
} = require('expo/config-plugins');
const tokens = require('../../docs/design/design-tokens.json');

// Android only. The system's own surfaces follow the redesign: alerts and
// text handles take the one accent, navy, instead of AppCompat's teal, and
// alert buttons say their words in sentence case (D6: nothing uppercase).
// With the system followed (plugins/appearance.js `automatic`) each colour
// gets a night value too: the accent turns to dark mode's pale navy, which
// reads on a dark alert, and the window behind React Native takes the page
// ground, so no light frame shows between the splash and the first React
// frame, behind the keyboard, or while the window resizes.
const navy = tokens.color.brand.navy.$value;
const navyNight = tokens.color.brand.navy.dark;
const paper = tokens.color.surface.paper.$value;
const paperNight = tokens.color.surface.paper.dark;
const { assignStylesValue, getAppThemeGroup } = AndroidConfig.Styles;

const dialog = {
  name: 'OpaxAlertDialog',
  parent: 'ThemeOverlay.AppCompat.Dialog.Alert',
};
const button = {
  name: 'OpaxAlertButton',
  parent: 'Widget.AppCompat.Button.ButtonBar.AlertDialog',
};

function withTheme(xml, appearance = 'light') {
  const app = getAppThemeGroup();
  const window = 'android:windowBackground';
  // A project generated under the other setting loses the item again.
  const cleared = assignStylesValue(xml, {
    add: false,
    parent: app,
    name: window,
    value: '@color/opaxWindow',
  });
  return [
    ...(appearance === 'automatic' ? [[app, window, '@color/opaxWindow']] : []),
    [app, 'colorAccent', '@color/opaxNavy'],
    [app, 'alertDialogTheme', '@style/OpaxAlertDialog'],
    [dialog, 'colorAccent', '@color/opaxNavy'],
    [dialog, 'buttonBarButtonStyle', '@style/OpaxAlertButton'],
    [button, 'android:textAllCaps', 'false'],
    [button, 'textAllCaps', 'false'],
  ].reduce(
    (next, [parent, name, value]) =>
      assignStylesValue(next, { add: true, parent, name, value }),
    cleared,
  );
}

/** Day and night colour resources for the switch; null removes a value. */
function themeColors(appearance = 'light') {
  const follows = appearance === 'automatic';
  return {
    day: { opaxNavy: navy, opaxWindow: follows ? paper : null },
    night: {
      opaxNavy: follows ? navyNight : null,
      opaxWindow: follows ? paperNight : null,
    },
  };
}
const assignColors = (xml, values) =>
  Object.entries(values).reduce(
    (next, [name, value]) =>
      AndroidConfig.Colors.assignColorValue(next, { name, value }),
    xml,
  );

module.exports = function withAndroidTheme(config, props = {}) {
  const appearance = props.appearance ?? 'light';
  const { day, night } = themeColors(appearance);
  config = withAndroidColors(config, (mod) => {
    mod.modResults = assignColors(mod.modResults, day);
    return mod;
  });
  config = withAndroidColorsNight(config, (mod) => {
    mod.modResults = assignColors(mod.modResults, night);
    return mod;
  });
  return withAndroidStyles(config, (mod) => {
    mod.modResults = withTheme(mod.modResults, appearance);
    return mod;
  });
};
module.exports.withTheme = withTheme;
module.exports.themeColors = themeColors;
module.exports.navy = navy;
