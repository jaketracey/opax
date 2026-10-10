// Design tokens (docs/design/TOKENS.md): the generated CSS is fresh, every name
// the site used before the token source still resolves to the same value, the
// promised colour pairs pass AA in every theme, and raw hex colours only go down.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STYLE_BEGIN,
  STYLE_END,
  contrastPairs,
  loadSource,
  palettes,
  parties,
  staleTargets,
} from '../../scripts/build_tokens.mjs';

const PORTAL = fileURLToPath(new URL('..', import.meta.url));
const source = loadSource();
const style = readFileSync(join(PORTAL, 'public/style.css'), 'utf8');

test('generated token files match docs/design/design-tokens.json', () => {
  assert.deepEqual(staleTargets(['web', 'docs']), [], 'run `node scripts/build_tokens.mjs` and commit the result');
  const begin = style.indexOf(STYLE_BEGIN);
  assert.ok(begin >= 0 && style.includes(STYLE_END), 'style.css keeps its tokens:begin / tokens:end region');
  assert.ok(begin < style.indexOf(':root { --header-h'), 'the token region opens style.css');
});

// Custom properties in effect at a viewport width: top-level :root blocks plus
// :root blocks inside a matching min-width or max-width media query.
function customProperties(css, width) {
  const props = new Map();
  const blocks = css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?:@media \((min|max)-width: (\d+)px\)\s*\{\s*)?:root \{([^}]*)\}/g);
  for (const [, kind, px, body] of blocks) {
    if ((kind === 'min' && width < +px) || (kind === 'max' && width > +px)) continue;
    for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) props.set(name, value.trim());
  }
  return props;
}
function resolved(props, name, seen = []) {
  assert.ok(props.has(name), `${name} is not defined`);
  assert.ok(!seen.includes(name), `circular ${[...seen, name].join(' > ')}`);
  return props.get(name).replace(/var\((--[\w-]+)\)/g, (_, inner) => resolved(props, inner, [...seen, name]));
}

// style.css :root on main before the token source (a3aa6532 lineage), resolved.
// A pair is [701px and wider, 700px and narrower].
const SERIF = '"Merriweather", Georgia, "Times New Roman", serif';
const BEFORE = {
  '--paper': '#FAF9F6', '--paper-raised': '#FFFFFF', '--paper-sunken': '#F1EFE8',
  '--ink': '#23271F', '--ink-soft': '#575C52', '--ink-faint': '#6F7468',
  '--line': '#DFDCD2', '--line-strong': '#8D897B', '--divider-subtle': '#DFDCD2', '--divider-default': '#B8B4A8',
  '--bronze-ink': '#8A5A12', '--bronze': '#A0761B',
  '--bronze-wash': 'rgba(160, 118, 27, 0.16)', '--bronze-rule': 'rgba(160, 118, 27, 0.55)',
  '--danger': '#A4262C', '--chart-mark': '#A0761B',
  '--navy': '#142A43', '--navy-raised': '#1D3A5C', '--on-navy': '#FFFFFF', '--on-navy-soft': '#B7C6D9', '--bronze-bright': '#D9A84A',
  '--party-alp': '#B02E33', '--party-lib': '#1D4F91', '--party-nat': '#8F6E00', '--party-lnp': '#4A90D9',
  '--party-grn': '#2E7D32', '--party-onp': '#BF5B15', '--party-ind': '#3E5B77', '--party-oth': '#7C6690',
  '--serif': SERIF,
  '--sans': '"Public Sans", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  '--heading-page': `400 clamp(1.9rem, 4.5vw, 2.75rem)/1.25 ${SERIF}`,
  '--heading-section': `600 1.4rem/1.35 ${SERIF}`,
  '--heading-subsection': `600 1.125rem/1.35 ${SERIF}`,
  '--heading-tracking': '0.005em',
  '--space-1': '0.25rem', '--space-2': '0.4rem', '--space-3': ['0.65rem', '0.5rem'], '--space-4': '1rem',
  '--space-5': '1.6rem', '--space-6': ['2.6rem', '2rem'], '--space-7': ['4.2rem', '3.25rem'],
  '--row-gap': ['0.65rem', '0.5rem'], '--sub-gap': ['2.6rem', '2rem'], '--section-gap': ['4.2rem', '3.25rem'],
  '--header-h': ['107px', '61px'],
};

