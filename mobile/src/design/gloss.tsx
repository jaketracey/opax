import { StyleSheet, View } from 'react-native';
import { Pressable } from './pressable';
import { Text } from './text';
import { colors, minimumTarget, radii, rhythm } from './tokens';

/**
 * A plain line under a section heading (the newcomer build's option C): a
 * glossary term's one-line meaning, drawn only for readers who asked for the
 * basics ("Explain terms" on). A tap opens the term's full answer.
 *
 * Design never imports a feature: the app supplies the setting, the words
 * and the answer sheet once, at launch, through `provideGloss`. Until then
 * (and in tests that never call it) every gloss draws nothing.
 */
export interface GlossEntry {
  /** The term as the guide writes it ("division", "register of interests"). */
  word: string;
  /** Its one line, in the guide's own words. */
  line: string;
}
export interface GlossSource {
  /** Whether plain lines are on: a hook, called once per gloss render. */
  useEnabled: () => boolean;
  entry: (id: string) => GlossEntry | undefined;
  open: (id: string) => void;
}
const off: GlossSource = {
  useEnabled: () => false,
  entry: () => undefined,
  open: () => undefined,
};
let source: GlossSource = off;
export function provideGloss(next: GlossSource) {
  source = next;
}
/** Tests only. */
export function resetGlossForTests() {
  source = off;
}

/** The term as a lead-in: the guide's word, its first letter capitalised. */
export function glossWord(word: string): string {
  return word.charAt(0).toLocaleUpperCase('en-AU') + word.slice(1);
}

export const glossHint = 'Opens the full answer';

/**
 * The term's line when plain lines are on and the glossary holds it, else
 * undefined. Always call it (a hook), with or without an id: a heading
 * draws exactly what it drew before when this is undefined.
 */
export function useGlossEntry(id: string | undefined): GlossEntry | undefined {
  const enabled = source.useEnabled();
  return enabled && id ? source.entry(id) : undefined;
}

/**
 * One plain line: "Division. A formal vote in Parliament where each
 * member’s name and vote is recorded." A thin bronze rule marks it as an
 * aside, not content; it never pushes anything for a reader who has it off.
 */
export function Gloss({
  id,
  entry,
  testID,
}: {
  id: string;
  /** From `useGlossEntry(id)`. */
  entry: GlossEntry;
  testID?: string;
}) {
  const word = glossWord(entry.word);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${word}. ${entry.line}`}
      accessibilityHint={glossHint}
      onPress={() => source.open(id)}
      testID={testID ?? `gloss-${id}`}
      style={({ pressed }) => [styles.target, pressed ? styles.pressed : null]}
    >
      <View style={styles.rule}>
        <Text wordSafe variant="secondary" tone="inkSoft">
          <Text variant="secondary" tone="ink">
            {word}.
          </Text>{' '}
          {entry.line}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: {
    minHeight: minimumTarget,
    justifyContent: 'center',
    borderRadius: radii.thumb,
    borderCurve: 'continuous',
  },
  pressed: { backgroundColor: colors.sunken },
  rule: {
    borderLeftWidth: 2,
    borderLeftColor: colors.bronze,
    paddingLeft: rhythm.row,
    paddingVertical: rhythm.line,
  },
});
