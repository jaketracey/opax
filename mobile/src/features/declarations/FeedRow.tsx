import { Pressable, StyleSheet, View } from 'react-native';
import { haptic } from '../../design/haptics';
import type { recentDeclarationsFor } from '../../api/selectors';
import { formatDate } from '../../design/format';
import {
  Icon,
  PersonRow,
  RowLink,
  Text,
  useAccessibilitySize,
  type RowMenuAction,
} from '../../design/primitives';
import { useRowHighlight } from '../../design/row-padding';
import { minimumTarget, rhythm } from '../../design/tokens';
import { openSource } from '../../navigation/external';
import { declarationsRoute, personRoute } from '../../navigation/routes';
import { presentSource } from '../../navigation/sheets';
import { shareRecord } from '../../navigation/share';
import { copyText } from '../records/actions';
import { registerChangeLabel } from '../your-mp/model';
import { declarantRow, originalLabel } from '../today/DeclarationRow';

// The feed's rows also carry the member's profile slug, when there is one.
type Declaration = NonNullable<
  ReturnType<typeof recentDeclarationsFor>['data']
>[number] & { profileSlug?: string | null };
type Tie = NonNullable<Declaration['ties']>[number];

/** "Same name as an AEC donor: Adani Mining Pty Ltd". */
export function tieLine(tie: Tie): string {
  const kinds = tie.kinds.length ? tie.kinds : [tie.kind];
  const register = kinds.includes('donor')
    ? 'an AEC donor'
    : kinds.includes('lobbyist')
      ? 'a registered lobbying firm'
      : kinds.includes('fits')
        ? 'a FITS registrant'
        : kinds.some((k) => k === 'supplier' || k === 'contract')
          ? 'a government supplier'
          : 'an organisation in another public register';
  return `Same name as ${register}: ${tie.organisation}`;
}

