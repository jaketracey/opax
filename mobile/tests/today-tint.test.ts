import { contrastRatio, requiredRatio } from '../src/design/contrast';
import { light, partyColors } from '../src/design/tokens';
import {
  accentOf,
  billAccent,
  billTone,
  brandAccent,
  markOn,
  mix,
  moneyAccent,
  partyAccent,
  topicAccent,
  washOf,
  type Accent,
} from '../src/features/today/tint';

// Every pair Today's own components draw with derived colours (src/features/
// today). The design system's role pairs are in contrast.ts; these are the
// party, brand and money accents, their washes and the bill tones.
const accents: [string, Accent][] = [
  ...Object.entries(partyColors).map(
    ([party, hex]) => [`party ${party}`, accentOf(hex)] as [string, Accent],
  ),
  ['brand', brandAccent],
  ['money', moneyAccent],
  ...(['passed', 'before_parliament', 'exposure_draft', 'lapsed'] as const).map(
    (status) => [`bill ${status}`, billAccent(status)] as [string, Accent],
  ),
  ...[0, 1, 2].map((i) => [`topic ${i}`, topicAccent(i)] as [string, Accent]),
];
const text = requiredRatio.text;
const mark = requiredRatio['non-text'];

describe.each(accents)('%s accent', (_name, accent) => {
  test('white titles and soft lines read on the deep header', () => {
    expect(contrastRatio(light.onNavy, accent.deep)).toBeGreaterThanOrEqual(5);
    expect(contrastRatio(accent.soft, accent.deep)).toBeGreaterThanOrEqual(
      text,
    );
  });
  test('ink, ink-soft and accent text read on the wash and on raised tiles', () => {
    for (const ground of [accent.wash, light.raised]) {
      expect(contrastRatio(light.ink, ground)).toBeGreaterThanOrEqual(text);
      expect(contrastRatio(light.inkSoft, ground)).toBeGreaterThanOrEqual(text);
      expect(contrastRatio(accent.ink, ground)).toBeGreaterThanOrEqual(text);
    }
  });
  test('the identity colour marks the raised surface at 3:1', () => {
    expect(contrastRatio(accent.base, light.raised)).toBeGreaterThanOrEqual(
      mark,
    );
  });
  test('the primary action keeps 3:1 against the wash', () => {
    expect(contrastRatio(light.navy, accent.wash)).toBeGreaterThanOrEqual(mark);
  });
});

test('brand and money accents mark their own washes (timeline rails)', () => {
  for (const accent of [brandAccent, moneyAccent])
    expect(contrastRatio(accent.base, accent.wash)).toBeGreaterThanOrEqual(
      mark,
    );
});

test('bill tones mark their own washes (status chips)', () => {
  for (const status of [
    'passed',
    'before_parliament',
    'exposure_draft',
    'lapsed',
  ]) {
    const tone = billAccent(status);
    expect(contrastRatio(tone.base, tone.wash)).toBeGreaterThanOrEqual(mark);
  }
});

test('party chips: ink on every party wash, and each dot marks its wash at 3:1', () => {
  for (const hex of Object.values(partyColors)) {
    const ground = washOf(hex, 0.14);
    expect(contrastRatio(light.ink, ground)).toBeGreaterThanOrEqual(text);
    expect(contrastRatio(markOn(hex, ground), ground)).toBeGreaterThanOrEqual(
      mark,
    );
  }
  // The light LNP blue is darkened on its wash; others keep their colour.
  expect(markOn(partyColors.labor, washOf(partyColors.labor, 0.14))).toBe(
    partyColors.labor,
  );
  expect(markOn(partyColors.lnp, washOf(partyColors.lnp, 0.14))).not.toBe(
    partyColors.lnp,
  );
});

test('declaration categories and follow changes use bronze on its washes', () => {
  expect(
    contrastRatio(light.bronzeInk, light.bronzeWash),
  ).toBeGreaterThanOrEqual(text);
  const changed = washOf(light.bronzeInk, 0.1);
  expect(contrastRatio(light.bronzeInk, changed)).toBeGreaterThanOrEqual(text);
  expect(contrastRatio(light.ink, changed)).toBeGreaterThanOrEqual(text);
  expect(contrastRatio(light.inkSoft, changed)).toBeGreaterThanOrEqual(text);
  expect(contrastRatio(light.onNavy, light.bronzeInk)).toBeGreaterThanOrEqual(
    mark,
  );
  expect(
    contrastRatio(light.navy, washOf(light.navy, 0.1)),
  ).toBeGreaterThanOrEqual(mark);
});

test('the Leads card: white, soft and bronze text on navy, resting and pressed', () => {
  for (const ground of [light.navy, light.navyRaised]) {
    expect(contrastRatio(light.onNavy, ground)).toBeGreaterThanOrEqual(text);
    expect(contrastRatio(light.onNavySoft, ground)).toBeGreaterThanOrEqual(
      text,
    );
    expect(contrastRatio(light.bronzeBright, ground)).toBeGreaterThanOrEqual(
      text,
    );
  }
  expect(
    contrastRatio(
      light.bronzeBright,
      mix(light.navy, light.bronzeBright, 0.18),
    ),
  ).toBeGreaterThanOrEqual(mark);
});

test('a party the design system does not colour takes the brand accent', () => {
  expect(partyAccent('Liberal').base).toBe(partyColors.liberal);
  expect(partyAccent(null)).toBe(brandAccent);
  expect(partyAccent('Party not recorded')).toBe(brandAccent);
  expect(partyAccent('Independent').base).toBe(partyColors.independent);
});

test.each([
  ['passed', 'passed'],
  ['before_parliament', 'before'],
  ['exposure_draft', 'draft'],
  ['lapsed', 'ended'],
  ['withdrawn', 'ended'],
  ['', 'unknown'],
])('bill status %s has the %s tone', (status, tone) => {
  expect(billTone(status)).toBe(tone);
});
