// A bill's daily post, split in two. The apps read `text`, `caption` and `slides` and lay them out under their own
// "Machine-written" label, so those are what they were. The channels post their own copies: record facts on X and
// Bluesky (`record_text`), and a caption that opens with who wrote the summary on Facebook and Instagram
// (`channel_caption`). Nothing here posts anything or calls a channel. Names are invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const built = await build({ stdin: { contents: [
  "export * from './src/daily-post'",
  "export {publicationCopy} from './src/social-publication'",
  "export {widgetEdition} from './src/app-widget'",
  "export {storedEdition} from './src/app-edition'",
  "export {OG_VERSION} from './src/og'",
].join(';'), resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const { composeDailyPost, publicationCopy, widgetEdition, storedEdition, billStanding, billPostText, authoriseVicPost, xLength, X_LIMIT } = api;

const S1 = 'It would move the annual reporting date for registered entities to 1 July each year.';
const S2 = 'It would let the regulator grant a one-off extension.';
const S3 = 'It would commence on Royal Assent.';
const index = { bills: [
  // Introduced, no stage rail (one dated stage): the widget and the app's plate show the status alone.
  { key: 'au-federal-x1', title: 'Example Reporting Amendment Bill 2026', introduced: '2026-09-07', status: 'before_parliament', sponsor: 'EXAMPLE, Alex, MP', sponsor_party: 'Independent Members', has_summary: true },
  // Passed: the record holds the day it passed (19 Aug) and the day of assent (26 Aug), which is its status date.
  { key: 'au-federal-x2', title: 'Example Customs Bill 2026', introduced: '2026-03-01', status: 'passed', status_as_of: '2026-08-26', sponsor: '', portfolio: 'Home Affairs', has_summary: true },
  // Passed, but the record holds only the assent.
  { key: 'au-federal-x3', title: 'Example Levy Bill 2026', introduced: '2026-03-02', status: 'passed', status_as_of: '2026-08-27', sponsor: '', portfolio: 'Treasury', has_summary: true },
] };
const files = {
  'au-federal-x1': { summary: { sentences: [S1, S2, S3] }, key_dates: [{ stage: 'introduced', date: '2026-09-07', house: 'representatives' }] },
  'au-federal-x2': { summary: { sentences: [S1, S2] }, key_dates: [{ stage: 'introduced', date: '2026-03-01', house: 'representatives' }, { stage: 'passed', date: '2026-06-02', house: 'representatives' }, { stage: 'passed', date: '2026-08-19', house: 'senate' }, { stage: 'royal_assent', date: '2026-08-26', house: 'senate' }] },
  'au-federal-x3': { summary: { sentences: [S1] }, key_dates: [{ stage: 'introduced', date: '2026-03-02', house: 'representatives' }, { stage: 'third_reading', date: '2026-08-20', house: 'senate' }, { stage: 'royal_assent', date: '2026-08-27', house: 'Assent' }] },
};
const sources = key => ({ async asset(path) { if (path === '/bills/index.json') return { bills: index.bills.filter(b => b.key === key) }; const m = /^\/bills\/(.+)\.json$/.exec(path); return m ? files[decodeURIComponent(m[1])] ?? null : null; }, personTopics: async () => [], recent: async () => [] });
const compose = key => composeDailyPost('2026-11-17', sources(key), 'bill');
const row = post => ({ date: post.date, subject: post.subject, post_json: JSON.stringify(post), created_at: '2026-11-17T00:00:00Z' });
const without = ({ record_text: _a, channel_caption: _b, ...post }) => post;

