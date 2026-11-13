import { RouteOptions } from '../../navigation/preview';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, SectionList, StyleSheet, View } from 'react-native';
import { SegmentedPicker } from '../../design/controls';
import { counted, formatCount } from '../../design/format';
import { useScreenColumn } from '../../design/layout';
import { useListSearchBar } from '../../design/search-bar';
import {
  ContentUnavailable,
  Skeleton,
  StatePageProvider,
} from '../../design/states';
import { Text } from '../../design/text';
import { colors, hairline, rhythm } from '../../design/tokens';
import { billRoute } from '../../navigation/routes';
import { loadProfile, type Loaded } from '../Person';
import { BlockSource, votesSource } from '../your-mp/Evidence';
import { registerCategoryLabel, registerEntry } from '../your-mp/model';
import type { EvidenceBlock } from '../your-mp/model';
import { MemberVoteRow } from './MemberVoteRow';
import { useFloatingBarFoot } from '../../navigation/floating-bar';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type Load =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error' }
  | ({ status: 'ready' } & Loaded);

function useProfile(slug: string) {
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<{ key: string; load: Load }>();
  const key = `${slug}#${attempt}`;
  useEffect(() => {
    let active = true;
    loadProfile(slug)
      .then((loaded) => {
        if (active)
          setLoad({
            key,
            load: loaded
              ? { status: 'ready', ...loaded }
              : { status: 'missing' },
          });
      })
      .catch(() => {
        if (active) setLoad({ key, load: { status: 'error' } });
      });
    return () => {
      active = false;
    };
  }, [slug, key]);
  return {
    load: load?.key === key ? load.load : ({ status: 'loading' } as Load),
    retry: () => setAttempt((n) => n + 1),
  };
}

function Unavailable({
  load,
  retry,
  subject,
  testID,
}: {
  load: Load;
  retry: () => void;
  subject: string;
  testID: string;
}) {
  return load.status === 'loading' ? (
    <Skeleton
      shape="rows"
      count={8}
      label={`Loading ${subject}`}
      testID={`${testID}-loading`}
    />
  ) : load.status === 'missing' ? (
    <ContentUnavailable
      symbol="person.crop.circle"
      title="This person isn’t in OPAX"
      testID={`${testID}-not-found`}
    />
  ) : (
    <ContentUnavailable
      symbol="exclamationmark.triangle"
      title={`Couldn’t load ${subject}`}
      body="Check your connection and try again."
      action={{ label: 'Try again', onPress: retry }}
      testID={`${testID}-error`}
    />
  );
}

type Side = 'all' | 'for' | 'against';

/** A missing or unreadable file is not evidence of an empty public record. */
function BlockUnavailable({
  block,
  retry,
  subject,
  missing,
  testID,
}: {
  block: Pick<EvidenceBlock<unknown>, 'status' | 'partial'> | null;
  retry: () => void;
  subject: string;
  missing: string;
  testID: string;
}) {
  if (block?.status === 'error' || block?.status === 'loading')
    return (
      <Unavailable
        load={{ status: block.status }}
        retry={retry}
        subject={subject}
        testID={testID}
      />
    );
  return (
    <ContentUnavailable
      symbol="doc.text"
      title={
        block?.status === 'unlinked'
          ? 'These records couldn’t be matched to this person'
          : missing
      }
      body={block?.partial ? 'Some records could not be read.' : undefined}
      action={
        block?.partial ? { label: 'Try again', onPress: retry } : undefined
      }
      testID={`${testID}-empty`}
    />
  );
}

/**
 * A member's whole voting record (`person/[slug]/votes`), pushed in the
 * readable column: every bill vote, newest first, searchable by bill and
 * narrowed to For or Against. Each row opens the division on its bill.
 */
