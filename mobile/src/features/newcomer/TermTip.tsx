import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button } from '../../design/controls';
import { Icon } from '../../design/icon';
import { InsetGroup } from '../../design/layout';
import { Pressable } from '../../design/pressable';
import { LinkRow } from '../../design/rows';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import { presentSheet } from '../../navigation/sheets';
import { newcomerOption } from './option';
import { plainWordsCopy, terms, type TermId } from './terms';

/** `/plain-words`: the glossary sheet, optionally opened at one term. */
export const plainWordsRoute = (term?: TermId) => ({
  pathname: '/plain-words' as const,
  params: term ? { term } : {},
});

/** Opens one term's short answer in the app's fitted rule sheet. */
export function explainTerm(id: TermId) {
  const term = terms[id];
  presentSheet({
    kind: 'rule',
    title: term.question,
    rule: term.body.join('\n\n'),
    testID: `term-${id}`,
    extra: (
      <InsetGroup>
        <LinkRow
          title={plainWordsCopy.all}
          symbol={symbols.help}
          onPress={() => router.push(plainWordsRoute())}
          testID={`term-${id}-all`}
        />
      </InsetGroup>
    ),
  });
}

/**
 * A term's tap target (option B, and wherever a tip is asked for by name).
 * - `glyph`: a quiet question mark beside a heading. A full 44 pt target;
 *   the mark itself is small and soft, so a reader who knows the term reads
 *   past it. VoiceOver hears the question ("What's a division?"), a button.
 * - `link`: the question written out, for the places a newcomer must not
 *   miss (the electorate step).
 */
export function TermTip({
  term,
  variant = 'glyph',
  testID,
}: {
  term: TermId;
  variant?: 'glyph' | 'link';
  testID?: string;
}) {
  const { question } = terms[term];
  const id = testID ?? `term-tip-${term}`;
  if (variant === 'link')
    return (
      <View style={styles.link}>
        <Button
          label={question}
          variant="plain"
          icon={symbols.help}
          onPress={() => explainTerm(term)}
          testID={id}
        />
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={question}
      accessibilityHint="Explains this term"
      onPress={() => explainTerm(term)}
      hitSlop={6}
      testID={id}
      style={({ pressed }) => [
        styles.glyph,
        pressed ? { backgroundColor: colors.sunken } : null,
      ]}
    >
      <Icon name={symbols.help} size={18} tone="inkSoft" maxScale={1.3} />
    </Pressable>
  );
}

/** Option B: the glyph beside a heading. Nothing in the other options. */
export function headerTip(term: TermId | undefined) {
  return term && newcomerOption() === 'b' ? <TermTip term={term} /> : undefined;
}

/**
 * Option C: one plain line under a heading, for a reader who said they are
 * new. No tap needed; "More" opens the same sheet as a tip.
 */
export function Gloss({ term }: { term: TermId | undefined }) {
  if (!term || newcomerOption() !== 'c') return null;
  const { gloss, question } = terms[term];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={gloss}
      accessibilityHint={`Opens “${question}”`}
      onPress={() => explainTerm(term)}
      testID={`term-gloss-${term}`}
      style={({ pressed }) => [
        styles.gloss,
        pressed ? { opacity: 0.6 } : null,
      ]}
    >
      <View style={styles.rule} />
      <Text wordSafe variant="secondary" tone="inkSoft" style={styles.grow}>
        {gloss}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { alignSelf: 'flex-start', marginLeft: -rhythm.tight },
  glyph: {
    width: minimumTarget,
    height: minimumTarget,
    marginVertical: -8,
    borderRadius: minimumTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gloss: { flexDirection: 'row', gap: rhythm.tight, alignItems: 'stretch' },
  rule: { width: 2, borderRadius: 1, backgroundColor: colors.bronze },
  grow: { flex: 1 },
});
