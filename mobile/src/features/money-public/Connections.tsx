import { RouteOptions } from '../../navigation/preview';
import { useCallback, useMemo, useState } from 'react';

import { SegmentedPicker } from '../../design/controls';
import { LinkRow } from '../../design/rows';
import { SourceLine } from '../../design/source';
import { EmptyState } from '../../design/states';
import { Text } from '../../design/text';
import { connectionRoute } from '../../navigation/routes/public-money';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { money } from './runtime';
import {
  ListCaption,
  MoneyList,
  MoneyStatus,
  TitleAlias,
  counted,
  matches,
  moneyBar,
  readableDates,
  recordSource,
  useMoneySearch,
} from './parts';

/** The three publishers the counts come from (specs/money.md 2.12). */
export const CONNECTIONS_CITATION = [
  { label: 'Hansard', title: 'Hansard, Parliament of Australia' },
  { label: 'Press releases', title: 'Ministers’ and members’ press releases' },
  { label: 'Queensland grants', title: 'Queensland Government grant records' },
];
export const CONNECTIONS_NOTE =
  'Counts are documents: speeches, press releases and grant records that name each entry. An electorate also counts grant records whose postcode falls in it; postcodes are not precise locations.';

type Kind = 'all' | 'program' | 'place' | 'organisation';
const kindWords: Record<string, string> = {
  program: 'Program',
  place: 'Place',
  electorate: 'Electorate',
  organisation: 'Organisation',
};
/** "Program", "Electorate": the kind in words. */
export const kindWord = (kind: string) => kindWords[kind] ?? '';
/** "Electorate · in 21,742 documents". */
export const connectionDetail = (kind: string, documents: number) =>
  [kindWord(kind), `in ${counted(documents, 'document')}`]
    .filter(Boolean)
    .join(' · ');
/**
 * A name as given, except a name in capitals only ("BACK TO WORK") shown in
 * title case ("Back To Work").
 */
export function displayName(name: string) {
  if (!/[A-Z]/.test(name) || name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(
      /(^|[\s(/-])(\p{L})/gu,
      (_, gap: string, letter: string) => `${gap}${letter.toUpperCase()}`,
    );
}

/**
 * Programs and places (specs/money.md 2.12): programs, places and
 * organisations named together in the record. Every row pushes its own
 * native page (`connection?id=`) with the excerpts.
 */
export default function Connections() {
  const load = useCallback(
      (refresh: boolean, _publish: unknown, signal?: AbortSignal) =>
        money.connections(refresh, signal),
      [],
    ),
    status = useCatalogRecord(load),
    data = status.record?.data;
  const search = useMoneySearch('Programs, places and organisations');
  const [kind, setKind] = useState<Kind>('all');
  const inKind = useMemo(
    () =>
      (data?.entities ?? []).filter(
        (e) =>
          kind === 'all' ||
          e.kind === kind ||
          (kind === 'place' && e.kind === 'electorate'),
      ),
    [data, kind],
  );
  const rows = useMemo(
    () =>
      inKind
        .filter((e) => matches(search.query, e.name))
        .sort((a, b) => b.count - a.count),
    [inKind, search.query],
  );
  const searching = !!search.query.trim();
  const caption = searching
    ? `${rows.length.toLocaleString('en-AU')} of ${counted(inKind.length, 'name')}`
    : `${counted(inKind.length, 'name')}, most documents first`;
  const saved = recordSource(status.record);
  const name = 'Programs and places';
  return (
    <>
      <RouteOptions
        options={{
          title: name,
          headerLargeTitleEnabled: true,
          headerLargeTitleShadowVisible: false,
          headerSearchBarOptions: search.options,
          ...moneyBar({ name, path: '/connections' }),
        }}
      />
      <MoneyList
        loaded={!!data}
        id="connections-list"
        rows={rows}
        rowKey={(r) => r.id}
        refreshing={status.refreshing}
        refresh={status.refresh}
        header={
          <>
            <TitleAlias title={name} testID="connections-title" />
            <Text wordSafe variant="secondary">
              Programs, places and organisations named together in Hansard,
              press releases and Queensland grants.
            </Text>
            <MoneyStatus
              status={status}
              name={name}
              figure={false}
              testID="connections-status"
            />
            {data ? (
              <>
                <SegmentedPicker
                  accessibilityLabel="Show"
                  value={kind}
                  onChange={setKind}
                  options={[
                    {
                      value: 'all',
                      label: 'All',
                      testID: 'connections-kind-all',
                    },
                    {
                      value: 'program',
                      label: 'Programs',
                      testID: 'connections-kind-program',
                    },
                    {
                      value: 'place',
                      label: 'Places',
                      testID: 'connections-kind-place',
                    },
                    {
                      value: 'organisation',
                      label: 'Organisations',
                      testID: 'connections-kind-organisation',
                    },
                  ]}
                  testID="connections-kind"
                />
                <ListCaption announce={searching} testID="connections-caption">
                  {caption}
                </ListCaption>
              </>
            ) : null}
          </>
        }
        empty={
          searching ? (
            <EmptyState
              message={`No names match “${search.query.trim()}”.`}
              testID="connections-empty"
            />
          ) : null
        }
        sourceLine={
          data ? (
            <SourceLine
              asOf={data.asOf}
              citation={CONNECTIONS_CITATION}
              savedAt={saved.savedAt}
              state={saved.state}
              notes={[CONNECTIONS_NOTE, data.note, ...saved.stateNotes].map(
                readableDates,
              )}
              testID="connections-source"
            />
          ) : null
        }
        render={(r) => (
          <LinkRow
            title={displayName(r.name)}
            detail={connectionDetail(r.kind, r.count)}
            href={connectionRoute(r.id, displayName(r.name))}
            testID={`connection-open-${r.id}`}
          />
        )}
      />
    </>
  );
}
