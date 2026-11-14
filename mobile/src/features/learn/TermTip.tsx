import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Button } from '../../design/controls';
import { useKeyCommand } from '../../design/keyboard';
import { Text } from '../../design/text';
import { colors, hairline, radii, rhythm } from '../../design/tokens';
import { learnCopy } from './copy';
import { glossaryTerm, isTermId, termTitle } from './glossary';
import { termRoute } from './routes';

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
        <View style={styles.more}>
          <Button
            label={learnCopy.more}
            variant="plain"
            accessibilityLabel={`${learnCopy.more} about ${term.word}`}
            onPress={() => router.replace(termRoute(id, over === '1'))}
            testID={`term-tip-${id}-more`}
          />
        </View>
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
    paddingHorizontal: rhythm.block,
    paddingTop: rhythm.row,
    paddingBottom: rhythm.line,
    gap: rhythm.line,
    shadowColor: colors.ink,
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  more: { alignSelf: 'flex-end', marginRight: -rhythm.tight },
});
