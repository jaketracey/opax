import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../design/primitives';
import { colors, minimumTarget, radii, rhythm } from '../../design/tokens';
import type { TranscriptTurn, VoiceSource } from '../../voice';
import { talkCopy } from './model';
import { captionText } from './caption-text';
import { askDraftDestination, recordDestination, sourceMeta } from './sources';

/**
 * One turn of the captions (specs/account.md 7.4): OPAX's words in body
 * ink, leading (machine text is OPAX's, not the record's, so not the record
 * serif); yours quieter and trailing. Each turn is one VoiceOver element that
 * names its speaker. Reporting lives in the ⋯ menu, never on a caption.
 */
export function AnswerCaption({
  turn,
  sources = [],
  onOpenSource,
  onMoreSources,
}: {
  turn: TranscriptTurn;
  sources?: readonly VoiceSource[];
  onOpenSource?: (source: VoiceSource) => void;
  onMoreSources?: () => void;
}) {
  const you = turn.role === 'user';
  const text = captionText(turn);
  if (!text && !sources.length) return null;
  return (
    <View
      testID={`talk-turn-${turn.role}`}
      style={you ? styles.you : styles.opax}
    >
      {text ? (
        <Text
          accessible
          accessibilityLabel={
            you ? talkCopy.youSaid(text) : talkCopy.opaxSaid(text)
          }
          wordSafe
          variant="body"
          tone={you ? 'inkSoft' : 'ink'}
          style={you ? styles.right : null}
        >
          {text}
        </Text>
      ) : null}
      {!you && sources.length ? (
        <View style={styles.sources}>
          {sources.slice(0, 3).map((source) => {
            const meta = sourceMeta(source);
            return (
              <Pressable
                key={source.path}
                accessibilityRole="button"
                accessibilityLabel={`${talkCopy.open(source.title)}, ${meta}`}
                accessibilityHint={
                  recordDestination(source.path)
                    ? 'Opens the record within Talk'
                    : askDraftDestination(source.path)
                      ? 'Offers to open in Ask'
                      : 'Offers to open on opax.com.au'
                }
                onPress={() => onOpenSource?.(source)}
                style={({ pressed }) => [
                  styles.chip,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text wordSafe variant="footnote" tone="navy">
                  {source.title}
                </Text>
                <Text wordSafe variant="footnote" tone="inkSoft">
                  {meta}
                </Text>
              </Pressable>
            );
          })}
          {sources.length > 3 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${sources.length - 3} more sources, opens Sources`}
              onPress={onMoreSources}
              style={({ pressed }) => [
                styles.chip,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text variant="footnote" tone="navy">
                +{sources.length - 3} more
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  you: { alignSelf: 'flex-end', maxWidth: '85%', paddingLeft: rhythm.group },
  opax: { alignSelf: 'stretch' },
  right: { textAlign: 'right' },
  sources: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.tight,
    marginTop: rhythm.tight,
  },
  chip: {
    minHeight: minimumTarget,
    minWidth: minimumTarget,
    maxWidth: '100%',
    justifyContent: 'center',
    paddingHorizontal: rhythm.tight,
    paddingVertical: rhythm.line,
    borderRadius: radii.thumb,
    borderCurve: 'continuous',
    backgroundColor: colors.navyWash,
  },
  pressed: { backgroundColor: colors.sunken },
});
