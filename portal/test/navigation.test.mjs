import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { workerFetch } from './helpers/worker-fetch.mjs';

await import('../public/navigation.js');
const nav = globalThis.OpaxNavigation;
const read = name => readFileSync(new URL('../public/' + name, import.meta.url), 'utf8');
const hubs = JSON.parse(read('hubs/index.json'));
const estimatesHref = `/estimates/${hubs.weeks.find(w => w.estimates).estimates}`;
const menuLinks = nav.groups.flatMap(g => g.columns.flatMap(c => [...c.links, ...(c.section ? [c.section] : [])]));
const menuHrefs = new Set([...menuLinks, ...nav.footerOnly].map(l => l.href));
const label = steps => steps.map(s => s.label).join(' › ');

/** One of the jsdom probes in helpers/header-search-shell.mjs, on the real page. */
function probe(path, name, { env, media } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./helpers/header-search-shell.mjs', import.meta.url), {
      execArgv: ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning'], workerData: { path, probe: name, env, media },
    });
    worker.once('message', message => message.error ? reject(Error(message.error)) : resolve(message.result));
    worker.once('error', reject);
    worker.once('exit', code => { if (code !== 0) reject(Error('Shell worker exited with ' + code)); });
  });
}

// Every kind of page the site serves, and how a reader gets there: from a menu
// link, as a record inside a section the menus link, or from a documented place
// in context. A new page kind has to be added here, with its way in.
const ROUTES = [
  ...[...menuHrefs].map(href => ({ route: href === '/estimates' ? estimatesHref : href, way: 'menu' })),
  ...['/sitting/2026-10-12', estimatesHref, '/bill/au-federal-r7549', '/instrument/F2026L00001', '/audit/2025-1',
    '/subject/person/anthony-albanese', '/subject/party/Australian%20Labor%20Party', '/subject/electorate/grayndler',
    '/subject/donor/an-organisation', '/subject/supplier/1', '/subject/agency/1', '/subject/campaigner/a-campaigner',
    '/subject/topic/housing', '/reports/housing/s/2', '/money/grants/federal/recipient/abn:12345678901',
    '/vic-election-2026/albert-park', '/explore?game=tm'].map(route => ({ route, way: 'section' })),
  { route: '/', way: 'context', entry: 'the mark at the start of the band, on every page' },
  { route: '/ask', way: 'context', entry: 'the band\'s Ask control on every page but home (whose first block is the question box)', control: 'chat-launcher' },
  { route: '/ask?view=search', way: 'context', entry: 'the band\'s search control: Enter searches the record', control: 'header-search-open' },
  { route: '/chat', way: 'context', entry: 'an answer\'s "Keep asking"', from: '/ask' },
  { route: '/doc/division-x', way: 'context', entry: 'search results, bill pages and cited sources', from: '/ask?view=search' },
  { route: '/map', way: 'context', entry: 'the money map\'s full-screen control', from: '/money' },
  { route: '/today', way: 'context', entry: 'the daily edition\'s social posts (a redirect)', from: '/' },
];
// The app's panels, each by an address it opens on.
const PANEL_ROUTES = { 'money-records': '/money/receipts', connections: '/connections', discover: '/discover', ask: '/ask', chat: '/chat',
  search: '/ask?view=search', money: '/money', reports: '/reports', explore: '/explore', doc: '/doc/division-x', subject: '/subject/person',
  declared: '/declared', about: '/about', methods: '/methods', stats: '/stats', expenses: '/expenses', privacy: '/privacy', support: '/support', bill: '/bills' };

