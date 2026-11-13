import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanEvent, beforeSend, safePath, automationReason, likelyBot, whenMeasurable } from '../analytics/privacy.mjs';

test('search recovery adds only a boolean and a fixed category, never queries or corrections',()=>{
 const existing={page:1,result_count:0,total_count:0,duration_ms:42};
 for(const kind of ['did_you_mean','scope','ask','none'])assert.deepEqual(
  cleanEvent('opax_search_completed',{...existing,had_suggestion:kind!=='none',suggestion_kind:kind,query:'private question',suggestions:['private correction'],suggestion_label:'private',suggestion_href:'/ask?q=private'}),
  {...existing,had_suggestion:kind!=='none',suggestion_kind:kind});
 assert.deepEqual(cleanEvent('opax_search_completed',{had_suggestion:'private',suggestion_kind:'private'}),{});
});

test('queries, hash query parameters and unrecognized routes are not collected', () => {
  assert.equal(safePath('/search?q=private&speaker=someone#answer'), '/search');
  assert.equal(safePath('https://opax.com.au/#/ask?q=private'), '/ask');
  assert.equal(safePath('/private-input'), '/other');
  assert.deepEqual(cleanEvent('opax_view', { page_path: '/search?q=private', page_title: 'private', page_section: 'search' }), { page_path: '/search', page_section: 'search' });
});
test('event properties are allowlisted and SDK enrichment is sanitized', () => {
  assert.equal(cleanEvent('unexpected', { question: 'private' }), null);
  assert.deepEqual(cleanEvent('opax_ask_completed', { source_count: 3, answer: 'private', has_answer: true }), { source_count: 3, has_answer: true });
  const event = beforeSend({ properties: { $current_url: 'https://opax.com.au/search?q=private', $referrer: 'https://example.com/private', $referring_domain: 'example.com', $initial_referring_domain: 'private', $initial_current_url: 'private', $set: { $initial_current_url: 'private' }, $title: 'private', query_length: 7, search_kind: 'speech' } });
  assert.equal(event.properties.$current_url, 'https://opax.com.au/search');
  assert.equal(event.properties.query_length, 7);
  assert.equal(event.properties.search_kind, 'speech');
  assert.equal(event.properties.$referring_domain, 'example.com');
  assert.equal(event.properties.$referrer, undefined);
  assert.ok(!JSON.stringify(event).includes('private'));
});
test('the three campaign tags on Opax links survive when they are plain slugs; everything else campaign-shaped is dropped', () => {
  const event = beforeSend({ properties: { $current_url: 'https://opax.com.au/bill/x?utm_source=bluesky&utm_medium=social&utm_campaign=daily_record&utm_content=2026-09-26', utm_source: 'bluesky', utm_medium: 'social', utm_campaign: 'daily_record', utm_content: '2026-09-26', utm_term: 'private', gclid: 'private', fbclid: 'private', $client_session_initial_utm_source: 'private', $set_once: { $initial_utm_source: 'private' } } });
  assert.deepEqual([event.properties.utm_source, event.properties.utm_medium, event.properties.utm_campaign], ['bluesky', 'social', 'daily_record']);
  assert.equal(event.properties.utm_content, undefined);
  assert.equal(event.properties.$current_url, 'https://opax.com.au/bill/x');
  assert.ok(!JSON.stringify(event).includes('private'));
  const free = beforeSend({ properties: { $current_url: 'https://opax.com.au/', utm_source: 'my name is private', utm_campaign: 'x'.repeat(41), utm_medium: 7 } });
  assert.equal(free.properties.utm_source, undefined);
  assert.equal(free.properties.utm_campaign, undefined);
  assert.equal(free.properties.utm_medium, undefined);
});
test('a reader\'s search words in the page title, session-entry copies of free tags and ad click ids never leave the browser', () => {
  const event = beforeSend({ properties: { $current_url: 'https://opax.com.au/ask', title: 'Search: private words · OPAX', $title: 'private', utm_source: 'bluesky',
    $session_entry_utm_source: 'bluesky', $session_entry_utm_medium: 'social', $session_entry_utm_campaign: 'daily_record', $session_entry_utm_term: 'private', $session_entry_utm_content: 'private',
    $session_entry_url: 'https://opax.com.au/ask?q=private', $session_entry_referrer: 'https://example.com/private', $session_entry_host: 'opax.com.au', $session_entry_pathname: '/private-typed-path',
    $prev_pageview_pathname: '/private-typed-path', igshid: 'private', ttclid: 'private', li_fat_id: 'private', gad_source: 'private', gbraid: 'private', wbraid: 'private', mc_cid: 'private', _kx: 'private', twclid: 'private', rdt_cid: 'private' } });
  const p = event.properties;
  assert.deepEqual([p.$session_entry_utm_source, p.$session_entry_utm_medium, p.$session_entry_utm_campaign, p.utm_source], ['bluesky', 'social', 'daily_record', 'bluesky']);
  assert.equal(p.$session_entry_host, 'opax.com.au');
  assert.equal(p.$session_entry_pathname, '/other');
  assert.equal(p.$prev_pageview_pathname, '/other');
  assert.equal(p.title, undefined);
  assert.ok(!JSON.stringify(event).includes('private'), JSON.stringify(event));
});
// PostHog used to run first so it heard the first view; it now runs after the
// app (the first route is not queued behind it) and replays from opaxAnalyticsLog.
test('PostHog runs after the shared event emitter and the app scripts, all deferred', () => {
  const index = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../public/home.html', import.meta.url), 'utf8');
  assert.match(index, /src="\/analytics.js\?v=[^"]+" defer/);
  assert.match(index, /src="\/events.js\?v=[^"]+" defer/);
  assert.ok(index.indexOf('src="/analytics.js') > index.indexOf('src="/events.js'));
  assert.ok(index.indexOf('/analytics.js?v=') > index.indexOf('/app.js?v='));
  assert.ok(home.indexOf('/analytics.js?v=') > home.indexOf('/home.js?v='));
});


