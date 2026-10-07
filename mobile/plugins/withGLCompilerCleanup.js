const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

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

// Full source hashes pin all camera-bearing translation units. Repeated prebuilds
// accept only the exact reviewed stubs; any upstream/mutated source fails closed.
const cameraHashes = require('./gl-camera-source-hashes.json');
function configureCamera(contents, file, packageVersion) {
  if (packageVersion !== version)
    throw new Error('Camera exclusion requires reviewed expo-gl 57.0.2');
  const hashes = cameraHashes[file];
  const hash = createHash('sha256').update(contents).digest('hex');
  if (!hashes) throw new Error('Unreviewed Expo GL camera file');
  if (hash === hashes[1]) return contents;
  if (hash !== hashes[0])
    throw new Error('Expo GL camera source changed unexpectedly: ' + file);
  let result;
  if (file.endsWith('.h')) {
    result = contents
      .replace(
        '#import <ExpoModulesCore/EXCameraInterface.h>',
        '#import <ExpoModulesCore/EXDefines.h>',
      )
      .replaceAll('id<EXCameraInterface>', 'id');
  } else if (file === 'EXGLCameraObject.mm') {
    result = `// Copyright 2016-present 650 Industries. All rights reserved.
// OPAX: camera textures are deliberately unavailable; no camera frameworks.
#import <ExpoGL/EXGLCameraObject.h>
@implementation EXGLCameraObject
- (instancetype)initWithContext:(EXGLContext *)glContext andCamera:(id)camera
{
  return nil;
}
@end
`;
  } else if (file === 'EXGLObjectManager.mm') {
    const start = contents.indexOf(
      '  EXGLContext *glContext',
      contents.indexOf('- (void)createTextureForContextWithId:'),
    );
    result = (
      contents.slice(0, start) +
      `  reject(@"E_GL_CAMERA_UNAVAILABLE", @"Camera textures are unavailable in OPAX.", nil);
}

@end
`
    ).replaceAll('id<EXCameraInterface>', 'id');
  } else {
    const start = contents.indexOf(
      '      guard let cameraView',
      contents.indexOf('AsyncFunction("createCameraTextureAsync")'),
    );
    const end = contents.indexOf('    .runOnQueue(.main)', start);
    result =
      contents.slice(0, start) +
      `      promise.reject("E_GL_CAMERA_UNAVAILABLE", "Camera textures are unavailable in OPAX.")
    }
` +
      contents.slice(end);
  }
  if (createHash('sha256').update(result).digest('hex') !== hashes[1])
    throw new Error('Camera exclusion produced an unreviewed stub');
  return result;
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
      for (const name of Object.keys(cameraHashes)) {
        const cameraFile = path.join(directory, 'ios', name);
        const original = await fs.readFile(cameraFile, 'utf8');
        const patched = configureCamera(original, name, metadata.version);
        if (patched !== original) await fs.writeFile(cameraFile, patched);
      }
      return mod;
    },
  ]);
};
module.exports.configureContext = configureContext;

module.exports.configureCamera = configureCamera;
