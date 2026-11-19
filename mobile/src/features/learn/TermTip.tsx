import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  StyleSheet,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import { PlainPressable as Pressable } from '../../design/pressable';
import { useKeyCommand } from '../../design/keyboard';
import { Text } from '../../design/text';
import {
  border,
  hairline,
  minimumTarget,
  radii,
  rhythm,
  textStyles,
} from '../../design/tokens';
import { makeStyles, useColors } from '../../design/use-colors';
import { learnCopy } from './copy';
import { glossaryTerm, isTermId, termTitle } from './glossary';
import { termRoute } from './routes';

/** The popover's inset: its text and its action share it. */
export const TIP_INSET = rhythm.block;
/**
 * The smallest text size iOS offers draws body text at about 0.8 of the
 * default, and the label's line with it: the reach is worked out there, so
 * the target is 44 pt tall at every size, not only at the default.
 */
const SMALLEST_TEXT = 0.8;
const reach = Math.ceil(
  (minimumTarget - textStyles.strong.lineHeight * SMALLEST_TEXT) / 2,
);
/** The label's own padding each side: the pressed wash's air. */
const MORE_PADDING = rhythm.tight;
/**
 * How far the touch reaches past the "More" label, so the target is at
 * least the minimum (44 pt) while the label keeps the text's insets. Never
 * past the popover's own edge, on either side: a touch outside it closes
 * the popover, and in a right-to-left layout "More" sits on the other
 * side, so the two sides are the same. The label with its padding is
 * already wider than the minimum.
 */
export const MORE_SLOP = {
  top: reach,
  bottom: Math.min(reach, TIP_INSET),
  left: TIP_INSET - MORE_PADDING,
  right: TIP_INSET - MORE_PADDING,
} as const;

const close = () => {
  if (router.canGoBack()) router.back();
};

/**
 * `/term-tip?id=&x=&y=`: the popover at a tapped term (README 8.2). The
 * term, the guide's one line, and "More", which swaps the popover for the
 * answer sheet. A tap outside, Escape or Android back closes it. A
 * transparent root route, so no screen has to host it.
 */
export default function TermTip() {
  const colors = useColors();
  const styles = useStyles();

  const { id, x, y, over } = useLocalSearchParams<{
    id?: string;
    x?: string;
    y?: string;
    over?: string;
  }>();
  const window = useWindowDimensions();
  const dark = useColorScheme() === 'dark';
  // A keyboard's focus shows as the app's ring, as on the shared Pressable.
  const [focused, setFocused] = useState(false);
  useKeyCommand('list-escape', close);
  if (!isTermId(id)) return null;
  const term = glossaryTerm(id);
  const at = {
    x: Number(x) || window.width / 2,
    y: Number(y) || window.height / 2,
  };
  const width = Math.min(320, window.width - 2 * rhythm.block);
  // Below the word in the upper part of the window, above it lower down.
  const below = at.y < window.height * 0.62;
  return (
    <View style={styles.fill} testID="term-tip">
      <Pressable
        feedback="none"
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={styles.fill}
        onPress={close}
        testID="term-tip-backdrop"
      />
      <View
        accessibilityViewIsModal
        testID={`term-tip-${id}`}
        style={[
          styles.bubble,
          dark ? styles.bubbleDark : styles.bubbleShadow,
          {
            width,
            left: Math.max(
              rhythm.block,
              Math.min(at.x - width / 2, window.width - width - rhythm.block),
            ),
          },
          below ? { top: at.y + 14 } : { bottom: window.height - at.y + 14 },
        ]}
      >
        <Text variant="strong" accessibilityRole="header">
          {termTitle(id)}
        </Text>
        <Text wordSafe variant="body">
          {term.short}
        </Text>
        <Pressable
          feedback="wash"
          accessibilityRole="button"
          accessibilityLabel={`${learnCopy.more} about ${term.word}`}
          onPress={() => router.replace(termRoute(id, over === '1'))}
          // The label sits on the text's own insets; the touch reaches past
          // it to the 44 pt target.
          hitSlop={MORE_SLOP}
          android_ripple={{ color: colors.sunken }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={focused ? [styles.more, styles.focused] : styles.more}
          testID={`term-tip-${id}-more`}
        >
          <Text variant="strong" tone="navy">
            {learnCopy.more}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    focused: {
      outlineColor: colors.navy,
      outlineWidth: border.focus,
      outlineOffset: border.focus,
      outlineStyle: 'solid',
    },
    fill: StyleSheet.absoluteFill,
    bubble: {
      position: 'absolute',
      backgroundColor: colors.raised,
      borderRadius: radii.tile,
      borderCurve: 'continuous',
      borderWidth: hairline,
      borderColor: colors.dividerSubtle,
      // One inset on every side the action touches: "More" ends on the text's
      // trailing edge and sits as far from the foot as from the side.
      paddingHorizontal: TIP_INSET,
      paddingTop: rhythm.row,
      paddingBottom: TIP_INSET,
      gap: rhythm.line,
    },
    // Light: the popover floats on a soft shadow.
    bubbleShadow: {
      shadowColor: colors.ink,
      shadowOpacity: 0.16,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    // Dark: no shadow reads on the near-black page, and one drawn in ink
    // would glow. A firmer hairline carries the popover's edge instead.
    bubbleDark: { borderColor: colors.dividerDefault },
    // On the text's trailing edge, a line's gap closer than a new block. The
    // pressed wash bleeds a little past the label on each side, as a quiet
    // button's does, without moving the label off that edge.
    more: {
      alignSelf: 'flex-end',
      marginTop: rhythm.line,
      paddingHorizontal: MORE_PADDING,
      marginHorizontal: -MORE_PADDING,
      borderRadius: radii.thumb,
      borderCurve: 'continuous',
    },
  }),
);
