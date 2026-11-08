import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { Block } from '../../api/catalogs';
import type { recentDeclarationsFor } from '../../api/selectors';
import { catalogs } from '../../api/runtime';
import { InsetGroup } from '../../design/layout';
import { Skeleton } from '../../design/states';
import { useAccessibilitySize } from '../../design/accessibility';
import { formatDate } from '../../design/format';
import { Icon } from '../../design/icon';
import { chamberName } from '../../design/parliament';
import { partyText } from '../../design/party';
import { PersonRow, type PersonRowProps } from '../../design/people';
import { RowLink, type RowMenuAction } from '../../design/row-link';
import {
  ownsRowPadding,
  useRowCellStyle,
  useRowHighlight,
  useRowInset,
} from '../../design/row-padding';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { minimumTarget, rhythm } from '../../design/tokens';
import { openSource } from '../../navigation/external';
import { declarationsRoute, personRoute } from '../../navigation/routes';
import { personRuns } from '../declarations/model';
import { declarationsSources } from './sources';
import { blockState, reportOf, TodayBlock, useTodayRead } from './TodayBlock';
import { shareRecord } from '../../navigation/share';
import { CachedPortrait } from '../CachedPortrait';
import { changeDate } from '../follows/changes';
import { registerChangeLabel } from '../your-mp/model';

type Declaration = NonNullable<
  ReturnType<typeof recentDeclarationsFor>['data']
>[number] & { profileSlug?: string | null };
export type DeclarationEntries = readonly {
  item: Declaration;
  index: number;
}[];

/** The original register entry's label: "Register of Members’ Interests · Dan Repacholi, page 20". */
export const originalLabel = (item: Declaration) =>
  `${item.sourceLabel} · ${item.name}${item.page !== null ? `, page ${item.page}` : ''}`;

/** Today's preview of a member's words: 140 characters, cut at a word. */
export const LONG_ENTRY = 140;

/**
 * An entry's opening words (P3-10): up to `max` characters, cut at a word
 * and marked with "…". The words are the member's own, trimmed only of
 * surrounding space, never reworded. The feed shows the entry in full.
 */
export function entryPreview(text: string, max = LONG_ENTRY): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const head = flat.slice(0, max + 1);
  const space = head.lastIndexOf(' ');
  const cut = space > max / 2 ? head.slice(0, space) : flat.slice(0, max);
  return `${cut.replace(/[\s,;:.\-\u2013\u2014(]+$/, '')}…`;
}

/**
 * The person who declared, as a PersonRow: portrait, name and party (a dot
 * and its name). VoiceOver hears the name, party and chamber once; each
 * entry under it is its own element.
 */
export function declarantRow(
  item: Declaration,
  testID: string,
  portraitTestID: string,
): PersonRowProps {
  const party = item.party
    ? partyText({
        party: item.party,
        status: item.partyStatus,
        formerly: item.formerly,
      }).spoken
    : null;
  const common = {
    name: item.name,
    portrait: <CachedPortrait name={item.name} testID={portraitTestID} />,
    accessibilityLabel: [
      item.name,
      party,
      chamberName(item.chamber, item.jurisdiction),
    ]
      .filter(Boolean)
      .join(', '),
    testID,
  };
  return item.party
    ? {
        ...common,
        party: item.party,
        partyStatus: item.partyStatus,
        formerly: item.formerly,
      }
    : common;
}

/** Just declared, filtered to one member (the feed shows the entry in full). */
export const declarationsForRoute = (name: string) => ({
  pathname: '/declarations' as const,
  params: { person: name },
});

/**
 * Consecutive declarations by one member under one PersonRow, which opens
 * the profile for a roster member (plain text, no chevron, otherwise). The
 * entries line up with the name; at accessibility sizes, under the portrait.
 * The person and each entry are separate links: two tap targets per member.
 */
export function DeclarationGroup({ entries }: { entries: DeclarationEntries }) {
  const stacked = useAccessibilitySize();
  const first = entries[0]!;
  const slug = first.item.profileSlug ?? null;
  return (
    <View style={styles.group}>
      <PersonRow
        {...declarantRow(
          first.item,
          `today-declaration-person-${first.index}`,
          `today-declaration-portrait-${first.index}`,
        )}
        href={slug ? personRoute(slug, first.item.name) : undefined}
        menu={slug ? 'person' : []}
      />
      <View
        testID={`today-declaration-entries-${first.index}`}
        style={[styles.entries, stacked ? null : styles.indent]}
      >
        {entries.map(({ item, index }) => (
          <DeclarationEntry key={item.id} item={item} index={index} />
        ))}
      </View>
    </View>
  );
}

