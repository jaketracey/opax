// The portrait share card (1080x1350) Instagram gets instead of the landscape
// link preview: the same OgCard data stood upright. Pure tree assertions on
// src/og.ts, then the Worker route with the rasteriser stubbed out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const built = await build({ entryPoints: [new URL('../src/og.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
const { portraitTree, cardTree, ogLayout, ogFormat, homeCard, PORTRAIT_WIDTH, PORTRAIT_HEIGHT, OG_WIDTH, OG_HEIGHT, OG_VERSION } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AN//Z';
const politician = { kicker: 'Parliamentarian', title: 'Anthony Albanese', lines: ['Labor · House of Representatives', 'Collected records: 1998 to 2026'], stat: { value: '5,408', label: 'speeches in the Opax record' }, dot: '#D93025', portrait: PHOTO, credit: 'Photo: Commonwealth of Australia, CC BY 3.0 AU, via Wikimedia Commons' };
const bill = { kicker: 'Bill · Introduced 1 September 2026', title: 'Public Records Bill 2026', lines: ['Not yet introduced: an exposure draft released for consultation.', 'Read the text, the explanatory memorandum and every speech on it.'] };
const award = { kicker: 'GA576236 · Starts 2026-07-31', title: 'City of Greater Geelong', lines: ['The project will deliver two competition-compliant courts with lighting, run-off areas and line marking. It will also construct a dedicated warm-up and shooting area and redevelop the ageing amenities building.', 'Award value, not payments received.'], stat: { value: '$5.5M', label: 'published grant award' } };

// Flatten an element tree in document order; children are a string, one element or an array.
function walk(el, out = []) {
  if (!el || typeof el !== 'object') return out;
  out.push(el);
  const kids = el.props?.children;
  for (const k of Array.isArray(kids) ? kids : kids === undefined ? [] : [kids]) if (k && typeof k === 'object') walk(k, out);
  return out;
}
const textNode = (el, text) => walk(el).find(n => n.props?.children === text);
const images = el => walk(el).filter(n => n.type === 'img');
const engraving = el => images(el).find(n => n.props.width === 340);

test('a politician card stands the portrait large and centred over a big name and the statistic', () => {
  const tree = portraitTree(politician);
  assert.equal(tree.props.style.width, PORTRAIT_WIDTH); assert.equal(tree.props.style.height, PORTRAIT_HEIGHT);
  assert.equal(PORTRAIT_WIDTH / PORTRAIT_HEIGHT, 0.8, 'Instagram feed and grid are 4:5');
  const photo = images(tree).find(n => n.props.src === PHOTO);
  assert.ok(photo, 'the portrait is drawn'); assert.equal(photo.props.width, 400); assert.equal(photo.props.height, 400);
  const order = walk(tree);
  const title = textNode(tree, 'Anthony Albanese');
  assert.ok(order.indexOf(photo) < order.indexOf(title), 'the face comes before the name');
  assert.equal(title.props.style.fontFamily, 'Merriweather'); assert.equal(title.props.style.textAlign, 'center');
  const landscapeTitle = textNode(cardTree(politician), 'Anthony Albanese');
  assert.ok(title.props.style.fontSize > landscapeTitle.props.style.fontSize, `portrait title ${title.props.style.fontSize} reads at grid size, landscape ${landscapeTitle.props.style.fontSize}`);
  assert.ok(title.props.style.fontSize >= 96);
  const value = textNode(tree, '5,408');
  assert.equal(value.props.style.fontFamily, 'Public Sans'); assert.equal(value.props.style.fontWeight, 700); assert.ok(value.props.style.fontSize >= 96, 'the statistic is prominent');
  assert.ok(textNode(tree, 'speeches in the Opax record'));
  assert.ok(walk(tree).some(n => n.props?.style?.background === '#D93025'), 'the party dot');
  assert.ok(walk(tree).some(n => typeof n.props?.children === 'string' && n.props.children.startsWith('Photo: Commonwealth')), 'the Commons credit');
  assert.equal(engraving(tree), undefined, 'a portrait leaves no room for the engraving');
  for (const fixed of ['Open Parliamentary Accountability eXchange', 'OPAX.COM.AU', 'Parliamentarian']) assert.ok(textNode(tree, fixed), fixed);
});

test('a bill card sets the title big, left, and fills the room with the engraving', () => {
  const tree = portraitTree(bill);
  const title = textNode(tree, 'Public Records Bill 2026');
  assert.ok(title.props.style.fontSize >= 104, String(title.props.style.fontSize)); assert.equal(title.props.style.textAlign, 'left'); assert.equal(title.props.style.fontStyle, 'normal');
  assert.ok(engraving(tree), 'nothing better to draw');
  assert.equal(images(tree).length, 2, 'the mark and the engraving, no photograph');
  assert.ok(textNode(tree, bill.lines[0])); assert.ok(textNode(tree, bill.lines[1]));
  assert.ok(textNode(tree, bill.kicker));
  assert.equal(walk(tree).some(n => n.props?.style?.fontSize >= 84 && n.props?.style?.fontFamily === 'Public Sans'), false, 'no statistic block');
});

