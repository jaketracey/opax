import { useCallback, useEffect, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { webOrigin } from '../../design/environment';
import { catalogs } from '../../api/runtime';
import {
  Button,
  ErrorState,
  Group,
  Heading,
  LoadingState,
  Screen,
  Section,
  Text,
  errorMessage,
} from '../../design/primitives';
import { shareHeaderItem } from '../../navigation/share';
import { records } from './runtime';
import { citationsFor } from './citations';
import { copyText, shareTextFile } from './actions';
import { useRead } from './useRead';
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
          unstable_headerRightItems: doc
            ? () => [
                shareHeaderItem({ path: `/doc/${doc.slug}`, title: doc.title }),
              ]
            : undefined,
        }}
      />
      <Screen testID="doc-citations">
        {error ? (
          <ErrorState message={errorMessage(error)} onRetry={retry} />
        ) : !doc ? (
          <LoadingState label="Loading citations" />
        ) : (
          <>
            <Heading level={1}>Cite this record</Heading>
            <Text wordSafe>{doc.title}</Text>
            {citationsFor(doc, {
              origin: webOrigin,
              corpusVersion: version,
              accessed,
            }).map((citation) => (
              <Section
                key={citation.id}
                title={citation.label}
                testID={`cite-${citation.id}`}
              >
                {citation.note ? (
                  <Text variant="fine">{citation.note}</Text>
                ) : null}
                <Group>
                  <Button
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
                    label={`Share ${citation.label} as a text file`}
                    testID={`cite-share-${citation.id}`}
                    onPress={() => {
                      void shareTextFile(
                        citation.text,
                        `opax-${doc.slug}-${citation.id}.${citation.extension}`,
                      );
                    }}
                  />
                </Group>
                <Text selectable testID={`cite-text-${citation.id}`}>
                  {citation.text}
                </Text>
              </Section>
            ))}
          </>
        )}
      </Screen>
    </>
  );
}
