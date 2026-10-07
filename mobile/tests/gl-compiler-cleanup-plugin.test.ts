import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { configureContext, configureCamera } = jest.requireActual(
  '../plugins/withGLCompilerCleanup.js',
);
test.each([
  'EXGLCameraObject.h',
  'EXGLCameraObject.mm',
  'EXGLObjectManager.h',
  'EXGLObjectManager.mm',
  'ExpoGLModule.swift',
])(
  'camera path %s is disabled without capture references, version guarded and idempotent',
  (file) => {
    const input = readFileSync(
      resolve('node_modules/expo-gl/ios', file),
      'utf8',
    );
    const patched = configureCamera(input, file, '57.0.2');
    expect(patched).not.toMatch(/AVCapture|AVKit|EXCameraInterface/);
    if (file.endsWith('.mm') || file.endsWith('.swift'))
      expect(patched).not.toContain('[[EXGLCameraObject alloc]');
    expect(configureCamera(patched, file, '57.0.2')).toBe(patched);
    expect(() => configureCamera(input, file, '57.0.3')).toThrow('reviewed');
    expect(() =>
      configureCamera(input + '\n// changed', file, '57.0.2'),
    ).toThrow('changed unexpectedly');
  },
);
const source = readFileSync(
  resolve('node_modules/expo-gl/ios/EXGLContext.mm'),
  'utf8',
);

test('native teardown releases the compiler after flushing and before destroying the context', () => {
  const patched = configureContext(source, '57.0.2');
  const destroy = patched.slice(patched.indexOf('- (void)destroy'));
  expect(destroy.indexOf('EXGLContextFlush(self->_contextId)')).toBeLessThan(
    destroy.indexOf('glReleaseShaderCompiler()'),
  );
  expect(destroy.indexOf('glReleaseShaderCompiler()')).toBeLessThan(
    destroy.indexOf('glFinish()'),
  );
  expect(destroy.indexOf('glFinish()')).toBeLessThan(
    destroy.indexOf('EXGLContextDestroy(self->_contextId)'),
  );
  expect(configureContext(patched, '57.0.2')).toBe(patched);
  expect(patched.match(/glReleaseShaderCompiler\(\)/g)).toHaveLength(1);
});

test('unreviewed dependency versions and changed native teardown fail closed', () => {
  expect(() => configureContext(source, '57.0.3')).toThrow('reviewed');
  expect(() => configureContext('', '57.0.2')).toThrow('destroy anchor');
  expect(() =>
    configureContext('// OPAX: release compiler resources', '57.0.2'),
  ).toThrow('changed unexpectedly');
});
