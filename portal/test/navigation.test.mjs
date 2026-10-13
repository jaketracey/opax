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
  { route: '/money/explain', way: 'context', entry: 'the Explain action on money pages and the money map', from: '/money' },
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
  ['/vic-election-2026/albert-park', 'Victorian election 2026 › Albert Park'],
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
  ['/money/explain', 'Money map › Explain this flow'],
  ['/no-such-page', 'Page not found'],
];
const serverTrail = async (path, env, assets) => {
  const response = await workerFetch(path, env, {}, { assets });
  const doc = new JSDOM(await response.text()).window.document;
  const items = [...doc.querySelectorAll('.prerender-crumbs li')];
  const graph = JSON.parse(doc.getElementById('ld-page')?.textContent || 'null')?.['@graph'] || [];
  const breadcrumbs = graph.find(node => node['@type'] === 'BreadcrumbList')?.itemListElement || null;
  return { status: response.status, doc, breadcrumbs, canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || null,
    items: items.map(li => ({ label: li.textContent.trim(), href: li.querySelector('a')?.getAttribute('href') || null, here: li.getAttribute('aria-current') })) };
};
/** The page's BreadcrumbList says what its strip shows: the same names, in
 *  order, each ancestor at its own address and the page at its canonical. */
function assertSameTrail({ items, breadcrumbs, canonical }, path) {
  assert.ok(breadcrumbs, `${path} has a BreadcrumbList`);
  assert.deepEqual(breadcrumbs.map(b => b.name), items.map(i => i.label), `${path}: names`);
  items.slice(0, -1).forEach((item, i) => assert.equal(breadcrumbs[i].item, new URL(item.href, 'https://opax.com.au').href, `${path}: ${item.label}`));
  assert.equal(breadcrumbs.at(-1).item, canonical, `${path}: the page itself is its canonical`);
}

for (const [path, expected] of TRAILS) {
  test(`the server writes the trail for ${path}, and its BreadcrumbList says the same`, async () => {
    const page = await serverTrail(path);
    const { items } = page;
    assert.equal(items.map(i => i.label).join(' › '), `Home › ${expected}`);
    assert.equal(items[0].href, '/');
    assert.equal(items.at(-1).href, null, 'the page itself is not a link');
    assert.equal(items.at(-1).here, 'page');
    for (const item of items.slice(0, -1)) assert.ok(item.href, `${item.label} links to its page`);
    if (page.status === 200) assertSameTrail(page, path);
    else assert.equal(page.breadcrumbs, null, 'an error page carries no structured data');
  });
}

// A division page's record is its bill, whatever its first speaker said: the
// chair opening the question must not name the page.
const CHAIR = 'Milton Dick In accordance with standing order 133, I shall now proceed to put the question';
const divisionFixture = (bills) => ({ key: 'division-federal-representatives-99999', slug: 'division-federal-representatives-99999', jurisdiction: 'federal', house: 'representatives',
  date: '2026-09-15', name: 'Bills — A Fixture Amendment Bill 2026; Second Reading', question: CHAIR, ayes: 80, noes: 50, result: 'Passed', members: [], bills });

test('a division sits under its bill, not under the words its chair opened with', async () => {
  const real = await serverTrail('/doc/division-federal-representatives-10005');
  assert.equal(real.status, 200);
  const bill = JSON.parse(read('divisions/division-federal-representatives-10005.json')).bills[0];
  assert.deepEqual(real.items.map(i => i.label), ['Home', 'Bills', nav.trail('/bills', bill.title)[1].label, 'Division']);
  assert.deepEqual(real.items.map(i => i.href), ['/', '/bills', `/bill/${bill.key}`, null]);
  assert.ok(real.items.every(i => !/Milton Dick|standing order/.test(i.label)));
  assertSameTrail(real, 'a real division');
  const fixture = '/divisions/division-federal-representatives-99999.json';
  const withBill = await serverTrail('/doc/division-federal-representatives-99999', {}, { [fixture]: divisionFixture([{ key: 'au-federal-r1', title: 'A Fixture Amendment Bill 2026' }]) });
  assert.equal(withBill.items.map(i => i.label).join(' › '), 'Home › Bills › A Fixture Amendment Bill 2026 › Division');
  assertSameTrail(withBill, 'a fixture division with a bill');
  const noBill = await serverTrail('/doc/division-federal-representatives-99999', {}, { [fixture]: divisionFixture([]) });
  assert.equal(noBill.items.map(i => i.label).join(' › '), 'Home › Search › Division');
  assert.equal(noBill.items[1].href, '/ask?view=search');
  assertSameTrail(noBill, 'a fixture division without a bill');
});

