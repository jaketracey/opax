import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../graph/map3d-engine.ts', import.meta.url), 'utf8');
const start = source.indexOf('  private updateLod(now: number)');
const end = source.indexOf('  /** Groups that must stay unfolded', start);
const code = ts.transpileModule(`class Probe { ${source.slice(start, end)} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const Probe = runInNewContext(`${code}; Probe`, {
  THREE: { MathUtils: { degToRad: n => n * Math.PI / 180 } },
  FOV: 40, COLLAPSE_PX: 68, EXPAND_PX: 86, LOD_MS: 420,
});

function fold({ overview = true, distance = 500, opened = false, selected = false } = {}) {
  const hub = { group: 'finance', lod: 0, lodTarget: 0, lodStarted: -1, dived: opened };
  const state = {
    overviewMode: overview, hubs: new Map([['finance', hub]]),
    territories: [{ hub, spread: 300 }], height: 540,
    updateCamera() {}, goalDist: () => distance,
    pinnedGroups: () => selected ? new Set(['finance']) : null,
  };
  Probe.prototype.updateLod.call(state, 100);
  return hub.lod;
}

test('homepage groups remain folded at close, fitted and distant camera scales', () => {
  for (const distance of [250, 500, 2500]) assert.equal(fold({ distance }), 1);
});

test('opening a group or selecting one of its members reveals the group', () => {
  assert.equal(fold({ opened: true }), 0);
  assert.equal(fold({ selected: true }), 0);
});

test('research and subject maps retain their automatic semantic zoom', () => {
  assert.equal(fold({ overview: false, distance: 500 }), 0);
  assert.equal(fold({ overview: false, distance: 10000 }), 1);
});
