const { withDangerousMod, withPodfile } = require('expo/config-plugins');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

module.exports = (config) => {
  // Direct `expo prebuild` must replay before pod installation too.
  config = withDangerousMod(config, [
    'ios',
    async (mod) => {
      execFileSync(
        'python3',
        [join(mod.modRequest.projectRoot, 'scripts/apply-privacy-patches.py')],
        {
          cwd: mod.modRequest.projectRoot,
          stdio: 'inherit',
        },
      );
      return mod;
    },
  ]);
  return withPodfile(config, (mod) => {
    const patchMarker = '# OPAX: pinned privacy patches before any pod install';
    if (!mod.modResults.contents.includes(patchMarker))
      mod.modResults.contents =
        patchMarker +
        '\n' +
        'system("python3", File.join(__dir__, "../scripts/apply-privacy-patches.py")) or raise "Privacy patches failed"\n' +
        mod.modResults.contents;
    const marker = '# OPAX: prebuilt React executable-bundle privacy manifest';
    if (!mod.modResults.contents.includes(marker)) {
      const end = mod.modResults.contents.lastIndexOf('  end\nend');
      if (end < 0 || !mod.modResults.contents.includes('post_install do'))
        throw new Error(
          'Podfile post_install layout changed; review privacy staging',
        );
      mod.modResults.contents =
        mod.modResults.contents.slice(0, end) +
        '    ' +
        marker +
        '\n' +
        '    system("python3", File.join(__dir__, "../scripts/stage-privacy-manifests.py")) or raise "React privacy staging failed"\n' +
        mod.modResults.contents.slice(end);
    }
    return mod;
  });
};
