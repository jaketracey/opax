import { Button, Group, Text } from '../../design/primitives';
import type { TranscriptTurn } from '../../voice';

export function AnswerCaption({
  turn,
  onReport,
}: {
  turn: TranscriptTurn;
  onReport: () => void;
}) {
  return (
    <Group>
      <Group
        accessible
        accessibilityLabel={`${turn.role === 'user' ? 'You' : 'OPAX'} said ${turn.text}`}
        testID={`talk-turn-${turn.role}`}
      >
        <Text variant="metadata">{turn.role === 'user' ? 'You' : 'OPAX'}</Text>
        <Text>{turn.text}</Text>
      </Group>
      {turn.role === 'agent' && turn.text.trim() ? (
        <Button
          label="Report this answer"
          testID={`talk-report-${turn.id}`}
          variant="quiet"
          onPress={onReport}
        />
      ) : null}
    </Group>
  );
}
