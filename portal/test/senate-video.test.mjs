// Senate video: the fetcher's parser, roster match and merge (scripts/senate_video/), the
// click-to-play card (public/video-card.js), the sitting and person renders, and the CSP.
// Fixtures only: no request leaves this process.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import jsdom from 'jsdom';
import {build} from 'esbuild';
import {parseTitle, parseDay, parseFeed, parsePlaylistPage, matchSenator, mergeRows, handbookSenators, toRow, CHANNEL_ID} from '../../scripts/senate_video/lib.mjs';
import {videoCardHTML, videoSectionHTML, sittingVideos, personVideos, wireVideoCards, embedUrl} from '../public/video-card.js';
import {deriveWeek} from '../public/hubs-data.js';
import {renderPersonAnswer} from '../src/seo-content.ts';

const feedXml = await readFile(new URL('./fixtures/senate-video/feed.xml', import.meta.url), 'utf8');
const calendar = JSON.parse(await readFile(new URL('../../scripts/hubs/sitting-2026.json', import.meta.url), 'utf8'));
// Invented people. Marlow is two different senators; Reed is a new senator the roster holds only from committee transcripts.
const roster = [
  {name: 'Jane Quill', pid: '90001', chambers: ['senate'], first: 2026, last: 2026, current: true, speeches: 3, representation: []},
  {name: 'Ana Marlow', pid: '90002', chambers: ['senate'], first: 2025, last: 2026, current: true, speeches: 9, representation: []},
  {name: 'Ben Marlow', pid: '90003', chambers: ['senate'], first: 2026, last: 2026, current: true, speeches: 2, representation: []},
  {name: 'Reed', full: 'Tamsin Reed', pid: '90004', chambers: ['senate_committee'], first: 2026, last: 2026, current: true, speeches: 4, representation: []},
  {name: 'Hal Ostrow', pid: '90005', chambers: ['senate'], first: 2004, last: 2016, current: false, speeches: 80, representation: []},
  {name: 'Cy Penn', pid: '90006', chambers: ['representatives'], first: 2026, last: 2026, current: true, speeches: 5, representation: []},
];
const handbook = {mpidOf: new Map([['90004', 'M904']]), senators: handbookSenators({current: [{id: 'M904', chamber: 'senate'}, {id: 'M905', chamber: 'representatives'}]})};

test('titles: both published patterns, the sitting date from the title, and odd titles fail soft', () => {
  assert.deepEqual(parseTitle('Senate Question Time, 15 October 2026', '2026-10-16T01:26:21+00:00'), {kind: 'question_time', date: '2026-10-15'});
  // The 12 Oct video was uploaded on the 13th: the page files it under the sitting day.
  assert.deepEqual(parseTitle('Senate Question Time, 12 October 2026', '2026-10-13T22:31:22+00:00'), {kind: 'question_time', date: '2026-10-12'});
  assert.deepEqual(parseTitle('Senate Question Time - 14 October 2026', '2026-10-14T07:45:20+00:00'), {kind: 'question_time', date: '2026-10-14'});
  assert.deepEqual(parseTitle('First speech: Senator Gatenby - 16 September 2026', '2026-09-16T07:38:51+00:00'), {kind: 'first_speech', date: '2026-09-16', speaker: 'Gatenby'});
  assert.deepEqual(parseTitle('First speech: Senator Jane Quill, 3 Sept 2026', '2026-09-04T00:00:00Z'), {kind: 'first_speech', date: '2026-09-03', speaker: 'Jane Quill'});
  assert.deepEqual(parseTitle('Senate Question Time', '2026-10-01T00:00:00Z'), {kind: 'question_time', date: null}, 'missing date');
  assert.deepEqual(parseTitle('Senate Question Time, 31 February 2026', '2026-03-01T00:00:00Z'), {kind: 'question_time', date: null}, 'impossible date');
  assert.deepEqual(parseTitle('Senate Question Time, 15 October 2027', '2026-10-16T00:00:00Z'), {kind: 'question_time', date: null}, 'a date after the upload is a typo');
  // Canberra is ahead of UTC: a same-day title uploaded the evening before (UTC) keeps its date.
  assert.equal(parseTitle('Senate Question Time, 16 October 2026', '2026-10-15T23:30:00Z').date, '2026-10-16');
  assert.deepEqual(parseTitle('First speech: Senator Quill', ''), {kind: 'first_speech', date: null, speaker: 'Quill'});
  assert.equal(parseTitle('Welcome to the Senate').kind, 'other');
  assert.equal(parseDay('Tuesday 15/10/2026'), '2026-10-15');
});

