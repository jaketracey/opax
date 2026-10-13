// Every page's content runs on the masthead's grid (13 Oct, round 2): the
// topics ledger (1120px) and the topic page grid (1190px) stopped about 150px
// short of the masthead's right edge at 1920, and /money/explain sat in a
// centred 832px column. jsdom has no layout, so this checks the cascade with
// every @media block applied at once: the masthead and the page share one
// .wrap, and each page's panel and top-level blocks carry no max-width, width
// or side margin, so they fill the wrap's content box at every width.
// scripts/measure_container_edges.mjs measures the same edges in Chrome.
// /community (14 Oct) is its own document, community.html: a merge dropped its
// nav.css link, so the band drew as bare lists over the page. Its <main> is the
// .wrap, and its heads are ui-page-heads on the same grid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../public/style.css') + '\n' + read('../public/money-explain.css');

// Every rule, with the ones inside @media and @supports lifted to the top.
function flatSheet(text = css) {
  const { document } = new JSDOM(`<!doctype html><style>${text}</style>`).window;
  const out = [];
  const MEDIA = 4, SUPPORTS = 12;
  const walk = (rules) => { for (const r of rules) [MEDIA, SUPPORTS].includes(r.type) ? walk(r.cssRules) : out.push(r.cssText); };
  walk(document.styleSheets[0].cssRules);
  assert.ok(out.length > 2000, `the stylesheets read whole (${out.length} rules)`);
  return out.join('\n');
}
const sheet = flatSheet();

// A page as the shell draws it: the masthead's .wrap, then the page's .wrap and panel.
const page = (panel) => new JSDOM(`<!doctype html><html><head><style>${sheet}</style></head><body>
  <header class="site-header"><div class="wrap masthead"><a class="brand" href="/">OPAX</a></div></header>
  <main id="main" class="compact"><div class="wrap">${panel}</div></main></body></html>`).window;

function fills(window, selector) {
  const els = window.document.querySelectorAll(selector);
  assert.ok(els.length, `${selector} is in the fixture`);
  for (const el of els) {
    const s = window.getComputedStyle(el);
    assert.equal(s.maxWidth, 'none', `${selector} has no max-width`);
    assert.ok(['auto', '100%', ''].includes(s.width), `${selector} width is ${s.width}`);
    for (const side of ['marginLeft', 'marginRight']) assert.ok(['0', '0px', ''].includes(s[side]), `${selector} ${side} is ${s[side]}`);
  }
}

const TEMPLATES = {
  'topics A-Z': {
    panel: `<section id="panel-subject" class="panel"><div id="subject-body">
      <div class="subject-head topic-index-head"><div><h1>Topics A–Z</h1><p class="topic-index-lede">Lede.</p></div></div>
      <div class="topic-index-tools"><p class="topic-index-note">Note.</p></div>
      <div class="topic-index-cols"><span>Topic</span></div>
      <ul class="topic-index-list"><li></li></ul>
      <details class="topic-index-coverage"><summary>Coverage</summary></details></div></section>`,
    blocks: ['#panel-subject', '.topic-index-head', '.topic-index-tools', '.topic-index-cols', '.topic-index-list', '.topic-index-coverage'],
  },
  'topic page': {
    panel: `<section id="panel-subject" class="panel"><div id="subject-body">
      <div class="topic-reader-tools"><form class="topic-ask-form"></form></div>
      <div class="subject-grid topic-page-grid"><div class="subject-main">
        <section class="topic-money ui-section"><figure class="chart"></figure></section>
        <section class="topic-tide ui-section"><figure></figure></section><section class="topic-arc ui-section"><ol></ol></section>
      </div><aside class="infobox"></aside></div></div></section>`,
    // The main column's blocks fill their grid track, which runs from the grid's own width.
    blocks: ['#panel-subject', '.topic-reader-tools', '.topic-page-grid', '.topic-money', '.topic-page-grid .chart', '.topic-tide', '.topic-arc'],
  },
  bill: {
    panel: `<section id="panel-bill" class="panel"><div id="bill-body">
      <div class="ui-page-head bill-head"><h1 id="bill-title" class="bill-title">A Bill</h1></div>
      <section class="growth-ask"></section>
      <section class="ui-section bill-section" data-accent="bills"></section></div></section>`,
    blocks: ['#panel-bill', '.bill-head', '.growth-ask', '#bill-body .bill-section'],
  },
  'money explain': {
    panel: `<section id="panel-money-records" class="panel"><article class="mx-page"><h1 class="mx-title">A flow</h1></article></section>`,
    blocks: ['#panel-money-records', '.mx-page'],
  },
  declared: {
    panel: `<section id="panel-declared" class="panel"><h1>Just declared</h1></section>`,
    blocks: ['#panel-declared'],
  },
  'report charts': {
    panel: `<section id="panel-reports" class="panel"><div id="report-stats"><figure class="chart"></figure><figure class="chart"></figure></div></section>`,
    blocks: ['#panel-reports', '#report-stats', '#report-stats > .chart'],
  },
  'electorate, instrument, party and person blocks': {
    panel: `<section id="panel-subject" class="panel"><div id="subject-body">
      <dl class="ui-kv el-demographics" data-variant="ledger"><div><dt>Median age</dt><dd>37</dd></div></dl>
      <dl class="ui-kv instrument-facts"><div><dt>Registered</dt><dd>2010</dd></div></dl>
      <div class="instrument-disclosures"><details class="ui-disclosure instrument-disclosure"><summary>Version</summary></details></div>
      <section class="party-receipts"></section><section id="person-pay"></section></div></section>`,
    blocks: ['.el-demographics', '.instrument-facts', '.instrument-disclosure', '.party-receipts', '#person-pay'],
  },
};

