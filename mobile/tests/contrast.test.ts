import {
  componentPairs,
  contrastRatio,
  forbiddenPairs,
  partyWashPairs,
  requiredRatio,
} from '../src/design/contrast';
import { light, lightHighContrast, partyColors } from '../src/design/palette';

const ratio = (a: string, b: string) =>
  Math.round(contrastRatio(a, b) * 100) / 100;

describe('contrast of every pair the components draw', () => {
  test.each(componentPairs.map((pair) => [pair.use, pair] as const))(
    '%s',
    (_, pair) => {
      const value = contrastRatio(pair.foreground, light[pair.background]);
      expect(value).toBeGreaterThanOrEqual(requiredRatio[pair.kind]);
    },
  );
  test.each(partyWashPairs.map((pair) => [pair.use, pair] as const))(
    '%s',
    (_, pair) => {
      expect(
        contrastRatio(pair.foreground, pair.background),
      ).toBeGreaterThanOrEqual(requiredRatio.text);
    },
  );
  test('the pairs IOS-UX forbids really fail', () => {
    for (const pair of forbiddenPairs)
      expect(
        contrastRatio(pair.foreground, light[pair.background]),
      ).toBeLessThan(requiredRatio.text);
  });
});

describe('ratios recorded in IOS-UX section 5', () => {
  test('text tokens', () => {
    expect(ratio(light.ink, light.paper)).toBeCloseTo(14.44, 1);
    expect(ratio(light.ink, light.raised)).toBeCloseTo(15.2, 1);
    expect(ratio(light.ink, light.sunken)).toBeCloseTo(13.21, 1);
    expect(ratio(light.inkSoft, light.paper)).toBeCloseTo(6.52, 1);
    expect(ratio(light.inkSoft, light.sunken)).toBeCloseTo(5.97, 1);
    expect(ratio(light.inkFaint, light.paper)).toBeCloseTo(4.56, 1);
    expect(ratio(light.inkFaint, light.raised)).toBeCloseTo(4.8, 1);
    expect(ratio(light.inkFaint, light.sunken)).toBeCloseTo(4.17, 1);
    expect(ratio(light.bronzeInk, light.paper)).toBeCloseTo(5.62, 1);
    expect(ratio(light.bronzeInk, light.bronzeWash)).toBeCloseTo(4.67, 1);
    expect(ratio(light.bronze, light.paper)).toBeCloseTo(3.91, 1);
    expect(ratio(light.danger, light.paper)).toBeCloseTo(6.9, 1);
    expect(ratio(light.onNavy, light.navy)).toBeCloseTo(14.56, 1);
    expect(ratio(light.onNavySoft, light.navy)).toBeCloseTo(8.39, 1);
    expect(ratio(light.bronzeBright, light.navy)).toBeCloseTo(6.69, 1);
    expect(ratio(light.lineStrong, light.paper)).toBeCloseTo(3.33, 1);
  });
  test('party dots clear 3:1 on paper', () => {
    for (const hex of Object.values(partyColors))
      expect(contrastRatio(hex, light.paper)).toBeGreaterThanOrEqual(3);
    expect(ratio(partyColors.lnp, light.paper)).toBeCloseTo(3.17, 1);
    expect(ratio(partyColors.nationals, light.paper)).toBeCloseTo(4.53, 1);
  });
});

describe('Increase Contrast', () => {
  test('text tokens step up one level and subtle rules take the default', () => {
    expect(lightHighContrast.inkFaint).toBe(light.inkSoft);
    expect(lightHighContrast.inkSoft).toBe(light.ink);
    expect(lightHighContrast.dividerSubtle).toBe(light.dividerDefault);
  });
  test('stepped-up faint text passes on every surface, sunken included', () => {
    for (const surface of [
      light.paper,
      light.raised,
      light.sunken,
      light.bronzeWash,
    ])
      expect(
        contrastRatio(lightHighContrast.inkFaint!, surface),
      ).toBeGreaterThanOrEqual(4.5);
  });
  test('category inks and bronzeInk strengthen to 7:1 on their wash and every surface', () => {
    const inks = [
      ['bronzeInk', 'bronzeWash'],
      ['moneyInk', 'moneyWash'],
      ['votesInk', 'votesWash'],
      ['interestsInk', 'interestsWash'],
      ['billsInk', 'billsWash'],
    ] as const;
    for (const [ink, wash] of inks) {
      const strong = lightHighContrast[ink]!;
      for (const surface of [
        light[wash],
        light.paper,
        light.raised,
        light.sunken,
      ]) {
        expect(contrastRatio(strong, surface)).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(strong, surface)).toBeGreaterThan(
          contrastRatio(light[ink], surface),
        );
      }
    }
  });
});