test('first-speech roster match: exact, ambiguous and unmatched all fail closed except the exact one', () => {
  assert.equal(matchSenator('Quill', '2026-09-16', roster)?.name, 'Jane Quill');
  assert.equal(matchSenator('Jane Quill', '2026-09-16', roster)?.name, 'Jane Quill');
  assert.equal(matchSenator('John Quill', '2026-09-16', roster), null, 'a different printed given name');
  assert.equal(matchSenator('Marlow', '2026-09-09', roster), null, 'two senators share the surname');
  assert.equal(matchSenator('Ana Marlow', '2026-09-09', roster)?.name, 'Ana Marlow', 'a given name settles it');
  assert.equal(matchSenator('Nobody', '2026-09-09', roster), null);
  assert.equal(matchSenator('Penn', '2026-09-09', roster), null, 'a member of the House is not a senator');
  assert.equal(matchSenator('Ostrow', '2026-09-09', roster), null, 'service years do not cover the speech');
  assert.equal(matchSenator('Quill', null, roster), null, 'no date, no match');
  // Committee-only roster row: a senator only through the APH Handbook, reached by pid.
  assert.equal(matchSenator('Reed', '2026-09-10', roster), null);
  assert.equal(matchSenator('Reed', '2026-09-10', roster, handbook)?.name, 'Reed');
  // Two rows with one pid are one person, not an ambiguity; the fuller row holds the page.
  const twins = [...roster, {name: 'Quill', full: 'Jane Quill', pid: '90001', chambers: ['senate_committee'], first: 2026, last: 2026, speeches: 1, representation: []}];
  assert.equal(matchSenator('Quill', '2026-09-16', twins)?.name, 'Jane Quill');
});

test('feed parse, then merge: accumulate, deduplicate by id, refresh titles, re-match later', () => {
  const items = parseFeed(feedXml);
  assert.equal(items.length, 7);
  assert.deepEqual(items[0], {id: 'qtFixture14', title: 'Senate Question Time - 14 October 2026', published: '2026-10-14T07:45:20+00:00'});
  assert.equal(items.at(-1).title, 'Welcome to the Senate & its committees');
  assert.throws(() => parseFeed(feedXml.replaceAll('QptchvNlCzMKsGPU8s_6UQ', 'Zzzzzzzzzzzzzzzzzzzzzz')), /another channel/);
  assert.throws(() => parseFeed('<html>blocked</html>'), /not an Atom feed/);
  const rows = mergeRows([], items, roster, handbook);
  assert.equal(rows.length, 7);
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.deepEqual(byId.fsQuill0916, {id: 'fsQuill0916', title: 'First speech: Senator Quill - 16 September 2026', published: '2026-09-16T07:38:51+00:00', kind: 'first_speech', date: '2026-09-16', chamber: 'senate', person_slug: 'jane-quill', person_pid: '90001', url: 'https://www.youtube.com/watch?v=fsQuill0916'});
  assert.equal(byId.fsMarlow909.person_slug, null);
  assert.equal(byId.fsMarlow909.person_pid, null);
  assert.equal(byId.fsNobody909.person_slug, null);
  assert.equal('person_slug' in byId.qtFixture12 || 'person_pid' in byId.qtFixture12, false, 'only first speeches carry a person');
  assert.equal(byId.qtUndated01.date, null);
  assert.deepEqual(rows.map(r => r.published), [...rows.map(r => r.published)].sort().reverse(), 'newest first');
  // Next night: the feed has moved on to two new videos and a retitled one; nothing staged is lost.
  const next = [{id: 'qtFixture15', title: 'Senate Question Time, 15 October 2026', published: '2026-10-16T01:26:21+00:00'},
    {id: 'qtFixture14', title: 'Senate Question Time, 14 October 2026', published: '2026-10-14T07:45:20+00:00'},
    {id: 'qtFixture15', title: 'Senate Question Time, 15 October 2026', published: '2026-10-16T01:26:21+00:00'}];
  const merged = mergeRows(rows, next, [...roster, {name: 'Nell Nobody', pid: '90007', chambers: ['senate'], first: 2026, last: 2026, current: true, representation: []}], handbook);
  assert.equal(merged.length, 8);
  assert.equal(new Set(merged.map(r => r.id)).size, 8);
  assert.equal(merged.find(r => r.id === 'qtFixture14').title, 'Senate Question Time, 14 October 2026');
  assert.equal(merged.find(r => r.id === 'fsNobody909').person_slug, 'nell-nobody', 'a roster that grew matches an earlier miss');
  assert.equal(toRow({id: 'bad id', title: 'x'}, roster), null);
  assert.deepEqual(parsePlaylistPage({items: [
    {snippet: {title: 'Senate Question Time, 9 September 2026', resourceId: {videoId: 'apiFixture1'}}, contentDetails: {videoId: 'apiFixture1', videoPublishedAt: '2026-09-09T09:00:00Z'}},
    {snippet: {title: 'Private video', resourceId: {videoId: 'apiFixture2'}}, contentDetails: {videoId: 'apiFixture2'}},
  ]}), [{id: 'apiFixture1', title: 'Senate Question Time, 9 September 2026', published: '2026-09-09T09:00:00Z'}]);
  assert.equal(CHANNEL_ID, 'UCQptchvNlCzMKsGPU8s_6UQ');
});

