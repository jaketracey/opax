#!/usr/bin/env node
// Review aid: source strings and template prefixes, not a simulator AX audit.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAllDocuments } from 'yaml';
import ts from 'typescript';

const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function files(dir, pattern) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory()
      ? files(file, pattern)
      : pattern.test(file)
        ? [file]
        : [];
  });
}
const strings = [];
const prefixes = [];
for (const file of files(path.join(mobile, 'src'), /\.[jt]sx?$/)) {
  const ast = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      strings.push(node.text);
    if (ts.isTemplateExpression(node)) prefixes.push(node.head.text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
const exact = new Set(strings);
function held(id) {
  if (exact.has(id)) return true;
  // Maestro selectors may be regexes, or contain a flow environment variable.
  const prefix = id.replace(/^\^/, '').split(/\$\{|[.*+?()[\]{}|^$]/)[0];
  if (prefixes.some((value) => value && prefix.startsWith(value))) return true;
  return (
    prefix !== id &&
    Boolean(prefix) &&
    strings.some((value) => value.startsWith(prefix))
  );
}
function ids(value, found = new Set()) {
  if (!value || typeof value !== 'object') return found;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'id' && typeof child === 'string') found.add(child);
    else ids(child, found);
  }
  return found;
}
const flows = process.argv.slice(2);
let misses = 0;
for (const file of flows.length
  ? flows.map((file) => path.resolve(file))
  : files(path.join(mobile, '.maestro'), /\.ya?ml$/)) {
  for (const doc of parseAllDocuments(fs.readFileSync(file, 'utf8'))) {
    if (doc.errors.length)
      throw new Error(
        `${file}: ${doc.errors.map((error) => error.message).join('; ')}`,
      );
    for (const id of ids(doc.toJS())) {
      if (!held(id)) {
        console.log(`${path.relative(mobile, file)}: ${id}`);
        misses++;
      }
    }
  }
}
console.log(
  `${misses} selectors need review (including native and runtime ids).`,
);
