import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, FlatList, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { peopleDepth } from '../../api/runtime';
import type { RecordResult } from '../../api/client';
import { serverPassage } from '../../api/passage-text';
import { MACHINE_BRIEF_EXPLANATION, MachineLabel } from '../../design/labels';
import { RecordRow } from '../../design/rows';
import { SourceLine } from '../../design/source';
import { ContentUnavailable, Skeleton } from '../../design/states';
import { phoneCopy } from '../../design/phone-copy';
import { Text } from '../../design/text';
import { chamberName } from '../../design/parliament';
import { formatCount, formatDate } from '../../design/format';
import { colors, rhythm } from '../../design/tokens';
import { useScreenColumn } from '../../design/layout';
import { headerItems, pageItems } from '../../navigation/chrome';
import { canonicalUrl } from '../../navigation/external';
import { fromWebPath } from '../../navigation/routes';
import { presentSource } from '../../navigation/sheets';
import { shareRecord } from '../../navigation/share';
import { useOpenAsk } from '../ask/open';
import { askDraft, pageActions } from './PageActions';
import { recordListTitle, type RecordListKind } from './Sections';
import {
  cleanPassage,
  displayedRecordTitle,
  type RecordRow as Row,
} from './model';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const PER = 20;

type Page = Awaited<ReturnType<typeof peopleDepth.list>>;
type Load =
  | { status: 'loading' }
  | { status: 'error'; offline: boolean }
  | {
      status: 'ready';
      rows: Row[];
      briefs: Record<string, string>;
      record: RecordResult<unknown>;
      more: boolean;
      paging: boolean;
    };

const noun = (kind: 'speeches' | 'mentions', n: number) =>
  kind === 'speeches'
    ? `${formatCount(n)} ${n === 1 ? 'speech' : 'speeches'}`
    : `${formatCount(n)} ${n === 1 ? 'mention' : 'mentions'}`;

/**
 * Speeches and Mentions in parliament (people.md 2.1, route 15): pushed from
 * a profile or party page, newest first, 20 a page, with the list's source
 * line and count at its foot. No search or filters: bounded and dated.
 */
