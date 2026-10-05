import { Button, Group, Text } from '../../design/primitives';
import type { TranscriptTurn } from '../../voice';
import type { ReportAnswer } from './reportAnswer';

export function AnswerCaption({
  turn,
  onReportAnswer,
}: {
  turn: TranscriptTurn;
  onReportAnswer: ReportAnswer;
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
          onPress={() => onReportAnswer({ id: turn.id, text: turn.text })}
        />
      ) : null}
    </Group>
  );
}