function browserHarness(dnt = '0', nav = {}, win = {}, doc = {}) {
  const listeners = new Map(), measured = [], scripts = [];
  const location = { hostname: 'opax.com.au', href: 'https://opax.com.au/search?q=private', pathname: '/search', search: '?q=private' };
  const context = {
    URL, navigator: { doNotTrack: dnt, ...nav }, window: { ...win }, location,
    document: { title: 'private', createElement: () => ({}), head: { appendChild: node => scripts.push(node) }, ...doc },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    addEventListener: (event, handler) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(handler);
    },
    dispatchEvent: event => {
      if (event.type === 'opax:measured') measured.push(event.detail);
      for (const handler of listeners.get(event.type) || []) handler(event);
    },
  };
  context.window.location = location;
  const emit = (type, detail) => context.dispatchEvent({ type, detail });
  return { context, location, measured, scripts, emit };
}

test('route views are deduplicated and outcomes reach both destinations through one boundary', async () => {
  const { runInNewContext } = await import('node:vm');
  const { context, location, measured, emit } = browserHarness();
  runInNewContext(readFileSync(new URL('../public/events.js', import.meta.url), 'utf8'), context);
  emit('DOMContentLoaded'); emit('opax:route');
  assert.equal(measured.length, 1);
  assert.equal(measured[0].properties.page_path, '/search');
  // Changing a map focus, filter, or search query is an interaction, not another page.
  location.href = 'https://opax.com.au/search?q=another'; location.search = '?q=another';
  emit('opax:route');
  assert.equal(measured.length, 1);
  location.href = 'https://opax.com.au/money'; location.pathname = '/money'; location.search = '';
  emit('opax:route');
  location.href = 'https://opax.com.au/search?q=private'; location.pathname = '/search'; location.search = '?q=private';
  emit('popstate'); emit('opax:route');
  assert.equal(measured.length, 3);
  emit('opax:analytics', {event:'opax_ask_completed',properties:{duration_ms:100,source_count:3,answer:'private'}});
  assert.equal(measured.length, 4);
  assert.equal(context.window.dataLayer.length, 4);
  assert.equal(context.window.dataLayer[3].opax.source_count, 3);
  assert.equal(context.window.dataLayer[3].opax.page_section, 'search');
  assert.ok(!JSON.stringify([measured,context.window.dataLayer]).includes('private'));
  emit('opax:analytics', {event:'unknown',properties:{question:'private'}});
  assert.equal(measured.length, 4);
});

