import { Platform } from 'react-native';
import { dpToSp, spToDp } from '../../modules/opax-text-metrics';
import {
  contentSizeCategory,
  type ContentSizeCategory,
  type DynamicTypeRamp,
} from './tokens';

// Apple's iOS/iPadOS Dynamic Type sizes, xSmall through AX5. These validate
// event provenance; UIFontMetrics still scales the actual native text.
// https://developer.apple.com/design/human-interface-guidelines/typography#Specifications
const sizes: Record<DynamicTypeRamp, readonly number[]> = {
  largeTitle: [31, 32, 33, 34, 36, 38, 40, 44, 48, 52, 56, 60],
  title1: [25, 26, 27, 28, 30, 32, 34, 38, 43, 48, 53, 58],
  title2: [19, 20, 21, 22, 24, 26, 28, 34, 39, 44, 50, 56],
  title3: [17, 18, 19, 20, 22, 24, 26, 31, 37, 43, 49, 55],
  headline: [14, 15, 16, 17, 19, 21, 23, 28, 33, 40, 47, 53],
  body: [14, 15, 16, 17, 19, 21, 23, 28, 33, 40, 47, 53],
  callout: [13, 14, 15, 16, 18, 20, 22, 26, 32, 38, 44, 51],
  subheadline: [12, 13, 14, 15, 17, 19, 21, 25, 30, 36, 42, 49],
  footnote: [12, 12, 12, 13, 15, 17, 19, 23, 27, 33, 38, 44],
  caption1: [11, 11, 11, 12, 14, 16, 18, 22, 26, 32, 37, 43],
  caption2: [11, 11, 11, 11, 13, 15, 17, 20, 24, 29, 34, 40],
};
/**
 * The XXXL body size over Large's (23 / 17): the cap for one-line chrome
 * text that sits beside fixed-size controls, such as Ask's composer
 * placeholder and the search field's (sweep 1, 2.1 and 2.5).
 */
export const chromeTextScaleCap = 23 / 17;
const index: Record<ContentSizeCategory, number> = {
  xSmall: 0,
  small: 1,
  medium: 2,
  large: 3,
  xLarge: 4,
  xxLarge: 5,
  xxxLarge: 6,
  ax1: 7,
  ax2: 8,
  ax3: 9,
  ax4: 10,
  ax5: 11,
};

export function textRampScale(
  ramp: DynamicTypeRamp,
  fontScale: number,
  maxFontSizeMultiplier = 0,
  os: string = Platform.OS,
  lineHeightSp?: number,
) {
  // RN Android's TextAttributeProps converts explicit lineHeight from SP
  // without maxFontSizeMultiplier; the ceiling applies to fontSize only.
  // Our event guard compares line heights, so preserve that native scale.
  if (os !== 'ios') {
    if (lineHeightSp === undefined) return undefined;
    const height = spToDp(lineHeightSp, fontScale);
    return height === undefined ? undefined : height / lineHeightSp;
  }
  const points = sizes[ramp];
  const full = points[index[contentSizeCategory(fontScale)]]! / points[3]!;
  return maxFontSizeMultiplier >= 1
    ? Math.min(full, maxFontSizeMultiplier)
    : full;
}

/** Convert a desired measured line scale back to the SP size RN must draw. */
export function androidCapScale(
  baseSp: number,
  cap: number,
  fontScale: number,
) {
  const sp = dpToSp(baseSp * cap, fontScale);
  return sp === undefined ? undefined : sp / baseSp;
}
