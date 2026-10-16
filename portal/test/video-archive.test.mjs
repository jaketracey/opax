// /video/senate: the Senate video archive (src/video-archive.ts). Grouping and order, the
// server-rendered kind filter, no empty sections, the click-to-play cards (no YouTube request
// before a press), the links in from /sitting and a person's first-speech card, navigation and
// the sitemap. Fixtures only: invented rows and names, an offline Worker over a scratch root.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, mkdir, writeFile, copyFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import jsdom from 'jsdom';
import {build} from 'esbuild';
import {wireVideoCards} from '../public/video-card.js';
import {deriveWeek} from '../public/hubs-data.js';
import {renderPersonAnswer} from '../src/seo-content.ts';
import {addVideoDiscovery, sitemapFiles} from '../../scripts/build_crawl_catalog.mjs';
import {loadWorker, offline, outbound} from './worker-harness.mjs';

const row = (id, title, kind, date, published, more = {}) => ({id, title, kind, date, published, chamber: 'senate', url: `https://www.youtube.com/watch?v=${id}`, ...more});
// Invented senators and titles. Ids are 11 characters, as YouTube's are.
const videos = [
  row('qtFix000001', 'Senate Question Time, 3 March 2026', 'question_time', '2026-03-03', '2026-03-03T08:00:00Z'),
  row('qtFix000002', 'Senate Question Time, 15 October 2026', 'question_time', '2026-10-15', '2026-10-16T01:00:00Z'),
  row('qtFix000003', 'Senate Question Time, 13 October 2026', 'question_time', '2026-10-13', '2026-10-13T07:00:00Z'),
  row('qtFix000004', 'Senate Question Time, 9 February 2021', 'question_time', '2021-02-09', '2021-02-09T07:00:00Z'),
  // No date in the title: it files under its upload day.
  row('qtFix000005', 'Senate Question Time', 'question_time', null, '2021-02-10T07:00:00Z'),
  row('fsFix000001', 'First speech: Senator Quill - 14 October 2026', 'first_speech', '2026-10-14', '2026-10-14T09:00:00Z', {person_slug: 'jane-quill', person_pid: '90001'}),
  row('fsFix000002', 'First speech: Senator Marlow - 2 March 2026', 'first_speech', '2026-03-02', '2026-03-02T09:00:00Z', {person_slug: null, person_pid: null}),
  row('otFix000001', '60 seconds in the Senate. Fixture explainer.', 'other', null, '2025-05-01T00:00:00Z'),
  row('otFix000002', 'Fixture lecture on the committee system', 'other', null, '2026-01-20T00:00:00Z'),
  {...row('badid', 'Malformed id', 'question_time', '2026-10-14', '2026-10-14T00:00:00Z')},
];
const data = {meta: {schema: 1, updated: '2026-10-16'}, videos};
const bySlug = new Map([['jane-quill', {name: 'Jane Quill'}]]);

const compile = async (entry) => {
  const compiled = await build({entryPoints: [new URL(entry, import.meta.url).pathname], bundle: true, platform: 'browser', format: 'esm', write: false, external: ['node:*'],
    plugins: [{name: 'omit-og', setup(b) { b.onResolve({filter: /^\.\/og-render$/}, () => ({path: 'renderer', namespace: 'video-archive-test'})); b.onLoad({filter: /.*/, namespace: 'video-archive-test'}, () => ({contents: 'export const renderOgPng=async()=>null; export const renderOgJpeg=renderOgPng;', loader: 'js'})); }}]});
  return import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
};
const {renderSenateVideo, groupVideos, senateVideoPage} = await compile('../src/video-archive.ts');
const {renderSittingIndex, renderSittingWeek} = await compile('../src/hubs.ts');
const ids = (html) => [...html.matchAll(/data-video-id="([^"]+)"/g)].map(m => m[1]);
const headings = (html, level) => [...html.matchAll(new RegExp(`<h${level}[^>]*>([^<]+)</h${level}>`, 'g'))].map(m => m[1]);

