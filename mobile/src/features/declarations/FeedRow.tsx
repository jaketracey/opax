import { useRef } from 'react';
import { findNodeHandle, Pressable, StyleSheet, View } from 'react-native';
import type { recentDeclarationsFor } from '../../api/selectors';
import { formatDate } from '../../design/format';
import { chamberName } from '../../design/parliament';
import { partyText } from '../../design/party';
import { Icon, Text, useAccessibilitySize } from '../../design/primitives';
import { colors, light, minimumTarget, rhythm } from '../../design/tokens';
import { openSource } from '../../navigation/external';
import { CachedPortrait } from '../CachedPortrait';
import { registerChangeLabel } from '../your-mp/model';
import { originalLabel } from '../today/DeclarationRow';
import { Chip, PartyChip, shortDay } from '../today/parts';
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
 * One row of the declared-interests feed, in Today's compact register row:
 * portrait, name, party and category on one line, the chamber, the entry in
 * the member's own words, and when it changed. The row opens the member's
 * native profile when there is one. "View original" (the register page) is a
 * touch-and-hold action and a VoiceOver action, as on Today; credits and
 * source terms are on the Sources and licences screen. Any name match the
 * export found follows the entry, in full.
 */
export function FeedRow({
  item,
  index,
  onOpenPerson,
}: {
  item: Declaration;
  index: number;
  /** Present only when the member has a native profile. */
  onOpenPerson?: () => void;
}) {
  const stacked = useAccessibilitySize();
  const changed = registerChangeLabel(item.kind);
  const change = `${changed[0]!.toUpperCase()}${changed.slice(1)} ${shortDay(item.date)}`;
  const party = item.party
    ? partyText({
        party: item.party,
        status: item.partyStatus,
        formerly: item.formerly,
      }).spoken
    : null;
  const chamber = chamberName(item.chamber, item.jurisdiction);
  const ties = item.ties?.length
    ? `Name match: ${item.ties.map(tieText).join('; ')}. Exact names only; this identifies a shared name across public registers, not wrongdoing.`
    : null;
  const original = () => void openSource(item.url, originalLabel(item));
  const label = [
    item.name,
    party,
    chamber,
    `${item.category}, ${changed} ${formatDate(item.date)}`,
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
    <View style={styles.frame}>
      <Pressable
        ref={menuAnchor}
        accessibilityRole={onOpenPerson ? 'button' : 'text'}
        accessibilityLabel={label}
        accessibilityHint={onOpenPerson ? 'Opens the profile' : undefined}
        accessibilityActions={[
          { name: 'viewOriginal', label: 'View original' },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'viewOriginal') original();
        }}
        onPress={onOpenPerson}
        onLongPress={menu}
        testID={`declaration-person-${index}`}
        style={({ pressed }) => [
          styles.row,
          stacked ? styles.stacked : null,
          pressed && onOpenPerson ? styles.pressed : null,
        ]}
      >
        <CachedPortrait
          name={item.name}
          testID={`declaration-portrait-${index}`}
        />
        <View style={styles.main}>
          <View style={styles.head}>
            <Text wordSafe variant="strong" style={styles.name}>
              {item.name}
            </Text>
            {item.party ? (
              <PartyChip
                party={item.party}
                status={item.partyStatus}
                formerly={item.formerly}
              />
            ) : null}
          </View>
          {chamber ? (
            <Text wordSafe variant="metadata">
              {chamber}
            </Text>
          ) : null}
          <Chip
            label={item.category}
            ground={light.bronzeWash}
            color={light.bronzeInk}
          />
          {item.description ? <Text>{item.description}</Text> : null}
          <Text wordSafe variant="fine">
            {change}
          </Text>
        </View>
        {onOpenPerson && !stacked ? (
          <Icon name="chevron.right" size={13} tone="inkSoft" />
        ) : null}
      </Pressable>
      {ties ? (
        <Text
          wordSafe
          variant="fine"
          tone="ink"
          testID={`declaration-ties-${index}`}
          style={stacked ? null : styles.indent}
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
  frame: { gap: rhythm.tight, paddingVertical: rhythm.tight },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rhythm.heading,
    minHeight: minimumTarget,
  },
  stacked: { flexDirection: 'column' },
  pressed: { backgroundColor: colors.sunken },
  // flex: 1 would become a zero height basis when the row stacks.
  main: {
    flexGrow: 1,
    flexShrink: 1,
    alignSelf: 'stretch',
    gap: rhythm.tight - 2,
  },
  head: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: rhythm.tight,
    rowGap: rhythm.line,
  },
  name: { flexShrink: 1 },
  indent: { marginLeft: PORTRAIT_COLUMN },
});