test('Ask sample questions count once: in place through app.js, a new-tab click here', async () => {
  const { runInNewContext } = await import('node:vm');
  const { context, measured, emit } = browserHarness();
  // Just enough of an element for the click handler: closest() on one selector.
  context.Element = class { constructor(matches) { this.matches = matches; } closest(sel) { return sel.split(',').some((s) => this.matches.includes(s.trim())) ? this : null; } };
  runInNewContext(readFileSync(new URL('../public/events.js', import.meta.url), 'utf8'), context);
  emit('DOMContentLoaded');
  const views = measured.length;
  const click = (matches, keys = {}) => context.dispatchEvent({ type: 'click', target: new context.Element(matches), ...keys });
  // A plain click asks in place; app.js reports it (trackOutcome), so nothing here.
  click(['.ask-sample', 'a']);
  assert.equal(measured.length, views);
  emit('opax:analytics', { event: 'opax_chip', properties: { chip_kind: 'ask' } });
  // A modified click opens the question in a new tab, which app.js does not see.
  click(['.ask-sample', 'a'], { metaKey: true });
  click(['#search-chips .chip']);
  assert.deepEqual(measured.slice(views).map((m) => [m.event, m.properties.chip_kind]),
    [['opax_chip', 'ask'], ['opax_chip', 'ask'], ['opax_chip', 'search']]);
});

test('GA replays early events once, tracks future events once, and strips private context', async () => {
  const { runInNewContext } = await import('node:vm');
  const { context, emit, scripts } = browserHarness();
  const events = readFileSync(new URL('../public/events.js', import.meta.url), 'utf8');
  const ga = readFileSync(new URL('../public/ga.js', import.meta.url), 'utf8');
  runInNewContext(events, context);
  emit('opax:analytics', {event:'opax_search_completed',properties:{result_count:12,query:'private'}});
  runInNewContext(ga, context); runInNewContext(ga, context);
  emit('opax:analytics', {event:'opax_journey',properties:{action:'played',lens:'industry',step:1,step_count:4,recipient:'private'}});
  // The adapter's gtag queue is its own: a 'config' in GTM's dataLayer makes GTM load the Google tag twice.
  const sent = context.window.opaxGaLayer.filter(item => item[0] === 'event');
  assert.deepEqual(Array.from(sent, item => item[1]), ['page_view','opax_search_completed','opax_journey']);
  assert.ok(!context.window.dataLayer.some(item => item[0] === 'config' || item[0] === 'js'));
  assert.equal(scripts.length, 1);
  assert.match(scripts[0].src, /gtag\/js\?id=G-EGY7Y5VTEQ&l=opaxGaLayer$/);
  assert.equal(context.window.opaxAnalyticsPending, null);
  assert.ok(!JSON.stringify(sent).includes('private'));
  assert.equal(sent[0][2].page_location, 'https://opax.com.au/search');
  assert.equal(sent[2][2].lens, 'industry');
  const settings = context.window.opaxGaLayer.find(item => item[0] === 'set')[1];
  assert.equal(settings.send_page_view, false);
  assert.equal(settings.allow_google_signals, false);
});

test('Do Not Track prevents buffering, dataLayer events and GA loading', async () => {
  const { runInNewContext } = await import('node:vm');
  const { context, emit, measured, scripts } = browserHarness('1');
  for (const file of ['events','ga','gtm']) runInNewContext(readFileSync(new URL(`../public/${file}.js`, import.meta.url), 'utf8'), context);
  emit('opax:analytics', {event:'opax_ask_completed',properties:{source_count:3}});
  assert.equal(measured.length, 0);
  assert.equal(scripts.length, 0);
  assert.equal(context.window.dataLayer, undefined);
});

