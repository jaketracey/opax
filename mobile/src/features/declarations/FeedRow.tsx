import { useRef } from 'react';
import { findNodeHandle, Pressable, StyleSheet, View } from 'react-native';
import type { recentDeclarationsFor } from '../../api/selectors';
import { formatDate } from '../../design/format';
import { chamberName } from '../../design/parliament';
import { PersonRow, Text, useAccessibilitySize } from '../../design/primitives';
import { minimumTarget, rhythm } from '../../design/tokens';
import { openSource } from '../../navigation/external';
import { registerChangeLabel } from '../your-mp/model';
import { declarantRow, originalLabel } from '../today/DeclarationRow';
import { shortDay } from '../today/parts';
import { showRecordMenu } from '../today/RecordMenu';

type Declaration = NonNullable<
  ReturnType<typeof recentDeclarationsFor>['data']
>[number];
type Tie = NonNullable<Declaration['ties']>[number];

// The web's register labels for a name match (app.js declaredTieHTML).
export function tieText(tie: Tie) {
  const kinds = tie.kinds.length ? tie.kinds : [tie.kind];
  const labels: string[] = [];
  if (kinds.includes('donor'))
    labels.push(
      `AEC donor${tie.industry ? ` · ${tie.industry.replace(/_/g, ' ')}` : ''}`,
    );
  if (kinds.includes('lobbyist')) labels.push('registered lobbying firm');
  if (kinds.includes('fits')) labels.push('FITS registrant');
  return labels.length
    ? `${tie.organisation}, ${labels.join(' · ')}`
    : tie.organisation;
}

/**
 * "Gift · added 31 Aug · Senate": the category, what changed and when, and
 * the chamber, on the row's one date line (Today's anatomy, with the chamber
 * the feed filters by).
 */
export function feedDateLine(
  item: Pick<
    Declaration,
    'category' | 'kind' | 'date' | 'chamber' | 'jurisdiction'
  >,
) {
  return [
    item.category,
    `${registerChangeLabel(item.kind)} ${shortDay(item.date)}`,
    chamberName(item.chamber, item.jurisdiction),
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Consecutive entries by one member in the declared-interests feed, under
 * one PersonRow (portrait, name, party as a dot and a name), which opens the
 * member's native profile when there is one. Each entry follows in the
 * member's own words and in full, with one date line ("Gift · added 31 Aug
 * · Senate") and any name match the export found, with its caveat.
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

/**
 * One entry, its own VoiceOver element, named so it reads on its own.
 * "View original" (the register page) is a touch-and-hold action and a
 * VoiceOver action, as on Today; the registers are in the feed's source
 * line and on Sources and licences.
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
  const ties = item.ties?.length
    ? `Name match: ${item.ties.map(tieText).join('; ')}. Exact names only; this identifies a shared name across public registers, not wrongdoing.`
    : null;
  const original = () => void openSource(item.url, originalLabel(item));
  const label = [
    item.name,
    `${item.category}, ${registerChangeLabel(item.kind)} ${formatDate(item.date)}`,
    chamberName(item.chamber, item.jurisdiction),
    item.description,
  ]
    .filter(Boolean)
    .join(', ');
  const menuAnchor = useRef<View>(null);
  const menu = () =>
    showRecordMenu(
      item.name,
      [
        ...(onOpenPerson
          ? [{ title: 'Open profile', onPress: onOpenPerson }]
          : []),
        { title: 'View original', onPress: original },
      ],
      findNodeHandle(menuAnchor.current) ?? undefined,
    );
  return (
    <View style={styles.entry}>
      <Pressable
        ref={menuAnchor}
        accessibilityRole="text"
        accessibilityLabel={label}
        accessibilityActions={[
          { name: 'viewOriginal', label: 'View original' },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'viewOriginal') original();
        }}
        onLongPress={menu}
        testID={`declaration-entry-${index}`}
        style={styles.main}
      >
        {item.description ? (
          <Text testID={`declaration-text-${index}`}>{item.description}</Text>
        ) : null}
        <Text wordSafe variant="fine" testID={`declaration-change-${index}`}>
          {feedDateLine(item)}
        </Text>
      </Pressable>
      {ties ? (
        <Text
          wordSafe
          variant="fine"
          tone="ink"
          testID={`declaration-ties-${index}`}
        >
          {ties}
        </Text>
      ) : null}
    </View>
  );
}

// The portrait column: the row portrait's 44pt and the row's 12pt gap.
const PORTRAIT_COLUMN = 44 + rhythm.heading;

const styles = StyleSheet.create({
  frame: { gap: rhythm.line, paddingVertical: rhythm.row },
  entries: { gap: rhythm.block },
  indent: { marginLeft: PORTRAIT_COLUMN },
  entry: { gap: rhythm.tight },
  main: { minHeight: minimumTarget, gap: rhythm.line + 2 },
});
