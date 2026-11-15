import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { PlainPressable as Pressable } from '../../design/pressable';
import { useKeyCommand } from '../../design/keyboard';
import { Text } from '../../design/text';
import {
  colors,
  hairline,
  minimumTarget,
  radii,
  rhythm,
  textStyles,
} from '../../design/tokens';
import { learnCopy } from './copy';
import { glossaryTerm, isTermId, termTitle } from './glossary';
import { termRoute } from './routes';

/** The popover's inset: its text and its action share it. */
export const TIP_INSET = rhythm.block;
/**
 * How far the touch reaches past the "More" label, so the target is at
 * least the minimum (44 pt) while the label keeps the text's insets. Never
 * past the popover's own edge: a touch outside it closes the popover.
 */
const reach = Math.ceil((minimumTarget - textStyles.strong.lineHeight) / 2);
export const MORE_SLOP = {
  top: reach,
  bottom: Math.min(reach, TIP_INSET),
  left: minimumTarget,
  right: Math.min(reach, TIP_INSET - rhythm.tight),
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
  const { id, x, y, over } = useLocalSearchParams<{
    id?: string;
    x?: string;
    y?: string;
    over?: string;
  }>();
  const window = useWindowDimensions();
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
          style={styles.more}
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

const styles = StyleSheet.create({
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
    shadowColor: colors.ink,
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  // On the text's trailing edge, a line's gap closer than a new block. The
  // pressed wash bleeds a little past the label on each side, as a quiet
  // button's does, without moving the label off that edge.
  more: {
    alignSelf: 'flex-end',
    marginTop: rhythm.line,
    paddingHorizontal: rhythm.tight,
    marginHorizontal: -rhythm.tight,
    borderRadius: radii.thumb,
    borderCurve: 'continuous',
  },
});