test('what the apps read is what main wrote: text, caption and slides, and the app response never carries the channel copies', async () => {
  const post = await compose('au-federal-x1');
  assert.equal(post.subject, 'bill:au-federal-x1');
  // Main's short text: the summary sentence, the status, the bill's name, the link.
  assert.equal(post.text, `${S1}\n\nIntroduced 7 Sep 2026; before parliament.\n\nExample Reporting Amendment Bill 2026\n\nhttps://opax.com.au/bill/au-federal-x1`);
  // Main's caption: the sentence first, the marker in its last paragraph before the link.
  assert.equal(post.caption, [S1, 'Example Reporting Amendment Bill 2026', 'Introduced 7 Sep 2026 by Alex Example (Independent). Still before parliament.',
    `What else is in the bill?\n• ${S2}\n• ${S3}`, 'Read the bill, its progress and the source documents.', 'Machine-written summary; check the bill text for the full detail.', 'https://opax.com.au/bill/au-federal-x1'].join('\n\n'));
  // /api/app/v1/edition/latest is built from the stored post field by field (app-edition.ts): the same keys as before, and
  // the same value for each, whether or not the stored post carries the channel copies.
  const edition = storedEdition(row(post));
  assert.deepEqual(Object.keys(edition), ['date', 'kind', 'subject', 'title', 'text', 'url', 'caption', 'slides']);
  assert.deepEqual(edition, storedEdition(row(without(post))));
  assert.equal(JSON.stringify(edition), JSON.stringify(storedEdition(row(without(post)))), 'byte for byte');
  assert.ok(!JSON.stringify(edition).includes('Sponsor: Alex Example'), 'the record text is not in the app response');
  assert.equal(edition.text, post.text); assert.equal(edition.caption, post.caption);
  // The widget reads the same fields.
  const widget = widgetEdition(post, null);
  assert.deepEqual(widget, widgetEdition(without(post), null));
  // A bill with no stage rail: the summary sentence is printed in the body under its label, so the plate line is the status alone.
  assert.equal(widget.line, 'Introduced 7 Sep 2026; before parliament');
  assert.ok(!widget.line.includes('It would move'));
});

test('X and Bluesky post the record: the bill\'s name, where it stands and its sponsor, with no model sentence', async () => {
  const post = await compose('au-federal-x1');
  assert.equal(post.record_text, 'Example Reporting Amendment Bill 2026\n\nIntroduced 7 Sep 2026; before parliament.\n\nSponsor: Alex Example (Independent).\n\nhttps://opax.com.au/bill/au-federal-x1');
  const x = publicationCopy(post, 'x').text, bluesky = publicationCopy(post, 'bluesky').text;
  assert.ok(x.startsWith('Example Reporting Amendment Bill 2026\n\nIntroduced 7 Sep 2026; before parliament.\n\nSponsor: Alex Example (Independent).\n\nhttps://opax.com.au/bill/au-federal-x1?utm_source=x'), x);
  assert.equal(bluesky, 'Example Reporting Amendment Bill 2026\n\nIntroduced 7 Sep 2026; before parliament.\n\nSponsor: Alex Example (Independent).\n\n#auspol');
  for (const text of [x, bluesky]) { assert.ok(!text.includes('It would move') && !text.includes('Machine-written')); assert.doesNotMatch(text, /[–—]/); }
  assert.ok(xLength(x) <= X_LIMIT);
  assert.ok([...bluesky].length <= 300, 'Bluesky allows 300 graphemes');
  // An edition stored before the channel copies existed posts as it always did.
  const old = without(post);
  assert.ok(publicationCopy(old, 'x').text.startsWith(S1));
  assert.ok(publicationCopy(old, 'bluesky').text.startsWith(S1));
  assert.ok(publicationCopy(old, 'facebook').text.startsWith(S1));
});

test('Facebook and Instagram captions open "Machine-written summary: <sentence>" and say it once', async () => {
  const post = await compose('au-federal-x1');
  assert.equal(post.channel_caption, [`Machine-written summary: ${S1}`, 'Example Reporting Amendment Bill 2026', 'Introduced 7 Sep 2026 by Alex Example (Independent). Still before parliament.',
    `What else is in the bill?\n• ${S2}\n• ${S3}`, 'Read the bill, its progress and the source documents. Check the bill text for the full detail.', 'https://opax.com.au/bill/au-federal-x1'].join('\n\n'));
  for (const [channel, limit] of [['facebook', 4900 + 20], ['instagram', 2200]]) {
    const text = publicationCopy(post, channel).text;
    assert.ok(text.startsWith(`Machine-written summary: ${S1}\n\nExample Reporting Amendment Bill 2026`), channel);
    assert.equal(text.split('Machine-written summary').length - 1, 1, channel + ': said once');
    assert.ok(!text.includes('Machine-written summary;'), channel + ': the trailing paragraph is gone');
    // What that paragraph also said is kept.
    assert.ok(text.includes('Check the bill text for the full detail.'), channel);
    assert.ok(text.includes('Read the bill, its progress and the source documents.'), channel);
    assert.ok(text.length <= limit, channel + ' caption is ' + text.length);
    assert.doesNotMatch(text, /[–—]/, channel);
  }
  assert.match(publicationCopy(post, 'instagram').text, /Explore Example Reporting Amendment Bill 2026 at opax\.com\.au, link in bio\./);
});

