import { StyleSheet, View } from 'react-native';
import { Text } from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import type { TranscriptTurn } from '../../voice';

/**
 * One turn of the captions: OPAX in the record serif, you in quieter sans,
 * set to the right. Each turn is one VoiceOver element that names its
 * speaker. Reporting lives in the More menu, never on a caption.
 */
export function AnswerCaption({ turn }: { turn: TranscriptTurn }) {
  const you = turn.role === 'user';
  return (
    <View
      accessible
      accessibilityLabel={`${you ? 'You' : 'OPAX'} said ${turn.text}`}
      testID={`talk-turn-${turn.role}`}
      style={you ? styles.you : styles.opax}
    >
      <Text
        variant={you ? 'metadata' : 'record'}
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
