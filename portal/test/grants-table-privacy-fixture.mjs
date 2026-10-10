// Recipient names are derived only at run time. Synthetic IDs exercise overrides.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MONEY_GRAPHS, isOrganisationDonor, withheldPhrases, namesWithheldPhrase} from '../public/donor-entity.js';

// Temporary assertion fallback until the core round 2 helper is committed.
export async function tablePrivacyIndex() {
  const graphs = await Promise.all(MONEY_GRAPHS.map(path => readFile(new URL('../public' + path, import.meta.url), 'utf8').then(JSON.parse)));
  const phrases = withheldPhrases(graphs, []);
  const values = [...new Set(graphs.flatMap(g => g.nodes.filter(n => n.kind === 'donor' && !isOrganisationDonor(n)).flatMap(n => [n.label, ...(n.aliases || [])])))].filter(v => namesWithheldPhrase(phrases, `donor receipts ${v}`));
  return {values, safe: value => !namesWithheldPhrase(phrases, `donor receipts ${value}`)};
}
export async function assertTablePrivacy(surfaces, index) {
  for (const key of ['clientInput', 'serverResponses', 'url', 'renderedText', 'accessibleText', 'analytics']) {
    assert.ok(Object.hasOwn(surfaces, key), `privacy surface missing: ${key}`);
    assert.ok(index.safe(typeof surfaces[key] === 'string' ? surfaces[key] : JSON.stringify(surfaces[key])), `withheld text on privacy surface: ${key}`);
  }
  assert.equal(typeof surfaces.csvPath, 'string');
  assert.ok(index.safe(await readFile(surfaces.csvPath, 'utf8')), 'withheld text in downloaded CSV');
}

export async function grantPrivacyFixture(read) {
  const index = await read('/graph/grants.federal.json');
  const names = index.recipients.filter(r => r.k === 'individual').map(r => r.n);
  const award = {id: 'fixture-public-award', rid: 'name:fixture-public', rn: 'fixture-public Council Pty Ltd', k: 'council', v: 25000, s: '2026-08-19'};
  const overrides = [{k: 'person'}, {k: 'sole trader'}, {kind: 'people'}, {abr: {etype: 'IND'}}, {abnType: 'IND'}].map((override, i) => ({...award, id: `fixture-private-award-${i}`, rid: `abn:${String(i).padStart(11, '0')}`, rn: `fixture-recipient-${i} Pty Ltd`, ...override}));
  const program = {n: 'Fixture program', ag: 'Fixture agency', grants: [award, ...overrides]};
  const programs = [program, {...program, n: names[0]}, {...program, ag: names[1]}];
  return {names, overrides, read: async path => path.startsWith('/grants/federal/programs/') ? programs[['go3141', 'go90', 'go6284'].findIndex(key => path.endsWith(key + '.json'))] : read(path)};
}
