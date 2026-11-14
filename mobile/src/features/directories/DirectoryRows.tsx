import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  Icon,
  LinkRow,
  PartyLabel,
  PersonRow,
  RowLink,
  Text,
  rowMenus,
  symbols,
  useRowFollow,
  type RowMenuAction,
} from '../../design/primitives';
import {
  useRowCellStyle,
  useRowHighlight,
  useRowInset,
  useRowSelected,
} from '../../design/row-padding';
import { selectedWash, splitRowStyles } from '../../design/selection';
import { counted, formatCount } from '../../design/format';
import { isPartyLabel, partySlug } from '../../design/party';
import { chamberName, jurisdictionName } from '../../design/parliament';
import { minimumTarget, rhythm } from '../../design/tokens';
import { billFoldText } from '../../api/bill-transforms';
import type { Electorate } from '../../api/catalog-decoders';
import {
  electorateRoute,
  partyRoute,
  personRoute,
} from '../../navigation/routes';
import { CachedPortrait } from '../CachedPortrait';
import { partyFromCode } from '../bills/party-codes';
import { useSetAsMyElectorate } from '../your-mp/useSetAsMyElectorate';
import type { RecordEntry } from '../split/entry';
import { placeLine, type PartyRow, type PeopleRow } from './model';

type Select = (entry: RecordEntry) => void;
interface RowProps<T> {
  item: T;
  /** iPad split: whether this row is in the detail pane. */
  selected?: boolean;
  onSelect?: Select;
}

/** The record a directory row opens: a profile, a party, an electorate. */
export function entryFor(item: PeopleRow | PartyRow | Electorate): RecordEntry {
  if ('profile' in item)
    return { kind: 'person', key: item.key, title: item.name };
  if ('money' in item)
    return { kind: 'party', key: item.name, title: item.name };
  return { kind: 'electorate', key: item.electorate_id, title: item.name };
}

function personMenu(
  item: PeopleRow,
  follow: ReturnType<typeof useRowFollow>,
  setSeat?: { label: string; onSelect: () => void },
): RowMenuAction[] {
  const party = item.profile.party;
  return [
    ...rowMenus.person({ name: item.name, slug: item.key, ...follow, setSeat }),
    ...(party && isPartyLabel(party)
      ? [
          {
            title: 'Open party',
            symbol: 'person.3' as const,
            onPress: () => router.push(partyRoute(party)),
          },
        ]
      : []),
  ];
}
function PersonView({
  item,
  selected,
  onSelect,
  menu,
}: RowProps<PeopleRow> & { menu: RowMenuAction[] }) {
  return (
    <PersonRow
      name={item.name}
      testID={`directory-person-${item.key}`}
      testDrawnName
      portrait={<CachedPortrait name={item.name} slug={item.key} />}
      party={item.profile.party}
      partyStatus={item.profile.partyStatus}
      formerly={item.profile.formerly}
      // The section ("Former members") and the place line say whether they
      // sit; the party label never does.
      statusShown
      place={placeLine(item)}
      href={personRoute(item.key)}
      menu={menu}
      selected={selected}
      select={onSelect ? () => onSelect(entryFor(item)) : undefined}
    />
  );
}
function FollowedPerson(props: RowProps<PeopleRow>) {
  const { item } = props;
  const follow = useRowFollow(
    'person',
    item.profile.canonicalPersonId ?? item.key,
    item.name,
  );
  return <PersonView {...props} menu={personMenu(item, follow)} />;
}
/** A sitting House member: the menu also sets their seat as yours. */
function SeatedPerson(props: RowProps<PeopleRow> & { seat: Electorate }) {
  const { item, seat } = props;
  const follow = useRowFollow(
    'person',
    item.profile.canonicalPersonId ?? item.key,
    item.name,
  );
  const set = useSetAsMyElectorate(seat);
  return (
    <PersonView
      {...props}
      menu={personMenu(
        item,
        follow,
        set.visible
          ? { label: set.label, onSelect: () => void set.run() }
          : undefined,
      )}
    />
  );
}
export const PersonDirectoryRow = memo(function PersonDirectoryRow(
  props: RowProps<PeopleRow>,
) {
  return props.item.seat ? (
    <SeatedPerson {...props} seat={props.item.seat} />
  ) : (
    <FollowedPerson {...props} />
  );
});

