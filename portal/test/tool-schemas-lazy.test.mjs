import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// The registry as Ask and MCP load it, with its zod counting each JSON Schema conversion.
const root = new URL('../', import.meta.url).pathname;
const countingZod = { name: 'counting-zod', setup(b) {
  b.onResolve({ filter: /^zod$/ }, args => args.importer.endsWith('/src/tools/index.ts') ? { path: 'counting-zod', namespace: 'counting' } : undefined);
  b.onResolve({ filter: /^counting-zod$/ }, () => ({ path: 'counting-zod', namespace: 'counting' }));
  b.onLoad({ filter: /.*/, namespace: 'counting' }, () => ({ resolveDir: root, loader: 'js', contents: "import {z as real} from 'zod'; export const conversions = []; export const z = new Proxy(real, {get(target, key) { return key === 'fromJSONSchema' ? (...args) => { conversions.push(args[0]); return target.fromJSONSchema(...args) } : target[key] }});" }));
} };
const built = await build({ stdin: { contents: "export {tools, toolSchema, parseToolArgs, ToolInputError} from './src/tools/index'; export {conversions} from 'counting-zod'; export {z} from 'zod';", resolveDir: root }, bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent', mainFields: ['module', 'main'], plugins: [countingZod] });
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));

test('loading the registry converts no tool schema; each is converted once, on first use', () => {
  assert.equal(api.conversions.length, 0, 'a cold isolate does no schema work for pages and searches');
  for (const [i, tool] of api.tools.entries()) {
    const schema = api.toolSchema(tool.name);
    assert.ok(schema && typeof schema.safeParse === 'function', tool.name);
    assert.equal(api.toolSchema(tool.name), schema, `${tool.name} is kept`);
    assert.equal(api.conversions.length, i + 1, `${tool.name} is converted once`);
    assert.equal(api.conversions[i], tool.inputSchema);
    assert.deepEqual(api.z.globalRegistry.get(schema), tool.inputSchema, `${tool.name} keeps its JSON Schema as metadata`);
  }
});

test('argument parsing uses the same schemas and still rejects unknown tools and bad input', () => {
  const before = api.conversions.length;
  assert.throws(() => api.parseToolArgs('no_such_tool', {}), api.ToolInputError);
  for (const tool of api.tools) assert.throws(() => api.parseToolArgs(tool.name, 'not an object'), api.ToolInputError, tool.name);
  assert.equal(api.conversions.length, before, 'parsing reuses the kept schemas');
});
