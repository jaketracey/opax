import { useCallback, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Group, SourceLine, StepButtons, Text } from '../../design/primitives';
import { formatDate, formatMoneyCompact } from '../../design/format';
import { rhythm } from '../../design/tokens';
import { RecordStatus } from '../RecordStatus';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { combine } from './catalog';
import { largestFor } from './data';
import { money } from './runtime';
import { MoneyHeader, MoneyList, RowSource, Title } from './parts';
export default function Largest() {
  const { month: initial } = useLocalSearchParams<{ month?: string }>();
  const [selected, setSelected] = useState(initial);
  const load = useCallback(async (refresh: boolean) => {
    const [largest, index] = await Promise.all([
      money.largest(refresh),
      money.grants('federal', refresh),
    ]);
    return combine([largest, index], {
      largest: largest.data,
      index: index.data,
    });
  }, []);
  const status = useCatalogRecord(load),
    data = status.record?.data,
    month = selected ?? data?.largest.latest ?? '';
  const rows = data ? largestFor(data.largest, data.index, month) : [];
  const months = Object.keys(data?.largest.months ?? {})
    .sort()
    .reverse();
  const monthIndex = months.indexOf(month);
  const label = monthName(month, true);
  const previous = months[monthIndex + 1],
    next = monthIndex > 0 ? months[monthIndex - 1] : undefined;
  // "‹ June" and "August ›" on one row; an end of the range says the
  // direction alone, drawn disabled.
  const stepFor = (direction: string, target: string | undefined) => ({
    label: target ? monthName(target, !sameYear(target, month)) : direction,
    accessibilityLabel: target
      ? `${direction}, ${monthName(target, true)}`
      : direction,
    disabled: !target,
    onPress: () => setSelected(target),
    testID: direction === 'Next month' ? 'largest-next' : 'largest-previous',
  });
  return (
    <>
      <MoneyHeader
        title="Largest grants"
        path={`/money/grants?jur=federal&largest=${month}`}
      />
      <MoneyList
        loaded={!!status.record}
        id="largest-list"
        rows={rows}
        rowKey={(r) => r.id}
        refreshing={status.refreshing}
        refresh={status.refresh}
        header={
          <>
            <Title id="largest-title">
              Where did the money go{label ? ` in ${label}` : ''}?
            </Title>
            <RecordStatus
              {...status}
              label="Loading the month’s largest grants"
              testID="largest-status"
            />
            {data ? (
              <>
                <Group gap={rhythm.tight}>
                  <Text wordSafe>
                    The largest grant agreements that started in {label}, one
                    per recipient.
                  </Text>
                  <SourceLine
                    title="About the month’s largest grants"
                    asOf={data.largest.asOf}
                    citation="GrantConnect"
                    savedAt={
                      status.record?.stale ? status.record.savedAt : null
                    }
                    originals={[
                      {
                        label: 'GrantConnect',
                        url: 'https://www.grants.gov.au/',
                      },
                    ]}
                    notes={data.largest.basis}
                    testID="largest-source"
                  />
                </Group>
                <StepButtons
                  testID="largest-months"
                  previous={stepFor('Previous month', previous)}
                  next={stepFor('Next month', next)}
                />
              </>
            ) : null}
          </>
        }
        render={(r, i) => (
          <Group gap={rhythm.line}>
            <Text wordSafe variant="strong" tabular>
              {formatMoneyCompact(r.value)}
            </Text>
            <Text wordSafe variant="strong" testID={`largest-recipient-${i}`}>
              {r.recipient}
            </Text>
            {r.purpose ? <Text wordSafe>{r.purpose}</Text> : null}
            <Text wordSafe variant="metadata">
              {[
                r.program,
                r.agency,
                r.selection,
                `Agreement from ${formatDate(r.start)}`,
                r.more
                  ? `${r.more} more award${r.more === 1 ? '' : 's'} to the same recipient that month`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <RowSource
              register="GrantConnect"
              record={r.id}
              // An individual's award record would name them: no link.
              url={r.organisation ? r.sourceUrl : null}
              asOf={data!.largest.asOf}
              organisation={
                r.organisation
                  ? {
                      name: r.recipient,
                      path: `/money/grants/federal/recipient/${encodeURIComponent(r.recipientId)}?award=${r.id}`,
                    }
                  : null
              }
              testID={`largest-source-${i}`}
            />
          </Group>
        )}
      />
    </>
  );
}

const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/;
/** "July 2026", or "July" where the year goes without saying. */
function monthName(month: string, withYear: boolean) {
  return MONTH.test(month)
    ? new Intl.DateTimeFormat('en-AU', {
        month: 'long',
        ...(withYear ? { year: 'numeric' as const } : {}),
        timeZone: 'UTC',
      }).format(new Date(`${month}-01`))
    : '';
}
const sameYear = (a: string, b: string) => a.slice(0, 4) === b.slice(0, 4);