const rows = mergeRows([], parseFeed(feedXml), roster, handbook);

const {JSDOM, requestInterceptor} = jsdom;
// Records every subresource the document asks for, and answers each with an empty body: none reaches the network.
const recorder = () => {
  const urls = [];
  return {urls, resources: {interceptors: [requestInterceptor((request) => { urls.push(request.url); return new Response('', {status: 200, headers: {'content-type': 'text/html'}}); })]}};
};

test('facade: nothing from YouTube before a press; the nocookie player after it, titled and focused', async () => {
  const loader = recorder();
  const card = rows.find(r => r.id === 'qtFixture12');
  const dom = new JSDOM(`<!doctype html><html><head></head><body><main>${videoSectionHTML('Senate Question Time', [card])}</main></body></html>`,
    {url: 'https://opax.com.au/sitting/2026-10-12', resources: loader.resources, pretendToBeVisual: true});
  const {document} = dom.window;
  wireVideoCards(document);
  await new Promise(r => setTimeout(r, 20));
  const button = document.querySelector('button.video-facade');
  assert.ok(button, 'a real button');
  assert.equal(button.type, 'button');
  assert.match(button.textContent, /Play video: Senate Question Time, 12 October 2026/);
  assert.match(button.textContent, /12 Oct 2026 · Australian Senate · YouTube/);
  assert.equal(document.querySelector('iframe'), null);
  assert.equal(document.querySelector('img'), null, 'no thumbnail');
  assert.equal(document.querySelector('svg.video-play').getAttribute('aria-hidden'), 'true');
  const link = document.querySelector('.video-caption a');
  assert.equal(link.textContent, 'Watch on YouTube');
  assert.equal(link.href, 'https://www.youtube.com/watch?v=qtFixture12');
  assert.equal(loader.urls.filter(u => /youtube|ytimg|google/.test(u)).length, 0, `before play: ${loader.urls}`);
  assert.doesNotMatch(document.documentElement.outerHTML.replace(/<a [^>]*>Watch on YouTube<\/a>/, ''), /youtube-nocookie|ytimg|i\d?\.ytimg|youtube\.com\/embed/);
  // Keyboard activation is the native button's: Enter and Space both dispatch click.
  button.focus();
  button.click();
  await new Promise(r => setTimeout(r, 20));
  const iframe = document.querySelector('iframe');
  assert.ok(iframe);
  assert.equal(iframe.src, 'https://www.youtube-nocookie.com/embed/qtFixture12?autoplay=1');
  assert.equal(iframe.src, embedUrl('qtFixture12'));
  assert.equal(iframe.title, 'Senate Question Time, 12 October 2026 (YouTube video player)');
  assert.match(iframe.getAttribute('allow'), /autoplay/);
  assert.equal(document.activeElement, iframe, 'focus follows the player');
  assert.equal(document.querySelector('button.video-facade'), null);
  assert.ok(document.querySelector('[data-video-card]').hasAttribute('data-playing'));
  for (let i = 0; i < 50 && !loader.urls.some(u => u.startsWith('https://www.youtube-nocookie.com/')); i++) await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(loader.urls.filter(u => /youtube|ytimg|google/.test(u)), ['https://www.youtube-nocookie.com/embed/qtFixture12?autoplay=1'], 'the press makes the first and only YouTube request');
  assert.ok(document.querySelector('link[data-video-card-style][href="/video-card.css"]'));
  dom.window.close();
});

