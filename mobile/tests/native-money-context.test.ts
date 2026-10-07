import type { ExpoWebGLRenderingContext } from 'expo-gl';
import { nativeWebGL2Context } from '../src/features/money/native-context';

class WebGL1Brand {}
class NativeES3 extends WebGL1Brand {
  VERSION = 1;
  version = 'OpenGL ES 3.0';
  marker = 57;
  getParameter() {
    return this.version;
  }
  texImage3D() {
    return this.marker;
  }
  createVertexArray() {
    return this.marker;
  }
  drawElementsInstanced() {
    return this.marker;
  }
}
const context = (value: NativeES3) =>
  value as unknown as ExpoWebGLRenderingContext;
test('native ES3 facade removes only the browser brand and preserves bound native methods/state', () => {
  const original = new NativeES3();
  const facade = nativeWebGL2Context(context(original));
  expect(original instanceof WebGL1Brand).toBe(true);
  expect(facade instanceof WebGL1Brand).toBe(false);
  expect(facade.getParameter(facade.VERSION)).toBe('OpenGL ES 3.0');
  expect(facade.createVertexArray()).toBe(57);
  expect(facade.createVertexArray).toBe(facade.createVertexArray);
  facade.drawingBufferColorSpace = 'srgb';
  expect(
    (original as NativeES3 & { drawingBufferColorSpace: string })
      .drawingBufferColorSpace,
  ).toBe('srgb');
});
test('the facade refuses native ES2 and missing instancing, rather than pretending WebGL2 support', () => {
  const original = new NativeES3();
  original.version = 'OpenGL ES 2.0';
  expect(() => nativeWebGL2Context(context(original))).toThrow(
    'Native WebGL2 context required',
  );
  original.version = 'OpenGL ES 3.0';
  Object.defineProperty(original, 'drawElementsInstanced', {
    value: undefined,
  });
  expect(() => nativeWebGL2Context(context(original))).toThrow(
    'Native WebGL2 context required',
  );
});
