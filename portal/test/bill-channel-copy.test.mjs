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
