/**
 * Hermes API audit, 11 Nov 2026, for RN 0.86.3. RN's sdks/.hermesv1version
 * pins hermes-v250829098.0.17 (commit 3477757); hermes-engine.podspec defaults
 * to this version. node_modules/hermes-compiler 250829098.0.17 is compiler-only:
 * `hermesc -exec` says it cannot execute. No runnable VM is installed.
 * Evidence is the constructor/prototype registrations in that exact source:
 * https://github.com/facebook/hermes/tree/hermes-v250829098.0.17/lib/VM/JSLib
 * Array.cpp: no toSorted; TypedArray.cpp: no toSorted/toReversed/with.
 * Object.cpp/Map.cpp: no groupBy; Array.cpp: no fromAsync.
 * IteratorPrototype.cpp: only Symbol.iterator, no helpers or global Iterator.
 * ArrayBuffer.cpp: byteLength/slice/isView only; no resizable/transfer APIs.
 * GlobalObject.cpp: no SharedArrayBuffer/Atomics/Float16Array.
 * JSON.cpp/RuntimeJSONUtils.cpp: no raw JSON or reviver source context.
 * Math.cpp/MathStdFunctions.def/DataView.cpp: no float16 APIs.
 * TypedArray.cpp: no Uint8Array hex/base64 APIs.
 * RegExp.cpp and include/hermes/Regex/RegexTypes.h: flags dgimsuy, no v/escape.
 *
 * Confirmed PRESENT, deliberately kept: Array toReversed/toSpliced/with,
 * findLast/findLastIndex/at; TypedArray findLast/findLastIndex/at; Object.hasOwn;
 * Error cause; RegExp d/hasIndices; String isWellFormed/toWellFormed; all seven
 * Set methods (Set.cpp); Promise.withResolvers/try (lib/InternalJavaScript/
 * 01-Promise.js, retained by RN Libraries/Core/polyfillPromise.js).
 * ES2022 APIs checked are present. This also covers newer buffer, JSON,
 * float16 and byte-encoding additions beyond the original crash candidates.
 * Update this audit and eslint.config.js together when upgrading RN/Hermes.
 * The phone's missing toSorted was independently observed in build 45;
 * tests/record-link-hermes.test.ts holds that regression.
 */

const remove = (target, names) => {
  for (const name of names) {
    if (!Reflect.deleteProperty(target, name))
      throw new Error(`Cannot model missing Hermes API: ${name}`);
  }
};

remove(Array.prototype, ['toSorted']);
remove(Array, ['fromAsync']);
remove(Object, ['groupBy']);
remove(Map, ['groupBy']);
remove(Object.getPrototypeOf(Uint8Array.prototype), [
  'toSorted',
  'toReversed',
  'with',
]);
remove(ArrayBuffer.prototype, [
  'resize',
  'resizable',
  'maxByteLength',
  'transfer',
  'transferToFixedLength',
  'detached',
]);
remove(JSON, ['rawJSON', 'isRawJSON']);
remove(Math, ['f16round']);
remove(DataView.prototype, ['getFloat16', 'setFloat16']);
remove(Uint8Array, ['fromBase64', 'fromHex']);
remove(Uint8Array.prototype, [
  'toBase64',
  'toHex',
  'setFromBase64',
  'setFromHex',
]);

// Node's iterator helpers live on a shared intrinsic, even after deleting the
// global Iterator. Generators, Set/Map/Array and string iterators inherit it.
const iteratorPrototype = Object.getPrototypeOf(
  Object.getPrototypeOf([][Symbol.iterator]()),
);
remove(iteratorPrototype, [
  'map',
  'filter',
  'take',
  'drop',
  'flatMap',
  'reduce',
  'toArray',
  'forEach',
  'some',
  'every',
  'find',
]);
remove(globalThis, [
  'Iterator',
  'Float16Array',
  'SharedArrayBuffer',
  'Atomics',
]);

remove(RegExp, ['escape']);
remove(RegExp.prototype, ['unicodeSets']);
const NativeRegExp = RegExp;
// Literal /.../v is syntax, so ESLint guards it. Model constructor calls too.
globalThis.RegExp = new Proxy(NativeRegExp, {
  apply(target, receiver, args) {
    if (args[1] !== undefined && String(args[1]).includes('v'))
      throw new SyntaxError('Hermes does not support the RegExp v flag');
    return Reflect.apply(target, receiver, args);
  },
  construct(target, args, newTarget) {
    if (args[1] !== undefined && String(args[1]).includes('v'))
      throw new SyntaxError('Hermes does not support the RegExp v flag');
    return Reflect.construct(target, args, newTarget);
  },
});

const parse = JSON.parse;
JSON.parse = (text, reviver) =>
  parse(
    text,
    typeof reviver === 'function'
      ? function (key, value) {
          return reviver.call(this, key, value);
        }
      : reviver,
  );
