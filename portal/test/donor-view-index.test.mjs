// The browser's donor privacy index is published as one small file
// (scripts/build_donor_index.mjs) so the first render no longer waits for every
// money graph. It must be exactly the index the graphs give, it must never hold
// a named withheld donor, and the loader must fall back the way it did before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MONEY_GRAPHS, donorPrivacyIndex, donorNameWithheld } from '../public/donor-entity.js';
import { donorIndexFile } from '../../scripts/build_donor_index.mjs';

const pub = fileURLToPath(new URL('../public/', import.meta.url));
const graphs = MONEY_GRAPHS.map((p) => JSON.parse(readFileSync(join(pub, p), 'utf8')));
const published = JSON.parse(readFileSync(join(pub, 'graph/donor-index.json'), 'utf8'));

test('the published index is the one the four graphs give', () => {
  const index = donorPrivacyIndex(graphs);
  assert.deepEqual(published, { organisations: [...index.organisations].sort(), withheld: [...index.withheld].sort() });
  assert.deepEqual(published, donorIndexFile(pub));
  for (const label of published.withheld) assert.match(label, /^donor \d+ \(name withheld\)$/);
});

test('the generator refuses graphs that still name a withheld donor', () => {
  const root = mkdtempSync(join(tmpdir(), 'donor-index-'));
  try {
    mkdirSync(join(root, 'graph'));
    for (const [i, p] of MONEY_GRAPHS.entries()) {
      const g = structuredClone(graphs[i]);
      if (i === 0) g.nodes.push({ id: 'donor:fictional', kind: 'donor', label: 'Fictional Example Person', aliases: [] });
      writeFileSync(join(root, p), JSON.stringify(g));
    }
    assert.throws(() => donorIndexFile(root), /not anonymised/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the browser loader reads the file, falls back to the graphs, then withholds', async () => {
  const realFetch = globalThis.fetch;
  const load = async (respond) => {
    const asked = [];
    globalThis.fetch = async (url) => { asked.push(String(url)); return respond(String(url)); };
    try {
      const mod = await import(`../public/donor-views.js?case=${Math.random()}`);
      return { index: await mod.loadDonorViewIndex(), asked };
    } finally { globalThis.fetch = realFetch; }
  };
  const json = (body) => ({ ok: true, json: async () => body });
  const file = await load((url) => json(published));
  assert.deepEqual(file.asked, ['/graph/donor-index.json']);
  const expected = donorPrivacyIndex(graphs);
  assert.deepEqual([...file.index.organisations].sort(), [...expected.organisations].sort());
  assert.deepEqual([...file.index.withheld].sort(), [...expected.withheld].sort());
  for (const name of [...expected.organisations].slice(0, 25)) assert.equal(donorNameWithheld(file.index, name), donorNameWithheld(expected, name));

  const fallback = await load((url) => url.endsWith('donor-index.json') ? { ok: false } : json(graphs[MONEY_GRAPHS.indexOf(url)]));
  assert.deepEqual(fallback.asked, ['/graph/donor-index.json', ...MONEY_GRAPHS]);
  assert.deepEqual([...fallback.index.organisations].sort(), [...expected.organisations].sort());

  const nothing = await load(() => ({ ok: false }));
  assert.equal(nothing.index.organisations.size, 0);
  assert.equal(donorNameWithheld(nothing.index, 'Fictional Example Person'), true);
});
