// One person, two recorded spellings that differ only in apostrophe, case or accents
// (speeches-press-002): "Brendan O'Connor" 879 and "Brendan O’Connor" 598 in speakers.json.
// The site's resolver used to pick the smaller spelling, and the Worker's exact collaborator
// filter reached only one of them. Display keeps the recorded spelling; the fold is for matching.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { speakerSpellings, speakerVariantIndex, spellingKey, scopedCollaborators } from '../public/speech-attribution.js';

const rows = JSON.parse(readFileSync(new URL('../public/speakers.json', import.meta.url), 'utf8'));
const worker = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

test('the spelling key folds apostrophes, case and accents, and nothing else', () => {
  assert.equal(spellingKey('Brendan O’Connor'), spellingKey("Brendan O'Connor"));
  assert.equal(spellingKey('Tom McINTOSH'), spellingKey('Tom McIntosh'));
  assert.equal(spellingKey('Jasmina Joldić'), spellingKey('Jasmina Joldic'));
  assert.notEqual(spellingKey('Brendan Patrick John O’Connor'), spellingKey("Brendan O'Connor"));
});

test('the published directory: every spelling of a name reaches the filter, largest first', () => {
  const variants = speakerVariantIndex(rows);
  assert.deepEqual(variants.get(spellingKey("Brendan O'Connor")), ["Brendan O'Connor", 'Brendan O’Connor']);
  assert.deepEqual(speakerSpellings(['Brendan O’Connor'], variants), ['Brendan O’Connor', "Brendan O'Connor"]);
  assert.deepEqual(speakerSpellings(['Anthony Albanese'], variants), ['Anthony Albanese'], 'one spelling: unchanged');
  const filter = { field: { and: [{ prop: 'origin_collaborator', collaborator: "Brendan O'Connor" }] } };
  assert.deepEqual(scopedCollaborators(filter, { speakers: speakerSpellings(["Brendan O'Connor"], variants) }), { field: { and: [{ or: [
    { prop: 'origin_collaborator', collaborator: "Brendan O'Connor" }, { prop: 'origin_collaborator', collaborator: 'Brendan O’Connor' }] }] } });
  // All 1,477 Brendan O'Connor speeches sit behind one filter; the reported 16 split names are all covered.
  const count = new Map(rows.map(([n, c]) => [n, c]));
  assert.equal(speakerSpellings(['Brendan O’Connor'], variants).reduce((s, n) => s + count.get(n), 0), 1477);
  assert.ok(variants.size >= 16, `${variants.size} split names`);
  for (const name of ["Kelly O'Dwyer", "Ken O'Dowd", 'Bert Van Manen', "Gavan O'Connor", "Deborah O'Neill", 'Tom McIntosh', "Yvette D'Ath", 'Terri MacDonald'])
    assert.ok((variants.get(spellingKey(name)) || []).length > 1, name);
});

test('the Worker widens a speaker filter to every spelling, on the search, Ask and topics paths', () => {
  assert.match(worker, /async function speakerPrints\([\s\S]*?speakerSpellings\(prints\.length \? prints : \[canonicalSpeaker\(raw\)\], variants\)/);
  assert.match(worker, /assetJson<\[string, number\]\[\]>\(env, '\/speakers\.json'\)\.then\(rows => speakerVariantIndex\(rows\)\)/);
});

function resolverFrom(file, fetchRows) {
  const source = readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
  const grab = re => re.exec(source)?.[0] || assert.fail(`${file}: ${re}`);
  const body = [
    grab(/const SPEAKER_NICKNAMES = [^\n]*\n/),
    grab(/function speakerKey ?\(s\) \{[\s\S]*?\n\}\n/),
    grab(/function mergeSpeakerRows ?\(rows\) \{[\s\S]*?\n\}\n/),
    grab(/let speakersDirPromise = null;?\nfunction loadSpeakersDir ?\(\) \{[\s\S]*?\n\}\n/),
    grab(/async function resolveSpeaker ?\(input\) \{[\s\S]*?\n\}\n/),
  ].join('\n');
  return new Function('fetch', 'SPEAKERS_URL', 'ensureSpeakersDatalist', `${body}; return {resolveSpeaker, loadSpeakersDir}`)(
    async () => ({ json: async () => fetchRows }), '/speakers.json', () => {});
}

for (const file of ['app.js', 'thenvsnow.js']) {
  test(`${file}: a typed name resolves to the most-used spelling, and a lone surname counts both spellings as one person`, async () => {
    const { resolveSpeaker, loadSpeakersDir } = resolverFrom(file, rows);
    assert.equal(await resolveSpeaker("brendan o'connor"), "Brendan O'Connor");
    assert.equal(await resolveSpeaker('Brendan O’Connor'), "Brendan O'Connor");
    assert.equal(await resolveSpeaker('tom mcintosh'), 'Tom McIntosh');
    const dir = await loadSpeakersDir();
    const holders = dir.bySurname.get("o'connor").map(([n]) => n);
    assert.equal(holders.filter(n => spellingKey(n) === spellingKey("Brendan O'Connor")).length, 1, 'one entry per person, not per spelling');
    if (dir.names) assert.equal(new Set(dir.names.map(spellingKey)).size, dir.names.length, 'the typeahead lists each name once');
  });
}
