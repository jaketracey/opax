import type { ExpoWebGLRenderingContext } from 'expo-gl';

/**
 * Expo's WebGL2 prototype inherits its WebGL1 prototype. Browser WebGL2 does
 * not, and Three r185 rejects any instance of WebGLRenderingContext. Keep the
 * native ES3 methods/state but expose a neutral prototype to that browser-only
 * brand check. No globals or context methods are replaced or fabricated.
 */
export function nativeWebGL2Context(
  gl: ExpoWebGLRenderingContext,
): WebGL2RenderingContext {
  const version = String(gl.getParameter(gl.VERSION));
  if (
    !/(?:OpenGL ES 3\.|WebGL 2\.)/.test(version) ||
    typeof gl.texImage3D !== 'function' ||
    typeof gl.createVertexArray !== 'function' ||
    typeof gl.drawElementsInstanced !== 'function'
  )
    throw new Error(`Native WebGL2 context required; received ${version}`);
  const methods = new Map<PropertyKey, unknown>();
  return new Proxy(gl, {
    getPrototypeOf: () => null,
    get(target, key) {
      const value = (target as unknown as Record<PropertyKey, unknown>)[key];
      if (typeof value !== 'function') return value;
      if (!methods.has(key)) methods.set(key, value.bind(target));
      return methods.get(key);
    },
    set(target, key, value) {
      (target as unknown as Record<PropertyKey, unknown>)[key] = value;
      return true;
    },
  });
}
