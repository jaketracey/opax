// three.js names every Source, Texture, Object3D, BufferGeometry and Material
// with MathUtils.generateUUID(), which draws its 128 bits from Math.random().
// Those UUIDs only key local scene objects, but CodeQL (js/insecure-randomness)
// reads a value named uuid as a security context. The shared three chunk is
// renamed on most rebuilds, so the same five alerts came back on every PR that
// touched it. This esbuild plugin draws the same four 32-bit words from Web
// Crypto instead while bundling. node_modules is untouched and the UUID format
// is unchanged. If three.js rewrites generateUUID, the build fails here rather
// than quietly shipping the old draw.
import { readFile } from 'node:fs/promises'

const MATH_RANDOM_DRAW = /const d0 = Math\.random\(\) \* 0xffffffff \| 0;\s*const d1 = Math\.random\(\) \* 0xffffffff \| 0;\s*const d2 = Math\.random\(\) \* 0xffffffff \| 0;\s*const d3 = Math\.random\(\) \* 0xffffffff \| 0;/g

// Int32Array keeps the signed 32-bit words the old `| 0` produced.
const WEB_CRYPTO_DRAW = 'const [ d0, d1, d2, d3 ] = crypto.getRandomValues( new Int32Array( 4 ) );'

export function secureThreeUuid(source, path = 'three.core.js') {
  const draws = source.match(MATH_RANDOM_DRAW)?.length ?? 0
  if (draws !== 1) {
    throw new Error(`${path}: expected one Math.random() UUID draw in three.js generateUUID, found ${draws}; update graph/three-uuid.mjs`)
  }
  return source.replace(MATH_RANDOM_DRAW, WEB_CRYPTO_DRAW)
}

// three's ESM entry (build/three.module.js) re-exports generateUUID from
// build/three.core.js, so that is the one file to rewrite.
export const secureThreeUuids = {
  name: 'secure-three-uuids',
  setup(build) {
    build.onLoad({ filter: /[\\/]node_modules[\\/]three[\\/]build[\\/]three\.core\.js$/ }, async ({ path }) => ({
      contents: secureThreeUuid(await readFile(path, 'utf8'), path),
      loader: 'js',
    }))
  },
}
