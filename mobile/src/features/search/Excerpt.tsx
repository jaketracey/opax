import { useState } from 'react';
import { Disclosure, Group, Text } from '../../design/primitives';
import { passageText } from '../../api/passage-text';

/** Keep the complete catalog text available without turning the profile link
 * into one very long VoiceOver element. A preview ends at a source sentence. */
export function Excerpt({ snippet: raw }: { snippet: string }) {
  const [expanded, setExpanded] = useState(false);
  const snippet = passageText(raw);
  if (!snippet) return null;
  const preview = snippet.match(/^.*?[.!?](?:\s|$)/s)?.[0].trim() ?? snippet;
  if (preview === snippet)
    return (
      <Text wordSafe variant="metadata">
        {snippet}
      </Text>
    );
  return (
    <Group>
      {!expanded ? (
        <Text wordSafe variant="metadata">
          {preview}
        </Text>
      ) : null}
      <Disclosure
        label={expanded ? 'Hide matching record' : 'Read matching record'}
        open={expanded}
        onToggle={setExpanded}
      >
        <Text wordSafe variant="metadata">
          {snippet}
        </Text>
      </Disclosure>
    </Group>
  );
}
