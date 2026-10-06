const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

const version = '57.0.2';
const anchor =
  '    // Destroy JS binding\n    EXGLContextDestroy(self->_contextId);';
const cleanup =
  '    // OPAX: release compiler resources after the final native batch.\n' +
  '    glReleaseShaderCompiler();\n' +
  '    glFinish();\n\n';

function configureContext(contents, packageVersion) {
  if (packageVersion !== version)
    throw new Error(
      'Expo GL compiler cleanup requires reviewed expo-gl 57.0.2',
    );
  if (contents.includes(cleanup + anchor)) return contents;
  if (contents.includes('OPAX: release compiler resources'))
    throw new Error('Expo GL compiler cleanup has changed unexpectedly');
  if (contents.split(anchor).length !== 2)
    throw new Error(
      'Expo GL compiler cleanup: missing or ambiguous destroy anchor',
    );
  return contents.replace(anchor, cleanup + anchor);
}

// A reproducible, version-guarded native teardown patch. OpenGL ES defines this
// as a compiler-resource release hint; compiled programs remain valid. The
// final GL work already runs on EXGLContext's queue with its context current.
module.exports = function withGLCompilerCleanup(config) {
  return withDangerousMod(config, [
    'ios',
    async (mod) => {
      const root = mod.modRequest.projectRoot;
      const directory = path.dirname(
        require.resolve('expo-gl/package.json', { paths: [root] }),
      );
      if (
        (await fs.realpath(directory)) !==
        path.join(await fs.realpath(root), 'node_modules', 'expo-gl')
      )
        throw new Error(
          'Expo GL compiler cleanup needs lane-local node_modules',
        );
      const metadata = JSON.parse(
        await fs.readFile(path.join(directory, 'package.json'), 'utf8'),
      );
      const file = path.join(directory, 'ios', 'EXGLContext.mm');
      const before = await fs.readFile(file, 'utf8');
      const after = configureContext(before, metadata.version);
      if (after !== before) await fs.writeFile(file, after);
      return mod;
    },
  ]);
};
module.exports.configureContext = configureContext;