export function PersonVotes() {
  const params = useLocalSearchParams<{ slug: string; name?: string }>();
  const slug = one(params.slug) ?? '';
  const { load, retry } = useProfile(slug);
  const [side, setSide] = useState<Side>('all');
  const [query, setQuery] = useState('');
  const search = useListSearchBar({
    placeholder: 'Bills',
    onChangeText: setQuery,
    onSearchButtonPress: setQuery,
    onCancelButtonPress: () => setQuery(''),
  });
  const { onLayout, content } = useScreenColumn('readable');
  const foot = useFloatingBarFoot();
  const votes = load.status === 'ready' ? load.profile.blocks.votes : null;
  const v = votes?.data;
  const rows = v
    ? [
        ...v.for.map((r) => ({ ...r, position: 'for' as const })),
        ...v.against.map((r) => ({ ...r, position: 'against' as const })),
      ]
        .filter((r) => side === 'all' || r.position === side)
        .filter((r) =>
          query.trim()
            ? r.name
                .toLocaleLowerCase('en-AU')
                .includes(query.trim().toLocaleLowerCase('en-AU'))
            : true,
        )
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    : [];
  return (
    <>
      <RouteOptions
        options={{ title: 'Voting record', headerSearchBarOptions: search }}
      />
      {load.status !== 'ready' ||
      !v ||
      !votes ||
      votes.status === 'error' ||
      votes.status === 'loading' ? (
        <View style={styles.page} testID="person-votes-screen">
          {load.status === 'ready' ? (
            <BlockUnavailable
              block={votes}
              retry={retry}
              subject="votes"
              missing="No voting summary is held for this person"
              testID="person-votes-list"
            />
          ) : (
            <Unavailable
              load={load}
              retry={retry}
              subject="votes"
              testID="person-votes-list"
            />
          )}
        </View>
      ) : (
        <StatePageProvider refreshing={false}>
          <FlatList
            testID="person-votes-screen"
            style={styles.page}
            contentInsetAdjustmentBehavior="automatic"
            onLayout={onLayout}
            contentContainerStyle={[styles.content, content, foot]}
            data={rows}
            keyExtractor={(r, i) => `${r.position}-${r.name}-${r.stage}-${i}`}
            ListHeaderComponent={
              <View style={styles.picker}>
                <SegmentedPicker<Side>
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'for', label: 'For' },
                    { value: 'against', label: 'Against' },
                  ]}
                  value={side}
                  onChange={setSide}
                  accessibilityLabel="Votes shown"
                  testID="person-votes-side"
                />
              </View>
            }
            renderItem={({ item: r, index }) => (
              <MemberVoteRow
                position={r.position}
                name={r.name}
                stage={r.stage}
                date={r.date}
                href={
                  r.billKey
                    ? billRoute(r.billKey, undefined, { section: 'divisions' })
                    : undefined
                }
                testID={`person-votes-row-${index}`}
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.inset} />}
            ListEmptyComponent={
              <ContentUnavailable
                symbol="magnifyingglass"
                title="No results"
                body={query ? `No bill matches “${query}”.` : undefined}
                testID="person-votes-no-results"
              />
            }
            ListFooterComponent={
              <View style={styles.foot}>
                <BlockSource
                  block={votes}
                  citation="They Vote For You"
                  licenceDataset="tvfy"
                  notes={[
                    'A division is a recorded vote: each member’s choice is counted and published.',
                    v.method,
                  ]}
                  line={votesSource(votes)}
                  testID="person-votes-list-source"
                />
                <Text wordSafe variant="footnote">
                  {`${counted(rows.length, 'vote', 'votes')} on bills`}
                </Text>
              </View>
            }
          />
        </StatePageProvider>
      )}
    </>
  );
}

/**
 * A member's declared interests in full (`person/[slug]/interests`): one
 * sticky group per register category, each entry in the member's words.
 */
export function PersonInterests() {
  const params = useLocalSearchParams<{ slug: string; name?: string }>();
  const slug = one(params.slug) ?? '';
  const { load, retry } = useProfile(slug);
  const { onLayout, content } = useScreenColumn('readable');
  const foot = useFloatingBarFoot();
  const interests =
    load.status === 'ready' ? load.profile.blocks.interests : null;
  const r = interests?.data;
  const sections = r
    ? Object.entries(r.buckets).map(([name, bucket]) => ({
        key: name,
        title: registerCategoryLabel(name),
        data: bucket.items.map((row) => registerEntry(row, r.statement_date)),
      }))
    : [];
  return (
    <>
      <RouteOptions options={{ title: 'Declared interests' }} />
      {load.status !== 'ready' ||
      !r ||
      !interests ||
      interests.status === 'error' ||
      interests.status === 'loading' ? (
        <View style={styles.page} testID="person-interests-screen">
          {load.status === 'ready' ? (
            <BlockUnavailable
              block={interests}
              retry={retry}
              subject="declared interests"
              missing="No register file is held for this person"
              testID="person-interests-list"
            />
          ) : (
            <Unavailable
              load={load}
              retry={retry}
              subject="declared interests"
              testID="person-interests-list"
            />
          )}
        </View>
      ) : (
        <StatePageProvider refreshing={false}>
          <SectionList
            testID="person-interests-screen"
            style={styles.page}
            contentInsetAdjustmentBehavior="automatic"
            stickySectionHeadersEnabled
            onLayout={onLayout}
            contentContainerStyle={[styles.content, content, foot]}
            sections={sections}
            keyExtractor={(e, i) => `${e.title}-${i}`}
            renderSectionHeader={({ section }) => (
              <View style={styles.header}>
                <Text wordSafe variant="groupHeader" accessibilityRole="header">
                  {section.title}
                </Text>
              </View>
            )}
            renderItem={({ item, index, section }) => (
              <View
                accessible
                style={[styles.entry, index ? styles.rule : null]}
                testID={`person-interests-${section.key}-${index}`}
              >
                {item.title ? (
                  <Text wordSafe variant="strong">
                    {item.title}
                  </Text>
                ) : null}
                {item.detail ? (
                  <Text wordSafe variant="recordText">
                    {item.detail}
                  </Text>
                ) : null}
                {item.meta ? (
                  <Text wordSafe variant="secondary">
                    {item.meta}
                  </Text>
                ) : null}
              </View>
            )}
            ListFooterComponent={
              <View style={styles.foot}>
                <BlockSource
                  block={interests}
                  citation="Register of interests"
                  licenceDataset="interests"
                  line={{ partial: !!r.unread_pages }}
                  testID="person-interests-list-source"
                />
                <Text wordSafe variant="footnote">
                  {`${formatCount(r.total)} declared ${r.total === 1 ? 'interest' : 'interests'}`}
                </Text>
              </View>
            }
          />
        </StatePageProvider>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  content: { paddingBottom: rhythm.section },
  picker: { paddingVertical: rhythm.tight },
  header: { backgroundColor: colors.paper, paddingVertical: rhythm.tight },
  entry: { paddingVertical: rhythm.tight, gap: rhythm.line },
  rule: { borderTopWidth: hairline, borderTopColor: colors.dividerSubtle },
  inset: { height: hairline, backgroundColor: colors.dividerSubtle },
  foot: { paddingTop: rhythm.group, gap: rhythm.line },
});