export default function RecordList({
  kind: fixed,
}: {
  /** `/person/[slug]/speeches` fixes the kind; `record-list` reads it. */
  kind?: RecordListKind;
} = {}) {
  const params = useLocalSearchParams<{
    slug?: string;
    person?: string;
    party?: string;
    kind?: string;
    name?: string;
  }>();
  const kind: RecordListKind = fixed
    ? fixed
    : one(params.kind) === 'mentions'
      ? 'mentions'
      : one(params.kind) === 'news'
        ? 'news'
        : 'speeches';
  const person = one(params.person) ?? one(params.slug);
  const party = one(params.party);
  const name = one(params.name) ?? person ?? party ?? '';
  const title = recordListTitle[kind];
  const webPath = person
    ? `/subject/person/${person}`
    : `/subject/party/${encodeURIComponent(name)}`;
  const openAsk = useOpenAsk();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const pages = useRef(0);
  const read = useCallback(
    (page: number) =>
      kind === 'news'
        ? Promise.reject(new Error('News is not listed'))
        : Promise.resolve().then(() => peopleDepth.list(name, kind, page)),
    [kind, name],
  );
  useEffect(() => {
    // News is not listed yet: nothing to read.
    if (kind === 'news') return;
    let active = true;
    pages.current = 1;
    read(1)
      .then((page: Page) => {
        if (!active) return;
        setLoad({
          status: 'ready',
          rows: page.records.data.results,
          briefs: page.briefs,
          record: page.records,
          more: page.records.data.results.length >= PER,
          paging: false,
        });
      })
      .catch((e: { code?: string }) => {
        if (active)
          setLoad({
            status: 'error',
            offline: e?.code === 'offline' || e?.code === 'timeout',
          });
      });
    return () => {
      active = false;
    };
  }, [read, attempt, kind]);
  const next = () => {
    if (load.status !== 'ready' || !load.more || load.paging) return;
    const page = pages.current + 1;
    setLoad({ ...load, paging: true });
    read(page)
      .then((more: Page) => {
        pages.current = page;
        setLoad((was) =>
          was.status === 'ready'
            ? {
                ...was,
                rows: [...was.rows, ...more.records.data.results],
                briefs: { ...was.briefs, ...more.briefs },
                more: more.records.data.results.length >= PER,
                paging: false,
              }
            : was,
        );
      })
      .catch(() =>
        setLoad((was) =>
          was.status === 'ready' ? { ...was, more: false, paging: false } : was,
        ),
      );
  };
  const ready = load.status === 'ready' ? load : null;
  const source = {
    asOf: ready?.record.asOf ?? null,
    citation: 'OPAX parliamentary record',
    savedAt: ready?.record.stale ? ready.record.savedAt : null,
    notes: [
      'OPAX parliamentary record; each row opens its source record.',
      kind === 'speeches'
        ? 'Newest matching results. Older speeches may not appear here.'
        : 'Newest records that name them. A shared name can match another person.',
      'Machine briefs are automated summaries; passages are extracts from the record.',
    ],
  };
  const menu = pageActions({
    kind: person ? 'person' : 'party',
    name,
    webPath,
    extra: [
      {
        title: 'Sources',
        symbol: 'doc.text.magnifyingglass',
        onPress: () => presentSource(source),
      },
    ],
  }).filter((item) => item.title !== `Ask about ${name}`);
  const fullMenu =
    kind === 'speeches' && person
      ? [
          {
            title: `Ask about ${name}’s speeches`,
            symbol: 'text.bubble' as const,
            onPress: () => openAsk(askDraft('speeches', name)),
          },
          ...menu,
        ]
      : menu;
  useEffect(() => {
    if (ready && !ready.paging)
      AccessibilityInfo.announceForAccessibility(
        kind === 'news' ? '' : noun(kind, ready.rows.length),
      );
  }, [ready?.rows.length, ready?.paging, kind, ready]);
  const { onLayout, content } = useScreenColumn('readable');
  const briefsShown = ready
    ? ready.rows.some((r) => ready.briefs[r.resource ?? ''])
    : false;
  return (
    <>
      <Stack.Screen
        options={{
          title,
          ...headerItems(
            pageItems({
              name: title,
              share: () => void shareRecord({ path: webPath, title: name }),
              menu: fullMenu,
            }),
          ),
        }}
      />
      {kind === 'news' ? (
        <View style={styles.page} testID="record-list-screen">
          <ContentUnavailable
            symbol="newspaper"
            title="News isn’t available yet"
            testID="record-list-unavailable"
          />
        </View>
      ) : load.status === 'error' ? (
        <View style={styles.page} testID="record-list-screen">
          <ContentUnavailable
            symbol={
              load.status === 'error' && load.offline
                ? 'wifi.slash'
                : 'exclamationmark.triangle'
            }
            title={
              load.status === 'error' && load.offline
                ? phoneCopy('Not saved on this iPhone yet')
                : `Couldn’t load ${title.toLowerCase()}`
            }
            body={
              load.status === 'error' && load.offline
                ? 'It will load when you’re back online.'
                : 'Check your connection and try again.'
            }
            action={{
              label: 'Try again',
              onPress: () => {
                setLoad({ status: 'loading' });
                setAttempt((n) => n + 1);
              },
            }}
            testID="record-list-error"
          />
        </View>
      ) : (
        <FlatList
          testID="record-list-screen"
          style={styles.page}
          contentInsetAdjustmentBehavior="automatic"
          onLayout={onLayout}
          contentContainerStyle={[styles.content, content]}
          data={ready?.rows ?? []}
          keyExtractor={(r, i) => `${r.slug}-${i}`}
          onEndReached={next}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            briefsShown ? (
              <MachineLabel explanation={MACHINE_BRIEF_EXPLANATION} />
            ) : null
          }
          ListEmptyComponent={
            load.status === 'loading' ? (
              <Skeleton
                shape="rows"
                count={8}
                label={`Loading ${title.toLowerCase()}`}
                testID="record-list-loading"
              />
            ) : (
              <ContentUnavailable
                symbol="quote.bubble"
                title={
                  kind === 'speeches'
                    ? 'No speeches in the record'
                    : 'No mentions in the record'
                }
                testID="record-list-empty"
              />
            )
          }
          renderItem={({ item: r, index }) => {
            const brief = ready?.briefs[r.resource ?? ''];
            const path = '/doc/' + encodeURIComponent(r.slug);
            const native = fromWebPath(path);
            const passage =
              kind === 'speeches'
                ? cleanPassage(r.snippet)
                : serverPassage(r.snippet, { max: 220 });
            return (
              <RecordRow
                title={displayedRecordTitle(r)}
                meta={[
                  kind === 'speeches' ? 'Speech' : r.speaker || 'Mention',
                  chamberName(r.chamber, r.state),
                  r.date ? formatDate(r.date, 'short') : 'Undated',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                excerpt={
                  brief || passage ? { text: (brief || passage)! } : null
                }
                href={native ?? undefined}
                external={
                  native
                    ? undefined
                    : {
                        url: canonicalUrl(path),
                        label: displayedRecordTitle(r),
                      }
                }
                testID={`record-list-row-${index}`}
              />
            );
          }}
          ListFooterComponent={
            ready && ready.rows.length ? (
              ready.more ? (
                <Skeleton
                  shape="rows"
                  count={2}
                  label={`Loading more ${title.toLowerCase()}`}
                  testID="record-list-more"
                />
              ) : (
                <View style={styles.foot}>
                  <SourceLine
                    title={title}
                    {...source}
                    testID="record-list-source"
                  />
                  <Text wordSafe variant="footnote" testID="record-list-count">
                    {noun(kind as 'speeches' | 'mentions', ready.rows.length)}
                  </Text>
                </View>
              )
            ) : null
          }
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  content: { paddingBottom: rhythm.section },
  foot: { paddingTop: rhythm.group, gap: rhythm.line },
});
