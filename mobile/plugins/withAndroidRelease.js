const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

const begin = '// OPAX Android release begin';
const end = '// OPAX Android release end';

function configureRelease(contents, variant) {
  if (!['development', 'e2e', 'production'].includes(variant))
    throw new Error('Android release: unknown OPAX variant');
  const production = variant === 'production';
  return (
    contents.replace(
      /\n\/\/ OPAX Android release begin[\s\S]*?\/\/ OPAX Android release end\n?/g,
      '',
    ) +
    `
${begin}
android.buildTypes.release {
    minifyEnabled ${production}
    shrinkResources ${production}
    // Function names without the DWARF/line-table overhead of FULL in the AAB.
    ndk.debugSymbolLevel = 'SYMBOL_TABLE'
    proguardFile file('opax-release.pro')
}
// Do not let a Gradle property or initWith opt a local build type into R8.
android.buildTypes.matching { it.name != 'release' }.all {
    minifyEnabled false
    shrinkResources false
}
${end}
`
  );
}

// Register before withAndroidPolicy: Expo runs these mods in reverse order.
// This block must follow its e2e initWith, so e2e retains the template's R8-off
// settings and the policy's suffix replacement cannot remove this block.
// Registered only for Android. Only Android mods are installed, so invoking
// this plugin directly during an iOS prebuild cannot alter its native project.
module.exports = function withAndroidRelease(config, { variant } = {}) {
  config = withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy')
      throw new Error('Android release: expected the Expo Groovy app template');
    mod.modResults.contents = configureRelease(
      mod.modResults.contents,
      variant,
    );
    return mod;
  });
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const app = path.join(mod.modRequest.platformProjectRoot, 'app');
      await fs.mkdir(app, { recursive: true });
      await fs.copyFile(
        require.resolve('./android-release/proguard-rules.pro'),
        path.join(app, 'opax-release.pro'),
      );
      return mod;
    },
  ]);
};
module.exports.configureRelease = configureRelease;
