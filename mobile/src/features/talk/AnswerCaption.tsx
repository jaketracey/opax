import { StyleSheet, View } from 'react-native';
import { Text } from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import type { TranscriptTurn } from '../../voice';
import { talkCopy } from './model';

/**
 * One turn of the captions (specs/account.md 7.4): OPAX's words in body
 * ink, leading (machine text is OPAX's, not the record's, so not the record
 * serif); yours quieter and trailing. Each turn is one VoiceOver element that
 * names its speaker. Reporting lives in the ⋯ menu, never on a caption.
 */
export function AnswerCaption({ turn }: { turn: TranscriptTurn }) {
  const you = turn.role === 'user';
  return (
    <View
      accessible
      accessibilityLabel={
        you ? talkCopy.youSaid(turn.text) : talkCopy.opaxSaid(turn.text)
      }
      testID={`talk-turn-${turn.role}`}
      style={you ? styles.you : styles.opax}
    >
      <Text
        wordSafe
        variant="body"
        tone={you ? 'inkSoft' : 'ink'}
        style={you ? styles.right : null}
      >
        {turn.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  you: { alignSelf: 'flex-end', maxWidth: '85%', paddingLeft: rhythm.group },
  opax: { alignSelf: 'stretch' },
  right: { textAlign: 'right' },
});