test('card markup escapes titles and refuses a malformed id', () => {
  assert.equal(videoCardHTML({id: 'javascript:1', title: 'x', kind: 'other'}), '');
  const html = videoCardHTML({id: 'qtFixture12', title: '<img src=x onerror=bad>', kind: 'question_time', date: '2026-10-12'});
  assert.doesNotMatch(html, /<img/);
  assert.equal(videoSectionHTML('Senate Question Time', []), '', 'no rows, no section');
});

// The hubs module through esbuild, as growth-hubs.test.mjs loads it.
const compile = async (entry) => {
  const compiled = await build({entryPoints: [new URL(entry, import.meta.url).pathname], bundle: true, platform: 'browser', format: 'esm', write: false, external: ['node:*'],
    plugins: [{name: 'omit-og', setup(b) { b.onResolve({filter: /^\.\/og-render$/}, () => ({path: 'renderer', namespace: 'video-test'})); b.onLoad({filter: /.*/, namespace: 'video-test'}, () => ({contents: 'export const renderOgPng=async()=>null; export const renderOgJpeg=renderOgPng;', loader: 'js'})); }}]});
  return import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
};
const {renderSittingWeek, renderSittingIndex, hubPage} = await compile('../src/hubs.ts');
const period = calendar.periods.find(w => w.start === '2026-10-12');
const september = calendar.periods.find(w => w.start === '2026-09-14');
const week = deriveWeek(period, [], [], calendar.updated);
const quiet = deriveWeek(september, [], [], calendar.updated);
const hubData = {...calendar, snapshotDate: calendar.updated, billUpdated: '2026-10-04', latestFederalDivision: '2026-10-15', weeks: [quiet, week], pages: []};