test('"Passed <date>" is the day the record says the bill passed; an assent date is named Royal Assent and only when there is no passing day', async () => {
  const [, passed, assentOnly] = index.bills;
  // The record holds both: the last passing stage, not the later assent.
  assert.equal(billStanding(passed, files['au-federal-x2']), 'Passed 19 Aug 2026.');
  const post = await compose('au-federal-x2');
  assert.equal(post.record_text, 'Example Customs Bill 2026\n\nPassed 19 Aug 2026.\n\nHome Affairs portfolio.\n\nhttps://opax.com.au/bill/au-federal-x2');
  assert.ok(!post.record_text.includes('26 Aug'));
  assert.ok(post.channel_caption.includes('Passed 19 Aug 2026. Introduced 1 Mar 2026 (Home Affairs portfolio).'));
  assert.ok(!post.channel_caption.includes('26 Aug'));
  assert.ok(publicationCopy(post, 'x').text.includes('Passed 19 Aug 2026.'));
  // The record holds no passing stage, only the assent (a third reading in one house is not the bill passing).
  assert.equal(billStanding(assentOnly, files['au-federal-x3']), 'Royal Assent 27 Aug 2026.');
  const assent = await compose('au-federal-x3');
  assert.equal(assent.record_text, 'Example Levy Bill 2026\n\nRoyal Assent 27 Aug 2026.\n\nTreasury portfolio.\n\nhttps://opax.com.au/bill/au-federal-x3');
  assert.ok(assent.channel_caption.includes('Royal Assent 27 Aug 2026. Introduced 2 Mar 2026 (Treasury portfolio).'));
  for (const text of [assent.record_text, assent.channel_caption, publicationCopy(assent, 'x').text, publicationCopy(assent, 'bluesky').text, publicationCopy(assent, 'facebook').text]) assert.ok(!/Passed 27 Aug/.test(text), 'an assent date is never called Passed');
  // Neither stage in the record: the status date is named as what it is.
  assert.equal(billStanding(passed, { key_dates: [{ stage: 'introduced', date: '2026-03-01' }] }), 'Recorded as passed, as at 26 Aug 2026.');
  assert.equal(billStanding(passed, null), 'Recorded as passed, as at 26 Aug 2026.');
  assert.equal(billStanding({ ...passed, status_as_of: null }, null), null);
  assert.equal(billStanding(index.bills[0], files['au-federal-x1']), null, 'a bill that has not passed');
});

