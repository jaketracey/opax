import { Pressable, StyleSheet, View } from 'react-native';
import { openSource } from '../../navigation/external';
import { personRoute, partyRoute } from '../../navigation/routes';
import { router } from 'expo-router';
import { useAccessibilitySize } from '../../design/accessibility';
import { Icon } from '../../design/icon';
import { PartyLabel, Portrait } from '../../design/people';
import { RowLink, rowMenus, useRowFollow } from '../../design/row-link';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import { partyText, type PartyContext } from '../../design/party';
import {
  ownsRowPadding,
  useRowCellStyle,
  useRowInset,
} from '../../design/row-padding';
import { useFaceURIs } from './FaceStackRow';
import { partyFromCode } from '../bills/party-codes';

const portraitSize = 80;

export interface OfficialPage {
  label: 'Parliament of Australia page' | 'Parliament of Victoria page';
  url: string;
}

/** The member's official page, when its URL is held; never for a former member. */
export function officialPageFor(
  sourceURL: string | null | undefined,
  jurisdiction: string | null | undefined,
): OfficialPage | null {
  if (!sourceURL) return null;
  let host = '';
  try {
    host = new URL(sourceURL).hostname;
  } catch {
    return null;
  }
  if (/(^|\.)aph\.gov\.au$/.test(host))
    return { label: 'Parliament of Australia page', url: sourceURL };
  if (jurisdiction === 'vic' && /(^|\.)parliament\.vic\.gov\.au$/.test(host))
    return { label: 'Parliament of Victoria page', url: sourceURL };
  return null;
}

/**
 * The member at the top of the Your MP tab, beside an 80 pt portrait. One
 * element: the whole row opens the profile; Follow,
 * Share, Copy link and the official page are in its context menu and
 * VoiceOver actions. The name is a link label, never a heading.
 */
export function MemberHeroRow({
  name,
  slug,
  party,
  partyStatus = 'current',
  tenure,
  personId,
  official,
  testID,
}: {
  name: string;
  slug: string;
  party: string | null;
  partyStatus?: PartyContext['status'];
  /** "Member since 1996", or null when the start is not known to the year. */
  tenure: string | null;
  personId?: string;
  official?: OfficialPage | null;
  testID?: string;
}) {
  const stacked = useAccessibilitySize();
  const cellStyle = useRowCellStyle();
  useRowInset(stacked ? 16 : 16 + portraitSize + rhythm.tight);
  const follow = useRowFollow('person', personId ?? slug, name);
  const [face] = useFaceURIs([{ name, slug }], 1);
  const href = personRoute(slug);
  const context = party ? { party, status: partyStatus } : null;
  const label = [name, context ? partyText(context).spoken : null, tenure]
    .filter(Boolean)
    .join(', ');
  const menu = rowMenus.person({ slug, name, ...follow });
  const extra = official
    ? [
        {
          title: official.label,
          symbol: 'arrow.up.right.square' as const,
          onPress: () => void openSource(official.url, official.label),
        },
      ]
    : [];
  return (
    <RowLink href={href} zoom menu={[...menu, ...extra]}>
      <Pressable
        testID={testID}
        accessible
        accessibilityRole="link"
        accessibilityLabel={label}
        accessibilityHint="Opens the profile"
        accessibilityActions={[
          { name: 'follow', label: follow.following ? 'Unfollow' : 'Follow' },
          ...(official ? [{ name: 'official', label: official.label }] : []),
          ...(party ? [{ name: 'party', label: 'Open party' }] : []),
        ]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'follow') follow.onFollow();
          if (e.nativeEvent.actionName === 'official' && official)
            void openSource(official.url, official.label);
          if (e.nativeEvent.actionName === 'party' && party)
            router.push(partyRoute(partyFromCode(party)));
        }}
        onPress={() => router.push(href)}
        style={({ pressed }) => [
          styles.row,
          cellStyle,
          pressed && { backgroundColor: colors.sunken },
        ]}
      >
        <View style={[styles.main, stacked && styles.stacked]}>
          <Portrait
            size={portraitSize}
            localURI={face ?? undefined}
            name={name}
            nameBeside
          />
          <View style={[styles.words, !stacked && styles.wordsInline]}>
            {/* Spec 2.1: SF Semibold on title2; tileFigure is the role with those metrics. */}
            <Text
              wordSafe
              variant="tileFigure"
              testID={testID && `${testID}-name`}
            >
              {name}
            </Text>
            {context ? (
              <View style={styles.partyAndTenure}>
                <PartyLabel
                  {...context}
                  linked
                  nested
                  compact
                  testID={testID && `${testID}-party`}
                />
                {tenure ? (
                  <Text wordSafe variant="secondary">
                    {tenure}
                  </Text>
                ) : null}
              </View>
            ) : tenure ? (
              <Text wordSafe variant="secondary">
                {tenure}
              </Text>
            ) : null}
          </View>
        </View>
        <Icon name={symbols.chevron} size={13} maxScale={1.5} tone="inkSoft" />
      </Pressable>
    </RowLink>
  );
}
ownsRowPadding(MemberHeroRow);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rhythm.tight,
    paddingVertical: rhythm.row,
    minHeight: minimumTarget,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  words: {
    flexDirection: 'column',
    gap: rhythm.line,
    alignSelf: 'stretch',
  },
  wordsInline: { flex: 1 },
  // Tenure supplies the room below the compact party link's hit target.
  partyAndTenure: { minHeight: minimumTarget, gap: rhythm.line },
});