test('a tool opened by its address is named the same by the server, the app and the list', async () => {
  const { items, breadcrumbs } = await serverTrail('/explore?game=tm');
  assert.equal(items.map(i => i.label).join(' › '), 'Home › Interactive tools › Time machine');
  assert.deepEqual(breadcrumbs.map(b => b.name), items.map(i => i.label));
  assert.equal(label(nav.trail('/explore?game=unknown')), 'Interactive tools');
  // The app's tools (GAMES) carry the list's names, so its trail reads the same.
  const games = Object.fromEntries([...read('app.js').matchAll(/\n  (\w+): \{ name: "([^"]+)", dialog:/g)].map(m => [m[1], m[2]]));
  assert.deepEqual(games, nav.tools);
  for (const [key, name] of Object.entries(nav.tools)) assert.equal(label(nav.trail(`/explore?game=${key}`)), `Interactive tools › ${name}`);
});

// A speech or committee page names its speaker, as the app's doc page does
// (Search › speaker), never the h1's "speaker, date · From the record".
const kbRecord = (speaker, title) => ({ title, origin: { collaborators: speaker ? [speaker] : [], url: 'https://example.test/hansard' },
  usermetadata: { classifications: [['kind', 'speech'], ['state', 'federal'], ['chamber', 'representatives']].map(([labelset, label]) => ({ labelset, label })) },
  extra: { metadata: { date: '2023-09-13', word_count: 420 } }, data: { texts: { body: { value: { body: 'Words of the fixture speech.' } } } } });
async function withKnowledgeBase(record, fn) {
  const realFetch = globalThis.fetch, hadCaches = 'caches' in globalThis, realCaches = globalThis.caches;
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
  globalThis.fetch = async (input) => String(input).includes('/slug/speech-') ? new Response(JSON.stringify(record), { headers: { 'content-type': 'application/json' } }) : new Response('{}', { status: 404 });
  try { return await fn(); } finally { globalThis.fetch = realFetch; if (hadCaches) globalThis.caches = realCaches; else delete globalThis.caches; }
}
const KB_ENV = { ARAG_ZONE: 'offline', ARAG_KB_ID: 'offline', ARAG_KB_TOKEN: 'offline', CACHE_EPOCH: 'nav-test' };

test('a speech page sits under Search by its speaker, on the server and in its BreadcrumbList', async () => {
  const speaker = 'An Invented Speaker';
  const page = await withKnowledgeBase(kbRecord(speaker, `${speaker} — A fixture debate — 13 September 2023`), () => serverTrail('/doc/speech-990001', KB_ENV));
  assert.equal(page.status, 200);
  assert.equal(page.items.map(i => i.label).join(' › '), `Home › Search › ${speaker}`);
  assert.equal(page.items[1].href, '/ask?view=search');
  assert.ok(page.items.every(i => !/From the record|September/.test(i.label)));
  assertSameTrail(page, 'a speech');
  const anonymous = await withKnowledgeBase(kbRecord(null, 'A fixture debate'), () => serverTrail('/doc/speech-990002', KB_ENV));
  assert.equal(anonymous.items.map(i => i.label).join(' › '), 'Home › Search › A fixture debate');
  // The app's doc page draws the same: Search › the speaker, else the record's title.
  assert.match(read('app.js'), /setCrumbs\(crumbsFor\("\/ask\?view=search", \(doc\.kind \|\| slug\.split\("-"\)\[0\]\) === "division"\s*\? "Division" : doc\.speaker \|\| displayTitle\(doc\)\)\);/);
});

test('donor navigation reads source metadata without organisation or placeholder gates',async()=>{
 const app=read('app.js');assert.doesNotMatch(app,/DONOR_PLACEHOLDER|donorOrganisationKnown|donorPrivacyIndex/);
 const {donorLookup,donorDisclosure}=await import('../public/donor-disclosure.js');
 const graph=JSON.parse(read('graph/money.json')),index=donorLookup(graph.nodes.filter(n=>n.kind==='donor'));
 assert.ok(index.size>0);
 for(const record of graph.nodes.filter(n=>n.kind==='donor'))assert.equal(donorDisclosure(record).name,record.source_name || record.label);
});

test('the reports in the menus are the published reports, by their own titles', () => {
  const column = nav.groups.find(g => g.id === 'research').columns.find(c => c.section?.href === '/reports');
  const listed = column.links.filter(l => l.record).map(l => [l.href, l.label]);
  const published = JSON.parse(read('reports/index.json')).reports.map(r => [`/reports/${r.slug}`, r.title]);
  assert.deepEqual(listed, published);
});

test('the community page\'s rewritten body does not keep the file\'s tag', async () => {
  const response = await workerFetch('/community');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('etag'), null);
  assert.equal(response.headers.get('content-length'), null);
  await response.arrayBuffer();
});

test('every control in the sheet is a full touch target', () => {
  const css = read('nav.css');
  assert.match(css, /\.nav-sheet \.drawer-close \{[^}]*width: var\(--size-target\); height: var\(--size-target\)/);
  assert.match(css, /\.sheet-chip \{[^}]*height: var\(--size-target\)/);
  assert.match(css, /\.sheet-foot a \{[^}]*min-height: var\(--size-target\)/);
  assert.match(css, /\.sheet-link \{[^}]*min-height: var\(--size-target\)/);
});

test('donor trails name confident and uncertain source records',async()=>{
 const {confidentDonorMatch,donorDisclosure}=await import('../public/donor-disclosure.js');
 const donors=JSON.parse(read('graph/money.json')).nodes.filter(n=>n.kind==='donor');
 for(const confident of [false,true]){
  const donor=donors.find(record=>confidentDonorMatch(record)===confident);assert.ok(donor);
  const shown=await serverTrail('/subject/donor/'+encodeURIComponent(donor.label)),name=donorDisclosure(donor).name;
  assert.equal(shown.status,200);assert.equal(shown.doc.querySelector('meta[name="robots"]'),null);
  assert.deepEqual(shown.items.map(item=>item.label),['Home','Donors',nav.trail('/subject/donor',name)[1].label]);assertSameTrail(shown,'source-named donor');
 }
 assert.equal(label(nav.trail('/subject/donor/someone')),'Donors');
});

test('the app sets every trail through the shared list', () => {
  const app = read('app.js');
  // A literal trail remains only where no section page exists (committee witnesses).
  const literal = [...app.matchAll(/setCrumbs\(\[\s*(?:\.\.\.)?\{?\s*([^\n]{0,60})/g)].map(m => m[1]);
  assert.deepEqual(literal.map(l => l.slice(0, 26)), ['label: "Committee witnesse']);
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

test('Privacy is one tap from the conversation page and linked wherever data is kept', () => {
  const html = read('index.html');
  const chat = html.slice(html.indexOf('<section id="panel-chat"'), html.indexOf('</section>', html.indexOf('<section id="panel-chat"')));
  assert.match(chat, /<a class="chat-privacy" href="\/privacy#privacy-questions">Privacy<\/a>/, 'the full conversation page drops the footer');
  assert.match(read('nav.css'), /html\[data-chat="docked"\] \.chat-privacy \{ display: none; \}/, 'docked, the page\'s own footer carries it');
  const history = read('app.js').slice(read('app.js').indexOf('function renderChatHistory'));
  assert.match(history.slice(0, history.indexOf('\n}\n')), /policy\.href = "\/privacy#privacy-questions"/, 'saved conversations say where they are kept');
  assert.match(read('community.js'), /<a href="\/privacy">How we use your account details<\/a>/, 'community sign-in');
});

test('Instruments sits under Parliament with Bills, never on the top level, and lights Parliament', () => {
  assert.deepEqual(nav.groups.map(g => g.label), ['Parliament', 'People & places', 'Money', 'Topics & reports', 'About']);
  const parliament = nav.groups.find(g => g.id === 'parliament');
  const laws = parliament.columns.find(c => c.heading === 'Laws');
  assert.deepEqual(laws.links.map(l => l.href), ['/bills', '/instruments']);
  assert.deepEqual(parliament.columns.find(c => c.heading === 'In the chamber').links.map(l => l.href), ['/sitting', '/estimates']);
  // The static bar (no scripts) carries the five groups only.
  assert.doesNotMatch(nav.barHTML(), /instruments/i);
  for (const path of ['/instruments', '/instrument/F2026L00001', '/bills', '/bill/au-federal-r1', '/sitting', '/estimates/2026-10']) assert.equal(nav.active(path), 'parliament', path);
  assert.equal(label(nav.trail('/instruments')), 'Legislative instruments');
  assert.equal(label(nav.trail('/instrument/F2026L00001', 'An instrument')), 'Legislative instruments › An instrument');
});
