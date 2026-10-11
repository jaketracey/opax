const { withPodfile, withSettingsGradle } = require('expo/config-plugins');

// Supported use_expo_modules! exclusion is propagated to Expo's resolver and
// generated module provider. Both podspecs belong to the local opax-voice module.
const declaration = "use_expo_modules! :exclude => ['opax-voice']";
function configurePodfile(contents, variant, productionVoice = false) {
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
      indent +
      (variant === 'production' && !productionVoice
        ? declaration
        : 'use_expo_modules!'),
  );
}
// Android's equivalent: the settings plugin's supported `exclude` list, read
// by the same resolver before it links modules and writes the package list.
const exclusion = "expoAutolinking.exclude = ['opax-voice']";
function configureSettingsGradle(contents, variant, productionVoice = false) {
  const pattern =
    /^(?:[ \t]*expoAutolinking\.exclude = \['opax-voice'\]\n)?([ \t]*)expoAutolinking\.useExpoModules\(\)[ \t]*$/gm;
  const matches = [...contents.matchAll(pattern)];
  if (matches.length !== 1)
    throw new Error(
      'Voice autolinking policy: expected one Expo module declaration',
    );
  return contents.replace(
    pattern,
    (_match, indent) =>
      (variant === 'production' && !productionVoice
        ? `${indent}${exclusion}\n`
        : '') + `${indent}expoAutolinking.useExpoModules()`,
  );
}
module.exports = function withVoiceAutolinking(
  config,
  { variant, productionVoice = false },
) {
  config = withPodfile(config, (mod) => {
    mod.modResults.contents = configurePodfile(
      mod.modResults.contents,
      variant,
      productionVoice,
    );
    return mod;
  });
  return withSettingsGradle(config, (mod) => {
    mod.modResults.contents = configureSettingsGradle(
      mod.modResults.contents,
      variant,
      productionVoice,
    );
    return mod;
  });
};
module.exports.configurePodfile = configurePodfile;
module.exports.configureSettingsGradle = configureSettingsGradle;
