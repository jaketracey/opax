const { withAppDelegate } = require('expo/config-plugins');
const { readFileSync } = require('node:fs');

const marker = '// OPAX search geometry probe';
const start = 'OpaxSearchGeometryProbe.start()';
function configureAppDelegate(contents, variant) {
  // Also remove a previous fixture injection on a non-clean variant change.
  const clean = contents.split('\n' + marker)[0].replace(`    ${start}\n`, '');
  if (variant !== 'e2e') return clean;
  const anchor =
    'return super.application(application, didFinishLaunchingWithOptions: launchOptions)';
  if (!clean.includes(anchor))
    throw new Error('Search geometry probe: missing launch anchor');
  return (
    clean.replace(anchor, `${start}\n    ${anchor}`) +
    '\n' +
    marker +
    '\n' +
    readFileSync(require.resolve('./search-geometry/Probe.swift'), 'utf8')
  );
}

// Native measurements exist only in the fixture build. There is no timer,
// accessibility probe, or local geometry recording in production.
module.exports = function withSearchGeometryProbe(config, { variant }) {
  return withAppDelegate(config, (mod) => {
    mod.modResults.contents = configureAppDelegate(
      mod.modResults.contents,
      variant,
    );
    return mod;
  });
};
module.exports.configureAppDelegate = configureAppDelegate;
