import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { recentDeclarationsFor } from '../../api/selectors';
import { formatDate } from '../../design/format';
import { chamberName } from '../../design/parliament';
import { partyText } from '../../design/party';
import { Icon, Text } from '../../design/primitives';
import { colors, light, minimumTarget, spacing } from '../../design/tokens';
import { openSource } from '../../navigation/external';
import { declarationsRoute } from '../../navigation/routes';
import { CachedPortrait } from '../CachedPortrait';
import { registerChangeLabel } from '../your-mp/model';
import { Chip, PartyChip, shortDay } from './parts';
import { showRecordMenu } from './RecordMenu';

type Declaration = NonNullable<
  ReturnType<typeof recentDeclarationsFor>['data']
>[number];

/** The original register entry's label: "Register of Members’ Interests · Dan Repacholi, page 20". */
export const originalLabel = (item: Declaration) =>
  `${item.sourceLabel} · ${item.name}${item.page !== null ? `, page ${item.page}` : ''}`;

/**
 * One register alteration in a compact row: portrait, name, party and
 * category on one line; the entry in the member's own words in two lines,
 * the whole of it on a tap; what changed and when. "View original" (the
 * register page) is a touch-and-hold action and a VoiceOver action.
 * Credits and licences are on the Sources and licences screen.
 */
export function DeclarationRow({
  item,
  index,
}: {
  item: Declaration;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [lines, setLines] = useState(0);
  const long = lines > 2;
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
  const original = () => void openSource(item.url, originalLabel(item));
  const label = [
    item.name,
    party,
    chamber,
    `${item.category}, ${registerChangeLabel(item.kind)} ${formatDate(item.date)}`,
    item.description,
  ]
    .filter(Boolean)
    .join(', ');
  const menu = () =>
    showRecordMenu(item.name, [
      { title: 'View original', onPress: original },
      {
        title: 'All recent declarations',
        onPress: () => router.push(declarationsRoute),
      },
    ]);
  return (
    <Pressable
      accessibilityRole={long ? 'button' : 'text'}
      accessibilityLabel={label}
      accessibilityHint={long ? 'Shows the whole entry' : undefined}
      accessibilityState={long ? { expanded } : undefined}
      accessibilityActions={[
        { name: 'viewOriginal', label: 'View original' },
        { name: 'allDeclarations', label: 'All recent declarations' },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'viewOriginal') original();
        if (event.nativeEvent.actionName === 'allDeclarations')
          router.push(declarationsRoute);
      }}
      onPress={() => {
        if (long) setExpanded((value) => !value);
      }}
      onLongPress={menu}
      testID={`today-declaration-${index}`}
      style={styles.frame}
    >
      {({ pressed }) => (
        <View style={[styles.row, pressed && long ? styles.pressed : null]}>
          <CachedPortrait
            name={item.name}
            testID={`today-declaration-portrait-${index}`}
          />
          <View style={styles.main}>
            <View
              style={styles.head}
              testID={`today-declaration-person-${index}`}
            >
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
              <Chip
                label={item.category}
                ground={light.bronzeWash}
                color={light.bronzeInk}
              />
            </View>
            {item.description ? (
              <View>
                <Text
                  numberOfLines={expanded ? undefined : 2}
                  testID={`today-declaration-text-${index}`}
                >
                  {item.description}
                </Text>
                {/* Measures the entry at full length, unseen, to know whether
                  two lines hold it. */}
                <View
                  pointerEvents="none"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={styles.measure}
                >
                  <Text
                    accessible={false}
                    testID={`today-declaration-measure-${index}`}
                    onTextLayout={(event) =>
                      setLines(event.nativeEvent.lines.length)
                    }
                  >
                    {item.description}
                  </Text>
                </View>
              </View>
            ) : null}
            <View style={styles.foot}>
              <Text wordSafe variant="fine" style={styles.grow}>
                {change}
              </Text>
              {long ? (
                <Icon
                  name={expanded ? 'chevron.up' : 'chevron.down'}
                  size={12}
                  tone="inkSoft"
                />
              ) : null}
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { minHeight: minimumTarget },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s3 + spacing.s1,
    minHeight: minimumTarget,
    paddingVertical: spacing.s3,
  },
  pressed: { backgroundColor: colors.raised },
  main: { flex: 1, gap: spacing.s1 + 2 },
  head: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing.s3,
    rowGap: spacing.s1,
  },
  name: { flexShrink: 1 },
  measure: { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  grow: { flex: 1 },
});
