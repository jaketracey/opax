import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const adapter = readFileSync(new URL('../graph/index.ts', import.meta.url), 'utf8');
const bundle = readFileSync(new URL('../public/money-map.js', import.meta.url), 'utf8');
const transpile = source => ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;

const start = adapter.indexOf('    const visibleNodes = windowNodes.filter(');
const filterBlock = adapter.slice(start, adapter.indexOf('    const visibleIds =', start));
