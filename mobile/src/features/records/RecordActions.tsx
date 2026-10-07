import { useState } from 'react';
import { router } from 'expo-router';
import { rhythm } from '../../design/tokens';
import { Button, Group } from '../../design/primitives';
import { isRecordSlug } from '../../api/record-policy';
import { canonicalUrl } from '../../navigation/external';
import { citeRoute } from '../../navigation/routes';
import { copyText } from './actions';
/** Search-result actions use no API until Cite explicitly opens the record. */
export function RecordActions({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  if (!isRecordSlug(slug)) return null;
  return (
    <Group
      gap={rhythm.tight}
      style={{ flexDirection: 'row', flexWrap: 'wrap' }}
    >
      <Button
        variant="quiet"
        size="compact"
        icon="quote.opening"
        label="Cite"
        onPress={() => router.push(citeRoute(slug))}
        testID={`result-cite-${slug}`}
      />
      <Button
        variant="quiet"
        size="compact"
        icon="link"
        label={copied ? 'Link copied' : 'Copy link'}
        onPress={() => {
          void copyText(canonicalUrl(`/doc/${slug}`)).then(setCopied);
        }}
        testID={`result-copy-${slug}`}
      />
    </Group>
  );
}
