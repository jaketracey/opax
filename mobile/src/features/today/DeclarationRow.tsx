import { useRef } from 'react';
import { findNodeHandle, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { recentDeclarationsFor } from '../../api/selectors';
import { formatDate } from '../../design/format';
import { chamberName } from '../../design/parliament';
import { partyText } from '../../design/party';
import {
  Disclosure,
  PersonRow,
  Text,
  useAccessibilitySize,
  type PersonRowProps,
} from '../../design/primitives';
import { minimumTarget, rhythm } from '../../design/tokens';
import { openSource } from '../../navigation/external';
import { declarationsRoute } from '../../navigation/routes';
import { CachedPortrait } from '../CachedPortrait';
import { registerChangeLabel } from '../your-mp/model';
import { shortDay } from './parts';
import { showRecordMenu } from './RecordMenu';

type Declaration = NonNullable<
  ReturnType<typeof recentDeclarationsFor>['data']
>[number];
export type DeclarationEntries = readonly {
  item: Declaration;
  index: number;
}[];

/** The original register entry's label: "Register of Members’ Interests · Dan Repacholi, page 20". */
export const originalLabel = (item: Declaration) =>
  `${item.sourceLabel} · ${item.name}${item.page !== null ? `, page ${item.page}` : ''}`;

/**
 * Longer entries than this (about three lines on an iPhone at the default
 * size) sit behind a disclosure on Today; the feed shows every entry in full.
 */
export const LONG_ENTRY = 140;

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

/**
 * Consecutive declarations by one member, under one PersonRow: their
 * portrait, name and party once, then each entry. On iPhone the entries
 * line up with the name; at accessibility sizes, under the portrait.
 */
export function DeclarationGroup({ entries }: { entries: DeclarationEntries }) {
  const stacked = useAccessibilitySize();
  const first = entries[0]!;
  return (
    <View style={styles.group}>
      <PersonRow
        {...declarantRow(
          first.item,
          `today-declaration-person-${first.index}`,
          `today-declaration-portrait-${first.index}`,
        )}
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
 * One register alteration, in the member's own words, then the category,
 * what changed and when, on one line ("Gift · added 31 Aug"). A long entry
 * is behind a disclosure, never cut short. "View original" (the register
 * page) is a touch-and-hold action and a VoiceOver action, and the register
 * is listed in the block's source line.
 */
export function DeclarationEntry({
  item,
  index,
}: {
  item: Declaration;
  index: number;
}) {
  const long = (item.description?.length ?? 0) > LONG_ENTRY;
  const changed = `${registerChangeLabel(item.kind)} ${formatDate(item.date)}`;
  const original = () => void openSource(item.url, originalLabel(item));
  // One element per entry, named, so it reads on its own; a long entry's
  // words are the disclosure's, said when it opens.
  const label = [
    item.name,
    `${item.category}, ${changed}`,
    long ? null : item.description,
  ]
    .filter(Boolean)
    .join(', ');
  const menuAnchor = useRef<View>(null);
  const menu = () =>
    showRecordMenu(
      item.name,
      [
        { title: 'View original', onPress: original },
        {
          title: 'All recent declarations',
          onPress: () => router.push(declarationsRoute),
        },
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
          { name: 'allDeclarations', label: 'All recent declarations' },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'viewOriginal') original();
          if (event.nativeEvent.actionName === 'allDeclarations')
            router.push(declarationsRoute);
        }}
        onLongPress={menu}
        testID={`today-declaration-${index}`}
        style={styles.frame}
      >
        {item.description && !long ? (
          <Text testID={`today-declaration-text-${index}`}>
            {item.description}
          </Text>
        ) : null}
        <Text
          wordSafe
          variant="fine"
          testID={`today-declaration-change-${index}`}
        >
          {`${item.category} · ${registerChangeLabel(item.kind)} ${shortDay(item.date)}`}
        </Text>
      </Pressable>
      {long ? (
        <Disclosure
          label="The entry in full"
          testID={`today-declaration-more-${index}`}
        >
          <Text testID={`today-declaration-text-${index}`}>
            {item.description}
          </Text>
        </Disclosure>
      ) : null}
    </View>
  );
}

// The portrait column: the row portrait's 44pt and the row's 12pt gap.
const PORTRAIT_COLUMN = 44 + rhythm.heading;

const styles = StyleSheet.create({
  group: { gap: rhythm.line },
  entries: { gap: rhythm.heading },
  indent: { marginLeft: PORTRAIT_COLUMN },
  entry: { gap: rhythm.line },
  frame: {
    minHeight: minimumTarget,
    justifyContent: 'center',
    gap: rhythm.line + 2,
  },
});
