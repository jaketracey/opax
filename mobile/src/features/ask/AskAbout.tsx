import { useState } from 'react';
import { router } from 'expo-router';
import { Button, Field, Group } from '../../design/primitives';
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
  const [topic, setTopic] = useState('');
  return (
    <Group>
      {kind === 'person' ? (
        <Field
          label="Topic"
          value={topic}
          onChangeText={setTopic}
          placeholder="Enter a topic…"
          testID="person-ask-topic"
        />
      ) : null}
      <Button
        label={
          kind === 'person' ? 'Ask about their speeches' : 'Ask about this'
        }
        onPress={() => router.push(askRoute(scopedQuestion(kind, name, topic)))}
        testID={`${kind}-ask`}
      />
    </Group>
  );
}
