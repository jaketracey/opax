import { spawnSync } from 'node:child_process';

test('the default Jest environment exposes the missing Hermes APIs as missing', () => {
  const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
  const missing: [object, string[]][] = [
    [Array.prototype, ['toSorted']],
    [Array, ['fromAsync']],
    [Object, ['groupBy']],
    [Map, ['groupBy']],
    [typedArray, ['toSorted', 'toReversed', 'with']],
    [
      ArrayBuffer.prototype,
      [
        'resize',
        'resizable',
        'maxByteLength',
        'transfer',
        'transferToFixedLength',
        'detached',
      ],
    ],
    [JSON, ['rawJSON', 'isRawJSON']],
    [RegExp, ['escape']],
    [RegExp.prototype, ['unicodeSets']],
    [Math, ['f16round']],
    [DataView.prototype, ['getFloat16', 'setFloat16']],
    [Uint8Array, ['fromBase64', 'fromHex']],
    [
      Uint8Array.prototype,
      ['toBase64', 'toHex', 'setFromBase64', 'setFromHex'],
    ],
    [globalThis, ['Iterator', 'Float16Array', 'SharedArrayBuffer', 'Atomics']],
  ];
  for (const [target, names] of missing)
    for (const name of names)
      expect([name, Reflect.get(target, name)]).toEqual([name, undefined]);
  const iterator = [1].values();
  for (const name of [
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
  ])
    expect(Reflect.get(iterator, name)).toBeUndefined();
  expect(() => Reflect.get([1], 'toSorted')()).toThrow(TypeError);
  expect(() => new RegExp('a', 'v')).toThrow(SyntaxError);
  expect(() => RegExp('a', 'v')).toThrow(SyntaxError);
  expect(new RegExp('a', 'u').test('a')).toBe(true);
  expect(/a/d.hasIndices).toBe(true);
  let reviverContext: unknown = 'not called';
  JSON.parse('1', (_key: string, value: unknown, context?: unknown) => {
    reviverContext = context;
    return value;
  });
  expect(reviverContext).toBeUndefined();
});

test('source-confirmed Hermes methods remain available', async () => {
  expect([2, 1].toReversed()).toEqual([1, 2]);
  expect([2, 1].toSpliced(0, 1)).toEqual([1]);
  expect([2, 1].with(0, 3)).toEqual([3, 1]);
  expect([1, 2].findLast((n) => n > 0)).toBe(2);
  expect([1, 2].findLastIndex((n) => n > 0)).toBe(1);
  expect([1, 2].at(-1)).toBe(2);
  expect('ok'.isWellFormed()).toBe(true);
  expect('\ud800'.toWellFormed()).toBe('\ufffd');
  expect([...new Set([1]).union(new Set([2]))]).toEqual([1, 2]);
  const deferred = Promise.withResolvers<number>();
  deferred.resolve(3);
  await expect(deferred.promise).resolves.toBe(3);
  await expect(Promise.try(() => 4)).resolves.toBe(4);
});

test('the actual ESLint config rejects missing APIs, including aliases and computed access', () => {
  const rejected = [
    '[1].toSorted()',
    '[1]["toSorted"]()',
    '[1]?.toSorted()',
    'const { toSorted: sort } = Array.prototype;',
    'Object.groupBy([], () => "x")',
    'Map["groupBy"]([], () => "x")',
    'const { groupBy } = Object;',
    'Array.fromAsync([])',
    'new Uint8Array(2).toReversed()',
    'const xs = new Uint8Array(2); xs.with(0, 1)',
    'const xs = new Uint8Array(2); const { toReversed } = xs;',
    'Iterator.from([])',
    '[1].values().map(x => x)',
    'const iterator = new Set([1]).values(); iterator.filter(x => x)',
    'const iterator = new Map().entries(); const { take } = iterator;',
    'new ArrayBuffer(2).resize(4)',
    'new ArrayBuffer(2).resizable',
    'new ArrayBuffer(2, { maxByteLength: 4 })',
    'JSON.rawJSON("1")',
    'JSON.isRawJSON({})',
    'JSON.parse("1", (key, value, context) => context.source)',
    'RegExp.escape("x")',
    'new RegExp("a", "v")',
    'RegExp("a", "iv")',
    '/a/v',
    'const flags = "v"; new RegExp("a", flags)',
    'new RegExp("a").unicodeSets',
    'new Float16Array(2)',
    'Math.f16round(1)',
    'new DataView(new ArrayBuffer(2)).getFloat16(0)',
    'Uint8Array.fromBase64("AA==")',
    'new Uint8Array(1).toHex()',
    'Atomics.waitAsync(new Int32Array(), 0, 0)',
    'new SharedArrayBuffer(2).grow(4)',
  ];
  const allowed = [
    '[1].with(0, 2)',
    '[1].toReversed()',
    '[1].toSpliced(0, 1)',
    '[1].findLast(Boolean)',
    '[1].findLastIndex(Boolean)',
    '[1].at(-1)',
    '"x".isWellFormed()',
    '"x".toWellFormed()',
    'new Set().union(new Set())',
    'new Set().intersection(new Set())',
    'Promise.withResolvers()',
    'Promise.try(() => 1)',
    '[1].map(x => x)',
    'const iterator = [1].values(); iterator.next()',
    'JSON.parse("1", (key, value) => value)',
    'Object.hasOwn({}, "a")',
    'new RegExp("a", "du")',
    '/a/d',
    'const custom = { toArray: () => [] }; custom.toArray()',
  ];
  const script = `const { ESLint } = require('eslint'); (async () => {
    const lint = new ESLint();
    const cases = ${JSON.stringify([...rejected, ...allowed])};
    const results = [];
    for (const code of cases) {
      const [result] = await lint.lintText(code, { filePath: 'src/analytics/events.ts' });
      results.push(result.messages.filter(m => m.ruleId === 'opax/hermes-builtins' || m.fatal));
    }
    const [outside] = await lint.lintText('[1].toSorted()', { filePath: 'tests/hermes-fixture.test.ts' });
    console.log(JSON.stringify({ results, outside: outside.messages }));
  })().catch(error => { console.error(error); process.exit(1); });`;
  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
  });
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  const { results, outside } = JSON.parse(result.stdout);
  rejected.forEach((code, index) => {
    expect({ code, messages: results[index] }).toEqual({
      code,
      messages: expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'opax/hermes-builtins',
          message: expect.stringContaining('Use '),
        }),
      ]),
    });
  });
  allowed.forEach((code, index) => {
    expect({ code, messages: results[rejected.length + index] }).toEqual({
      code,
      messages: [],
    });
  });
  expect(
    outside.filter(
      (m: { ruleId: string }) => m.ruleId === 'opax/hermes-builtins',
    ),
  ).toEqual([]);
}, 30000);