test('every page kind is reachable from the menus or a documented entry', () => {
  const known = new Set(ROUTES.map(r => r.route));
  for (const { route, way, entry, control, from } of ROUTES) {
    if (way === 'menu') assert.ok(menuHrefs.has(route) || route === estimatesHref, route);
    else if (way === 'section') {
      const section = nav.trail(route).find(s => s.href);
      assert.ok(section && menuHrefs.has(section.href), `${route} sits in a menu section (${label(nav.trail(route))})`);
    } else {
      assert.ok(entry, `${route} documents its way in`);
      if (control) assert.match(read('index.html'), new RegExp(`id="${control}"`), `${route}: the band carries ${control}`);
      if (from) assert.ok(known.has(from), `${route} is reached from ${from}, itself reachable`);
    }
  }
  // Coverage: every panel of the app and every server-rendered static page is in the list.
  const panels = JSON.parse(read('app.js').match(/const PANELS = (\[[^\]]+\])/)[1]);
  for (const panel of panels) assert.ok(known.has(PANEL_ROUTES[panel]), `panel ${panel} has a route in the list`);
  const worker = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  const staticBlock = worker.slice(worker.indexOf('const STATIC_PAGES'), worker.indexOf('\n}\n', worker.indexOf('const STATIC_PAGES')));
  for (const [, key] of staticBlock.matchAll(/\n  '?([\w/-]+)'?: \{/g)) {
    const route = key === 'search' ? '/ask?view=search' : '/' + key;
    assert.ok(known.has(route), `server page /${key} has a way in`);
  }
});

test('every menu, footer and shortcut link is a page the Worker serves', async () => {
  const hrefs = new Set([...menuHrefs, ...nav.shortcuts.map(s => s.href)].map(h => h === '/estimates' ? estimatesHref : h));
  for (const href of hrefs) {
    const response = await workerFetch(href);
    assert.equal(response.status, 200, href);
    await response.arrayBuffer();
  }
});

test('a section page\'s trail is its menu name; About\'s pages sit under About OPAX', () => {
  for (const link of [...menuLinks, ...nav.footerOnly].filter(l => !l.record && l.href !== '/estimates')) {
    const steps = nav.trail(link.href);
    assert.equal(steps.at(-1).label, link.label, link.href);
    assert.equal(steps.at(-1).href, undefined, `${link.href}: the page itself is plain`);
  }
  assert.equal(label(nav.trail('/methods')), 'About OPAX › Methods & how to cite');
  assert.equal(nav.trail('/methods')[0].href, '/about');
});

// The trail per kind of page, as the server writes it (no scripts needed).
const TRAILS = [
  ['/sitting', 'Sitting weeks'],
  ['/sitting/2026-10-12', 'Sitting weeks › 12 Oct 2026 – 15 Oct 2026'],
  [estimatesHref, 'Sitting weeks › Supplementary Budget Estimates'],
  ['/bills', 'Bills'],
  ['/instruments', 'Legislative instruments'],
  ['/audit', 'Queensland audit reports'],
  ['/subject/person', 'Parliamentarians'],
  ['/subject/person/anthony-albanese', 'Parliamentarians › Anthony Albanese'],
  ['/declared', 'Declared interests'],
  ['/vic-election-2026', 'Victorian election 2026'],
  ['/vic-election-2026/albert-park', 'Victorian election 2026 › Albert Park district'],
  ['/money', 'Money map'],
  ['/money/receipts', 'Political receipts'],
  ['/money/grants', 'Grants'],
  ['/discover', 'Government contracts'],
  ['/connections', 'Programs & places'],
  ['/subject/topic', 'Topics A–Z'],
  ['/subject/topic/housing', 'Topics A–Z › Housing'],
  ['/explore', 'Interactive tools'],
  ['/reports', 'Reports'],
  ['/reports/housing', 'Reports › Housing'],
  ['/about', 'About OPAX'],
  ['/methods', 'About OPAX › Methods & how to cite'],
  ['/stats', 'About OPAX › Sources & coverage'],
  ['/expenses', 'About OPAX › Expense definitions'],
  ['/privacy', 'About OPAX › Privacy'],
  ['/support', 'About OPAX › Support'],
  ['/community', 'About OPAX › Community'],
  ['/ask', 'Ask'],
  ['/ask?view=search', 'Search'],
  ['/chat', 'Ask › Keep asking'],
  ['/no-such-page', 'Page not found'],
];
const serverTrail = async (path, env) => {
  const response = await workerFetch(path, env);
  const doc = new JSDOM(await response.text()).window.document;
  const items = [...doc.querySelectorAll('.prerender-crumbs li')];
  return { status: response.status, doc, items: items.map(li => ({ label: li.textContent.trim(), href: li.querySelector('a')?.getAttribute('href') || null, here: li.getAttribute('aria-current') })) };
};

