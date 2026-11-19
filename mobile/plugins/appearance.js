// The app's one appearance switch, for iOS and Android and every build
// variant, production included (dark mode, 19 Nov 2026).
//
//   light      Light only, on both platforms: the system's dark setting is
//              ignored. Every release up to 1.1.5 was built this way.
//   automatic  Follow the system on both platforms.
//
// OPAX_APPEARANCE chooses for one build. With it unset the build takes
// DEFAULT_APPEARANCE below: that one line is the release default, and
// changing it to 'automatic' ships dark mode to every reader whose device is
// set to dark. app.config.ts, the Android plugins, scripts/qa-static.ts and
// the tests all read the switch from here, so nothing else changes with it.
const DEFAULT_APPEARANCE = 'light';

const APPEARANCES = ['light', 'automatic'];

/** The switch for this build: OPAX_APPEARANCE, or the release default. */
function appearance(env = process.env) {
  const value = env.OPAX_APPEARANCE ?? DEFAULT_APPEARANCE;
  if (!APPEARANCES.includes(value))
    throw new Error('OPAX_APPEARANCE must be light or automatic');
  return value;
}

module.exports = { DEFAULT_APPEARANCE, APPEARANCES, appearance };