test('footer partners have explicit referral UTMs and fixed tracking identifiers', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const partner of ['progress_agentic_rag','corpuskit']) {
    assert.match(html, new RegExp('utm_source=opax&amp;utm_medium=referral&amp;utm_campaign=powered_by&amp;utm_content=footer" data-analytics-partner="'+partner+'"'));
  }
  assert.deepEqual(cleanEvent('opax_outbound', {host:'corpuskit.org',partner:'corpuskit',placement:'footer',url:'private'}), {host:'corpuskit.org',partner:'corpuskit',placement:'footer'});
});

 test('PostHog receives the same sanitized lifecycle and context as GA', async () => {
  const { runInNewContext } = await import('node:vm');
  const { context, emit } = browserHarness();
  const captured = [];
  Object.assign(context, { cleanEvent, beforeSend, automationReason, likelyBot, whenMeasurable });
  context.posthog = { init(){}, capture:(event,properties)=>captured.push({event,properties}) };
  const adapter = readFileSync(new URL('../analytics/index.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm,'');
  runInNewContext(adapter, context);
  runInNewContext(readFileSync(new URL('../public/events.js', import.meta.url), 'utf8'), context);
  runInNewContext(readFileSync(new URL('../public/ga.js', import.meta.url), 'utf8'), context);
  emit('opax:analytics', {event:'opax_ask_failed',properties:{duration_ms:100,cancelled:true,error:'private'}});
  emit('opax:analytics', {event:'opax_outbound',properties:{host:'corpuskit.org',partner:'corpuskit',placement:'footer'}});
  assert.deepEqual(captured.map(e=>e.event), ['$pageview','opax_ask_failed','opax_outbound']);
  assert.ok(!JSON.stringify(captured).includes('private'));
  const ga = context.window.opaxGaLayer.filter(e=>e[0]==='event');
  for (const key of ['host','partner','placement','page_section']) assert.equal(captured[2].properties[key], ga[2][2][key]);
});

test('PostHog loaded after the app replays every earlier event once, even after GA drained its buffer', async () => {
  const { runInNewContext } = await import('node:vm');
  const { context, emit } = browserHarness();
  const captured = [];
  Object.assign(context, { cleanEvent, beforeSend, automationReason, likelyBot, whenMeasurable });
  context.posthog = { init(){}, capture:(event,properties)=>captured.push({event,properties}) };
  runInNewContext(readFileSync(new URL('../public/events.js', import.meta.url), 'utf8'), context);
  emit('opax:analytics', {event:'opax_search_completed',properties:{result_count:4,query:'private'}});
  runInNewContext(readFileSync(new URL('../public/ga.js', import.meta.url), 'utf8'), context);
  assert.equal(context.window.opaxAnalyticsPending, null);
  runInNewContext(readFileSync(new URL('../analytics/index.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm,''), context);
  emit('opax:analytics', {event:'opax_source_open',properties:{from_section:'search'}});
  assert.deepEqual(captured.map(e=>e.event), ['$pageview','opax_search_completed','opax_source_open']);
  assert.equal(context.window.opaxAnalyticsLog, null);
  assert.ok(!JSON.stringify(captured).includes('private'));
});

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
test('clear automation signals are recognised from browser properties alone; real browsers are not', () => {
  assert.equal(automationReason({ userAgent: CHROME, webdriver: true }), 'webdriver');
  assert.equal(automationReason({ userAgent: CHROME.replace('Chrome/', 'HeadlessChrome/') }), 'automation_ua');
  assert.equal(automationReason({ userAgent: CHROME, userAgentData: { brands: [{ brand: 'HeadlessChrome' }] } }), 'automation_ua');
  assert.equal(automationReason({ userAgent: CHROME + ' Chrome-Lighthouse' }), 'automation_ua');
  assert.equal(automationReason({ userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }), 'automation_ua');
  assert.equal(automationReason({ userAgent: CHROME }, { innerWidth: 0, innerHeight: 0 }, { visibilityState: 'visible' }), 'zero_viewport');
  // Hidden, prerendering or not a browser: a zero size is not yet evidence.
  for (const doc of [{ visibilityState: 'hidden' }, { visibilityState: 'visible', prerendering: true }, undefined])
    assert.equal(automationReason({ userAgent: CHROME }, { innerWidth: 0, innerHeight: 0 }, doc), null);
  for (const [nav, win] of [
    [{ userAgent: CHROME, webdriver: false, userAgentData: { brands: [{ brand: 'Google Chrome' }] } }, { innerWidth: 1280, innerHeight: 720 }],
    [{ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' }, { innerWidth: 390, innerHeight: 844 }],
    [{}, {}],
  ]) assert.equal(automationReason(nav, win), null);
});

test('likely_bot is one boolean from weak signals, including a page left with no interaction', () => {
  const nav = { userAgent: CHROME, languages: ['en-AU'] };
  assert.equal(likelyBot(nav), false);
  assert.equal(likelyBot(nav, { leaving: true, interacted: true }), false);
  assert.equal(likelyBot(nav, { leaving: true, interacted: false }), true);
  assert.equal(likelyBot(nav, { leaving: false, interacted: false }), false);
  assert.equal(likelyBot({ ...nav, languages: [] }), true);
});

for (const [name, nav, win, doc] of [['navigator.webdriver', { webdriver: true }, {}], ['a headless user agent', { userAgent: 'HeadlessChrome/141' }, {}], ['a zero-size viewport on screen', {}, { innerWidth: 0, innerHeight: 0 }, { visibilityState: 'visible' }]]) {
  test(`${name} stops buffering, dataLayer, GA and PostHog`, async () => {
    const { runInNewContext } = await import('node:vm');
    const { context, emit, measured, scripts } = browserHarness('0', nav, win, doc);
    let inits = 0; const captured = [];
    Object.assign(context, { cleanEvent, beforeSend, automationReason, likelyBot, whenMeasurable });
    context.posthog = { init() { inits++; }, capture: (event) => captured.push(event) };
    for (const file of ['events', 'ga']) runInNewContext(readFileSync(new URL(`../public/${file}.js`, import.meta.url), 'utf8'), context);
    runInNewContext(readFileSync(new URL('../analytics/index.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, ''), context);
    emit('DOMContentLoaded');
    emit('opax:analytics', { event: 'opax_ask_completed', properties: { source_count: 3 } });
    assert.equal(measured.length, 0);
    assert.equal(scripts.length, 0);
    assert.equal(context.window.dataLayer, undefined);
    assert.equal(inits, 0);
    assert.deepEqual(captured, []);
  });
}

test('PostHog SDK events are dropped if automation appears later, and $pageleave carries likely_bot only', async () => {
  const { runInNewContext } = await import('node:vm');
  const { context, emit } = browserHarness('0', { userAgent: CHROME, languages: ['en-AU'] }, { innerWidth: 1280, innerHeight: 720, outerWidth: 1280, outerHeight: 800 });
  let options;
  Object.assign(context, { cleanEvent, beforeSend, automationReason, likelyBot, whenMeasurable });
  context.posthog = { init(_token, o) { options = o; }, capture() {} };
  runInNewContext(readFileSync(new URL('../analytics/index.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, ''), context);
  const leave = () => options.before_send({ event: '$pageleave', properties: { $current_url: 'https://opax.com.au/ask?q=private' } });
  const left = leave();
  assert.equal(left.properties.likely_bot, true);
  assert.equal(left.properties.$current_url, 'https://opax.com.au/ask');
  assert.equal(options.before_send({ event: '$pageview', properties: { $current_url: 'https://opax.com.au/' } }).properties.likely_bot, false);
  emit('scroll');
  assert.equal(leave().properties.likely_bot, false);
  assert.ok(!JSON.stringify(left).includes('private'));
  context.window.innerWidth = 0; context.document.visibilityState = 'visible';
  assert.equal(leave(), null);
});

function deferredHarness(visibilityState) {
  const docListeners = new Map();
  const doc = { visibilityState, addEventListener: (type, fn) => docListeners.set(type, [...(docListeners.get(type) || []), fn]) };
  const h = browserHarness('0', { userAgent: CHROME, languages: ['en-AU'] }, { innerWidth: 0, innerHeight: 0 }, doc);
  let inits = 0; const captured = [];
  Object.assign(h.context, { cleanEvent, beforeSend, automationReason, likelyBot, whenMeasurable });
  h.context.posthog = { init() { inits++; }, capture: (event) => captured.push(event) };
  h.fire = (type) => { for (const fn of docListeners.get(type) || []) fn(); };
  h.posthogInits = () => inits; h.captured = captured;
  return h;
}
async function loadAll(context) {
  const { runInNewContext } = await import('node:vm');
  runInNewContext(readFileSync(new URL('../public/events.js', import.meta.url), 'utf8'), context);
  runInNewContext(readFileSync(new URL('../public/ga.js', import.meta.url), 'utf8'), context);
  runInNewContext(readFileSync(new URL('../analytics/index.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, ''), context);
}

test('a zero viewport while hidden waits; on screen at full size it sends one view and starts GA and PostHog', async () => {
  const h = deferredHarness('hidden');
  await loadAll(h.context);
  h.emit('DOMContentLoaded');
  assert.equal(h.measured.length, 0);
  assert.equal(h.scripts.length, 0);
  assert.equal(h.posthogInits(), 0);
  // Still hidden: nothing is decided yet.
  h.fire('visibilitychange');
  assert.equal(h.posthogInits(), 0);
  Object.assign(h.context.window, { innerWidth: 390, innerHeight: 844 });
  h.context.document.visibilityState = 'visible';
  h.fire('visibilitychange'); h.fire('visibilitychange'); h.fire('prerenderingchange');
  assert.deepEqual(h.measured.map((m) => m.event), ['opax_view']);
  assert.equal(h.scripts.length, 1);
  assert.equal(h.posthogInits(), 1);
  assert.deepEqual(h.captured, ['$pageview']);
  assert.deepEqual(Array.from(h.context.window.opaxGaLayer.filter((e) => e[0] === 'event'), (e) => e[1]), ['page_view']);
  h.emit('opax:route');
  assert.equal(h.measured.length, 1);
});

test('a prerendered page with no viewport is decided when it activates', async () => {
  const h = deferredHarness('visible');
  h.context.document.prerendering = true;
  await loadAll(h.context);
  assert.equal(h.measured.length, 0);
  Object.assign(h.context.window, { innerWidth: 1280, innerHeight: 720 });
  h.context.document.prerendering = false;
  h.fire('prerenderingchange');
  assert.equal(h.measured.length, 1);
  assert.equal(h.posthogInits(), 1);
});

test('a zero viewport that is still zero once on screen stays off', async () => {
  const h = deferredHarness('hidden');
  await loadAll(h.context);
  h.context.document.visibilityState = 'visible';
  h.fire('visibilitychange');
  Object.assign(h.context.window, { innerWidth: 1280, innerHeight: 720 });
  h.fire('visibilitychange');
  h.emit('opax:route');
  assert.equal(h.measured.length, 0);
  assert.equal(h.scripts.length, 0);
  assert.equal(h.posthogInits(), 0);
  assert.equal(h.context.window.dataLayer, undefined);
});

// --- Feature-use events (telemetry scan, 13 Nov 2026, items 2, 5, 6 and 13) ---

test('static pages are counted by name; their sub-pages and look-alikes stay /other', () => {
  for (const page of ['press', 'today', 'sitting', 'budget', 'privacy', 'support', 'audit', 'estimates', 'instruments']) {
    assert.equal(safePath(`/${page}`), `/${page}`);
    assert.equal(safePath(`https://opax.com.au/${page}?q=private#private`), `/${page}`);
    assert.equal(safePath(`/${page}/private-record`), '/other');
    assert.equal(safePath(`/${page}private`), '/other');
  }
  assert.deepEqual(cleanEvent('opax_view', { page_path: '/press', page_section: 'press' }), { page_path: '/press', page_section: 'press' });
});

test('opax_source_open, opax_share and opax_press take fixed words only', () => {
  for (const placement of ['inline', 'sources_pane', 'talk_sources', 'other'])
    assert.deepEqual(cleanEvent('opax_source_open', { from_section: 'ask', placement, href: '/doc/private' }), { from_section: 'ask', placement });
  assert.deepEqual(cleanEvent('opax_source_open', { from_section: 'ask', placement: 'private' }), { from_section: 'ask' });
  for (const record_type of ['person', 'party', 'bill', 'electorate', 'doc', 'money', 'other'])
    assert.deepEqual(cleanEvent('opax_share', { kind: 'copy_link', record_type, url: 'https://opax.com.au/doc/private' }), { kind: 'copy_link', record_type });
  // A slug-shaped value would pass the generic check; here it is not one of the words.
  assert.deepEqual(cleanEvent('opax_share', { kind: 'private-slug', record_type: 'private-person' }), {});
  for (const action of ['asset_download', 'boilerplate_copy']) assert.deepEqual(cleanEvent('opax_press', { action, text: 'private' }), { action });
  assert.deepEqual(cleanEvent('opax_press', { action: 'private' }), {});
});

async function clickHarness(html, doc = {}) {
  const { JSDOM } = await import('jsdom');
  const { runInNewContext } = await import('node:vm');
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
  const h = browserHarness('0', {}, {}, doc);
  h.context.Element = dom.window.Element;
  const captured = [];
  Object.assign(h.context, { cleanEvent, beforeSend, automationReason, likelyBot, whenMeasurable });
  h.context.posthog = { init() {}, capture: (event, properties) => captured.push({ event, properties }) };
  runInNewContext(readFileSync(new URL('../public/events.js', import.meta.url), 'utf8'), h.context);
  runInNewContext(readFileSync(new URL('../analytics/index.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, ''), h.context);
  const views = h.measured.length;
  h.click = (selector) => h.context.dispatchEvent({ type: 'click', button: 0, target: dom.window.document.querySelector(selector) });
  h.after = () => h.measured.slice(views);
  return { ...h, dom, captured };
}

test('a source link says where it sat, and neither GA nor PostHog sees which record', async () => {
  const h = await clickHarness(`
    <article class="answer"><p>Said <a id="inline" href="/doc/2026-10-14-private-slug">here</a>.</p></article>
    <details class="chat-sources"><a id="pane" href="/doc/2026-10-14-private-slug">Source</a></details>
    <aside class="opax-voice"><div class="opax-voice-transcript"><a id="talk-inline" href="/doc/2026-10-14-private-slug">x</a></div>
      <details class="opax-voice-sources"><a id="talk" href="/doc/2026-10-14-private-slug">x</a></details></aside>
    <ul><li><a id="list" href="/doc/2026-10-14-private-slug">x</a></li></ul>`);
  for (const id of ['inline', 'pane', 'talk-inline', 'talk', 'list']) h.click(`#${id}`);
  assert.deepEqual(h.after().map((m) => [m.event, m.properties.placement]), [
    ['opax_source_open', 'inline'], ['opax_source_open', 'sources_pane'], ['opax_source_open', 'inline'],
    ['opax_source_open', 'talk_sources'], ['opax_source_open', 'other']]);
  assert.deepEqual(h.captured.filter((c) => c.event === 'opax_source_open').map((c) => c.properties.placement), ['inline', 'sources_pane', 'inline', 'talk_sources', 'other']);
  assert.ok(!/private/.test(JSON.stringify([h.measured, h.captured, h.context.window.dataLayer])));
});

test('press kit: an image taken and a boilerplate copy are counted, with no file name or text', async () => {
  let anchor = null;
  const h = await clickHarness(`
    <p data-press-copy><strong>Short.</strong> <span id="words">private boilerplate words</span></p>
    <p id="elsewhere">private other words</p>
    <ul><li><a id="asset" data-press-asset href="/social/private-asset.png">Avatar</a></li><li><a id="plain" href="/methods">Methods</a></li></ul>`,
  { getSelection: () => ({ anchorNode: anchor, toString: () => { throw new Error('the selection text is never read'); } }) });
  const doc = h.dom.window.document;
  h.click('#asset');
  h.click('#plain');
  anchor = doc.getElementById('words').firstChild; // a text node inside the boilerplate
  h.context.dispatchEvent({ type: 'copy', target: doc.body });
  anchor = doc.getElementById('elsewhere').firstChild;
  h.context.dispatchEvent({ type: 'copy', target: doc.body });
  // No selection API: the copy event's own target decides.
  anchor = null;
  h.context.dispatchEvent({ type: 'copy', target: doc.getElementById('words') });
  assert.deepEqual(h.after().map((m) => [m.event, m.properties.action]),
    [['opax_press', 'asset_download'], ['opax_press', 'boilerplate_copy'], ['opax_press', 'boilerplate_copy']]);
  assert.deepEqual(h.captured.filter((c) => c.event === 'opax_press').map((c) => c.properties.action), ['asset_download', 'boilerplate_copy', 'boilerplate_copy']);
  assert.ok(!/private/.test(JSON.stringify([h.measured, h.captured, h.context.window.dataLayer])));
});

test('the press kit loads the shared event emitter and PostHog, and marks its assets and boilerplate', () => {
  const press = readFileSync(new URL('../public/press.html', import.meta.url), 'utf8');
  assert.match(press, /src="\/events.js\?v=[^"]+" defer/);
  assert.match(press, /src="\/gtm.js\?v=[^"]+" defer/);
  assert.match(press, /src="\/analytics.js\?v=[^"]+" defer/);
  assert.ok(press.indexOf('/analytics.js?v=') > press.indexOf('/events.js?v='));
  assert.equal(press.match(/data-press-copy/g)?.length, 2);
  assert.ok((press.match(/<a data-press-asset href="\/(?:social|og)[^"]*\.png"/g) || []).length >= 3);
});