test('the selectors here are the ones the pages draw', () => {
  const app = read('../public/app.js');
  const sources = { app, explain: read('../public/money-explain.js'), electorates: read('../public/electorates.js'), shell: read('../public/index.html'), instruments: read('../src/instruments.ts') };
  const drawn = [
    ['app', 'class="subject-head topic-index-head"'], ['app', 'class="topic-index-tools"'], ['app', 'class="topic-index-cols"'],
    ['app', 'class="topic-index-list"'], ['app', 'class="topic-index-coverage"'], ['app', 'classList.add("topic-page-grid")'],
    ['app', 'class="topic-reader-tools"'], ['app', 'class="topic-money ui-section"'], ['app', 'class="topic-tide ui-section"'],
    ['app', 'class="ui-page-head bill-head"'], ['app', 'class="party-receipts"'], ['app', 'slot.id = "person-pay"'],
    ['explain', 'class="mx-page"'], ['electorates', 'class="ui-kv el-demographics"'], ['shell', '<section id="panel-declared" class="panel"'],
    ['shell', 'id="report-stats"'], ['shell', '<div class="wrap masthead">'], ['instruments', 'class="ui-kv instrument-facts"'],
    ['instruments', 'class="ui-disclosure instrument-disclosure"'],
  ];
  for (const [file, markup] of drawn) assert.ok(sources[file].includes(markup), `${file} still draws ${markup}`);
});

test('the masthead and the page content share one grid', () => {
  const window = page('<section id="panel-subject" class="panel"></section>');
  const { document } = window;
  const head = window.getComputedStyle(document.querySelector('header .wrap'));
  const body = window.getComputedStyle(document.querySelector('#main > .wrap'));
  for (const prop of ['maxWidth', 'paddingLeft', 'paddingRight', 'marginLeft', 'marginRight', 'width', 'boxSizing']) {
    assert.equal(body[prop], head[prop], `#main .wrap ${prop} matches the masthead's`);
  }
});

for (const [name, { panel, blocks }] of Object.entries(TEMPLATES)) {
  test(`${name}: the container and its blocks fill the masthead's grid at every width`, () => {
    const window = page(panel);
    for (const selector of blocks) fills(window, selector);
  });
}

test('/community links the band\'s stylesheet and runs its page on the masthead\'s grid', () => {
  const html = read('../public/community.html');
  for (const sheet of ['style.css', 'ui-controls.css', 'nav.css', 'community.css']) {
    assert.match(html, new RegExp(`<link rel="stylesheet" href="/${sheet.replace('.', '\\.')}\\?v=`), `community.html links ${sheet}`);
  }
  assert.ok(html.includes('<div class="wrap masthead">'), 'community.html wears the synced masthead');
  assert.ok(html.includes('<main id="community-main" class="wrap community-main"'), 'its <main> is the page\'s .wrap');
  const js = read('../public/community.js');
  for (const markup of ['class="ui-page-head community-welcome"', 'class="ui-page-head community-list-head"', '<div class="community-discussion">']) {
    assert.ok(js.includes(markup), `community.js still draws ${markup}`);
  }

  const sheet = flatSheet(read('../public/style.css') + '\n' + read('../public/nav.css') + '\n' + read('../public/community.css'));
  const { window } = new JSDOM(`<!doctype html><html><head><style>${sheet}</style></head><body class="community-site">
    <header class="site-header"><div class="wrap masthead"><a class="logo" href="/">OPAX</a></div></header>
    <main id="community-main" class="wrap community-main"><nav class="ui-tabs community-nav"><a href="/community">Discussions</a></nav>
      <div id="community-content"><div class="ui-page-head community-welcome"><h1>Title</h1><p class="ui-lede">Lede.</p></div>
      <div class="community-feed-layout"><section></section><aside class="community-sidebar"></aside></div>
      <div class="community-discussion"></div></div></main></body></html>`).window;
  const head = window.getComputedStyle(window.document.querySelector('header .wrap'));
  const main = window.getComputedStyle(window.document.querySelector('#community-main'));
  for (const prop of ['maxWidth', 'paddingLeft', 'paddingRight', 'marginLeft', 'marginRight', 'width', 'boxSizing']) {
    assert.equal(main[prop], head[prop], `#community-main ${prop} matches the masthead's`);
  }
  fills(window, '.community-nav');
  fills(window, '.community-welcome');
  fills(window, '.community-feed-layout');
  // The lede keeps its reading measure; the discussion keeps a reading column on the left edge, never centred.
  assert.equal(window.getComputedStyle(window.document.querySelector('.community-welcome .ui-lede')).maxWidth, 'var(--size-readable)');
  const discussion = window.getComputedStyle(window.document.querySelector('.community-discussion'));
  for (const side of ['marginLeft', 'marginRight']) assert.ok(['0', '0px', ''].includes(discussion[side]), `.community-discussion ${side} is ${discussion[side]}`);
});