/** "Added 2 Sep 2026": what the register did to the entry, and when. */
export function changeLine(
  item: Pick<Declaration, 'kind' | 'date'>,
  style: 'long' | 'short' = 'short',
) {
  const change = registerChangeLabel(item.kind);
  const date = formatDate(item.date, style);
  return [
    `${change.charAt(0).toLocaleUpperCase('en-AU')}${change.slice(1)}`,
    date,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Consecutive entries by one member in Just declared, under one PersonRow
 * (portrait, name, party), which opens the member's profile when there is
 * one. Each entry follows in the member's own words, in full.
 */
export function FeedGroup({
  entries,
  onOpenPerson,
}: {
  entries: readonly { item: Declaration; index: number }[];
  /** Present only when the member has a native profile. */
  onOpenPerson?: () => void;
}) {
  const stacked = useAccessibilitySize();
  const first = entries[0]!;
  return (
    <View style={styles.frame}>
      <PersonRow
        {...declarantRow(
          first.item,
          `declaration-person-${first.index}`,
          `declaration-portrait-${first.index}`,
        )}
        onPress={onOpenPerson}
      />
      <View style={[styles.entries, stacked ? null : styles.indent]}>
        {entries.map(({ item, index }) => (
          <FeedEntry
            key={item.id}
            item={item}
            index={index}
            onOpenPerson={onOpenPerson}
          />
        ))}
      </View>
    </View>
  );
}

/** One feed row: a group of one entry. */
export function FeedRow({
  item,
  index,
  onOpenPerson,
}: {
  item: Declaration;
  index: number;
  onOpenPerson?: () => void;
}) {
  return <FeedGroup entries={[{ item, index }]} onOpenPerson={onOpenPerson} />;
}

/** The entry's own source sheet: the register page, dated, and its notes. */
function openEntrySource(item: Declaration, index: number) {
  presentSource(
    {
      asOf: item.date,
      dateRole: 'recorded',
      citation: [{ label: 'Register of interests', title: item.sourceLabel }],
      originals: [
        {
          label: item.sourceLabel,
          url: item.url,
          record: `${item.name}, ${formatDate(item.date, 'short')}${
            item.page !== null ? `, page ${item.page}` : ''
          }`,
          asOf: item.date,
        },
      ],
      notes: [
        item.category,
        ...(item.ties ?? []).map(
          (tie) =>
            `${tieLine(tie)}. Matches use exact names, ignoring case and spacing; a shared name is not evidence of wrongdoing.`,
        ),
      ],
    },
    { testID: `declaration-source-${index}` },
  );
}

/**
 * One entry, one button: the member's words, the category, any name match
 * and "Added 2 Sep 2026 · Register of interests". It opens the entry's
 * source sheet (no chevron: it does not push). Touch and hold, or the
 * VoiceOver actions, open the profile or the register, copy or share.
 */
function FeedEntry({
  item,
  index,
  onOpenPerson,
}: {
  item: Declaration;
  index: number;
  onOpenPerson?: () => void;
}) {
  const highlight = useRowHighlight();
  const ties = (item.ties ?? []).map(tieLine);
  const change = changeLine(item);
  const slug = item.profileSlug;
  const menu: RowMenuAction[] = [
    ...(onOpenPerson
      ? [
          {
            title: 'Open profile',
            symbol: 'person.crop.circle' as const,
            onPress: onOpenPerson,
          },
        ]
      : []),
    {
      title: 'Open the register',
      symbol: 'arrow.up.right.square',
      onPress: () => void openSource(item.url, originalLabel(item)),
    },
    ...(item.description
      ? [
          {
            title: 'Copy text',
            symbol: 'doc.on.doc' as const,
            onPress: () => {
              void copyText(item.description!).then((copied) => {
                if (copied) haptic('success');
              });
            },
          },
        ]
      : []),
    {
      title: 'Share',
      symbol: 'square.and.arrow.up',
      onPress: () =>
        void shareRecord({
          title: `${item.name}: ${item.category}`,
          path: slug ? `/subject/person/${slug}/interests` : '/declared',
        }),
    },
  ];
  const label = [
    item.description?.trim().replace(/[.\s]+$/, ''),
    item.category,
    ...ties,
    `${changeLine(item, 'long')}, Register of interests`,
  ]
    .filter(Boolean)
    .join('. ');
  return (
    <RowLink
      href={slug ? personRoute(slug) : declarationsRoute}
      preview={false}
      menu={menu}
      select={() => openEntrySource(item, index)}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Opens sources"
        testID={`declaration-entry-${index}`}
        onPress={() => openEntrySource(item, index)}
        style={({ pressed }) => [
          styles.entry,
          pressed ? { backgroundColor: highlight } : null,
        ]}
      >
        {item.description ? (
          <Text variant="recordText" testID={`declaration-text-${index}`}>
            {item.description}
          </Text>
        ) : null}
        <Text
          wordSafe
          variant="secondary"
          testID={`declaration-change-${index}`}
        >
          {item.category}
        </Text>
        {ties.length ? (
          <Text
            wordSafe
            variant="footnote"
            testID={`declaration-ties-${index}`}
          >
            {ties.join('\n')}
          </Text>
        ) : null}
        <View style={styles.register}>
          <Icon
            name="doc.text.magnifyingglass"
            size={13}
            maxScale={1.5}
            tone="navy"
          />
          <Text wordSafe variant="footnote" tone="inkSoft" style={styles.grow}>
            {`${change} · `}
            <Text variant="footnote" tone="navy">
              Register of interests
            </Text>
          </Text>
        </View>
      </Pressable>
    </RowLink>
  );
}
// The portrait column: the row portrait's 44pt and the row's 12pt gap.
const PORTRAIT_COLUMN = 44 + rhythm.heading;

const styles = StyleSheet.create({
  frame: { gap: rhythm.line, paddingVertical: rhythm.row },
  entries: { gap: rhythm.block },
  indent: { marginLeft: PORTRAIT_COLUMN },
  entry: { minHeight: minimumTarget, gap: rhythm.line + 2 },
  register: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
  },
  grow: { flexShrink: 1 },
});