test('every name style.css defined before the token source keeps its value', () => {
  for (const [width, index] of [[1280, 0], [390, 1]]) {
    const props = customProperties(style, width);
    for (const [name, expected] of Object.entries(BEFORE))
      assert.equal(resolved(props, name), Array.isArray(expected) ? expected[index] : expected, `${name} at ${width}px`);
  }
  assert.match(style, /:root \{\n {2}color-scheme: light;/);
});

const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c((n >> 16) & 255) + 0.7152 * c((n >> 8) & 255) + 0.0722 * c(n & 255);
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('promised colour pairs pass in light, dark and both Increase Contrast themes', () => {
  const p = palettes(source);
  const themes = {
    light: p.light,
    dark: p.dark,
    lightHighContrast: { ...p.light, ...p.lightHighContrast },
    darkHighContrast: { ...p.dark, ...p.darkHighContrast },
  };
  const pairs = contrastPairs(source);
  const failures = [];
  const need = (theme, fg, bg, min, label = `${fg} on ${bg}`) => {
    const ratio = contrast(fg.startsWith('#') ? fg : themes[theme][fg], bg.startsWith('#') ? bg : themes[theme][bg]);
    if (ratio < min) failures.push(`${theme}: ${label} ${ratio.toFixed(2)} < ${min}`);
  };
  for (const theme of Object.keys(themes)) {
    for (const { fg, bg } of pairs.text) need(theme, fg, bg, 4.5);
    for (const { fg, bg } of pairs.nonText) need(theme, fg, bg, 3);
    if (theme.endsWith('HighContrast')) for (const { fg, bg } of pairs.strong) need(theme, fg, bg, 7);
    const dark = theme.startsWith('dark');
    for (const party of parties(source)) {
      const { dot, wash } = dark ? party.dark : party;
      for (const surface of ['paper', 'raised']) need(theme, dot, themes[theme][surface], 3, `${party.key} dot on ${surface}`);
      for (const text of ['ink', 'inkSoft']) need(theme, themes[theme][text], wash, 4.5, `${text} on the ${party.key} wash`);
    }
  }
  assert.deepEqual(failures, []);
  // Text tokens step up under Increase Contrast; the forbidden pairs really fail.
  assert.equal(themes.lightHighContrast.inkFaint, p.light.inkSoft);
  assert.equal(themes.lightHighContrast.inkSoft, p.light.ink);
  assert.equal(themes.darkHighContrast.inkSoft, p.dark.ink);
  for (const { fg, bg } of pairs.forbidden) assert.ok(contrast(p.light[fg], p.light[bg]) < 4.5, `${fg} on ${bg} should fail AA`);
  // The web's translucent bronze wash flattens over paper to the app's opaque one.
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(p.light.paper.slice(i, i + 2), 16));
  const flat = [[r, 160], [g, 118], [b, 27]].map(([under, over]) => Math.round(under * 0.84 + over * 0.16));
  const wash = [1, 3, 5].map((i) => parseInt(p.light.bronzeWash.slice(i, i + 2), 16));
  flat.forEach((channel, i) => assert.ok(Math.abs(channel - wash[i]) <= 1, `bronze wash channel ${i}`));
});

