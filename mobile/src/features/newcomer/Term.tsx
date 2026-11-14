import { NavigationRouteContext } from 'expo-router/react-navigation';
import {
  Fragment,
  useContext,
  useEffect,
  useId,
  useState,
  type ComponentProps,
} from 'react';
import {
  Modal,
  Platform,
  Pressable as BarePressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import { useAccessibilitySize } from '../../design/accessibility';
import { Button } from '../../design/controls';
import { Text } from '../../design/text';
import { colors, hairline, radii, rhythm } from '../../design/tokens';
import { newcomerOption } from './option';
import { explainTerm } from './TermTip';
import { termPhrases, terms, type TermId } from './terms';

/**
 * Inline glossary terms (newcomer design pass; prototype).
 *
 * A term in running text takes a dotted underline the FIRST time it appears
 * on a screen, and nowhere after: a page that says "Senate" nine times marks
 * it once. A tap opens a small popover at the word: one line, and "More" for
 * the full answer. At accessibility sizes there is no popover (one line at
 * AX5 would not fit a bubble): the tap opens the full answer's sheet.
 *
 * VoiceOver cannot see an underline, and most terms sit inside a row that
 * reads as one element. So the term is offered twice over: standing text gets
 * the hint "Explains {term}"; a row or tile adds a custom action named for
 * the question ("What's a second reading?"), see `termAction`.
 *
 * Android has no dotted text decoration: the underline is solid there, in
 * the same soft ink, and the popover is the same view.
 */

// First use, per screen: route key -> term -> the instance that claimed it.
const claims = new Map<string, Map<TermId, string>>();
const listeners = new Set<() => void>();
function useFirstUse(term: TermId | null): boolean {
  const scope = useContext(NavigationRouteContext)?.key ?? 'root';
  const id = useId();
  const [, bump] = useState(0);
  useEffect(() => {
    if (!term) return;
    const mine = claims.get(scope) ?? new Map<TermId, string>();
    claims.set(scope, mine);
    if (!mine.has(term)) {
      mine.set(term, id);
      listeners.forEach((listener) => listener());
    }
    const listener = () => bump((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (mine.get(term) === id) {
        mine.delete(term);
        listeners.forEach((each) => each());
      }
    };
  }, [term, scope, id]);
  return !!term && claims.get(scope)?.get(term) === id;
}

/** The first known phrase in a string, if any. */
export function findTerm(
  text: string,
): { start: number; end: number; term: TermId } | null {
  let best: { start: number; end: number; term: TermId } | null = null;
  for (const [phrase, term] of termPhrases) {
    const start = text.indexOf(phrase);
    if (start < 0) continue;
    const boundary =
      !/[A-Za-z]/.test(text[start - 1] ?? '') &&
      !/[A-Za-z]/.test(text[start + phrase.length] ?? '');
    if (!boundary) continue;
    if (!best || start < best.start)
      best = { start, end: start + phrase.length, term };
  }
  return best;
}

/** A row's or tile's VoiceOver action for the term in its text. */
export function termAction(text: string) {
  const found =
    newcomerOption() === 'a' || !newcomerOption() ? null : findTerm(text);
  return found
    ? {
        name: `explain-${found.term}`,
        label: terms[found.term].question,
        onAction: () => explainTerm(found.term),
      }
    : null;
}

type TextProps = ComponentProps<typeof Text>;

/**
 * Text that marks the first glossary term in it. Options B and C only; in
 * every other build it is the plain `Text`.
 */
export function TermText({
  children,
  term: named,
  ...props
}: Omit<TextProps, 'children'> & {
  children: string;
  /** Mark this term on the whole phrase given by `phrase`, not by lookup. */
  term?: TermId;
}) {
  const on = newcomerOption() === 'b' || newcomerOption() === 'c';
  const found = on
    ? named
      ? { start: 0, end: children.length, term: named }
      : findTerm(children)
    : null;
  const first = useFirstUse(found?.term ?? null);
  const large = useAccessibilitySize();
  const window = useWindowDimensions();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  if (!found || !first) return <Text {...props}>{children}</Text>;
  const term = terms[found.term];
  const open = (event: GestureResponderEvent) => {
    if (large) return explainTerm(found.term);
    setAt({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
  };
  const width = Math.min(320, window.width - 32);
  const below = at ? at.y < window.height * 0.62 : true;
  return (
    <Fragment>
      <Text
        {...props}
        accessibilityHint={`Explains ${children.slice(found.start, found.end)}`}
      >
        {children.slice(0, found.start)}
        <Text
          onPress={open}
          suppressHighlighting={false}
          style={styles.term}
          testID={`term-inline-${found.term}`}
        >
          {children.slice(found.start, found.end)}
        </Text>
        {children.slice(found.end)}
      </Text>
      <Modal
        transparent
        visible={!!at}
        animationType="fade"
        onRequestClose={() => setAt(null)}
        statusBarTranslucent
      >
        <BarePressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={styles.backdrop}
          onPress={() => setAt(null)}
        />
        {at ? (
          <View
            accessibilityViewIsModal
            testID={`term-popover-${found.term}`}
            style={[
              styles.bubble,
              {
                width,
                left: Math.max(
                  16,
                  Math.min(at.x - width / 2, window.width - width - 16),
                ),
              },
              below
                ? { top: at.y + 14 }
                : { bottom: window.height - at.y + 14 },
            ]}
          >
            <Text variant="strong" accessibilityRole="header">
              {term.word}
            </Text>
            <Text wordSafe variant="body">
              {term.gloss}
            </Text>
            <View style={styles.more}>
              <Button
                label="More"
                variant="plain"
                accessibilityLabel={`More about ${term.word}`}
                onPress={() => {
                  setAt(null);
                  explainTerm(found.term);
                }}
                testID={`term-popover-${found.term}-more`}
              />
            </View>
          </View>
        ) : null}
      </Modal>
    </Fragment>
  );
}

const styles = StyleSheet.create({
  term: {
    textDecorationLine: 'underline',
    // iOS draws the dots; Android ignores the style and draws a solid line.
    textDecorationStyle: Platform.OS === 'ios' ? 'dotted' : 'solid',
    textDecorationColor: colors.inkFaint,
  },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
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
