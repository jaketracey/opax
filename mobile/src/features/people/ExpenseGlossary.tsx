import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { catalogs } from '../../api/runtime';
import {
  AsAtLine,
  ErrorState,
  Group,
  Heading,
  LoadingState,
  Screen,
  Section,
  SourceLink,
  StaleNotice,
  Text,
  errorMessage,
} from '../../design/primitives';
import { shareHeaderItem } from '../../navigation/share';

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
              <Section key={g.id} title={g.title}>
                <Text wordSafe>{g.blurb}</Text>
                {record.data.categories
                  .filter((c) => c.group === g.id)
                  .map((c) => (
                    <Group key={c.name}>
                      <Heading level={3}>{c.name}</Heading>
                      <Text wordSafe>{c.text}</Text>
                      {c.note ? (
                        <Text wordSafe variant="fine">
                          {c.note}
                        </Text>
                      ) : null}
                      {c.url ? (
                        <SourceLink
                          citation={c.source}
                          url={c.url}
                          kind="record"
                        />
                      ) : (
                        <Text wordSafe variant="fine">
                          {c.source}
                        </Text>
                      )}
                    </Group>
                  ))}
              </Section>
            ))}
            <AsAtLine
              asOf={record.data.meta.updated}
              citation={record.data.meta.source}
              licence={record.data.meta.licence}
            />
            {record.stale ? <StaleNotice savedAt={record.savedAt} /> : null}
            <Text wordSafe variant="fine">
              {record.data.meta.licence_note}
            </Text>
            <SourceLink
              citation="IPEA explanatory notes"
              url={record.data.meta.source_url}
              kind="record"
            />
            <SourceLink
              citation="Expense category licence"
              url={record.data.meta.licence_url}
              kind="record"
            />
            <Text testID="expense-glossary-end" variant="fine">
              End of glossary
            </Text>
          </Group>
        )}
      </Screen>
    </>
  );
}
