import { router } from 'expo-router';
import { useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { decodeEntities } from '../../api/passage-text';
import { counted, formatDate } from '../../design/format';
import {
  Group,
  InlineError,
  InsetGroup,
  LinkRow,
  Skeleton,
  Text,
  type SourceDetails,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import {
  moneyItemRoute,
  moneyRecordRoute,
} from '../../navigation/routes/public-money';
import { resultsRoute } from '../../navigation/routes/search';
import { isGrantProgram } from './eligibility';
import { InterestRow } from './InterestRow';
import { EmptyResults, type RecoveryHandlers } from './EmptyResults';
import {
  openSearchPath,
  openSearchPerson,
  searchPathRoute,
} from './navigation';
import { countLabel, resultKindLabel, savedCopy } from './present';
import { failureRecovery } from './recovery';
import {
  groupKey,
  groupRequest,
  readFor,
  useRead,
  type GroupPage,
  type GroupRow,
  type Read,
} from './requests';
import { groups, type CatalogGroup } from './scopes';
import { ReportRow } from './ReportResults';

/**
 * Where a money row goes (journeys/money.md 7 and 12.1): an organisation
 * (a recipient or supplier id) pushes `money-record` with `rid` and `jur`;
 * a grant or contract record pushes `money-item`; a program or agency opens
 * its native page. Leads are never search results.
 */
export function moneyDestination(row: GroupRow) {
  const [path, query] = (row.href ?? '').split('?');
  const params = new URLSearchParams(query);
  const rid =
    params.get('rid') ??
    /^\/money\/(?:recipient|supplier)\/([^/]+)$/.exec(path ?? '')?.[1];
  if (rid)
    return moneyRecordRoute(
      { rid: decodeURIComponent(rid), jur: params.get('jur') ?? 'federal' },
      decodeEntities(row.title),
    );
  if (['grant_award', 'contract'].includes(row.kind) || params.get('award'))
    return moneyItemRoute(
      {
        kind: row.kind === 'contract' ? 'contract' : 'grant',
        id: params.get('award') ?? row.slug,
      },
      decodeEntities(row.title),
    );
  if (
    row.kind === 'grant' &&
    !isGrantProgram({ ...row, source: row.source ?? undefined })
  )
    return null;
  return row.href ? searchPathRoute(row.href) : null;
}

/** Leads are excluded from results (journeys/search.md 3.4, neutrality). */
export const isLead = (row: { kind: string; href?: string | null }) =>
  row.kind === 'lead' ||
  /^\/(?:money\/)?leads?(?:\/|$|\?)/.test(row.href ?? '');

const groupShown = new Map<string, number>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useGroupList(group: CatalogGroup, q: string) {
  const key = `${group}|${q.trim()}`;
  const pages = useSyncExternalStore(
    subscribe,
    () => groupShown.get(key) ?? 1,
    () => groupShown.get(key) ?? 1,
  );
  const first = useRead<GroupPage>(groupKey(group, q, 1));
  const last = useRead<GroupPage>(groupKey(group, q, pages));
  const reads: Read<GroupPage>[] = [];
  for (let page = 1; page <= pages; page++) {
    const read = readFor<GroupPage>(groupKey(group, q, page));
    if (read?.status !== 'ready') break;
    reads.push(read);
  }
  const results = reads.flatMap((r) =>
    r.status === 'ready' ? [r.result] : [],
  );
  const rows = results
    .flatMap((r) => r.data.results)
    .filter((row) => !isLead(row) && !row.href?.startsWith('/ask'))
    .filter((row) =>
      group === 'grants' ? isGrantProgram(row as never) : true,
    );
  const lastData = results.at(-1)?.data;
  const more =
    !!lastData &&
    lastData.page * lastData.per_page < lastData.total &&
    pages === results.length;
  const head = results[0];
  const saved = head ? savedCopy(head.stale, head.staleReason) : null;
  const source: SourceDetails | null = head
    ? {
        asOf: head.asOf,
        citation: [
          ...new Set(rows.map((r) => r.source).filter((s): s is string => !!s)),
        ],
        savedAt: head.stale ? head.savedAt : null,
        state: head.partial ? 'partial' : saved!.state,
        originals: rows.flatMap((row) =>
          row.url
            ? [
                {
                  label: row.source || 'Original source',
                  url: row.url,
                  record: decodeEntities(row.title),
                },
              ]
            : [],
        ),
        notes: [
          head.partial ? 'Some records could not be read.' : null,
          saved!.note,
          ...(head.data.warnings ?? []),
          head.data.coverage ?? null,
        ],
      }
    : null;
  return {
    first,
    next: pages > 1 ? last : null,
    rows: head ? rows : null,
    more,
    nextCount: lastData
      ? Math.max(
          0,
          Math.min(
            lastData.per_page,
            lastData.total - lastData.page * lastData.per_page,
          ),
        )
      : 0,
    count: head
      ? countLabel(head.data.total, [groups[group].one, groups[group].noun])
      : null,
    source,
    load: () => {
      if (q.trim()) void groupRequest(group, q, 1);
    },
    loadMore: () => {
      if (!more) return;
      groupShown.set(key, pages + 1);
      listeners.forEach((l) => l());
      void groupRequest(group, q, pages + 1);
    },
    retry: () =>
      void groupRequest(group, q, last?.status === 'error' ? pages : 1),
  };
}
export type GroupList = ReturnType<typeof useGroupList>;

function CatalogRow({
  row,
  group,
  index,
}: {
  row: GroupRow;
  group: CatalogGroup;
  index: number;
}) {
  const [failed, setFailed] = useState(false);
  const title = decodeEntities(row.title);
  const money = group === 'grants' || group === 'agencies';
  const destination = money ? moneyDestination(row) : null;
  const open = () => {
    setFailed(false);
    const action = row.personSlug
      ? openSearchPerson(row.personSlug)
      : openSearchPath(row.href, title);
    void action.catch(() => setFailed(true));
  };
  const detail = [
    resultKindLabel(row.kind),
    row.date ? formatDate(row.date, 'short') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  if (group === 'reports')
    return <ReportRow row={row} testID={`results-${group}-${index}`} />;
  if (row.kind === 'interest')
    return (
      <InterestRow
        row={row}
        testID={`results-${group}-${index}`}
        fallback={() => openSearchPath(row.href, title)}
      />
    );
  return (
    <View>
      <LinkRow
        title={title.replace(/\s+[\u2014–-]\s+.*$/, '')}
        detail={
          money
            ? detail
            : row.snippet
              ? `${detail} · ${row.snippet.slice(0, 140)}`
              : detail
        }
        href={destination ?? undefined}
        onPress={destination ? undefined : open}
        external={
          money && !destination && row.url
            ? { url: row.url, label: row.source || 'Original source' }
            : undefined
        }
        testID={`results-${group}-${index}`}
      />
      {failed ? (
        <InlineError
          subject="This page"
          message="This page couldn’t be opened."
          onRetry={open}
        />
      ) : null}
    </View>
  );
}

/** A register or money list: one read per explicit tap, paged on tap. */
export function GroupResults({
  group,
  list,
  q,
  recover,
}: {
  group: CatalogGroup;
  list: GroupList;
  q: string;
  recover: RecoveryHandlers;
}) {
  const noun = groups[group].noun;
  if (!list.first || list.first.status === 'loading')
    return <Skeleton shape="rows" count={3} label={`Searching ${noun}`} />;
  if (list.first.status === 'error')
    return (
      <InlineError
        subject={groups[group].label}
        message={failureRecovery(list.first.error, group).sentence}
        onRetry={list.retry}
        testID="results-error"
      />
    );
  const rows = list.rows ?? [];
  if (!rows.length)
    return <EmptyResults where={group} q={q} recover={recover} />;
  return (
    <Group gap={rhythm.block}>
      {group === 'pay' ? (
        <Text variant="footnote" testID="search-pay-caveat">
          Entitlements set by instrument, not payslips.
        </Text>
      ) : null}
      <InsetGroup>
        {rows.map((row, index) => (
          <CatalogRow
            key={`${row.slug}:${index}`}
            row={row}
            group={group}
            index={index}
          />
        ))}
      </InsetGroup>
      {list.next?.status === 'loading' ? (
        <Skeleton shape="rows" count={1} label={`Loading more ${noun}`} />
      ) : list.next?.status === 'error' ? (
        <InlineError
          subject={`More ${noun}`}
          message={`More ${noun} couldn’t load.`}
          onRetry={list.retry}
        />
      ) : list.more ? (
        <InsetGroup>
          <LinkRow
            title={`Show ${counted(list.nextCount, `more ${groups[group].one}`, `more ${noun}`)}`}
            accessory="none"
            onPress={list.loadMore}
            testID="results-more"
          />
        </InsetGroup>
      ) : null}
    </Group>
  );
}

/**
 * Tap-to-run rows (decision 3, Option C): each register or money list is
 * one read, run only when its row is chosen, on its own pushed list.
 */
export function SearchInRows({
  q,
  include,
  header,
  testID,
}: {
  q: string;
  include: readonly CatalogGroup[];
  header: string;
  testID?: string;
}) {
  return (
    <InsetGroup header={header} testID={testID}>
      {include.map((group) => (
        <LinkRow
          key={group}
          title={groups[group].label}
          onPress={() =>
            router.push(resultsRoute(group, { group, q: q.trim() }))
          }
          testID={`search-in-${group}`}
        />
      ))}
    </InsetGroup>
  );
}