test('sitting week: one Question Time card per sitting day with a video; none, and no heading, without', () => {
  const page = renderSittingWeek(hubData, week, [], new Map(), '2026-10-16', {}, {}, rows);
  const cards = [...page.html.matchAll(/data-video-id="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(cards, ['qtFixture12', 'qtFixture14'], 'day order; the undated upload and first speeches stay off');
  assert.match(page.html, /<h2 class="ui-section-title">Senate Question Time<\/h2>/);
  assert.match(page.html, /only when you press play/);
  assert.doesNotMatch(page.html, /<iframe|youtube-nocookie|ytimg/);
  for (const html of [renderSittingWeek(hubData, quiet, [], new Map(), '2026-10-16', {}, {}, rows).html, renderSittingWeek(hubData, week, [], new Map(), '2026-10-16').html]) {
    assert.doesNotMatch(html, /data-video-card|Senate Question Time<\/h2>|senate-video/);
  }
  const index = renderSittingIndex(hubData, '2026-10-16', {}, rows).html;
  const row = (start) => /<li><div><h2 class="ui-row-title"><a href="\/sitting\/([\d-]+)">[\s\S]*?<\/li>/g[Symbol.matchAll](index).find(m => m[1] === start)[0];
  const [sept, oct] = [row('2026-09-14'), row('2026-10-12')];
  assert.doesNotMatch(sept, /hub-video-mark/);
  assert.match(oct, /<span class="hub-video-mark">Video<span class="visually-hidden">: Senate Question Time on 2 sitting days<\/span><\/span>/);
});

test('hubPage reads the staged video file and survives its absence', async () => {
  const files = {'/hubs/index.json': hubData, '/video/senate.json': {meta: {}, videos: rows}};
  const read = async (path) => { if (!(path in files)) throw new Error('missing ' + path); return structuredClone(files[path]); };
  assert.match((await hubPage('sitting', '2026-10-12', read, [], new Map(), '2026-10-16')).html, /data-video-id="qtFixture14"/);
  delete files['/video/senate.json'];
  const bare = await hubPage('sitting', '2026-10-12', read, [], new Map(), '2026-10-16');
  assert.equal(bare.status, 200);
  assert.doesNotMatch(bare.html, /data-video-card/);
});

test('person page: a matched senator gets a First speech card; others get no section', async () => {
  const files = {'/video/senate.json': {meta: {}, videos: rows}};
  const read = async (path) => { if (!(path in files)) throw new Error('missing ' + path); return structuredClone(files[path]); };
  const slugs = new Map(roster.map(p => [p.name, p.name.toLowerCase().replace(/\s+/g, '-')]));
  const quill = (await renderPersonAnswer(roster[0], read, slugs)).html;
  assert.match(quill, /<h2 class="ui-section-title">First speech<\/h2>/);
  assert.match(quill, /data-video-id="fsQuill0916"/);
  assert.doesNotMatch(quill, /<iframe/);
  for (const p of [roster[1], roster[2], roster[5]]) assert.doesNotMatch((await renderPersonAnswer(p, read, slugs)).html, /First speech<\/h2>|data-video-card/, p.name);
  assert.equal(personVideos(rows, null).length, 0, 'no slug, no match');
  // The same senator listed under a second, full-name row (the electorate reference's): same pid, own slug.
  const second = {name: 'Tamsin Reed', pid: '90004', chambers: ['senate'], first: null, last: null, current: true, representation: [{electorate: 'Tasmania', jurisdiction: 'federal', chamber: 'senate'}]};
  const reedRows = mergeRows([], [{id: 'fsReed00910', title: 'First speech: Senator Reed - 10 September 2026', published: '2026-09-10T08:00:00Z'}], roster, handbook);
  assert.equal(reedRows[0].person_slug, 'reed');
  assert.deepEqual(personVideos(reedRows, 'tamsin-reed', second).map(v => v.id), ['fsReed00910'], 'pid, with the surname in the title');
  assert.equal(personVideos(reedRows, 'someone-else', {...second, pid: '90009'}).length, 0, 'another pid');
  assert.equal(personVideos([{...reedRows[0], title: 'First speech: Senator Penn - 10 September 2026'}], 'x', second).length, 0, 'a pid without the surname in the title fails closed');
  const files2 = {'/video/senate.json': {meta: {}, videos: reedRows}};
  const read2 = async (path) => { if (!(path in files2)) throw new Error('missing ' + path); return structuredClone(files2[path]); };
  assert.match((await renderPersonAnswer(second, read2, new Map([['Tamsin Reed', 'tamsin-reed'], ['Reed', 'reed']]))).html, /data-video-id="fsReed00910"/);
  assert.equal(sittingVideos(rows, '2026-10-12', '2026-10-15').length, 2);
});

test('CSP: frame-src gains youtube-nocookie.com and nothing broader, in _headers and the Worker', async () => {
  const headers = await readFile(new URL('../public/_headers', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  const csp = /Content-Security-Policy: (.+)/.exec(headers)[1];
  const directive = (policy, name) => policy.split(';').map(s => s.trim()).find(s => s.startsWith(name + ' '));
  assert.equal(directive(csp, 'frame-src'), 'frame-src https://www.googletagmanager.com https://www.youtube-nocookie.com');
  assert.doesNotMatch(csp.replace('https://www.youtube-nocookie.com', ''), /youtube|ytimg|\*\.google\.com/);
  assert.match(worker, /const YOUTUBE_EMBED = 'https:\/\/www\.youtube-nocookie\.com'\n/);
  assert.match(worker, /`frame-src \$\{GTM\} \$\{YOUTUBE_EMBED\}`,/);
  assert.equal((worker.match(/YOUTUBE_EMBED/g) || []).length, 2, 'used in frame-src only');
  assert.doesNotMatch(worker.replace(/^\/\/.*$/gm, ''), /youtube\.com(?!\/)|\*\.youtube/);
});
