import { useState } from 'react';
import { Button, Group, Text } from '../../design/primitives';

/** Keep the complete catalog text available without turning the profile link
 * into one very long VoiceOver element. A preview ends at a source sentence. */
export function Excerpt({ snippet }: { snippet: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!snippet) return null;
  const preview = snippet.match(/^.*?[.!?](?:\s|$)/s)?.[0].trim() ?? snippet;
  if (preview === snippet) return <Text variant="metadata">{snippet}</Text>;
  return (
    <Group>
      {!expanded ? <Text variant="metadata">{preview}</Text> : null}
      <Button
        label={expanded ? 'Hide matching record' : 'Read matching record'}
        variant="quiet"
        size="compact"
        onPress={() => setExpanded(!expanded)}
      />
      {expanded ? <Text variant="metadata">{snippet}</Text> : null}
    </Group>
  );
}
