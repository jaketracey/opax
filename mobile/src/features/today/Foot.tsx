import { StyleSheet, View } from 'react-native';
import type { Block, EditionView } from '../../api/catalogs';
import { Section, SourceLine, Text } from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { editionSources } from './sources';

/**
 * The foot of Today: the daily edition's source line (each feed closes with
 * its own, so no one date stands for blocks of different ages), then the
 * independence line (design review D4: it moved here from the masthead) and
 * the reminder that patterns are leads. A saved edition carries its own
 * line in the card, so the foot leaves it out.
 */
export function TodayFoot({ edition }: { edition: Block<EditionView> | null }) {
  const shown =
    edition?.status === 'ready' &&
    edition.data !== null &&
    !(edition.stale && edition.savedAt !== null)
      ? edition.data
      : null;
  return (
    <Section testID="today-foot">
      <View style={styles.foot}>
        {shown ? (
          <SourceLine
            title="About the daily edition"
            {...editionSources(shown)}
            state={edition?.partial ? 'partial' : null}
            testID="today-sources"
          />
        ) : null}
        <Text wordSafe variant="fine" testID="today-independence">
          OPAX is independent and non-partisan. It is not a government app.
        </Text>
        <Text wordSafe variant="fine" testID="today-screen-footer">
          Patterns in the public record are leads, not findings. Check the
          linked sources.
        </Text>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  foot: { gap: rhythm.tight },
});
