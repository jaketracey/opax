#!/usr/bin/env node
// my-mp.md 3.15. Typing, scrolling and assertions cost no taps.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSeq, parseAllDocuments } from 'yaml';

const budgets = {
  // The native field needs an explicit focus tap in the current app.
  // Count it alongside Continue and choosing the row; never hide it as typing.
  'first-launch-member': 3,
  'today-member-profile': 1,
  'today-official-page': 2,
  'figure-original': 2,
};
const required = {
  '66-my-mp-journey.yaml': [
    'first-launch-member',
    'today-member-profile',
    'today-official-page',
  ],
  '67-my-mp-entry-points.yaml': ['figure-original'],
};
function read(file) {
  const source = fs.readFileSync(file, 'utf8');
  const docs = parseAllDocuments(source);
  for (const doc of docs) {
    if (doc.errors.length)
      throw new Error(
        `${file}: ${doc.errors.map((e) => e.message).join('; ')}`,
      );
  }
  return {
    source,
    steps: docs
      .filter((doc) => isSeq(doc.contents))
      .flatMap((doc) => doc.contents.items),
  };
}
function count(steps, file, stack) {
  let taps = 0;
  for (const step of steps) {
    if (!step || typeof step !== 'object') continue;
    if ('tapOn' in step) taps++;
    if ('longPressOn' in step) taps++;
    if (step.runFlow) {
      const flow = step.runFlow;
      const target = typeof flow === 'string' ? flow : flow.file;
      if (target) {
        if (target.includes('${'))
          throw new Error(
            `${file}: dynamic runFlow cannot be counted: ${target}`,
          );
        const child = path.resolve(path.dirname(file), target);
        if (stack.includes(child))
          throw new Error(`${file}: recursive runFlow: ${child}`);
        taps += count(
          read(child).steps.map((node) => node.toJSON()),
          child,
          [...stack, child],
        );
      }
      if (flow.commands) taps += count(flow.commands, file, stack);
    }
    if (step.repeat) {
      const times = Number(step.repeat.times);
      if (!Number.isSafeInteger(times) || times < 0)
        throw new Error(`${file}: counted repeat needs a finite times bound`);
      taps += times * count(step.repeat.commands ?? [], file, stack);
    }
    if (step.retry) {
      const retries = Number(step.retry.maxRetries ?? 0);
      if (!Number.isSafeInteger(retries) || retries < 0)
        throw new Error(`${file}: invalid maxRetries`);
      taps += (retries + 1) * count(step.retry.commands ?? [], file, stack);
    }
  }
  return taps;
}
function check(file) {
  const { source, steps } = read(file);
  const markers = [
    ...source.matchAll(/^\s*#\s*(budget|end):\s*([\w-]+)\s*$/gm),
  ];
  const seen = new Set();
  const results = [];
  let open;
  for (const marker of markers) {
    const [, kind, task] = marker;
    if (!(task in budgets)) throw new Error(`${file}: unknown budget ${task}`);
    if (kind === 'budget') {
      if (open) throw new Error(`${file}: nested budget ${task}`);
      open = { task, start: marker.index + marker[0].length };
    } else {
      if (!open || open.task !== task)
        throw new Error(`${file}: unmatched end ${task}`);
      const selected = steps.filter(
        (node) => node.range[0] >= open.start && node.range[0] < marker.index,
      );
      // A marker must surround whole commands, so nested commands cannot escape the count.
      if (
        steps.some(
          (node) => node.range[0] < open.start && node.range[1] > open.start,
        )
      )
        throw new Error(`${file}: marker inside a command`);
      if (
        steps.some(
          (node) =>
            node.range[0] < marker.index && node.range[1] > marker.index,
        )
      )
        throw new Error(`${file}: marker inside a command`);
      const taps = count(
        selected.map((node) => node.toJSON()),
        file,
        [file],
      );
      if (!selected.length || !taps)
        throw new Error(`${file}: empty budget ${task}`);
      if (taps > budgets[task])
        throw new Error(
          `${file}: ${task}: ${taps} taps exceeds budget ${budgets[task]}`,
        );
      seen.add(task);
      results.push(
        `${path.basename(file)}: ${task}: ${taps}/${budgets[task]} taps`,
      );
      open = undefined;
    }
  }
  if (open) throw new Error(`${file}: unclosed budget ${open.task}`);
  for (const task of required[path.basename(file)] ?? []) {
    if (!seen.has(task)) throw new Error(`${file}: missing budget ${task}`);
  }
  // Most flows declare no tap budget. They can share the changed-flow gate,
  // but required journeys must keep every marker and malformed pairs fail.
  return results.length
    ? results
    : [`${path.basename(file)}: no declared tap budgets`];
}
const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = process.argv.slice(2);
try {
  const paths = files.length
    ? files
    : ['66-my-mp-journey', '67-my-mp-entry-points'].map((name) =>
        path.join(mobile, '.maestro', `${name}.yaml`),
      );
  for (const file of paths)
    for (const result of check(path.resolve(file))) console.log(result);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
