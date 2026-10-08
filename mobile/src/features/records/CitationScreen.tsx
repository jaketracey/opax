import { headerItems } from '../../navigation/chrome';
import { useCallback, useEffect, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { rhythm } from '../../design/tokens';
import { webOrigin } from '../../design/environment';
import { catalogs } from '../../api/runtime';
import {
  Button,
  Group,
  Heading,
  LoadingState,
  Screen,
  Section,
  Text,
} from '../../design/primitives';
import { shareHeaderItem } from '../../navigation/share';
import { records } from './runtime';
import { citationsFor } from './citations';
import { copyText, shareTextFile } from './actions';
import { useRead } from './useRead';
import { RecordLoadError } from './RecordLoadError';
function localISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export default function Citations() {
  const { slug = '' } = useLocalSearchParams<{ slug: string }>();
  const load = useCallback(() => records.document(slug), [slug]);
  const { value, error, retry } = useRead(load);
  const [version, setVersion] = useState('unversioned');
  const [accessed] = useState(localISODate);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void catalogs
      .corpus()
      .then((record) => {
        if (active) setVersion(record.data.version || 'unversioned');
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const doc = value?.data;
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Cite',
          ...headerItems(
            doc
              ? () => [
                  shareHeaderItem({
                    path: `/doc/${doc.slug}`,
                    title: doc.title,
                  }),
                ]
              : undefined,
          ),
        }}
      />
      <Screen testID="doc-citations">
        {error ? (
          <RecordLoadError error={error} slug={slug} onRetry={retry} />
        ) : !doc ? (
          <LoadingState label="Loading citations" />
        ) : (
          <>
            <Group gap={rhythm.tight}>
              <Heading level={1}>Cite this record</Heading>
              <Text variant="metadata" wordSafe>
                {doc.title}
              </Text>
            </Group>
            {citationsFor(doc, {
              origin: webOrigin,
              corpusVersion: version,
              accessed,
            }).map((citation) => (
              <Section
                key={citation.id}
                title={citation.label}
                icon="quote.opening"
                accent="bills"
                info={
                  citation.note
                    ? {
                        title: `About ${citation.label}`,
                        notes: [citation.note],
                      }
                    : undefined
                }
                testID={`cite-${citation.id}`}
              >
                <Group gap={rhythm.tight}>
                  <Text selectable testID={`cite-text-${citation.id}`}>
                    {citation.text}
                  </Text>
                  <Group
                    gap={rhythm.tight}
                    style={{ flexDirection: 'row', flexWrap: 'wrap' }}
                  >
                    <Button
                      variant="quiet"
                      size="compact"
                      icon="doc.on.doc"
                      label={
                        copied === citation.id
                          ? `Copied ${citation.label}`
                          : `Copy ${citation.label}`
                      }
                      testID={`cite-copy-${citation.id}`}
                      onPress={() => {
                        void copyText(citation.text).then((ok) => {
                          if (ok) setCopied(citation.id);
                        });
                      }}
                    />
                    <Button
                      variant="quiet"
                      size="compact"
                      icon="square.and.arrow.up"
                      label={`Share ${citation.label}`}
                      accessibilityHint="Shares the citation as a text file"
                      testID={`cite-share-${citation.id}`}
                      onPress={() => {
                        void shareTextFile(
                          citation.text,
                          `opax-${doc.slug}-${citation.id}.${citation.extension}`,
                        );
                      }}
                    />
                  </Group>
                </Group>
              </Section>
            ))}
          </>
        )}
      </Screen>
    </>
  );
}
