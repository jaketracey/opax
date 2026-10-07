import { useCallback, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  AsAtLine,
  Button,
  InfoButton,
  Group,
  SourceLink,
  Text,
} from '../../design/primitives';
import { formatDate, formatMoneyCompact } from '../../design/format';
import { RecordStatus } from '../RecordStatus';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { combine } from './catalog';
import { largestFor } from './data';
import { money } from './runtime';
import { MoneyHeader, MoneyList, OrganisationWebLink, Title } from './parts';
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
  const label = /^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)
    ? new Intl.DateTimeFormat('en-AU', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${month}-01`))
    : '';
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
                <Text wordSafe>
                  The largest grant agreements that started in {label}, one per
                  recipient, as published on GrantConnect by{' '}
                  {formatDate(data.largest.asOf)}.
                </Text>
                <AsAtLine asOf={data.largest.asOf} citation="GrantConnect" />
                <Group>
                  <Button
                    label="Previous month"
                    disabled={!months[monthIndex + 1]}
                    onPress={() => setSelected(months[monthIndex + 1])}
                  />
                  <Button
                    label="Next month"
                    disabled={monthIndex <= 0}
                    onPress={() => setSelected(months[monthIndex - 1])}
                  />
                </Group>
              </>
            ) : null}
          </>
        }
        render={(r, i) => (
          <Group>
            <Text wordSafe variant="figureInline">
              {formatMoneyCompact(r.value)}
            </Text>
            <Text wordSafe variant="strong" testID={`largest-recipient-${i}`}>
              {r.recipient}
            </Text>
            {r.purpose ? <Text wordSafe>{r.purpose}</Text> : null}
            <Text wordSafe>{r.program}</Text>
            <Text wordSafe variant="metadata">
              {r.agency} · {r.id} · {r.selection} · Agreement from{' '}
              {formatDate(r.start)}
            </Text>
            {r.more ? (
              <Text wordSafe>
                And {r.more} more award{r.more === 1 ? '' : 's'} to the same
                recipient that month.
              </Text>
            ) : null}
            <AsAtLine asOf={data!.largest.asOf} citation="GrantConnect" />
            {r.organisation ? (
              <OrganisationWebLink
                name={r.recipient}
                path={`/money/grants/federal/recipient/${encodeURIComponent(r.recipientId)}?award=${r.id}`}
              />
            ) : null}
            {r.organisation ? (
              <SourceLink
                citation="GrantConnect record"
                record={r.id}
                url={r.sourceUrl}
                kind="record"
              />
            ) : null}
          </Group>
        )}
        footer={
          data ? (
            <InfoButton
              title="About the month’s largest grants"
              notes={data.largest.basis}
            />
          ) : null
        }
      />
    </>
  );
}