test('every string that states it says the same true sentence: the short text, the caption, the cover line and the cover alt', async () => {
  // Passed, with a passing day in the record: each app-facing string is main's string with the one sentence corrected.
  const post = await compose('au-federal-x2'), cover = post.slides[0];
  assert.equal(post.text, `${S1}\n\nPassed 19 Aug 2026.\n\nExample Customs Bill 2026\n\nhttps://opax.com.au/bill/au-federal-x2`);
  assert.equal(post.caption, [S1, 'Example Customs Bill 2026', 'Passed 19 Aug 2026. Introduced 1 Mar 2026 (Home Affairs portfolio).', `What else is in the bill?\n• ${S2}`,
    'Read the bill, its progress and the source documents.', 'Machine-written summary; check the bill text for the full detail.', 'https://opax.com.au/bill/au-federal-x2'].join('\n\n'));
  assert.equal(cover.line, `${S1} Passed 19 Aug 2026.`);
  assert.equal(cover.alt, `Example Customs Bill 2026. Machine-written summary: ${S1} Passed 19 Aug 2026.`, 'the alt text says who wrote the sentence');
  // Main wrote the assent day under "Passed" in all four; swapping that one sentence back gives main's strings exactly.
  const asMain = v => v.replaceAll('Passed 19 Aug 2026.', 'Passed 26 Aug 2026.');
  assert.equal(asMain(post.text), `${S1}\n\nPassed 26 Aug 2026.\n\nExample Customs Bill 2026\n\nhttps://opax.com.au/bill/au-federal-x2`);
  for (const text of [post.text, post.caption, cover.line, cover.alt, JSON.stringify(post.slides), post.record_text, post.channel_caption]) assert.ok(!text.includes('Passed 26 Aug'), 'the assent day is nowhere called the day it passed');
  // Only the assent in the record: "Royal Assent", in the same four places.
  const assent = await compose('au-federal-x3'), assentCover = assent.slides[0];
  assert.equal(assent.text, `${S1}\n\nRoyal Assent 27 Aug 2026.\n\nExample Levy Bill 2026\n\nhttps://opax.com.au/bill/au-federal-x3`);
  assert.ok(assent.caption.includes('\n\nRoyal Assent 27 Aug 2026. Introduced 2 Mar 2026 (Treasury portfolio).\n\n'));
  assert.equal(assentCover.line, `${S1} Royal Assent 27 Aug 2026.`);
  assert.ok(assentCover.alt.endsWith('Royal Assent 27 Aug 2026.'));
  for (const text of [assent.text, assent.caption, JSON.stringify(assent.slides)]) assert.doesNotMatch(text, /Passed \d/);
  // A bill before parliament: nothing changes at all.
  const before = await compose('au-federal-x1');
  assert.ok(before.text.includes('Introduced 7 Sep 2026; before parliament.') && before.slides[0].line.endsWith('Introduced 7 Sep 2026; before parliament.'));
  // The widget reads the cover line and the first paragraph together: the sentence is still printed once.
  const widget = widgetEdition(assent, null);
  assert.ok(widget && !String(widget.line ?? '').includes('It would move'));
  // An edition already posted is found by its date and subject, which the wording plays no part in.
  assert.equal(post.subject, 'bill:au-federal-x2'); assert.equal(post.date, '2026-11-17');
});

test('the marked fallback is a guard: reachable only for a bill with no dated fact, which the daily post never chooses', async () => {
  const url = 'https://opax.com.au/bill/example-1';
  const undated = billPostText({ key: 'example-1', title: 'Example Reporting Amendment Bill 2026', status: 'before_parliament' }, S1, '', '', url);
  assert.equal(undated, `Machine-written summary. ${S1}\n\nExample Reporting Amendment Bill 2026\n\n${url}`);
  assert.ok(xLength(undated) <= X_LIMIT);
  // The composer skips a bill with no introduction date, so the fallback does not fire from there.
  const none = await composeDailyPost('2026-11-17', { async asset(path) { return path === '/bills/index.json' ? { bills: [{ key: 'au-federal-x9', title: 'Undated Bill 2026', status: 'before_parliament', has_summary: true }] } : path === '/bills/au-federal-x9.json' ? { summary: { sentences: [S1] } } : null; }, personTopics: async () => [], recent: async () => [] }, 'bill');
  assert.ok(!none || none.kind !== 'bill' || none.subject !== 'bill:au-federal-x9');
  // A long name never pushes the record text over the limit.
  const long = billPostText({ key: 'example-1', title: 'An Example Bill With A Very Long Official Name '.repeat(6).trim() + ' 2026', status: 'before_parliament', introduced: '2026-03-01' }, S1, 'Introduced 1 Mar 2026; before parliament.', ' by Alex Example (Independent)', url);
  assert.ok(xLength(long) <= X_LIMIT && long.includes('Introduced 1 Mar 2026; before parliament.') && !long.includes(S1));
});

