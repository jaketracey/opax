import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

// The fourteen daily editions of 3 to 16 Nov 2026 that the social design review read, composed again from the
// repo's own exports (public/), each narrowed to its stored subject. Four content fixes are checked on them:
// the vote slide, amending bills' bracketed words, the chamber photograph, and seat margins in words with their
// year. Nothing is fetched and nothing is posted.

// daily-post.ts and og.ts import story.ts without an extension (the Worker is bundled), so they are bundled here too.
const bundle = async (file) => {
  const built = await build({ entryPoints: [new URL(file, import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
  return import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
};
const { composeDailyPost, shortTitle, seatHolder, seatMargin, partyName } = await bundle('../src/daily-post.ts');
const { coverTitleFits } = await bundle('../src/og.ts');

const files = new Map();
const read = (path) => {
  if (!files.has(path)) {
    let data = null;
    try { data = JSON.parse(readFileSync(new URL(`../public${path}`, import.meta.url), 'utf8')); } catch { data = null; }
    files.set(path, data);
  }
  return files.get(path);
};
// The 9 Nov program left public/social/programs.json on 11 Nov; its record as the export then held it.
const GO7867 = JSON.parse(readFileSync(new URL('./fixtures/social-program-go7867.json', import.meta.url), 'utf8'));

/** The exports, with each picker's list narrowed to the one subject; `over` replaces a whole file. */
function sources(subject, over = {}) {
  return {
    async asset(path) {
      if (path in over) return over[path];
      const data = path === '/social/programs.json' && subject === 'program:GO7867' ? GO7867 : read(path);
      if (!data) return null;
      if (path === '/bills/index.json') return { ...data, bills: data.bills.filter(b => `bill:${b.key}` === subject) };
      if (path === '/parliamentarians.json') return { ...data, people: data.people.filter(p => `person:${p.name}` === subject) };
      if (path === '/social/programs.json') return { ...data, programs: data.programs.filter(p => `program:${p.id}` === subject) };
      return data;
    },
    async personTopics() { return []; },
    async recent() { return []; },
  };
}
const compose = (date, kind, subject, over) => kind === 'grant'
  ? composeDailyPost(date, sources(subject, over), kind, subject)
  : composeDailyPost(date, sources(subject, over), kind);

const EDITIONS = [
  ['2026-11-03', 'politician', 'person:Tyron Whitten'], ['2026-11-04', 'grant', 'grant:GA576854@abn:23693334360'],
  ['2026-11-05', 'bill', 'bill:au-federal-r7530'], ['2026-11-06', 'grant', 'grant:GA576943@abn:39549568822'],
  ['2026-11-07', 'politician', 'person:Aaron Violi'], ['2026-11-08', 'bill', 'bill:au-federal-r7528'],
  ['2026-11-09', 'program', 'program:GO7867'], ['2026-11-10', 'politician', 'person:Richard Marles'],
  ['2026-11-11', 'grant', 'grant:GA575774@abn:38393903860'], ['2026-11-12', 'bill', 'bill:au-federal-s1517'],
  ['2026-11-13', 'grant', 'grant:GA576098@abn:80227965466'], ['2026-11-14', 'politician', 'person:Varun Ghosh'],
  ['2026-11-15', 'bill', 'bill:au-federal-s1515'], ['2026-11-16', 'program', 'program:activity:Female Facilities & Water Safety Stream'],
];
const editions = new Map();
for (const [date, kind, subject] of EDITIONS) editions.set(date, await compose(date, kind, subject));
const bills = [...editions.values()].filter(post => post.kind === 'bill');
// Beside the fourteen: the bill whose Senate third reading shares its name with a closure (federal-senate-9971/9972).
const defence = await compose('2026-11-08', 'bill', 'bill:au-federal-r7378');
const slide = (post, type) => post.slides.find(s => s.type === type) ?? null;

test('the fourteen editions compose again from the exports, each with its stored subject', () => {
  for (const [date, kind, subject] of EDITIONS) {
    const post = editions.get(date);
    assert.ok(post, date);
    assert.equal(post.kind, kind, date);
    assert.equal(post.subject, subject.split('@')[0], date);
  }
  assert.equal(defence.subject, 'bill:au-federal-r7378');
});

// ---------------------------------------------------------------- 1. the vote slide

const OUTCOME = /^(?:Passed|Agreed|Not agreed) at the (?:third|second) reading, \d+ to \d+$/;
const PROCEDURE = /limit|debate|closure|guillotine|suspen|adjourn|be put|allot/i;

test('a vote slide is the bill\'s deciding division with its outcome, never a procedural one', () => {
  for (const post of [...editions.values(), defence]) {
    for (const s of post.slides.filter(s => s.type === 'division')) {
      assert.match(s.title, OUTCOME, post.subject);
      assert.doesNotMatch(`${s.title} ${s.alt}`, PROCEDURE, post.subject);
    }
  }
  // 9971 (a closure on the third reading) and 9972 (the third reading) share a name and a day: the third reading.
  const division = slide(defence, 'division');
  assert.equal(division.title, 'Passed at the third reading, 30 to 18');
  assert.equal(division.line, 'Senate, 4 Mar 2026. Party split from They Vote For You.');
  assert.equal(division.ayes, 30);
  assert.equal(division.noes, 18);
  assert.ok(slide(defence, 'source').rows.includes('Division record: theyvoteforyou.org.au'));
});

test('a bill with no deciding division has no vote slide, and its edition is otherwise exactly as without divisions', async () => {
  // 8 Nov (r7528): seven divisions, all on amendments or in consideration in detail, five of them Senate amendment
  // votes taken under the guillotine and filed as "Limitation of debate"; 5 Nov (r7530): the same five Senate votes.
  for (const date of ['2026-11-05', '2026-11-08']) {
    const post = editions.get(date);
    const key = post.subject.slice('bill:'.length);
    assert.ok(read(`/bills/${key}.json`).divisions.length > 0, `${key} has recorded divisions`);
    assert.equal(slide(post, 'division'), null, `${date}: no vote slide, and no other division in its place`);
    assert.ok(!slide(post, 'source').rows.some(r => /theyvoteforyou/.test(r)), date);
    // The same bill with no divisions at all: the same slides, caption, texts and keys.
    const record = read(`/bills/${key}.json`);
    const bare = await compose(date, 'bill', post.subject, { [`/bills/${key}.json`]: { ...record, divisions: [] } });
    assert.deepEqual(post, bare, date);
  }
});

// ---------------------------------------------------------------- 2. amending bills' bracketed words

const bracketWords = (title) => /\((?!No\.?\s*\d+\))[^()]*[A-Za-z][^()]*\)/.exec(title)?.[0] ?? null;

test('a shortened bill name keeps its bracketed words, on the cover and in the X and Bluesky text', () => {
  const seen = [];
  for (const post of [...bills, defence]) {
    const cover = slide(post, 'cover');
    assert.ok(coverTitleFits(cover.title), `${post.subject}: the cover title is drawn whole, not cut with "…"`);
    const words = bracketWords(post.title);
    if (!words) continue;
    seen.push(post.subject);
    assert.ok(cover.title.includes(words), `${post.subject}: cover "${cover.title}" keeps ${words}`);
    assert.ok(post.record_text.includes(words), `${post.subject}: record_text keeps ${words}`);
  }
  assert.deepEqual(seen, ['bill:au-federal-r7530', 'bill:au-federal-s1515', 'bill:au-federal-r7378']);
  assert.equal(slide(editions.get('2026-11-15'), 'cover').title, 'Military… (Veterans’ Allied Health Care)');
  assert.equal(slide(editions.get('2026-11-05'), 'cover').title, 'News Journalism Payments (Consequential Amendments)');
});

test('the edition text keeps the clipped name the shipped apps hide, so 1.1.4 and 1.1.5 show nothing new', () => {
  // The apps drop a text paragraph that is the title's start ending in "…", or the title itself.
  for (const post of bills) {
    const paragraph = post.text.split('\n\n').at(-2);
    assert.ok(paragraph === post.title || (paragraph.endsWith('…') && post.title.startsWith(paragraph.slice(0, -1))), `${post.subject}: ${paragraph}`);
  }
});

test('shortTitle gives way before the brackets, then sheds the tail, and only then cuts at the end', () => {
  const name = 'Military Rehabilitation and Compensation Amendment (Veterans’ Allied Health Care) Bill 2026';
  const room = (n) => (text) => [...text].length <= n;
  assert.equal(shortTitle(name, room(200)), name);
  assert.equal(shortTitle(name, room(70)), 'Military Rehabilitation… (Veterans’ Allied Health Care) Bill 2026');
  assert.equal(shortTitle(name, room(55)), 'Military Rehabilitation… (Veterans’ Allied Health Care)');
  assert.equal(shortTitle(name, room(52)), 'Military… (Veterans’ Allied Health Care) Bill 2026');
  assert.equal(shortTitle(name, room(30)), 'Veterans’ Allied Health Care');
  assert.equal(shortTitle(name, room(20)), 'Military…');
  // "(No. 2)" is a number, not words to keep.
  assert.equal(shortTitle('Treasury Laws Amendment (Measures No. 2) Bill (No. 2) 2026', room(50)), 'Treasury Laws… (Measures No. 2) Bill (No. 2) 2026');
  assert.equal(shortTitle('Appropriation Bill (No. 2) 2026-2027 and its long companion title', room(30)), 'Appropriation Bill (No. 2)…');
});

// ---------------------------------------------------------------- 3. the chamber photograph

const photos = (post) => post.slides.map(s => s.photo).filter(Boolean);

test('a bill shows its own chamber: House bills the House, Senate bills the Senate, on every slide', () => {
  const expected = { 'bill:au-federal-r7530': 'house-chamber', 'bill:au-federal-r7528': 'house-chamber', 'bill:au-federal-s1517': 'senate-chamber', 'bill:au-federal-s1515': 'senate-chamber', 'bill:au-federal-r7378': 'house-chamber' };
  for (const post of [...bills, defence]) {
    assert.ok(photos(post).length >= 1, post.subject);
    assert.deepEqual([...new Set(photos(post))], [expected[post.subject]], post.subject);
  }
  // r7378 was introduced in the House: the House, though its deciding division was the Senate's.
  assert.equal(slide(defence, 'division').line.split(',')[0], 'Senate');
});

test('with no photograph of the bill\'s own chamber, the cover is drawn without one rather than the other chamber\'s', async () => {
  const catalogue = read('/social/photos.json');
  const houseOnly = { ...catalogue, photos: Object.fromEntries(Object.entries(catalogue.photos).filter(([id]) => id !== 'senate-chamber')) };
  const post = await compose('2026-11-15', 'bill', 'bill:au-federal-s1515', { '/social/photos.json': houseOnly });
  assert.equal(slide(post, 'cover').photo, null);
  assert.deepEqual(photos(post), []);
  assert.equal(slide(post, 'picture'), null, 'a picture slide needs a photograph: none of the wrong chamber');
  assert.doesNotMatch(`${post.caption}\n${post.channel_caption}`, /Photo/);
  assert.ok(slide(post, 'cover').title.includes('Veterans’ Allied Health Care'));
});

// ---------------------------------------------------------------- 4. no stored codes; margins with their year

/** Every string an edition carries, links taken out. */
const strings = (value) => typeof value === 'string' ? [value.replace(/https?:\/\/\S+/g, ' ')]
  : Array.isArray(value) ? value.flatMap(strings) : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];

test('no edition carries a stored code ("Fairly_safe", "ALP", a party history) in its text, captions, slides or alt', () => {
  for (const post of editions.values()) {
    for (const text of strings(post)) {
      assert.doesNotMatch(text, /\b[A-Za-z]+_[A-Za-z_]+\b/, `${post.subject}: ${text.slice(0, 120)}`);
      assert.doesNotMatch(text, /\bHeld by [^.,]+, (?:[A-Z.]{2,}|[^.]*;[^.]*)\./, `${post.subject}: ${text.slice(0, 120)}`);
    }
  }
});

test('a margin is given only with the election it is from', () => {
  let margins = 0;
  for (const post of editions.values()) {
    for (const text of strings(post)) {
      for (const sentence of text.split(/(?<=\.)\s+/).filter(s => /\bmargin\b/i.test(s))) {
        margins++;
        assert.match(sentence, /\bAt the (?:19|20)\d\d election\b/, `${post.subject}: ${sentence}`);
      }
    }
  }
  assert.ok(margins >= 4, 'the grant editions carry their seats\' margins');
  // 13 Nov: stored as "Held by Andrew Hastie, Liberal. Fairly_safe seat, margin 3.59 at the 2022 election."
  const seat = editions.get('2026-11-13').slides.filter(s => s.type === 'number').flatMap(s => s.lines).find(l => /^Held by/.test(l));
  assert.equal(seat, 'Held by Andrew Hastie, Liberal. At the 2022 election it was a fairly safe seat, margin 3.59%.');
});

test('the seat holder is the sitting member, and parties are named in words', () => {
  const electorates = read('/graph/grants.federal.json').electorates;
  const holder = (name) => seatHolder(electorates.find(e => e.n === name).mps);
  // The export lists every member a seat has had, oldest first: Perth's first is a member of 1923, Kooyong's of 1901.
  assert.deepEqual(holder('Perth'), { name: 'Patrick Gorman', party: 'Labor' });
  assert.deepEqual(holder('Kooyong'), { name: 'Monique Ryan', party: 'Independent' });
  for (const e of electorates.filter(e => e.t && e.c)) {
    const held = seatHolder(e.mps);
    if (held?.party) assert.doesNotMatch(held.party, /;|^(?!LNP$)[A-Z.\- ]+$/, e.n);
  }
  assert.equal(partyName('ALP'), 'Labor');
  assert.equal(partyName('A.L.P.'), 'Labor');
  assert.equal(partyName('KAP'), "Katter's Australian Party");
  assert.equal(partyName('WAP; LP from 1910'), '');
  assert.equal(partyName('ZZQ'), '');
  assert.equal(seatMargin({ 2019: [5.7, 'Liberal', 'fairly_safe'], 2022: [2.94, 'Independent', 'marginal'] }, 'Labor'), ' At the 2022 election it was a marginal Independent seat, margin 2.94%.');
  assert.equal(seatMargin({ 2022: [13.1, 'KAP', 'safe'] }, "Katter's Australian Party"), ' At the 2022 election it was a safe seat, margin 13.1%.');
  assert.equal(seatMargin({ 2022: [4, 'ZZQ', 'very_odd'] }), ' At the 2022 election the margin was 4%.');
  assert.equal(seatMargin({ latest: [4, 'Labor', 'safe'] }), '');
  assert.equal(seatMargin(null), '');
});