for (const [path, expected] of TRAILS) {
  test(`the server writes the trail for ${path}`, async () => {
    const { items } = await serverTrail(path);
    assert.equal(items.map(i => i.label).join(' › '), `Home › ${expected}`);
    assert.equal(items[0].href, '/');
    assert.equal(items.at(-1).href, null, 'the page itself is not a link');
    assert.equal(items.at(-1).here, 'page');
    for (const item of items.slice(0, -1)) assert.ok(item.href, `${item.label} links to its page`);
  });
}

test('a donor\'s page never puts a name in its trail', async () => {
  const { items } = await serverTrail('/subject/donor/An%20Example%20Donor');
  assert.equal(items.map(i => i.label).join(' › '), 'Home › Donors');
  assert.equal(label(nav.trail('/subject/donor/someone')), 'Donors');
});

test('the app sets every trail through the shared list', () => {
  const app = read('app.js');
  // Literal trails remain only where no section page exists (committee
  // witnesses) or another lane's page composes its own return trail.
  const literal = [...app.matchAll(/setCrumbs\(\[\s*(?:\.\.\.)?\{?\s*([^\n]{0,60})/g)].map(m => m[1]);
  assert.deepEqual(literal.map(l => l.slice(0, 26)).sort(), ['explainReturnCrumbs, { lab', 'label: "Committee witnesse'].sort());
  for (const [, address] of app.matchAll(/crumbsFor\(\s*["'`]([^"'`$]+)["'`]/g))
    assert.notEqual(nav.trail(address).at(0)?.label, 'Page not found', `crumbsFor("${address}") names a section`);
  assert.doesNotMatch(app, /label:\s*"(Registers of interests|Corpus stats|Expense categories|Ask & search|Encyclopedia)"/);
});

test('the static menu bar and footer index are drawn from the same list', () => {
  for (const file of ['index.html', 'home.html', 'community.html']) {
    const html = read(file);
    assert.ok(html.includes(`<!-- nav:bar:start -->${nav.barHTML()}<!-- nav:bar:end -->`), `${file}: menu bar fallback`);
    assert.ok(html.includes(`<!-- nav:index:start -->${nav.footerHTML(() => true, { slot: false })}<!-- nav:index:end -->`), `${file}: footer index`);
    // Privacy is one tap from every page: the footer index carries it.
    assert.match(html.slice(html.indexOf('<!-- nav:index:start -->')), /<a class="footer-link" href="\/privacy">Privacy<\/a>/);
  }
  assert.ok(nav.footerOnly.some(p => p.href === '/privacy'), 'and the sheet\'s last line');
});

test('the Worker marks published sections on the page, so the menus need no request', async () => {
  for (const path of ['/sitting', '/subject/person/anthony-albanese', '/', '/community']) {
    const on = new JSDOM(await (await workerFetch(path)).text()).window.document.documentElement;
    assert.equal(on.getAttribute('data-nav-gates'), 'vic-election', path);
    const off = new JSDOM(await (await workerFetch(path, { VIC_ELECTION_HUB_ENABLED: 'false' })).text()).window.document.documentElement;
    assert.equal(off.hasAttribute('data-nav-gates'), false, path);
  }
});

test('the election link is drawn from the page flag; opening the menus asks only for the calendar', async () => {
  const published = await probe('/sitting', 'gates');
  assert.equal(published.gatesAttr, 'vic-election');
  assert.deepEqual(published.atLoad, { menus: 1, sheet: 1, chip: 1, footer: 1, slots: 0 });
  assert.equal(published.feature, 1);
  assert.deepEqual(published.onOpen, ['GET /hubs/index.json']);
  const unpublished = await probe('/sitting', 'gates', { env: { VIC_ELECTION_HUB_ENABLED: 'false' } });
  assert.equal(unpublished.gatesAttr, null);
  assert.deepEqual(unpublished.atLoad, { menus: 0, sheet: 0, chip: 0, footer: 0, slots: 4 });
  assert.ok(unpublished.onOpen.every(r => !r.includes('vic-election')), unpublished.onOpen.join());
});

for (const [label, path] of [['an app page', '/subject/person/david-pocock'], ['a server-only page', '/sitting']]) {
  test(`the sheet holds focus, folds groups and closes on Escape (${label})`, async () => {
    const r = await probe(path, 'sheet');
    assert.deepEqual(r.opened, { open: true, expanded: 'true', focus: true });
    assert.ok(r.stopCount > 10);
    assert.equal(r.wrapsForward, true, 'Tab from the last control returns to the first');
    assert.equal(r.wrapsBack, true, 'Shift+Tab from the first goes to the last');
    assert.equal(r.fromDialogBack, true);
    assert.equal(r.groupAfter.expanded, String(r.groupBefore !== 'true'));
    assert.equal(r.groupAfter.hidden, r.groupBefore === 'true');
    assert.equal(r.closingClass, true, 'Escape runs the exit motion');
    assert.deepEqual(r.closed, { open: false, expanded: 'false', focus: 'nav-open' });
  });

  test(`the menu bar's keyboard model (${label})`, async () => {
    const r = await probe(path, 'panel-keys');
    assert.equal(r.count, 5);
    assert.deepEqual(r.down, { expanded: 'true', hidden: false, focusFirst: true });
    assert.equal(r.second, true);
    assert.equal(r.end, true);
    assert.equal(r.home, true);
    assert.equal(r.upToTrigger, true);
    assert.deepEqual(r.right, { focus: true, nextOpen: 'true', previousOpen: 'false', previousHidden: true });
    assert.equal(r.left, true);
    assert.deepEqual(r.escape, { expanded: 'false', hidden: true, focus: true, anyOpen: false });
    assert.equal(r.click, 'true');
    assert.equal(r.clickAgain, 'false');
  });

  test(`"/" opens search, never while typing in a field (${label})`, async () => {
    const r = await probe(path, 'slash');
    assert.ok(Object.keys(r.typed).length >= 4);
    for (const [field, expanded] of Object.entries(r.typed)) assert.equal(expanded, 'false', field);
    assert.equal(r.withMeta, 'false');
    assert.deepEqual(r.opened, { prevented: true, expanded: 'true', focus: 'mast-q' });
  });
}

test('with reduced motion the sheet closes at once, without its exit motion', async () => {
  const r = await probe('/sitting', 'sheet', { media: ['prefers-reduced-motion: reduce'] });
  assert.equal(r.closingClass, false);
  assert.equal(r.openRightAfterEscape, false);
  assert.deepEqual(r.closed, { open: false, expanded: 'false', focus: 'nav-open' });
});

test('every animation and transition in nav.css is off under reduced motion', () => {
  const css = read('nav.css');
  const marker = '@media (prefers-reduced-motion: no-preference) {';
  let outside = css;
  // Cut each no-preference block (balanced braces) out; what is left must not move.
  for (let i = outside.indexOf(marker); i >= 0; i = outside.indexOf(marker)) {
    let depth = 0, j = i + marker.length - 1;
    for (; j < outside.length; j++) { if (outside[j] === '{') depth++; else if (outside[j] === '}' && --depth === 0) break; }
    outside = outside.slice(0, i) + outside.slice(j + 1);
  }
  assert.ok(css.includes(marker));
  assert.doesNotMatch(outside, /(?<![\w-])(animation|transition)(-[\w-]+)?\s*:/);
  assert.doesNotMatch(outside, /@keyframes/);
});