// --- raw hex colours ---------------------------------------------------------
// Hex colour literals in the web's hand-written front-end sources. Tokens live
// in tokens.css and the generated region of style.css; bundles are counted at
// their source (graph/, grants-map/, voice/, analytics/); the Leaflet CSS is
// vendored. A file may go down, never up; a new file starts at zero. When a
// pass removes some, lower its number here.
const HEX_BASELINE = {
  // Pass 4G took every module, page and stylesheet to zero. What is left must
  // be a literal: a theme-color meta (browsers read no custom properties
  // there) and the procurement map's two node colours, handed to three.js.
  'public/index.html': 1,
  'public/home.html': 1,
  'public/procurement-data.js': 2,
};
// Filled from the counts at pass 5 lane D (design/p5w-shell, merged with lane
// B), after their regions moved to roles and canonical names. Lower a number when a pass
// removes some; never raise one.
const TYPE_BASELINE = {
  'graph/explain.ts': 1,
  'graph/index.ts': 7,
  'graph/map3d-engine.ts': 2,
  'graph/words.ts': 3,
  'public/app.js': 3,
  'public/ballot.css': 2,
  'public/community.css': 5,
  'public/community.html': 9,
  'public/grants.js': 6,
  'public/home.css': 8,
  'public/hubs.css': 19,
  'public/index.html': 9,
  'public/ledger.js': 2,
  'public/matrix.js': 1,
  'public/quiz.js': 4,
  'public/st-test.html': 1,
  'public/stages.js': 2,
  'public/style.css': 652,
  'public/thenvsnow.js': 2,
  'public/timemachine.js': 15,
  'public/ui-controls.css': 9,
  'public/ui-source.css': 2,
  'public/ui-workbench.css': 10,
  'public/voice.css': 19,
  'public/wordsdollars.js': 2,
  'src/community-notifications.ts': 4,
};
const DEPRECATED_BASELINE = {
  'public/style.css': 629,
  'public/ui-controls.css': 2,
  'public/ui-workbench.css': 5,
  'public/voice.css': 4,
};
const HEX = /(?<![\w&#-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const SCANNED = ['public', 'graph', 'grants-map', 'voice', 'analytics'];
const SKIP = new Set([
  'public/tokens.css', // the tokens themselves
  'public/chunks', 'public/money-map.js', 'public/explain.js', // graph/ bundles
  'public/voice.js', 'public/grants-map.js', 'public/grants-map.css', // voice/ and grants-map/ bundles (Leaflet CSS)
  'public/analytics.js', 'public/events.js', 'public/ga.js', // analytics/ bundles
]);

/** Per file, how many times `count` finds something in its text: the
 *  hand-written sources under `dirs`, minus `skip`, and style.css without its
 *  generated token region. */
function countPerFile(count, dirs = SCANNED, skip = SKIP) {
  const counts = {};
  const walk = (dir) => {
    for (const name of readdirSync(join(PORTAL, dir))) {
      const path = `${dir}/${name}`;
      if (name === 'node_modules' || name.startsWith('.') || skip.has(path)) continue;
      const full = join(PORTAL, path);
      if (statSync(full).isDirectory()) walk(path);
      else if (['.css', '.js', '.mjs', '.html', '.ts'].includes(extname(name))) {
        let text = readFileSync(full, 'utf8');
        if (path === 'public/style.css') text = text.slice(0, text.indexOf(STYLE_BEGIN)) + text.slice(text.indexOf(STYLE_END));
        const n = count(text);
        if (n) counts[relative(PORTAL, full)] = n;
      }
    }
  };
  for (const dir of dirs) walk(dir);
  return counts;
}
const rawHexCounts = () => countPerFile((text) => text.match(HEX)?.length ?? 0);

/** A count that may go down, never up: a file over its baseline fails, a new
 *  file starts at zero, a file under its baseline is reported for lowering. */
function onlyDown(t, label, counts, baseline, fix) {
  const over = Object.entries(counts)
    .filter(([file, n]) => n > (baseline[file] ?? 0))
    .map(([file, n]) => `${file}: ${n} ${label} (baseline ${baseline[file] ?? 0}); ${fix}`);
  assert.deepEqual(over, []);
  for (const [file, n] of Object.entries(baseline))
    if ((counts[file] ?? 0) < n) t.diagnostic(`${file} is down to ${counts[file] ?? 0} ${label} from ${n}: lower the baseline`);
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  t.diagnostic(`${label}: ${sum(counts)} (baseline ${sum(baseline)})`);
}

test('no new raw hex colours outside the tokens', (t) => {
  onlyDown(t, 'raw hex colours', rawHexCounts(), HEX_BASELINE, 'use a token from tokens.css');
});

// --- raw type values and deprecated token names ------------------------------
// Pass 5 (lane D): the hex test could not see two other bypasses. Both are
// counted per file in the same sources plus the Worker's HTML and CSS strings
// in src/ (not the share-card renderer or the email, which draw outside the
// site's stylesheet). Each count may go down, never up.
const TYPE_DIRS = [...SCANNED, 'src'];
const TYPE_SKIP = new Set([...SKIP, 'src/og.ts', 'src/og-render.ts', 'src/community-email.ts', 'src/community-email-mark.ts']);

// A font, font-size or font-weight set to anything but a role (var(--type-*))
// or a keyword that defers to one: "font: 600 1rem/1.4 var(--sans)",
// "font-size: 13px", "font-weight: 700".
const RAW_TYPE = /(?<![\w-])font(?:-size|-weight)?\s*:\s*(?!var\(|inherit\b|initial\b|unset\b|revert\b)[^\s;}"'`]/g;
const rawTypeCounts = () => countPerFile((text) => text.match(RAW_TYPE)?.length ?? 0, TYPE_DIRS, TYPE_SKIP);

// Uses of a name design-tokens.json lists as deprecated for the web (aliases
// kept for one release: --space-1..7, --line, --heading-*, --row-gap, ...).
const DEPRECATED = new Set(Object.keys(source.deprecated.web).filter((name) => name.startsWith('--')));
const deprecatedCounts = () => countPerFile(
  (text) => [...text.matchAll(/var\(\s*(--[\w-]+)\s*[,)]/g)].filter(([, name]) => DEPRECATED.has(name)).length,
  TYPE_DIRS, TYPE_SKIP);

test('the type and deprecated-name counters see what they should', () => {
  const type = (css) => css.match(RAW_TYPE)?.length ?? 0;
  assert.equal(type('a { font: 600 1rem/1.4 var(--sans); font-size: 13px; font-weight: 700; }'), 3);
  assert.equal(type('a { font: var(--type-fine); font-size: inherit; font-weight: var(--x); font-family: var(--serif); font-variant-numeric: tabular-nums; --font-size: 2px; }'), 0);
  assert.ok(DEPRECATED.has('--space-3') && DEPRECATED.has('--line') && !DEPRECATED.has('--space-row'));
  const names = (css) => [...css.matchAll(/var\(\s*(--[\w-]+)\s*[,)]/g)].filter(([, name]) => DEPRECATED.has(name)).length;
  assert.equal(names('a { margin: var(--space-3) var(--space-row); border-color: var(--line); color: var(--line-control); }'), 2);
});

test('no new raw type values outside the roles', (t) => {
  onlyDown(t, 'raw type values', rawTypeCounts(), TYPE_BASELINE, 'use a --type-* role from tokens.css');
});

test('no new uses of deprecated token names', (t) => {
  onlyDown(t, 'deprecated token names', deprecatedCounts(), DEPRECATED_BASELINE, 'use the name design-tokens.json gives as its replacement');
});