test('grouping: years newest first, then months newest first, then days; undated rows by upload day', () => {
  const groups = groupVideos(videos.filter(v => v.kind !== 'other'));
  assert.deepEqual(groups.map(([y]) => y), ['2026', '2021']);
  assert.deepEqual(groups[0][1].map(([m]) => m), ['2026-10', '2026-03']);
  assert.deepEqual(groups[0][1][0][1].map(v => v.id), ['qtFix000002', 'fsFix000001', 'badid', 'qtFix000003'], 'groupVideos sorts; the page drops the malformed id');
  assert.deepEqual(groups[1][1].map(([m, rows]) => [m, rows.map(v => v.id)]), [['2021-02', ['qtFix000005', 'qtFix000004']]]);

  const page = renderSenateVideo(data, null, bySlug);
  assert.equal(page.status, 200);
  assert.equal(page.title, 'Senate video');
  assert.deepEqual(headings(page.html, 1), ['Senate video']);
  assert.match(page.html, /<p class="ui-lede">Question Time and senators’ first speeches, as published by the Senate Public Information Office on YouTube\. The player loads only when you press play\.<\/p>/);
  assert.deepEqual(headings(page.html, 2), ['2026', '2021', 'Other Senate videos']);
  assert.deepEqual(headings(page.html, 3), ['October 2026', 'March 2026', 'February 2021']);
  assert.deepEqual(ids(page.html), ['qtFix000002', 'fsFix000001', 'qtFix000003', 'qtFix000001', 'fsFix000002', 'qtFix000005', 'qtFix000004'], 'the malformed id is dropped');
  // Year jumps, and the list of other videos, newest first, linked to YouTube under the Senate's own titles.
  assert.match(page.html, /<nav class="hub-jump" aria-label="Years"><ul class="hub-jump-list"><li><a href="#y2026">2026<\/a><\/li><li><a href="#y2021">2021<\/a><\/li><li><a href="#other-video">Other Senate videos<\/a><\/li><\/ul><\/nav>/);
  for (const id of ['y2026', 'y2021', 'm2026-10', 'm2026-03', 'm2021-02', 'other-video']) assert.match(page.html, new RegExp(`id="${id}"`));
  const others = page.html.split('id="other-video"')[1];
  assert.deepEqual([...others.matchAll(/<a href="([^"]+)" rel="noopener">([^<]+)<\/a>/g)].map(m => [m[1], m[2]]), [
    ['https://www.youtube.com/watch?v=otFix000002', 'Fixture lecture on the committee system'],
    ['https://www.youtube.com/watch?v=otFix000001', '60 seconds in the Senate. Fixture explainer.']]);
  assert.doesNotMatch(others, /data-video-card/, 'other videos are links, not cards');
  // The source line: the channel and the terms note.
  assert.match(page.html, /<span class="ui-source-name">AuSenate YouTube channel<\/span>/);
  assert.match(page.html, /href="https:\/\/www\.youtube\.com\/@AuSenate"/);
  assert.match(page.html, /never downloads, clips or re-hosts them/);
  assert.match(page.html, /<nav class="crumbs[^"]*"[\s\S]*?Senate video<\/span><\/li><\/ol><\/nav>/);
});

