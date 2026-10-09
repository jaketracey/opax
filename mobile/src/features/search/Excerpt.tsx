import { useState } from 'react';
import { Disclosure, Group, Text } from '../../design/primitives';
import { passageText, serverPassage } from '../../api/passage-text';

/** A Worker document row (32-hex resource id) carries a normalized
 * /api/search snippet; a catalog row's snippet is raw published text. */
export const isWorkerSnippet = (resource: string | null | undefined) =>
  /^[a-f0-9]{32}$/.test(resource ?? '');

/** Keep the complete catalog text available without turning the profile link
 * into one very long VoiceOver element. A preview ends at a source sentence. */
export function Excerpt({
  snippet: raw,
  resource,
}: {
  snippet: string;
  resource?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const snippet = isWorkerSnippet(resource)
    ? serverPassage(raw)
    : passageText(raw);
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
