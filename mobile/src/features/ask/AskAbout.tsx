import { router } from 'expo-router';
import { LinkRow } from '../../design/primitives';
import { askRoute } from '../../navigation/routes';
export function scopedQuestion(
  kind: 'person' | 'bill' | 'party' | 'electorate',
  name: string,
  topic = '',
) {
  if (kind === 'person')
    return {
      question: topic.trim()
        ? `What did ${name} say about ${topic.trim()}?`
        : `What has ${name} said in parliament?`,
      speaker: name,
      kind: 'speech',
    };
  if (kind === 'bill')
    return { question: `What did parliament say about the ${name}?` };
  if (kind === 'party')
    return { question: `What has parliament said about ${name}?` };
  return { question: `What has parliament said about ${name}?` };
}
export function AskAbout({
  kind,
  name,
}: {
  kind: 'person' | 'bill' | 'party' | 'electorate';
  name: string;
}) {
  return (
    <LinkRow
      title={kind === 'person' ? 'Ask about their speeches' : 'Ask about this'}
      onPress={() => router.dismissTo(askRoute(scopedQuestion(kind, name)))}
      testID={`${kind}-ask`}
      icon="text.bubble"
      accent="people"
    />
  );
}