test('an authorised edition carries its approved line on the channel copies too', async () => {
  const post = authoriseVicPost(await compose('au-federal-x1'), true);
  assert.ok(post.authorisation);
  for (const text of [post.text, post.caption, post.record_text, post.channel_caption]) assert.equal(text.split(post.authorisation).length - 1, 1);
  assert.ok(post.record_text.endsWith(`${post.authorisation}\n\nhttps://opax.com.au/bill/au-federal-x1`));
  assert.ok(publicationCopy(post, 'x').text.includes(post.authorisation));
  assert.ok(publicationCopy(post, 'bluesky').text.includes(post.authorisation));
  assert.ok(publicationCopy(post, 'facebook').text.includes(post.authorisation));
  // Applied twice (once when composed, once when published): still one line each.
  const again = authoriseVicPost(post, true);
  assert.equal(again.record_text, post.record_text); assert.equal(again.channel_caption, post.channel_caption);
});

test('the share image is redrawn for links already shared, its alt text says who wrote the sentence, and public social copy has no em dash', () => {
  assert.equal(api.OG_VERSION, '9');
  const worker = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.ok(worker.includes("const summaryCard = !!meta.card?.kicker?.includes(MACHINE_SUMMARY_WORDS)"));
  assert.ok(worker.includes("clip(`${summaryCard ? MACHINE_SUMMARY_PREFIX : ''}${meta.card.title} on OPAX`, 120)"));
  for (const file of ['../src/social-publication.ts', '../src/daily-post.ts']) {
    const code = readFileSync(new URL(file, import.meta.url), 'utf8').split('\n').filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).map(line => line.replace(/\s\/\/ .*$/, '')).join('\n');
    const strings = code.match(/(['"`])(?:\\.|(?!\1)[^\\\n])*\1/g) ?? [];
    // An em dash in a string these files write into a post (a year range's en dash is not one).
    assert.deepEqual(strings.filter(s => /\u2014/.test(s)), [], file);
  }
});

test('a bill edition\'s cover slide carries the small "Machine-written summary" note; the other slides and other editions do not', async () => {
  const post = await compose('au-federal-x1'), cover = post.slides[0];
  assert.equal(cover.type, 'cover');
  assert.ok(cover.line.startsWith(S1), 'the cover line opens with the summary sentence');
  assert.equal(cover.note, 'Machine-written summary');
  for (const slide of post.slides.slice(1)) assert.ok(!('note' in slide) || slide.type === 'list', slide.type);
  // What the widget and the app's plate read off the cover is unchanged: the line, and nothing of the note.
  assert.equal(widgetEdition(post, null).line, 'Introduced 7 Sep 2026; before parliament');
  assert.ok(!JSON.stringify(widgetEdition(post, null)).includes('Machine-written'));
  // The app edition carries the slides as stored, so the cover has the one new key and every other value as before.
  const stored = storedEdition(row(post)).slides[0];
  const { note, ...rest } = stored;
  assert.equal(note, 'Machine-written summary');
  assert.deepEqual(Object.keys(rest), Object.keys(cover).filter(k => k !== 'note'));
});


// ---------------------------------------------------------------- with photographs
const catalogue = { photos: {
  senate: { file: '/social/photos/senate.jpg', width: 1200, height: 750, description: 'Senate', source_title: 'File:Senate.jpg', page: 'https://example.test/senate', author: 'Jo Sample', licence: 'CC BY-SA 3.0', credit: 'Photo: Jo Sample, CC BY-SA 3.0, via Wikimedia Commons' },
  house: { file: '/social/photos/house.jpg', width: 1200, height: 714, description: 'House', source_title: 'File:House.jpg', page: 'https://example.test/house', author: 'Kim Sample', licence: 'CC BY-SA 4.0', credit: 'Photo: Kim Sample, CC BY-SA 4.0, via Wikimedia Commons' },
}, subjects: {}, kinds: { 'bill:senate': ['senate', 'house'], 'bill:representatives': ['house', 'senate'], bill: ['senate', 'house'] } };
const pictured = key => { const base = sources(key); return { ...base, asset: async path => path === '/social/photos.json' ? catalogue : base.asset(path) }; };

test('every caption that goes out with a photograph carries its credit paragraph', async () => {
  for (const key of ['au-federal-x1', 'au-federal-x2', 'au-federal-x3']) {
    const post = await composeDailyPost('2026-11-17', pictured(key), 'bill');
    assert.ok(post.slides?.length >= 3 && post.slides[0].photo, key + ': the story has a photograph');
    const credit = /Photos?: (?:Jo|Kim) Sample, CC BY-SA \d\.0, via Wikimedia Commons\./;
    // The app-facing caption, as on main, and the channels' own caption: the credit is the paragraph before the link.
    for (const [name, text] of [['caption', post.caption], ['channel_caption', post.channel_caption]]) {
      const paragraphs = text.split('\n\n');
      assert.match(paragraphs.at(-2), credit, `${key} ${name}: the credit paragraph`);
      assert.equal(paragraphs.at(-1), post.url, `${key} ${name}: the link closes the caption`);
      assert.equal(text.split('via Wikimedia Commons').length - 1, paragraphs.at(-2).split('via Wikimedia Commons').length - 1, 'said once');
    }
    // What Facebook and Instagram are actually sent, with the slides they carry.
    for (const channel of ['facebook', 'instagram']) {
      const copy = publicationCopy(post, channel);
      assert.ok(copy.slides?.length >= 3, `${key} ${channel}: posts the photographs`);
      assert.match(copy.text, credit, `${key} ${channel}: the photo credit is in the caption`);
      assert.ok(copy.text.startsWith('Machine-written summary: '), channel);
    }
    // X and Bluesky post the single card with no slide photographs, and their text carries no credit, as on main.
    assert.doesNotMatch(publicationCopy(post, 'x').text, /Wikimedia/);
  }
  // No photograph, no credit paragraph: nothing is invented.
  const bare = await compose('au-federal-x1');
  assert.doesNotMatch(bare.channel_caption, /Photo/);
});

test('a bill\'s slides are what main draws from: the stored cover, list and source, with their photographs', async () => {
  const post = await composeDailyPost('2026-11-17', pictured('au-federal-x1'), 'bill');
  assert.deepEqual(post.slides.map(s => s.type), ['cover', 'list', 'source']);
  const [cover, list] = post.slides;
  assert.deepEqual({ type: cover.type, kicker: cover.kicker, title: cover.title, line: cover.line, photo: cover.photo, alt: cover.alt }, {
    type: 'cover', kicker: 'Bill · Alex Example (Independent)', title: 'Example Reporting Amendment',
    line: `${S1} Introduced 7 Sep 2026; before parliament.`, photo: 'senate',
    // The cover's alt says who wrote the sentence (this branch's third commit); everything else is as main stores it.
    alt: `Example Reporting Amendment Bill 2026. Machine-written summary: ${S1} Introduced 7 Sep 2026; before parliament.` });
  assert.deepEqual(list, { type: 'list', kicker: 'What it does', title: 'In three sentences', items: [S1, S2, S3], note: 'Written by a model from the explanatory memorandum; not the record.', alt: `What it does: ${S1} ${S2} ${S3}` });
  // The slides do not depend on the channel copies: the same with them taken off.
  assert.deepEqual(without(post).slides, post.slides);
  // A passed bill. On this branch the status sentence itself is corrected, so the stored cover says the day the bill
  // passed (19 Aug), not the assent day main stores (26 Aug), and its alt says who wrote the sentence. The cover and
  // the channel copy read the one sentence: if billSlides were handed anything else, this fails.
  const passed = await composeDailyPost('2026-11-17', pictured('au-federal-x2'), 'bill'), passedCover = passed.slides[0];
  assert.equal(passedCover.type, 'cover');
  assert.ok(passedCover.photo, 'the passed bill\'s cover has its photograph');
  assert.ok(passedCover.line.endsWith(' Passed 19 Aug 2026.'), passedCover.line);
  assert.equal(passedCover.line, `${S1} Passed 19 Aug 2026.`);
  assert.equal(passedCover.alt, `Example Customs Bill 2026. Machine-written summary: ${S1} Passed 19 Aug 2026.`);
  assert.ok(!JSON.stringify(passedCover).includes('26 Aug'), 'the assent day is not on the cover');
  assert.ok(passed.record_text.includes('Passed 19 Aug 2026.') && passed.text.includes('Passed 19 Aug 2026.'), 'the same sentence as the channel copy and the short text');
});

test('an em dash inside a stored summary sentence does not reach the channels\' caption; the app-facing strings keep the sentence as stored', async () => {
  const dashed = 'It would be run by three independent commissioners—including a First Nations commissioner.';
  const src = { ...sources('au-federal-x1'), asset: async path => path === '/bills/index.json' ? { bills: [index.bills[0]] } : path === '/bills/au-federal-x1.json' ? { ...files['au-federal-x1'], summary: { sentences: [dashed, 'It would report each year — to both houses.'] } } : null };
  const post = await composeDailyPost('2026-11-17', src, 'bill');
  assert.ok(post.channel_caption.startsWith('Machine-written summary: It would be run by three independent commissioners, including a First Nations commissioner.'));
  assert.ok(post.channel_caption.includes('• It would report each year, to both houses.'));
  for (const channel of ['facebook', 'instagram', 'x', 'bluesky']) assert.doesNotMatch(publicationCopy(post, channel).text, /[–—]/, channel);
  assert.ok(post.caption.startsWith(dashed), 'the app-facing caption is as stored');
  assert.ok(post.text.startsWith(dashed));
});

test('the donor reference is printed once when an edition stored in main\'s form is authorised by this code', async () => {
  const source = { id: 'donor:source-only', kind: 'reference', label: 'SOURCE, GRAHAM', source_name: 'SOURCE, GRAHAM', match: { confidence: 0, method: 'unresolved', href: null }, returnReferences: [{ return_type: 'GrantConnect source record; electoral identity unconfirmed', year: '2024-25', transaction_id: 'GA-FIXTURE-7', url: 'https://example.test/grant/7' }] };
  const fresh = { date: '2026-10-13', kind: 'grant', subject: 'fixture', title: source.label, text: 'A recorded grant award.', url: 'https://opax.test/subject/donor/SOURCE', donor: source,
    slides: [{ type: 'cover', kicker: 'Source', title: source.label, line: 'A grant award.', photo: null, alt: source.label }, { type: 'number', kicker: 'The award', title: 'What the record says', lines: ['One line.'], value: '$1', label: 'x', alt: 'x' }, { type: 'source', kicker: 'Check it', title: 'x', rows: ['A row.'], url: 'opax.com.au', alt: 'x' }] };
  // As this code writes it today: the reference with a comma, once in each place.
  const now = authoriseVicPost(fresh);
  const reference = /Source reference: SOURCE, GRAHAM, [^\n]*GA-FIXTURE-7[^\n.]*/.exec(now.text)[0];
  const count = (text, part) => text.split(part).length - 1;
  // The same edition as main stored it: every comma-form reference spelled with main's dash, joined with main's dash.
  const mainForm = reference.replace('SOURCE, GRAHAM, ', 'SOURCE, GRAHAM — ');
  const asMain = JSON.parse(JSON.stringify(now).replaceAll(JSON.stringify(reference).slice(1, -1) + '. ', JSON.stringify(mainForm).slice(1, -1) + ' — ').replaceAll(JSON.stringify(reference).slice(1, -1), JSON.stringify(mainForm).slice(1, -1)));
  assert.ok(asMain.text.includes(mainForm) && !asMain.text.includes(reference), 'the stored copy is in main\'s spelling');
  // Published after the deploy: authorised again by this code, as every publish does.
  const again = authoriseVicPost(asMain);
  for (const [name, text] of [['text', again.text], ['caption', again.caption], ['cover line', again.slides[0].line], ['cover alt', again.slides[0].alt], ['source rows', again.slides[2].rows.join('\n')], ['number lines', again.slides[1].lines.join('\n')]]) {
    assert.equal(count(text, 'GA-FIXTURE-7'), 1, name + ': the reference is there once: ' + text.slice(0, 200));
  }
  // The stored text keeps its fact and is not rebuilt around a second reference.
  assert.equal(again.text, asMain.text);
  assert.equal(again.caption, asMain.caption);
  assert.deepEqual(again.slides, asMain.slides);
  assert.ok(again.text.includes('A recorded grant award.'), 'the fact is still in the X text');
  // And an edition composed now is stable when authorised twice.
  assert.deepEqual(authoriseVicPost(now), now);
});