test('a grant award card makes the amount the largest figure and keeps the caveat line', () => {
  const tree = portraitTree(award);
  const value = textNode(tree, '$5.5M');
  assert.equal(value.props.style.fontSize, 132); assert.equal(value.props.style.color, '#D9A84A');
  assert.ok(textNode(tree, 'published grant award')); assert.ok(textNode(tree, 'GA576236 · Starts 2026-07-31')); assert.ok(textNode(tree, 'City of Greater Geelong'));
  assert.ok(textNode(tree, 'Award value, not payments received.'), 'the second line survives');
  const purpose = walk(tree).find(n => typeof n.props?.children === 'string' && n.props.children.startsWith('The project will deliver'));
  assert.ok(purpose, 'the purpose line is set, clipped to three rows if it must be');
  assert.equal(engraving(tree), undefined, 'the statistic takes the place of the engraving');
  const title = textNode(tree, 'City of Greater Geelong');
  assert.ok(title.props.style.fontSize >= 104, String(title.props.style.fontSize));
});

test('em dashes and long titles are handled the way the landscape card handles them', () => {
  const tree = portraitTree({ kicker: 'Associated entity', title: 'Transport Workers Union of Australia NSW QLD Interim Governance Branch formerly Transport Workers Union of Australia New South Wales Branch', lines: ['Linked to Labor — on the AEC register'] });
  const title = walk(tree).find(n => n.props?.style?.fontFamily === 'Merriweather');
  assert.equal(title.props.style.fontSize, 54); assert.ok(title.props.children.endsWith('…'), 'trimmed on a word boundary');
  assert.ok(textNode(tree, 'Linked to Labor, on the AEC register'), 'no em dashes in house style');
});

test('the layout table and the format parser leave the landscape card untouched', () => {
  assert.deepEqual([ogLayout('portrait').width, ogLayout('portrait').height], [1080, 1350]); assert.equal(ogLayout('portrait').tree, portraitTree);
  assert.deepEqual([ogLayout('landscape').width, ogLayout('landscape').height], [OG_WIDTH, OG_HEIGHT]); assert.equal(ogLayout('landscape').tree, cardTree);
  for (const value of [null, undefined, '', 'PORTRAIT', 'square', 'portrait ']) assert.equal(ogFormat(value), 'landscape', JSON.stringify(value));
  assert.equal(ogFormat('portrait'), 'portrait');
  const home = cardTree(homeCard());
  assert.equal(home.props.style.width, 1200); assert.equal(home.props.style.height, 630);
  assert.equal(OG_VERSION, '4', 'the landscape drawing did not change, so crawlers keep their cache');
});

test('the Worker draws ?format=portrait at 1080x1350, keys the cache on it and says so in a header', async () => {
  const renders = [];
  globalThis.__ogRenders = renders;
  const compiled = await build({ entryPoints: [new URL('../src/index.ts', import.meta.url).pathname], bundle: true, platform: 'browser', format: 'esm', write: false, external: ['node:*'], plugins: [{ name: 'record-image-renderer', setup(b) {
    b.onResolve({ filter: /^\.\/og-render$/ }, () => ({ path: 'image-renderer', namespace: 'og-portrait-test' }));
    b.onLoad({ filter: /.*/, namespace: 'og-portrait-test' }, () => ({ contents: 'export async function renderOgPng(card,fonts,format){globalThis.__ogRenders.push({kind:"png",format,card});return new Uint8Array([137,80,78,71])}; export async function renderOgJpeg(card,fonts,format){globalThis.__ogRenders.push({kind:"jpeg",format,card});return new Uint8Array([255,216,255,224])}', loader: 'js' }));
  } }] });
  const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  const store = new Map();
  globalThis.caches = { default: { async match(req) { return store.get(req.url); }, async put(req, res) { store.set(req.url, res); } } };
  const env = { CACHE_EPOCH: 'test-epoch', ASSETS: { async fetch() { return new Response(new Uint8Array(8)); } } };
  const pending = [];
  const ctx = { waitUntil(p) { pending.push(p); } };
  const get = url => worker.fetch(new Request(url), env, ctx);

  const portrait = await get('https://opax.com.au/og/home.jpg?format=portrait&v=' + OG_VERSION);
  assert.equal(portrait.status, 200); assert.equal(portrait.headers.get('content-type'), 'image/jpeg');
  assert.equal(portrait.headers.get('x-opax-og'), '/home'); assert.equal(portrait.headers.get('x-opax-format'), 'portrait');
  assert.deepEqual(renders.map(r => [r.kind, r.format]), [['jpeg', 'portrait']]);

  const landscape = await get('https://opax.com.au/og/home.jpg?v=' + OG_VERSION);
  assert.equal(landscape.status, 200); assert.equal(landscape.headers.get('x-opax-og'), '/home'); assert.equal(landscape.headers.get('x-opax-format'), null);
  const square = await get('https://opax.com.au/og/home.png?format=square');
  assert.equal(square.headers.get('x-opax-format'), null, 'any other format is landscape');
  assert.deepEqual(renders.map(r => r.format), ['portrait', 'landscape', 'landscape']);

  await Promise.all(pending);
  const keys = [...store.keys()];
  assert.equal(keys.filter(k => k.includes('format=portrait')).length, 1, keys.join('\n'));
  assert.equal(keys.length, 3, 'three distinct cache entries');
  const again = await get('https://opax.com.au/og/home.jpg?format=portrait&v=' + OG_VERSION);
  assert.equal(again.headers.get('x-opax-cache'), 'HIT'); assert.equal(again.headers.get('x-opax-format'), 'portrait');
  assert.equal(renders.length, 3, 'a HIT does not draw again');
});
