import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { personRole, roleLine, personTitle } from '../src/seo-titles.ts';

// ACT Legislative Assembly Hansard (source act_hansard) reaches the KB labelled
// kind=speech, source=act_hansard, state=act, chamber=act_la (parli.ingest.arag_sync
// copies the speeches row). These are the places that must know those two values.
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const search = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('the Worker accepts state=act as a speech filter and no longer treats it as an extended state', () => {
  assert.match(worker, /const STATES = new Set\(\[[^\]]*'act'[^\]]*\]\)/);
  const extended = /const extendedStates = new Set\(\[([^\]]*)\]\)/.exec(worker);
  assert.ok(extended, 'extendedStates is defined');
  assert.doesNotMatch(extended[1], /'act'/);
  assert.match(extended[1], /'tas'/);   // Tasmania, WA and the NT still have no speeches
});

test('the search page and the front-end name the ACT and its chamber', () => {
  assert.match(search, /<select id="a-state"[\s\S]*?<option value="act">ACT<\/option>[\s\S]*?<\/select>/);
  assert.match(app, /const STATE_NAMES = \{[^}]*act: "ACT"/);
  assert.match(app, /const PARLIAMENT_NAMES = \{[^}]*act: "ACT"/);
  assert.match(app, /act_la: "ACT Legislative Assembly"/);
  assert.match(app, /\["act", "ACT Legislative Assembly"\]/);            // the stats page's live table
  assert.match(app, /act: \/\^ACT Legislative Assembly\$\//);              // topic pages' coverage window
});

test('an ACT MLA is a Member for their seat, tagged ACT', () => {
  const p = { name: 'Yvette Berry', party: 'Labor', party_now: 'Labor', states: ['act'], last: 2026,
    representation: [{ electorate: 'Ginninderra', chamber: 'act_la', jurisdiction: 'act', state: 'ACT' }] };
  const r = personRole(p, 2026);
  assert.equal(roleLine(r), 'Labor Member for Ginninderra (ACT)');
  assert.equal(personTitle('Yvette Berry', r, 'Speeches'), 'Yvette Berry MP, Labor Member for Ginninderra (ACT) · OPAX');
});
