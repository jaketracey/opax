import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billTitle, personRole, personTitle, roleLine, BILL_TITLE_MAX } from '../src/seo-titles.ts';

const seat = (electorate, chamber, jurisdiction = 'federal', state = 'NSW') => ({ electorate, chamber, jurisdiction, state });

test('a sitting member is named as the parliament names them, with party and seat', () => {
  const albanese = { name: 'Anthony Albanese', party: 'Labor', party_now: 'Labor', current: true, states: ['federal'], last: 2026, representation: [seat('Grayndler', 'representatives')] };
  const r = personRole(albanese, 2026);
  assert.equal(roleLine(r), 'Labor Member for Grayndler (NSW)');
  assert.equal(personTitle('Anthony Albanese', r, 'Speeches, votes & interests'), 'Anthony Albanese MP, Labor Member for Grayndler (NSW) · OPAX');
  const wong = { name: 'Penny Wong', party: 'Labor', current: true, states: ['federal'], last: 2026, representation: [seat('South Australia', 'senate', 'federal', 'SA')] };
  assert.equal(personTitle('Penny Wong', personRole(wong, 2026), 'x'), 'Penny Wong, Labor Senator for South Australia · x · OPAX');
  const pocock = { name: 'David Pocock', party: 'Independent', current: true, states: ['federal'], last: 2026, representation: [seat('Australian Capital Territory', 'senate', 'federal', 'ACT')] };
  assert.equal(roleLine(personRole(pocock, 2026)), 'Independent Senator for the ACT');
});

test('former members, state members and statewide councils', () => {
  const abbott = { name: 'Tony Abbott', party: 'Liberal', states: ['federal'], last: 2019, representation: [seat('Warringah', 'representatives')] };
  assert.equal(personTitle('Tony Abbott', personRole(abbott, 2026), 'Speeches, votes & interests'), 'Tony Abbott, former Liberal Member for Warringah (NSW) · OPAX');
  const aitchison = { name: 'Jenny Aitchison', party: null, states: ['nsw'], last: 2026, representation: [seat('Maitland', 'nsw_la', 'nsw')] };
  assert.equal(personTitle('Jenny Aitchison', personRole(aitchison, 2026), 'Speeches'), 'Jenny Aitchison MP, Member for Maitland (NSW) · Speeches · OPAX');
  const mlc = { name: 'Bronnie Taylor', party: null, states: ['nsw'], last: 2023, representation: [seat('Legislative Council district of New South Wales', 'nsw_lc', 'nsw')] };
  assert.equal(roleLine(personRole(mlc, 2026)), 'former MLC (NSW)');
  const minister = { name: 'Ingrid Stitt', party: null, states: ['vic'], last: 2026, representation: [seat('Western Metropolitan – Minister for Mental Health, Minister for Ageing', 'vic_lc', 'vic', 'VIC')] };
  assert.equal(roleLine(personRole(minister, 2026)), 'MLC for Western Metropolitan (Vic)');
  // Federal former, state sitting: the state seat is the one they hold now.
  const saffin = { name: 'Janelle Saffin', party: 'Labor', states: ['federal', 'nsw'], last: 2026, representation: [seat('Page', 'representatives'), seat('Lismore', 'nsw_la', 'nsw')] };
  assert.equal(roleLine(personRole(saffin, 2026)), 'Labor Member for Lismore (NSW)');
  assert.equal(personRole({ name: 'Shoebridge', party: null, states: ['nsw'], last: 2026, representation: [] }, 2026), null);
  assert.equal(personTitle('Shoebridge', null, 'Speeches'), 'Shoebridge · OPAX');
});

test('a long title drops the suffix, then the state, then the party', () => {
  const r = { name: 'Concetta Fierravanti-Wells', former: 'former ', party: 'Liberal', role: 'Senator for New South Wales', tag: '', federal: true };
  const t = personTitle(r.name, r, 'Speeches, votes & interests');
  assert.equal(t, 'Concetta Fierravanti-Wells, former Senator for New South Wales · OPAX');
});

test('bill titles are the full official name, never cut, with the masthead only when it fits', () => {
  assert.equal(billTitle('National Student Ombudsman Levy Bill 2026'), 'National Student Ombudsman Levy Bill 2026 · OPAX');
  assert.equal(billTitle('Automated Decision-Making (Safeguards and Transparency) Bill 2026'), 'Automated Decision-Making (Safeguards and Transparency) Bill 2026');
  const child = 'Child Support and Family Assistance Legislation Amendment (Ending Financial Abuse in the Child Support Scheme No. 1) Bill 2026';
  assert.equal(billTitle(child), child);
  const customs = 'Customs and Other Legislation Amendment (Illicit Tobacco Enforcement Modernisation and Other Measures) Bill 2026';
  assert.equal(billTitle(`  ${customs.replace(/ /g, '  ')} `), customs);
  const edge = 'X'.repeat(BILL_TITLE_MAX - ' · OPAX'.length);
  assert.equal(billTitle(edge), `${edge} · OPAX`);
  assert.equal(billTitle(`${edge}Y`), `${edge}Y`);
  for (const t of [child, customs, edge]) assert.ok(!billTitle(t).includes('…'));
});
