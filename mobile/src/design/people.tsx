import { Pressable, StyleSheet, View } from 'react-native';
import { useAccessibilitySize } from './accessibility';
import { Icon } from './icon';
import { partyIdentity, partyText, type PartyContext } from './party';
import { Text } from './text';
import { colors, hairline, layout, minimumTarget, spacing } from './tokens';

const portraitSizes = { row: 44, profile: 88 } as const;

/**
 * A parliamentarian's portrait. Until a reviewed portrait path exists in the
 * API client (see src/design/README.md), every portrait is the blank circle:
 * never initials, never a remote image loaded outside the client.
 */
export function Portrait({
  size = 'row',
  testID,
}: {
  size?: keyof typeof portraitSizes;
  testID?: string;
}) {
  const dimension = portraitSizes[size];
  return (
    <View
      testID={testID}
      // A blank circle says nothing, so VoiceOver skips it; the name is beside it.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      accessibilityIgnoresInvertColors
      style={[
        styles.portrait,
        { width: dimension, height: dimension, borderRadius: dimension / 2 },
      ]}
    />
  );
}

/**
 * Party identity: a 10pt dot plus the readable label, never colour alone, and
 * never without its context: a historical affiliation reads "Formerly Labor",
 * a sitting member who changed party reads "One Nation · formerly Nationals".
 * Dense rows can show the web's short label (ALP, LIB); VoiceOver still reads
 * the full name. An unrecorded party is said in words, with no dot.
 */
export function PartyLabel({
  party,
  current,
  formerly,
  dense = false,
  testID,
}: PartyContext & {
  dense?: boolean;
  testID?: string;
}) {
  const identity = partyIdentity(party);
  const text = partyText({ party, current, formerly }, dense);
  const tone = dense ? 'inkSoft' : 'ink';
  return (
    <View
      style={styles.party}
      accessible
      accessibilityLabel={text.spoken}
      testID={testID}
    >
      {identity.color ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.dot, { backgroundColor: identity.color }]}
        />
      ) : null}
      <Text wordSafe variant={dense ? 'metadata' : 'body'} tone={tone}>
        {text.visible}
        {text.previous ? (
          <Text variant={dense ? 'metadata' : 'body'} tone="inkSoft">
            {` · ${text.previous}`}
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

// A party always travels with its status, so no row shows a historical
// affiliation as if it were current.
type PersonRowParty =
  | { party?: undefined; partyCurrent?: undefined; formerly?: undefined }
  | { party: string | null; partyCurrent: boolean; formerly?: string | null };
export type PersonRowProps = PersonRowParty & {
  name: string;
  /** "Member for Grayndler · NSW" or "Senator for Queensland". */
  place?: string;
  /** A date or extra line: "Sponsored travel, added 2 Sep 2026". */
  detail?: string;
  /** Present only for roster parliamentarians with a native page. */
  onPress?: () => void;
  testID?: string;
};
/**
 * A row for a roster parliamentarian: portrait (blank circle without one),
 * name, party, place, chevron. Not for donors, witnesses, suppliers or other
 * private individuals: they get plain text and never a profile link
 * (decision 3).
 */
export function PersonRow({
  name,
  party,
  partyCurrent,
  formerly,
  place,
  detail,
  onPress,
  testID,
}: PersonRowProps) {
  const stacked = useAccessibilitySize();
  const partyContext =
    party === undefined
      ? null
      : { party, current: partyCurrent ?? false, formerly };
  const label = [
    name,
    partyContext ? partyText(partyContext).spoken : null,
    place,
    detail,
  ]
    .filter(Boolean)
    .join(', ');
  const body = (
    <>
      <View style={[styles.personMain, stacked ? styles.personStacked : null]}>
        <Portrait />
        <View style={styles.personText}>
          <Text wordSafe variant="strong">
            {name}
          </Text>
          {partyContext ? <PartyLabel {...partyContext} dense /> : null}
          {place ? (
            <Text wordSafe variant="metadata">
              {place}
            </Text>
          ) : null}
          {detail ? (
            <Text wordSafe variant="metadata">
              {detail}
            </Text>
          ) : null}
        </View>
      </View>
      {onPress ? <Icon name="chevron.right" size={14} tone="inkSoft" /> : null}
    </>
  );
  if (!onPress)
    return (
      <View
        accessible
        accessibilityLabel={label}
        testID={testID}
        style={styles.person}
      >
        {body}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.person,
        // Raised, not sunken: every party dot keeps 3:1 against the highlight.
        pressed ? { backgroundColor: colors.raised } : null,
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  portrait: {
    backgroundColor: colors.sunken,
    borderWidth: hairline,
    borderColor: colors.line,
  },
  party: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s4,
    minHeight: minimumTarget,
    paddingVertical: layout.rowGap,
  },
  personMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s4,
  },
  personStacked: { flexDirection: 'column', gap: spacing.s3 },
  personText: { flex: 1, gap: spacing.s1, alignSelf: 'stretch' },
});
