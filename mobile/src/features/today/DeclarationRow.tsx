import { useRef, useState } from 'react';
import { findNodeHandle, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { recentDeclarationsFor } from '../../api/selectors';
import { formatDate } from '../../design/format';
import { chamberName } from '../../design/parliament';
import { partyText } from '../../design/party';
import {
  Icon,
  PartyLabel,
  Text,
  useAccessibilitySize,
} from '../../design/primitives';
import { ownsRowPadding } from '../../design/row-padding';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import { openSource } from '../../navigation/external';
import { declarationsRoute } from '../../navigation/routes';
import { CachedPortrait } from '../CachedPortrait';
import { registerChangeLabel } from '../your-mp/model';
import { shortDay } from './parts';
import { showRecordMenu } from './RecordMenu';

type Declaration = NonNullable<
  ReturnType<typeof recentDeclarationsFor>['data']
>[number];

/** The original register entry's label: "Register of Members’ Interests · Dan Repacholi, page 20". */
export const originalLabel = (item: Declaration) =>
  `${item.sourceLabel} · ${item.name}${item.page !== null ? `, page ${item.page}` : ''}`;

/**
 * One register alteration as a row on the paper: portrait, the member's
 * name, their party as a dot and name; the entry in the member's own words
 * in two lines, the whole of it on a tap; then the category, what changed
 * and when, on one line ("Gift · added 31 Aug"). "View original" (the
 * register page) is a touch-and-hold action and a VoiceOver action, and the
 * register is listed in Today's source line.
 */
export function DeclarationRow({
  item,
  index,
}: {
  item: Declaration;
  index: number;
}) {
  // The portrait sits above the text at accessibility sizes, as in PersonRow.
  const stacked = useAccessibilitySize();
  const [expanded, setExpanded] = useState(false);
  const [lines, setLines] = useState(0);
  const long = lines > 2;
  const change = `${item.category} · ${registerChangeLabel(item.kind)} ${shortDay(item.date)}`;
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
    <Pressable
      ref={menuAnchor}
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
        <View
          testID={`today-declaration-layout-${index}`}
          style={[
            styles.row,
            stacked ? styles.stacked : null,
            pressed && long ? styles.pressed : null,
          ]}
        >
          <CachedPortrait
            name={item.name}
            testID={`today-declaration-portrait-${index}`}
          />
          <View style={styles.main}>
            <View
              style={styles.head}
              testID={`today-declaration-person-${index}`}
            >
              <Text wordSafe variant="strong">
                {item.name}
              </Text>
              {item.party ? (
                <PartyLabel
                  party={item.party}
                  status={item.partyStatus}
                  formerly={item.formerly}
                  linked={false}
                  nested
                />
              ) : null}
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
              <Text
                wordSafe
                variant="fine"
                style={styles.grow}
                testID={`today-declaration-change-${index}`}
              >
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

ownsRowPadding(DeclarationRow);

const styles = StyleSheet.create({
  frame: { minHeight: minimumTarget },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rhythm.heading,
    minHeight: minimumTarget,
    paddingVertical: rhythm.tight,
  },
  stacked: { flexDirection: 'column' },
  pressed: { backgroundColor: colors.sunken },
  // flex: 1 would become a zero height basis when the row stacks.
  main: {
    flexGrow: 1,
    flexShrink: 1,
    alignSelf: 'stretch',
    gap: rhythm.line + 2,
  },
  head: { gap: 2 },
  measure: { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: rhythm.heading },
  grow: { flex: 1 },
});
