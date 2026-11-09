#!/usr/bin/env node
// Review aid: whole source strings/templates, not a simulator AX audit.
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
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function sourceTemplate(parts) {
  if ((parts.join('').match(/[a-z]/gi) ?? []).length < 3) return null;
  return {
    pattern: new RegExp(`^${parts.map(escapeRegex).join('.+')}$`),
    prefixOnly: parts.slice(1).every((part) => part === ''),
  };
}
function sourceInventory() {
  const strings = new Set();
  const templates = [];
  for (const file of files(path.join(mobile, 'src'), /\.[jt]sx?$/)) {
    const ast = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node) {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
        strings.add(node.text);
      if (ts.isTemplateExpression(node)) {
        const template = sourceTemplate([
          node.head.text,
          ...node.templateSpans.map((span) => span.literal.text),
        ]);
        if (template) templates.push(template);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  return { strings, templates };
}
export function classifySelector(id, { strings, templates }) {
  if (strings.has(id)) return 'found';
  // Match a Maestro regex against WHOLE source literals. A selector's regex
  // syntax may occupy a template's interpolation slots, but never replace
  // its literal parts; both ends of every source template remain anchored.
  if (!id.includes('${')) {
    try {
      const selector = new RegExp(`^(?:${id})$`);
      if ([...strings].some((value) => selector.test(value))) return 'found';
    } catch {
      // An invalid regex is still reported as an unheld selector below.
    }
  }
  const candidate = id.replace(/^\^/, '').replace(/(?<!\\)\$$/, '');
  const matches = templates.filter(({ pattern }) => pattern.test(candidate));
  if (matches.some(({ prefixOnly }) => !prefixOnly)) return 'found';
  return matches.length ? 'prefix' : 'missing';
}

const cache = new Map();
function read(file) {
  if (!cache.has(file)) {
    const docs = parseAllDocuments(fs.readFileSync(file, 'utf8'));
    for (const doc of docs) {
      if (doc.errors.length)
        throw new Error(
          `${file}: ${doc.errors.map((error) => error.message).join('; ')}`,
        );
    }
    cache.set(
      file,
      docs.map((doc) => doc.toJS()),
    );
  }
  return cache.get(file);
}
// Resolve literal flow parameters only. Never execute Maestro/JavaScript.
function expand(value, env) {
  if (typeof value !== 'string') return value;
  for (let i = 0; i < 10; i++) {
    const next = value.replace(/\$\{([A-Za-z_]\w*)\}/g, (token, key) =>
      ['string', 'number', 'boolean'].includes(typeof env[key])
        ? String(env[key])
        : token,
    );
    if (next === value) break;
    value = next;
  }
  return value;
}
let inventory;
const reports = { missing: new Set(), prefix: new Set() };
const relative = (file) => path.relative(mobile, file);
function record(id, file, env, caller) {
  const resolved = expand(id, env);
  const state = classifySelector(resolved, inventory);
  if (state !== 'found') {
    const location =
      caller && resolved !== id
        ? `${relative(caller)} -> ${relative(file)} (id ${id})`
        : relative(file);
    reports[state].add(`${location}: ${resolved}`);
  }
}
function audit(file, inherited = {}, stack = [], caller) {
  if (stack.includes(file)) return;
  const docs = read(file);
  const env = { ...(docs[0]?.env ?? {}), ...inherited };
  function walk(value, env) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.id === 'string') record(value.id, file, env, caller);
    for (const [key, child] of Object.entries(value)) {
      if (key === 'env') continue;
      if (key === 'runFlow') {
        const flow = typeof child === 'string' ? { file: child } : child;
        if (!flow || typeof flow !== 'object') continue;
        const childEnv = { ...env };
        for (const [name, param] of Object.entries(flow.env ?? {}))
          childEnv[name] = expand(param, env);
        if (flow.file) {
          const target = expand(flow.file, childEnv);
          if (!target.includes('${'))
            audit(
              path.resolve(path.dirname(file), target),
              childEnv,
              [...stack, file],
              file,
            );
        }
        if (flow.commands) walk(flow.commands, childEnv);
      } else walk(child, env);
    }
  }
  for (const doc of docs) walk(doc, env);
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  inventory = sourceInventory();
  const paths = process.argv.slice(2);
  for (const file of paths.length
    ? paths.map((file) => path.resolve(file))
    : files(path.join(mobile, '.maestro'), /\.ya?ml$/))
    audit(file);
  console.log('missing from source strings and templates');
  for (const line of [...reports.missing].sort()) console.log(line);
  console.log('\nheld only by a prefix template, check by hand');
  for (const line of [...reports.prefix].sort()) console.log(line);
  console.log(
    `\n${reports.missing.size} missing; ${reports.prefix.size} held only by a prefix template.`,
  );
}