/** "{n} sitting members" under the party's dot and full name; no money. */
export const PartyDirectoryRow = memo(function PartyDirectoryRow({
  item,
  selected,
  onSelect,
}: RowProps<PartyRow>) {
  const slug = partySlug(item.name);
  const follow = useRowFollow('party', slug, item.name);
  const detail = counted(item.members, 'sitting member');
  return (
    <LinkRow
      title=""
      leading={
        <PartyLabel party={item.name} status="current" nested linked={false} />
      }
      detail={detail}
      accessoryAlign="first-line"
      href={partyRoute(item.name)}
      menu={rowMenus.place({
        title: item.name,
        path: `/subject/party/${slug}`,
        ...follow,
      })}
      select={onSelect ? () => onSelect(entryFor(item)) : undefined}
      selected={selected}
      accessibilityLabel={`${item.name}, ${detail}`}
      testID={`directory-party-${billFoldText(item.name).replace(/ /g, '-')}`}
    />
  );
});

/**
 * An electorate's two lines: the house and state in short form ("Federal,
 * South Australia", "Western Australian Legislative Assembly"), then its
 * member and party, "Member not confirmed", or "No longer used".
 */
export function electorateLines(item: Electorate): {
  house: string;
  member: string;
  party: string | null;
} {
  const state = jurisdictionName(item.state_code);
  const house =
    item.jurisdiction === 'federal'
      ? [item.chamber === 'senate' ? 'Senate' : 'Federal', state]
          .filter(Boolean)
          .join(', ')
      : (chamberName(item.chamber, item.jurisdiction) ??
        jurisdictionName(item.jurisdiction) ??
        'Chamber not recorded');
  if (item.status === 'historical')
    return { house, member: 'No longer used', party: null };
  const members = item.representatives;
  if (item.representation_status !== 'verified' || !members.length)
    return { house, member: '', party: null };
  if (members.length > 1)
    return {
      house,
      member: `${formatCount(members.length)} ${item.chamber === 'senate' ? 'senators' : 'members'}`,
      party: null,
    };
  return {
    house,
    member: members[0]!.person.name,
    party: members[0]!.party?.trim() || null,
  };
}
export const ElectorateDirectoryRow = memo(function ElectorateDirectoryRow({
  item,
  selected,
  onSelect,
}: RowProps<Electorate>) {
  const follow = useRowFollow('electorate', item.electorate_id, item.name);
  const set = useSetAsMyElectorate(item);
  const highlight = useRowHighlight();
  const cellStyle = useRowCellStyle();
  useRowInset(16);
  const split = selected !== undefined;
  useRowSelected(!!selected);
  const lines = electorateLines(item);
  const select = onSelect ? () => onSelect(entryFor(item)) : undefined;
  const row = (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={[item.name, lines.house, lines.member, lines.party]
        .filter(Boolean)
        .join(', ')}
      accessibilityState={split ? { selected } : undefined}
      accessibilityActions={
        isPartyLabel(lines.party)
          ? [{ name: 'party', label: `Open ${lines.party} party page` }]
          : undefined
      }
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'party' && lines.party)
          router.push(partyRoute(partyFromCode(lines.party)));
      }}
      testID={`directory-electorate-${item.slug}`}
      onPress={select}
      style={({ pressed }) => [
        styles.row,
        split ? splitRowStyles.bleed : null,
        cellStyle,
        selected
          ? selectedWash()
          : pressed
            ? { backgroundColor: highlight }
            : null,
      ]}
    >
      <View style={styles.body}>
        <Text wordSafe variant="strong">
          {item.name}
        </Text>
        <Text wordSafe variant="secondary">
          {lines.house}
        </Text>
        {lines.member ? (
          <View style={styles.member}>
            <Text wordSafe variant="secondary">
              {lines.party ? `${lines.member} · ` : lines.member}
            </Text>
            {lines.party ? (
              <PartyLabel party={lines.party} nested linked />
            ) : null}
          </View>
        ) : null}
      </View>
      {split ? null : (
        <Icon name={symbols.chevron} size={13} maxScale={1.5} tone="inkSoft" />
      )}
    </Pressable>
  );
  return (
    <RowLink
      href={electorateRoute(item.electorate_id)}
      select={select}
      menu={rowMenus.place({
        title: item.name,
        path: item.url,
        ...follow,
        setSeat: set.visible
          ? { label: set.label, onSelect: () => void set.run() }
          : undefined,
      })}
    >
      {row}
    </RowLink>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
    paddingVertical: rhythm.row,
  },
  body: { flex: 1, gap: rhythm.line },
  member: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
});
