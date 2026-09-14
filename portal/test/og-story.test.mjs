// The story slides (src/story.ts): a daily edition drawn as an Instagram
// carousel, one 1080x1350 JPEG per slide. The trees are rendered for real here
// (satori + resvg in Node, the fonts from public/fonts/og) so a layout that
// satori cannot lay out fails in the suite, not in the Worker. Then the route,
// with the rasteriser stubbed and a stored edition in a fake D1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';
import satori, { init as initSatori } from 'satori/wasm';
import initYoga from 'yoga-wasm-web';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { encode, decode } from 'jpeg-js';

const portal = new URL('../', import.meta.url);
const built = await build({ entryPoints: [new URL('src/og.ts', portal).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
const { storySlideTree, OG_FONT_FILES, PORTRAIT_WIDTH, PORTRAIT_HEIGHT } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const storyMod = await build({ entryPoints: [new URL('src/story.ts', portal).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
const { validStory, photosFor, photoFor, STORY_VERSION } = await import('data:text/javascript;base64,' + Buffer.from(storyMod.outputFiles[0].text).toString('base64'));

const yoga = await initYoga(readFileSync(new URL('node_modules/yoga-wasm-web/dist/yoga.wasm', portal)));
initSatori(yoga);
await initWasm(readFileSync(new URL('node_modules/@resvg/resvg-wasm/index_bg.wasm', portal)));
const fonts = OG_FONT_FILES.map(f => ({ name: f.name, weight: f.weight, style: f.style, data: readFileSync(new URL(`public/fonts/og/${f.file}`, portal)) }));
const uri = p => `data:image/jpeg;base64,${readFileSync(new URL(p, portal)).toString('base64')}`;
const photo = uri('public/social/photos/senate-chamber.jpg');
const inset = uri('public/photos/jpg/10352.jpg');
const credit = 'Photo: JJ Harrison, CC BY-SA 3.0, via Wikimedia Commons';

async function renderJpeg(slide, images = {}) {
  const svg = await satori(storySlideTree(slide, images), { width: PORTRAIT_WIDTH, height: PORTRAIT_HEIGHT, fonts });
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: PORTRAIT_WIDTH } });
  const rendered = r.render();
  try { return new Uint8Array(encode({ data: rendered.pixels, width: rendered.width, height: rendered.height }, 90).data); } finally { rendered.free(); r.free(); }
}

const slides = {
  cover: { type: 'cover', kicker: 'Bill · Treasury portfolio', title: 'A framework for moving cash', line: 'Cash Distribution Framework Bill 2026. Royal Assent 26 Aug 2026.', photo: 'senate-chamber', alt: 'The Senate chamber. A framework for moving cash.' },
  coverInset: { type: 'cover', kicker: 'Parliamentarian · Kennedy, Qld', title: 'Bob Katter', line: 'Katter’s Australian Party · House of Representatives · records 2000 to 2026', photo: 'parliament-house-flagpole', inset: '10352', insetCredit: 'Portrait: Parliament of Australia via OpenAustralia', alt: 'Parliament House with a portrait of Bob Katter.' },
  coverBare: { type: 'cover', kicker: 'Grant award · Geelong, Vic', title: 'Windsor Park, rebuilt', line: '$4 million from the Commonwealth to the City of Greater Geelong.', photo: null, alt: 'Windsor Park, rebuilt.' },
  number: { type: 'number', kicker: 'The award', title: 'What the record says', lines: ['Community Development Grants · Department of Infrastructure', 'Agreement from 12 Feb 2019 · Award GA34203'], value: '$11.3m', label: 'to The Trustee for the Qantas Foundation Memorial Trust', alt: 'The award: $11.3 million.' },
  picture: { type: 'picture', kicker: 'The purpose', title: 'What it was for', photo: 'senate-chamber', quote: '“Construct an airpark roof over four aircraft at the Qantas Founders Museum, Longreach, Qld”', lines: ['Category: Regional Development · Financial year 2018-19'], alt: 'What it was for.' },
  bars: { type: 'bars', kicker: 'What he talks about', title: 'Most common topic labels', lines: [], items: [{ label: 'Agriculture', pct: 27 }, { label: 'Mining & energy', pct: 19 }, { label: 'Climate & environment', pct: 16 }], note: 'Shares of labelled speeches; a speech can carry several labels.', alt: 'Topic labels.' },
  ledger: { type: 'ledger', kicker: 'The same trust', title: 'Three awards, two departments', lines: [], rows: [{ c1: '2017-18', c2: 'Protecting National Historic Sites · Climate Change, Energy, the Environment and Water', amount: '$77,770' }, { c1: '2018-19', c2: 'Airpark roof over four aircraft · Infrastructure', amount: '$11,300,000' }], total: { label: 'In the record', amount: '$11,729,541' }, alt: 'Three awards.' },
  timeline: { type: 'timeline', kicker: 'How it moved', title: 'Fifty-five days', lines: [], events: [{ date: '2 Jul 2026', text: 'Introduced in the House of Representatives' }, { date: '26 Aug 2026', text: 'Royal Assent · Act C2026A00069' }], alt: 'How it moved.' },
  division: { type: 'division', kicker: 'The only recorded division', title: 'Limiting debate, 34 to 26', ayes: 34, noes: 26, ayeParties: [['Labor', 24], ['Greens', 9], ['Independent', 1]], noParties: [['Liberal', 19], ['LNP', 3], ['One Nation', 3], ['Nationals', 1]], line: 'Senate, 20 Aug 2026. Party split from They Vote For You.', alt: 'The division.' },
  list: { type: 'list', kicker: 'What it does', title: 'In three sentences', items: ['The bill would create a legal framework for regulating cash distribution services in Australia.', 'The ACCC and the RBA would administer the framework.', 'The bill would commence the day after Royal Assent.'], note: 'Written by a model from the explanatory memorandum; not the record.', alt: 'What it does.' },
  source: { type: 'source', kicker: 'Check it', title: 'Every figure links to its record', rows: ['GrantConnect award GA34203, Department of Finance, CC BY 3.0 AU', 'A published award value, not evidence of payments received'], url: 'opax.com.au/money/grants', path: 'federal → recipient ABN 97 694 995 462 → award GA34203', alt: 'Check it.' },
};

// Flatten an element tree in document order; children are a string, one element or an array.
function walk(el, out = []) {
  if (!el || typeof el !== 'object') return out;
  out.push(el);
  const kids = el.props?.children;
  for (const k of Array.isArray(kids) ? kids : kids === undefined ? [] : [kids]) if (k && typeof k === 'object') walk(k, out);
  return out;
}
const texts = el => walk(el).map(n => n.props?.children).filter(c => typeof c === 'string');
const images = el => walk(el).filter(n => n.type === 'img');

test('every slide type renders as a 1080x1350 JPEG', async () => {
  for (const [name, slide] of Object.entries(slides)) {
    const imgs = slide.type === 'cover' && slide.photo ? { photo, credit, inset: slide.inset ? inset : null, insetCredit: slide.insetCredit } : slide.type === 'picture' ? { photo, credit } : {};
    const jpeg = await renderJpeg(slide, imgs);
    assert.deepEqual([...jpeg.subarray(0, 3)], [0xff, 0xd8, 0xff], `${name} is a JPEG`);
    const { width, height } = decode(jpeg, { useTArray: true, tolerantDecoding: true, maxMemoryUsageInMB: 512 });
    assert.deepEqual([width, height], [1080, 1350], `${name} is portrait`);
  }
});

test('the cover draws the photograph as a full-width band with the credit and a swipe cue; without one it is the engraving card', () => {
  const tree = storySlideTree(slides.cover, { photo, credit });
  const band = images(tree).find(n => n.props.src === photo);
  assert.ok(band, 'the photograph is drawn'); assert.equal(band.props.width, 1080); assert.equal(band.props.height, 960); assert.equal(band.props.style.objectFit, 'cover'); assert.match(String(band.props.style.maskImage), /^linear-gradient\(to bottom/, 'the photograph is feathered into the navy by a mask');
  assert.ok(walk(tree).some(n => typeof n.props?.style?.backgroundImage === 'string' && n.props.style.backgroundImage.startsWith('linear-gradient')), 'the wash runs into the navy');
  assert.ok(texts(tree).includes(credit), 'the credit line is on the footer');
  assert.ok(texts(tree).some(t => t.includes('Swipe')), 'the swipe cue');
  assert.ok(!texts(tree).includes(slides.cover.alt), 'alt text is never drawn');
  const bare = storySlideTree(slides.coverBare, {});
  assert.equal(images(bare).find(n => n.props.width === 1080), undefined, 'no band without a photograph');
  assert.ok(images(bare).some(n => n.props.width === 520), 'the engraving stands in');
  assert.ok(!texts(bare).some(t => t.startsWith('Photo:')), 'no credit for no photograph');
  const withInset = storySlideTree(slides.coverInset, { photo, credit, inset, insetCredit: slides.coverInset.insetCredit });
  const face = images(withInset).find(n => n.props.src === inset);
  assert.ok(face, 'the portrait inset'); assert.equal(face.props.width, 300);
  assert.ok(texts(withInset).some(t => t.includes('Portrait: Parliament of Australia')), 'both credits');
});

test('the number slide sets the figure at the card statistic size; the ledger and source clip long text on a word', () => {
  const number = storySlideTree(slides.number);
  const value = walk(number).find(n => n.props?.children === '$11.3m');
  assert.equal(value.props.style.fontSize, 176); assert.equal(value.props.style.color, '#D9A84A');
  const ledger = storySlideTree(slides.ledger);
  const c2 = texts(ledger).find(t => t.startsWith('Protecting National'));
  assert.ok(c2.endsWith('…'), 'a long description is clipped to two lines');
  assert.ok(texts(ledger).includes('$11,729,541'));
  const source = storySlideTree(slides.source);
  const path = texts(source).find(t => t.startsWith('federal'));
  assert.ok(!path.includes('→'), 'no arrow glyph: the faces do not carry one'); assert.ok(path.includes(' · '));
  assert.ok(images(source).some(n => n.props.width === 240 && n.props.style.position === 'absolute'), 'the engraving watermark');
});

test('validStory and the catalogue helpers guard what may be posted', () => {
  const story = [slides.cover, slides.number, slides.source];
  assert.ok(validStory(story));
  assert.equal(validStory([slides.number, slides.source]), false, 'must open with a cover');
  assert.equal(validStory([slides.cover, slides.number]), false, 'must close with the source');
  assert.equal(validStory([slides.cover, slides.source]), false, 'at least three');
  assert.equal(validStory([slides.cover, ...Array(9).fill(slides.number), slides.source]), false, 'at most ten');
  const catalogue = JSON.parse(readFileSync(new URL('public/social/photos.json', portal), 'utf8'));
  assert.deepEqual(photosFor(catalogue, 'bill:x', 'bill', 'senate')[0], 'senate-chamber');
  assert.deepEqual(photosFor(catalogue, 'grant:GA34203', 'grant'), ['qantas-founders-roof', 'qantas-founders-twilight']);
  assert.deepEqual(photosFor(catalogue, 'grant:GA1', 'grant'), [], 'grants have no default photograph');
  assert.equal(photoFor(catalogue, 'senate-chamber').credit, 'Photo: JJ Harrison, CC BY-SA 3.0, via Wikimedia Commons');
  assert.equal(photoFor({ ...catalogue, photos: { bad: { ...catalogue.photos['senate-chamber'], licence: 'All rights reserved' } } }, 'bad'), null, 'an unaccepted licence is never drawn');
  for (const p of Object.values(catalogue.photos)) assert.match(p.licence, /^(CC0|Public domain|CC BY(-SA)?( \d(\.\d)?)?( [A-Z]{2})?)$/, p.file);
});

test('the Worker serves /og/story/<date>/<n>.jpg from the stored edition, keyed on the slide text, and 404s otherwise', async () => {
  const renders = [];
  globalThis.__storyRenders = renders;
  const compiled = await build({ entryPoints: [new URL('src/index.ts', portal).pathname], bundle: true, platform: 'browser', format: 'esm', write: false, external: ['node:*'], plugins: [{ name: 'record-image-renderer', setup(b) {
    b.onResolve({ filter: /^\.\/og-render$/ }, () => ({ path: 'image-renderer', namespace: 'og-story-test' }));
    b.onLoad({ filter: /.*/, namespace: 'og-story-test' }, () => ({ contents: 'export async function renderOgPng(){return new Uint8Array([137,80,78,71])}; export async function renderOgJpeg(){return new Uint8Array([255,216,255,224])}; export async function renderStoryJpeg(slide,images,fonts){globalThis.__storyRenders.push({slide,images});return new Uint8Array([255,216,255,224,0,1])}', loader: 'js' }));
  } }] });
  const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('migrations/0005_social_publication.sql', portal), 'utf8'));
  const post = { date: '2026-09-15', kind: 'bill', subject: 'bill:au-federal-r7513', title: 'Cash Distribution Framework Bill 2026', url: 'https://opax.com.au/bill/au-federal-r7513', text: 'x', slides: [slides.cover, slides.list, slides.source] };
  sqlite.prepare('INSERT INTO social_editions VALUES(?,?,?,?)').run(post.date, post.subject, JSON.stringify(post), '2026-09-14T22:00:00Z');
  const db = { prepare(sql) { let args = []; return { bind(...a) { args = a; return this; }, async first() { return sqlite.prepare(sql).get(...args) ?? null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return { meta: { changes: 0 } }; } }; } };
  const store = new Map();
  globalThis.caches = { default: { async match(req) { return store.get(req.url); }, async put(req, res) { store.set(req.url, res); } } };
  const assets = [];
  const env = { CACHE_EPOCH: 'test-epoch', COMMUNITY_DB: db, GENERATION_CACHE: { async get() { return null; } }, ASSETS: { async fetch(req) { assets.push(new URL(req.url).pathname); if (req.url.endsWith('/social/photos.json')) return Response.json(JSON.parse(readFileSync(new URL('public/social/photos.json', portal), 'utf8'))); return new Response(new Uint8Array([1, 2, 3])); } } };
  const pending = [];
  const ctx = { waitUntil(p) { pending.push(p); } };
  const get = (url, method = 'GET') => worker.fetch(new Request(url, { method }), env, ctx);

  const one = await get('https://opax.com.au/og/story/2026-09-15/1.jpg');
  assert.equal(one.status, 200); assert.equal(one.headers.get('content-type'), 'image/jpeg');
  assert.equal(one.headers.get('x-opax-story'), '2026-09-15/1'); assert.equal(one.headers.get('x-opax-format'), 'portrait'); assert.equal(one.headers.get('x-opax-subject'), post.subject);
  assert.equal(one.headers.get('x-opax-cache'), 'MISS');
  assert.equal(renders.length, 1); assert.equal(renders[0].slide.type, 'cover');
  assert.ok(renders[0].images.photo.startsWith('data:image/jpeg;base64,'), 'the catalogue photograph is read from the asset store');
  assert.equal(renders[0].images.credit, 'Photo: JJ Harrison, CC BY-SA 3.0, via Wikimedia Commons');
  assert.ok(assets.includes('/social/photos/senate-chamber.jpg'));

  await Promise.all(pending);
  const head = await get('https://opax.com.au/og/story/2026-09-15/1.jpg', 'HEAD');
  assert.equal(head.status, 200); assert.equal(head.headers.get('x-opax-cache'), 'HIT'); assert.equal(head.headers.get('x-opax-story'), '2026-09-15/1');
  assert.equal(await head.text(), '', 'HEAD carries no body');
  assert.equal(renders.length, 1, 'a HIT does not draw again');
  const key = [...store.keys()][0];
  assert.match(key, new RegExp(`/story/test-epoch/\\d+/${STORY_VERSION}/2026-09-15/1/[0-9a-f]{8}$`), key);

  const three = await get('https://opax.com.au/og/story/2026-09-15/3.jpg');
  assert.equal(three.status, 200); assert.equal(renders.at(-1).slide.type, 'source'); assert.equal(renders.at(-1).images.photo, null, 'a type slide reads no photograph');
  for (const bad of ['https://opax.com.au/og/story/2026-09-15/4.jpg', 'https://opax.com.au/og/story/2026-09-15/0.jpg', 'https://opax.com.au/og/story/2026-09-15/11.jpg', 'https://opax.com.au/og/story/2026-02-30/1.jpg', 'https://opax.com.au/og/story/2026-09-15/1.png']) {
    const res = await get(bad);
    assert.ok(res.status === 404 || res.status === 503, `${bad}: ${res.status}`);
    assert.notEqual(res.headers.get('content-type'), 'image/jpeg', bad);
  }
});
