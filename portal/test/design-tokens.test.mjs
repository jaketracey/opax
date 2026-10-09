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
  'public/grants.js': 123,
  'public/timemachine.js': 120,
  'graph/index.ts': 84,
  'public/ledger.js': 71,
  'public/ballot.css': 57,
  'public/style.css': 53,
  'public/voice.css': 39,
  'graph/palette.ts': 38,
  'public/thenvsnow.js': 34,
  'public/statemap.js': 31,
  'public/matrix.js': 21,
  'public/wordsdollars.js': 21,
  'public/app.js': 17,
  'graph/words.ts': 17,
  'public/home-prototype.html': 16,
  'public/home.html': 16,
  'public/newsrail.js': 16,
  'public/quiz.js': 16,
  'public/lg-test.html': 11,
  'public/tm-test.html': 11,
  'public/ui-controls.css': 11,
  'public/map.html': 10,
  'public/stages.js': 10,
  'public/ui-workbench.html': 9,
  'public/wombat.js': 7,
  'graph/explain.ts': 5,
  'public/community.css': 4,
  'public/evidence.js': 2,
  'public/procurement-data.js': 2,
  'public/index.html': 1,
  'public/money-journeys-data.js': 1,
  'public/money-journeys.js': 1,
  'public/ui-workbench.css': 1,
  'graph/connection-fallback.ts': 1,
  'graph/map3d-engine.ts': 1,
};
const HEX = /(?<![\w&#-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const SCANNED = ['public', 'graph', 'grants-map', 'voice', 'analytics'];
const SKIP = new Set([
  'public/tokens.css', // the tokens themselves
  'public/chunks', 'public/money-map.js', 'public/explain.js', // graph/ bundles
  'public/voice.js', 'public/grants-map.js', 'public/grants-map.css', // voice/ and grants-map/ bundles (Leaflet CSS)
  'public/analytics.js', 'public/events.js', 'public/ga.js', // analytics/ bundles
]);

function rawHexCounts() {
  const counts = {};
  const walk = (dir) => {
    for (const name of readdirSync(join(PORTAL, dir))) {
      const path = `${dir}/${name}`;
      if (name === 'node_modules' || name.startsWith('.') || SKIP.has(path)) continue;
      const full = join(PORTAL, path);
      if (statSync(full).isDirectory()) walk(path);
      else if (['.css', '.js', '.mjs', '.html', '.ts'].includes(extname(name))) {
        let text = readFileSync(full, 'utf8');
        if (path === 'public/style.css') text = text.slice(0, text.indexOf(STYLE_BEGIN)) + text.slice(text.indexOf(STYLE_END));
        const n = text.match(HEX)?.length ?? 0;
        if (n) counts[relative(PORTAL, full)] = n;
      }
    }
  };
  for (const dir of SCANNED) walk(dir);
  return counts;
}

test('no new raw hex colours outside the tokens', (t) => {
  const counts = rawHexCounts();
  const over = Object.entries(counts)
    .filter(([file, n]) => n > (HEX_BASELINE[file] ?? 0))
    .map(([file, n]) => `${file}: ${n} raw hex colours (baseline ${HEX_BASELINE[file] ?? 0}); use a token from tokens.css`);
  assert.deepEqual(over, []);
  const under = Object.entries(HEX_BASELINE).filter(([file, n]) => (counts[file] ?? 0) < n);
  for (const [file, n] of under) t.diagnostic(`${file} is down to ${counts[file] ?? 0} from ${n}: lower HEX_BASELINE`);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  t.diagnostic(`raw hex colours: ${total} (baseline ${Object.values(HEX_BASELINE).reduce((sum, n) => sum + n, 0)})`);
});
