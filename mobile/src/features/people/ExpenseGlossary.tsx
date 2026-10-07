import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { catalogs } from '../../api/runtime';
import {
  AsAtLine,
  ErrorState,
  Group,
  Heading,
  InfoButton,
  RowList,
  LoadingState,
  Screen,
  Section,
  SourceLink,
  StaleNotice,
  Text,
  errorMessage,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { shareHeaderItem } from '../../navigation/share';
import { closeSheetItem } from '../../navigation/chrome';

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
          title: 'Expense category glossary',
          presentation: 'modal',
          unstable_headerRightItems: () => [
            shareHeaderItem({
              path: '/expenses',
              title: 'Expense category glossary',
            }),
            closeSheetItem(),
          ],
        }}
      />
      <Screen testID="expense-glossary">
        {error ? (
          <ErrorState message={error} onRetry={() => setRetry((v) => v + 1)} />
        ) : !record ? (
          <LoadingState label="Loading expense category definitions" />
        ) : (
          <Group>
            <Heading level={1}>Expense category glossary</Heading>
            {record.data.groups.map((g) => (
              <Section
                key={g.id}
                title={g.title}
                icon="list.bullet"
                accent="money"
                info={{ title: g.title, notes: [g.blurb] }}
              >
                <RowList>
                  {record.data.categories
                    .filter((c) => c.group === g.id)
                    .map((c) => (
                      <Group key={c.name} gap={rhythm.tight}>
                        <Heading level={3}>{c.name}</Heading>
                        <Text wordSafe>{c.text}</Text>
                        {c.note ? (
                          <InfoButton
                            title={'About ' + c.name.toLowerCase()}
                            notes={[c.note]}
                          />
                        ) : null}
                        {c.url ? (
                          <SourceLink
                            citation={c.source}
                            url={c.url}
                            kind="record"
                          />
                        ) : null}
                      </Group>
                    ))}
                </RowList>
              </Section>
            ))}
            <AsAtLine
              asOf={record.data.meta.updated}
              citation={record.data.meta.source}
              licence={record.data.meta.licence}
            />
            {record.stale ? <StaleNotice savedAt={record.savedAt} /> : null}
            <Text testID="expense-glossary-end" variant="caption">
              End of glossary
            </Text>
          </Group>
        )}
      </Screen>
    </>
  );
}
