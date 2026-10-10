const {
  AndroidConfig,
  withAndroidColors,
  withAndroidStyles,
} = require('expo/config-plugins');
const tokens = require('../../docs/design/design-tokens.json');

// Android only. The system's own surfaces follow the redesign: alerts and
// text handles take the one accent, navy, instead of AppCompat's teal, and
// alert buttons say their words in sentence case (D6: nothing uppercase).
const navy = tokens.color.brand.navy.$value;
const { assignStylesValue, getAppThemeGroup } = AndroidConfig.Styles;

const dialog = {
  name: 'OpaxAlertDialog',
  parent: 'ThemeOverlay.AppCompat.Dialog.Alert',
};
const button = {
  name: 'OpaxAlertButton',
  parent: 'Widget.AppCompat.Button.ButtonBar.AlertDialog',
};

function withTheme(xml) {
  const app = getAppThemeGroup();
  return [
    [app, 'colorAccent', '@color/opaxNavy'],
    [app, 'alertDialogTheme', '@style/OpaxAlertDialog'],
    [dialog, 'colorAccent', '@color/opaxNavy'],
    [dialog, 'buttonBarButtonStyle', '@style/OpaxAlertButton'],
    [button, 'android:textAllCaps', 'false'],
    [button, 'textAllCaps', 'false'],
  ].reduce(
    (next, [parent, name, value]) =>
      assignStylesValue(next, { add: true, parent, name, value }),
    xml,
  );
}

module.exports = function withAndroidTheme(config) {
  config = withAndroidColors(config, (mod) => {
    mod.modResults = AndroidConfig.Colors.assignColorValue(mod.modResults, {
      name: 'opaxNavy',
      value: navy,
    });
    return mod;
  });
  return withAndroidStyles(config, (mod) => {
    mod.modResults = withTheme(mod.modResults);
    return mod;
  });
};
module.exports.withTheme = withTheme;
module.exports.navy = navy;