test('first-speech cards link a matched senator; an unmatched one shows its title only', () => {
  const html = renderSenateVideo(data, 'first-speech', bySlug).html;
  const card = (id) => html.match(new RegExp(`<figure class="video-card"[^>]*><div class="video-frame"><button[^>]*data-video-id="${id}"[\\s\\S]*?</figure>`))[0];
  assert.match(card('fsFix000001'), /<figcaption class="video-caption"><a href="https:\/\/www\.youtube\.com\/watch\?v=fsFix000001" rel="noopener">Watch on YouTube<\/a> · <a href="\/subject\/person\/jane-quill">Jane Quill<\/a><\/figcaption>/);
  assert.match(card('fsFix000002'), /<figcaption class="video-caption"><a [^>]*>Watch on YouTube<\/a><\/figcaption>/);
  assert.doesNotMatch(card('fsFix000002'), /\/subject\/person/);
  // A slug the roster no longer holds still links, under a plain label.
  assert.match(renderSenateVideo(data, 'first-speech').html, /<a href="\/subject\/person\/jane-quill">The senator’s page<\/a>/);
  assert.doesNotMatch(renderSenateVideo(data, 'question-time', bySlug).html, /\/subject\/person\//, 'Question Time cards carry no person');
});

test('kind filter: server-rendered links with the chosen chip marked, and only that kind below', () => {
  const chips = (html) => [...html.matchAll(/<a class="ui-chip" href="([^"]+)"( aria-current="true")?>([^<]+) <span class="video-kind-count">(\d+)<\/span><\/a>/g)].map(m => [m[3], m[1], m[4], !!m[2]]);
  assert.deepEqual(chips(renderSenateVideo(data, null).html), [
    ['All', '/video/senate', '9', true], ['Question Time', '/video/senate?kind=question-time', '5', false],
    ['First speeches', '/video/senate?kind=first-speech', '2', false], ['Other', '/video/senate?kind=other', '2', false]]);
  const qt = renderSenateVideo(data, 'question-time');
  assert.equal(qt.title, 'Senate video: Question Time');
  assert.deepEqual(chips(qt.html).filter(c => c[3]).map(c => c[0]), ['Question Time']);
  assert.deepEqual(ids(qt.html), ['qtFix000002', 'qtFix000003', 'qtFix000001', 'qtFix000005', 'qtFix000004']);
  assert.doesNotMatch(qt.html, /Other Senate videos|other-video/);
  const fs = renderSenateVideo(data, 'first-speech');
  assert.deepEqual(ids(fs.html), ['fsFix000001', 'fsFix000002']);
  assert.deepEqual(headings(fs.html, 2), ['2026'], 'no 2021 section: no first speech then');
  assert.doesNotMatch(fs.html, /hub-jump/, 'one year needs no jump links');
  const other = renderSenateVideo(data, 'other');
  assert.deepEqual(ids(other.html), []);
  assert.deepEqual(headings(other.html, 2), ['Other Senate videos']);
  assert.doesNotMatch(other.html, /data-video-card|video-year|hub-jump/);
  // An unknown kind is the whole page.
  assert.deepEqual(ids(renderSenateVideo(data, 'nonsense').html), ids(renderSenateVideo(data, null).html));
});

test('no empty sections: a kind without rows has no chip, heading or jump link', () => {
  const qtOnly = {meta: data.meta, videos: videos.filter(v => v.kind === 'question_time')};
  const html = renderSenateVideo(qtOnly, null).html;
  assert.doesNotMatch(html, /First speeches|kind=first-speech|kind=other|Other Senate videos|other-video/);
  assert.match(html, /kind=question-time/);
  for (const section of html.split('<section class="ui-section').slice(1)) assert.match(section, /data-video-card|<li>/, 'every section holds rows');
  // Chosen by address, a kind with no rows says so once and offers the whole list.
  const empty = renderSenateVideo(qtOnly, 'first-speech').html;
  assert.doesNotMatch(empty, /<section class="ui-section/);
  assert.match(empty, /<p class="video-empty">No videos of this kind yet\. <a href="\/video\/senate">All Senate video<\/a><\/p>/);
  const none = renderSenateVideo({meta: {}, videos: []}, null).html;
  assert.doesNotMatch(none, /<section class="ui-section|video-kinds|hub-jump/);
  assert.match(none, /No Senate videos are published here yet\./);
});

test('senateVideoPage survives a missing file', async () => {
  const page = await senateVideoPage(async () => { throw new Error('missing'); }, null);
  assert.equal(page.status, 200);
  assert.doesNotMatch(page.html, /data-video-card/);
});

const {JSDOM, requestInterceptor} = jsdom;
test('the archive page asks YouTube for nothing until a card is pressed', async () => {
  const urls = [];
  const resources = {interceptors: [requestInterceptor((request) => { urls.push(request.url); return new Response('', {status: 200, headers: {'content-type': 'text/html'}}); })]};
  const dom = new JSDOM(`<!doctype html><html><head></head><body><main>${renderSenateVideo(data, null, bySlug).html}</main></body></html>`,
    {url: 'https://opax.com.au/video/senate', resources, pretendToBeVisual: true});
  const {document} = dom.window;
  wireVideoCards(document);
  await new Promise(r => setTimeout(r, 20));
  assert.equal(document.querySelectorAll('button.video-facade').length, 7);
  assert.equal(document.querySelector('iframe'), null);
  assert.equal(document.querySelector('img'), null, 'no thumbnails');
  assert.deepEqual(urls.filter(u => /youtube|ytimg|google/.test(u)), [], 'before any press');
  assert.doesNotMatch(document.body.innerHTML, /youtube-nocookie|ytimg|youtube\.com\/embed/);
  document.querySelector('button.video-facade[data-video-id="fsFix000001"]').click();
  for (let i = 0; i < 50 && !urls.some(u => u.startsWith('https://www.youtube-nocookie.com/')); i++) await new Promise(r => setTimeout(r, 10));
  assert.equal(document.querySelectorAll('iframe').length, 1, 'only the pressed card plays');
  assert.equal(document.querySelector('iframe').src, 'https://www.youtube-nocookie.com/embed/fsFix000001?autoplay=1');
  assert.deepEqual(urls.filter(u => /youtube|ytimg|google/.test(u)), ['https://www.youtube-nocookie.com/embed/fsFix000001?autoplay=1']);
  dom.window.close();
});

test('links in: the sitting index, a sitting week and a person\'s first-speech card', async () => {
  const calendar = JSON.parse(await readFile(new URL('../../scripts/hubs/sitting-2026.json', import.meta.url), 'utf8'));
  const week = deriveWeek(calendar.periods.find(w => w.start === '2026-10-12'), [], [], calendar.updated);
  const hubData = {...calendar, snapshotDate: calendar.updated, billUpdated: '2026-10-04', latestFederalDivision: '2026-10-15', weeks: [week], pages: []};
  assert.match(renderSittingIndex(hubData, '2026-10-16', {}, videos).html, /<p class="hub-more"><a href="\/video\/senate">All Senate videos<\/a><\/p>/);
  assert.doesNotMatch(renderSittingIndex(hubData, '2026-10-16', {}, []).html, /\/video\/senate/, 'no videos, no link');
  const weekHtml = renderSittingWeek(hubData, week, [], new Map(), '2026-10-16', {}, {}, videos).html;
  const section = weekHtml.split('id="senate-video"')[1].split('</section>')[0];
  assert.match(section, /<p class="video-more"><a href="\/video\/senate#m2026-10">More Senate video<\/a><\/p>/);
  // The person's server answer, and the app's person page.
  const files = {'/video/senate.json': data};
  const read = async (path) => { if (!(path in files)) throw new Error('missing ' + path); return structuredClone(files[path]); };
  const quill = {name: 'Jane Quill', pid: '90001', chambers: ['senate'], first: 2026, last: 2026, current: true, speeches: 3, representation: []};
  const answer = (await renderPersonAnswer(quill, read, new Map([['Jane Quill', 'jane-quill']]))).html;
  assert.match(answer.split('id="ssr-first-speech"')[1], /^[\s\S]*?<p class="video-more"><a href="\/video\/senate\?kind=first-speech">All first speeches<\/a><\/p>[\s\S]*?<\/section>/);
  const other = {...quill, name: 'Cy Penn', pid: '90006'};
  assert.doesNotMatch((await renderPersonAnswer(other, read, new Map([['Cy Penn', 'cy-penn']]))).html, /All first speeches/);
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const firstSpeech = app.split('async function renderPersonFirstSpeech')[1].split('\n}\n')[0];
  assert.match(firstSpeech, /<p class="video-more"><a href="\/video\/senate\?kind=first-speech">All first speeches<\/a><\/p>/);
  assert.match(firstSpeech, /if \(currentSubjectKey !== key \|\| !slot\.isConnected \|\| !rows\.length\) \{ slot\.remove\(\); return; \}/, 'no card, no link');
});

test('navigation: Senate video sits in Parliament, in the menu, the footer index and the static footers', async () => {
  await import('../public/navigation.js');
  const nav = globalThis.OpaxNavigation;
  const chamber = nav.groups.find(g => g.id === 'parliament').columns.find(c => c.heading === 'In the chamber');
  assert.equal(chamber.links.find(l => l.href === '/video/senate')?.label, 'Senate video');
  assert.equal(nav.active('/video/senate'), 'parliament');
  assert.deepEqual(nav.trail('/video/senate').map(s => s.label), ['Senate video']);
  const parliamentFooter = nav.footerHTML().split('<div class="footer-col">').find(c => c.includes('>Parliament</h2>'));
  assert.match(parliamentFooter, /href="\/video\/senate"[^>]*>Senate video<\/a>/);
  for (const page of ['index.html', 'home.html', 'community.html']) {
    assert.match(await readFile(new URL(`../public/${page}`, import.meta.url), 'utf8'), /class="footer-link" href="\/video\/senate">Senate video<\/a>/, page);
  }
});

test('sitemap: /video/senate is a static entry dated by the file, and absent without playable rows', () => {
  const groups = {static: []};
  addVideoDiscovery(groups, data);
  assert.deepEqual(groups.static, [{path: '/video/senate', lastmod: '2026-10-16'}]);
  const files = sitemapFiles({static: groups.static});
  assert.match(files.files.map(f => f.body).join(''), /<loc>https:\/\/opax\.com\.au\/video\/senate<\/loc><lastmod>2026-10-16<\/lastmod>/);
  for (const empty of [null, {meta: {updated: '2026-10-16'}, videos: []}, {meta: {updated: '2026-10-16'}, videos: [{id: 'bad', chamber: 'senate'}]}]) {
    const none = {static: []};
    addVideoDiscovery(none, empty);
    assert.deepEqual(none.static, []);
  }
});

test('the real Worker serves /video/senate as a server page, offline, from a scratch root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opax-video-archive-'));
  const restore = offline();
  try {
    await copyFile(new URL('../public/index.html', import.meta.url), join(root, 'index.html'));
    await mkdir(join(root, 'video'));
    await writeFile(join(root, 'video', 'senate.json'), JSON.stringify(data));
    await writeFile(join(root, 'parliamentarians.json'), JSON.stringify({meta: {generated: '2026-10-16'}, people: [{name: 'Jane Quill', pid: '90001', speeches: 3, chambers: ['senate'], first: 2026, last: 2026, current: true, representation: []}]}));
    const worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, root);
    for (const [path, title] of [['/video/senate', 'Senate video · OPAX'], ['/video/senate?kind=first-speech', 'Senate video: First speeches · OPAX'], ['/video/senate/', 'Senate video · OPAX']]) {
      const response = await worker.fetch(path);
      assert.equal(response.status, 200, path);
      const html = await response.text();
      assert.match(html, new RegExp(`<title>${title.replace(/[?.]/g, '\\$&')}</title>`), path);
      assert.match(html, /<link rel="canonical" href="https:\/\/opax\.com\.au\/video\/senate">/, 'filtered views share the bare canonical');
      assert.match(html, /<link rel="stylesheet" href="\/hubs\.css">/);
      assert.match(html, /<script type="module" src="\/video-card\.js"><\/script>/);
      assert.doesNotMatch(html, /<script[^>]+src="\/app\.js/);
      assert.doesNotMatch(html.match(/<main\b[\s\S]*?<\/main>/)[0], /<iframe|youtube-nocookie\.com\/embed|ytimg/);
      assert.doesNotMatch(html, /youtube-nocookie\.com\/embed|ytimg|<link[^>]+youtube/, 'nothing preloads YouTube');
    }
    const quill = await (await worker.fetch('/video/senate?kind=first-speech')).text();
    assert.match(quill, /<a href="\/subject\/person\/jane-quill">Jane Quill<\/a>/);
    // Only the exact address: the data file is still an asset, and nothing else is claimed.
    assert.equal((await worker.fetch('/video/senate.json')).status, 200);
    assert.deepEqual(outbound, []);
  } finally {
    restore();
    await rm(root, {recursive: true, force: true});
  }
});
