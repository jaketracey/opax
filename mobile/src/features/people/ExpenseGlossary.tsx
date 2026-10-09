import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { AndroidReadingHeader } from '../../navigation/AndroidReadingHeader';
import { catalogs } from '../../api/runtime';
import {
  ErrorState,
  Group,
  Heading,
  RowList,
  LoadingState,
  Screen,
  Section,
  Text,
  errorMessage,
} from '../../design/primitives';
import { layout, rhythm } from '../../design/tokens';
import { BlockSource, recordBlock } from '../your-mp/Evidence';
import { shareHeaderItem } from '../../navigation/share';
import { closeSheetItem, headerItems } from '../../navigation/chrome';

export default function ExpenseGlossary() {
  const [record, setRecord] = useState<Awaited<
      ReturnType<typeof catalogs.expenseCategories>
    > | null>(null),
    [error, setError] = useState<string | null>(null),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    catalogs
      .expenseCategories()
      .then((r) => {
        if (active) {
          setRecord(r);
          setError(null);
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [retry]);
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Expense glossary',
          ...(Platform.OS === 'android'
            ? { header: AndroidReadingHeader }
            : {}),
          ...headerItems(() => [
            shareHeaderItem({
              path: '/expenses',
              title: 'Expense category glossary',
            }),
            closeSheetItem(),
          ]),
        }}
      />
      <Screen testID="expense-glossary">
        {error ? (
          <ErrorState message={error} onRetry={() => setRetry((v) => v + 1)} />
        ) : !record ? (
          <LoadingState label="Loading expense category definitions" />
        ) : (
          <Group gap={layout.sectionGap}>
            {/* The title is the bar's; each group's description and each
                category's note are the glossary itself, so they are drawn. */}
            {record.data.groups.map((g, i) => (
              <Section key={g.id} title={g.title} accent="money" rule={i > 0}>
                {g.blurb ? (
                  <Text wordSafe variant="metadata">
                    {g.blurb}
                  </Text>
                ) : null}
                <RowList>
                  {record.data.categories
                    .filter((c) => c.group === g.id)
                    .map((c) => (
                      <Group key={c.name} gap={rhythm.tight}>
                        <Heading level={3}>{c.name}</Heading>
                        <Text wordSafe>{c.text}</Text>
                        {c.note ? (
                          <Text wordSafe variant="fine">
                            {c.note}
                          </Text>
                        ) : null}
                      </Group>
                    ))}
                </RowList>
              </Section>
            ))}
            <BlockSource
              block={recordBlock(record)}
              citation={record.data.meta.source}
              licence={record.data.meta.licence ?? undefined}
              originals={record.data.categories.flatMap((c) =>
                c.url ? [{ label: c.source, url: c.url, record: c.name }] : [],
              )}
              testID="expense-glossary-source"
            />
            {/* The page's end, for journeys that scroll to it. */}
            <View
              testID="expense-glossary-end"
              collapsable={false}
              style={styles.end}
            />
          </Group>
        )}
      </Screen>
    </>
  );
}
const styles = StyleSheet.create({ end: { height: 1 } });