/**
 * One register entry as one link with a chevron: the member's words in the
 * record's serif, previewed to 140 characters, then "{Category} · added
 * {d MMM}". It opens Just declared filtered to the member, where the entry
 * is in full. No "More" here. Touch and hold: Open the register, Share.
 */
export function DeclarationEntry({
  item,
  index,
}: {
  item: Declaration;
  index: number;
}) {
  const cellStyle = useRowCellStyle();
  const highlight = useRowHighlight();
  useRowInset();
  const preview = item.description ? entryPreview(item.description) : null;
  const change = `${item.category} · ${registerChangeLabel(item.kind)} ${changeDate(item.date)}`;
  const spokenChange = `${item.category}, ${registerChangeLabel(item.kind)} ${formatDate(item.date, 'long')}`;
  const href = declarationsForRoute(item.name);
  const menu: RowMenuAction[] = [
    {
      title: 'Open the register',
      symbol: symbols.external,
      onPress: () => void openSource(item.url, originalLabel(item)),
    },
    {
      title: 'Share',
      symbol: 'square.and.arrow.up',
      onPress: () =>
        void shareRecord({
          title: `${item.name}: ${item.category}`,
          path: item.profileSlug
            ? `/subject/person/${item.profileSlug}/interests`
            : '/declared',
        }),
    },
  ];
  return (
    <RowLink href={href} menu={menu}>
      <Pressable
        accessible
        accessibilityRole="link"
        accessibilityLabel={[preview, spokenChange].filter(Boolean).join('. ')}
        accessibilityHint="Opens Just declared for this member"
        testID={`today-declaration-${index}`}
        onPress={() => router.push(href)}
        style={({ pressed }) => [
          styles.entry,
          cellStyle,
          pressed ? { backgroundColor: highlight } : null,
        ]}
      >
        <View style={styles.words}>
          {preview ? (
            <Text
              wordSafe
              variant="recordText"
              testID={`today-declaration-text-${index}`}
            >
              {preview}
            </Text>
          ) : null}
          <Text
            wordSafe
            variant="secondary"
            testID={`today-declaration-change-${index}`}
          >
            {change}
          </Text>
        </View>
        <Icon name={symbols.chevron} size={13} maxScale={1.5} tone="inkSoft" />
      </Pressable>
    </RowLink>
  );
}
ownsRowPadding(DeclarationEntry);

// The portrait column: the row portrait's 44 pt and the row's gap.
const PORTRAIT_COLUMN = 44 + rhythm.tight;

const styles = StyleSheet.create({
  group: { gap: rhythm.line },
  entries: { gap: rhythm.row },
  indent: { marginLeft: PORTRAIT_COLUMN },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
  },
  words: { flex: 1, gap: rhythm.line },
});

type DeclarationsBlockData = Block<Declaration[]>;
/**
 * Just declared (today.md 5.9): up to three entries, newest first, grouped
 * by member, with the line after the group. Entries draw from the recent
 * file at once; parties and profile links join when the roster answers
 * (the same rows, so nothing moves).
 */
export function DeclarationsBlock({
  attempt,
  onRetry,
}: {
  attempt: number;
  onRetry: () => void;
}) {
  const first = useTodayRead<DeclarationsBlockData>(
    'declarations',
    (refresh) => catalogs.todayDeclarations(3, refresh),
    attempt,
  );
  const joined = useTodayRead<DeclarationsBlockData | null>(
    'declarations-joined',
    async (refresh) => {
      const feed = await catalogs
        .todayDeclarationsProfiled(3, refresh)
        .catch(() => null);
      return feed?.status === 'ready' && feed.data ? feed : null;
    },
    attempt,
  );
  const block = joined ?? first;
  const state = blockState(block, { emptyCollapses: true });
  return (
    <TodayBlock
      title="Just declared"
      action={{
        accessibilityLabel: 'See all declarations',
        href: declarationsRoute,
        testID: 'today-declarations-all',
      }}
      state={state}
      skeleton={
        <Skeleton
          shape="people"
          count={3}
          label="Loading declarations"
          testID="today-declarations-loading"
        />
      }
      error="Declarations couldn't be loaded."
      onRetry={onRetry}
      report={reportOf(block)}
      line={
        block && block.status === 'ready'
          ? {
              ...declarationsSources(block),
              testID: 'today-declarations-sources',
            }
          : undefined
      }
      testID="today-declarations"
    >
      {(declarations) => (
        <InsetGroup testID="today-declarations-group">
          {personRuns(declarations).map((run) => (
            <DeclarationGroup key={run.key} entries={run.entries} />
          ))}
        </InsetGroup>
      )}
    </TodayBlock>
  );
}
