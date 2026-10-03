const { withPodfile } = require('expo/config-plugins');

// Supported use_expo_modules! exclusion is propagated to Expo's resolver and
// generated module provider. Both podspecs belong to the local opax-voice module.
const declaration = "use_expo_modules! :exclude => ['opax-voice']";
function configurePodfile(contents, variant) {
  const pattern =
    /^([ \t]*)use_expo_modules!(?: :exclude => \['opax-voice'\])?[ \t]*$/gm;
  const matches = [...contents.matchAll(pattern)];
  if (matches.length !== 1)
    throw new Error(
      'Voice autolinking policy: expected one Expo module declaration',
    );
  return contents.replace(
    pattern,
    (_match, indent) =>
      indent + (variant === 'production' ? declaration : 'use_expo_modules!'),
  );
}
module.exports = function withVoiceAutolinking(config, { variant }) {
  return withPodfile(config, (mod) => {
    mod.modResults.contents = configurePodfile(
      mod.modResults.contents,
      variant,
    );
    return mod;
  });
};
module.exports.configurePodfile = configurePodfile;
