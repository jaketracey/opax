import { useState } from 'react';
import { localImageURI } from '../api/image-policy';
import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useAccessibilitySize } from './accessibility';
import { Icon } from './icon';
import type { PartyStatus } from '../api/party-transforms';
import { partyIdentity, partyText, type PartyContext } from './party';
import { Text } from './text';
import { nameProbeProps } from './text-probe';
import { colors, hairline, layout, minimumTarget, spacing } from './tokens';

const portraitSizes = { row: 44, profile: 88 } as const;

/** An unchanged local portrait, or the existing blank circle. Never initials. */
export function Portrait({
  size = 'row',
  testID,
  localURI,
  name,
  official = false,
  nameBeside = true,
}: {
  size?: keyof typeof portraitSizes;
  testID?: string;
  localURI?: string;
  name?: string;
  official?: boolean;
  nameBeside?: boolean;
}) {
  const [failedURI, setFailedURI] = useState<string | null>(null);
  const dimension = portraitSizes[size];
  let uri: string | undefined;
  try {
    if (localURI && localURI !== failedURI) uri = localImageURI(localURI);
  } catch {
    /* Blank fallback for anything outside the cache. */
  }
  const decorative = nameBeside || !name || !uri;
  return (
    <View
      testID={testID}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      accessibilityIgnoresInvertColors
      style={[
        styles.portrait,
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
          overflow: 'hidden',
        },
      ]}
    >
      {uri ? (
        <Image
          source={{ uri: localImageURI(uri) }}
          style={{ width: dimension, height: dimension }}
          resizeMode="contain"
          accessible={!decorative}
          accessibilityLabel={
            decorative
              ? undefined
              : `${official ? 'Official portrait' : 'Photo'} of ${name}`
          }
          accessibilityElementsHidden={decorative}
          importantForAccessibility={
            decorative ? 'no-hide-descendants' : 'auto'
          }
          accessibilityIgnoresInvertColors
          onError={() => setFailedURI(uri!)}
        />
      ) : null}
    </View>
  );
}

/**
 * Party identity: a 10pt dot plus the readable label, never colour alone, and
 * never without its context: a known former member reads "Formerly Labor", a
 * member who changed party reads "One Nation · formerly Nationals". A party
 * the data does not date reads plainly ("Labor"), as on the web.
 * Dense rows can show the web's short label (ALP, LIB); VoiceOver still reads
 * the full name. An unrecorded party is said in words, with no dot.
 */
export function PartyLabel({
  party,
  status,
  formerly,
  dense = false,
  testID,
}: PartyContext & {
  dense?: boolean;
  testID?: string;
}) {
  const identity = partyIdentity(party);
  const text = partyText({ party, status, formerly }, dense);
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
// affiliation as if it were current, or an undated one as if it were former.
type PersonRowParty =
  | { party?: undefined; partyStatus?: undefined; formerly?: undefined }
  | {
      party: string | null | undefined;
      partyStatus: PartyStatus;
      formerly?: string | null;
    };
export type PersonRowProps = PersonRowParty & {
  name: string;
  /** Reviewed portrait content; callers retain its credit and licence links. */
  portrait?: ReactNode;
  /** "Member for Grayndler · NSW" or "Senator for Queensland". */
  place?: string;
  /** A date or extra line: "Sponsored travel, added 2 Sep 2026". */
  detail?: string;
  /** Present only for roster parliamentarians with a native page. */
  onPress?: () => void;
  testID?: string;
  /** Opt in only for journeys that inspect native drawn-line bounds. */
  testDrawnName?: boolean;
};
/**
 * A row for a roster parliamentarian: portrait (blank circle without one),
 * name, party, place, chevron. Not for donors, witnesses, suppliers or other
 * private individuals: they get plain text and never a profile link
 * (decision 3).
 */
export function PersonRow({
  name,
  portrait,
  party,
  partyStatus,
  formerly,
  place,
  detail,
  onPress,
  testID,
  testDrawnName = false,
}: PersonRowProps) {
  const stacked = useAccessibilitySize();
  const partyContext =
    party === undefined
      ? null
      : { party, status: partyStatus ?? 'unknown', formerly };
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
        {portrait ?? <Portrait />}
        <View
          style={[styles.personText, stacked ? null : styles.personTextInline]}
        >
          <Text
            wordSafe
            variant="strong"
            {...(testDrawnName ? nameProbeProps : {})}
            testID={testID ? `${testID}-name` : undefined}
            style={styles.personName}
          >
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
  // flex: 1 allocates width beside the portrait, but becomes a zero height
  // basis when the main axis stacks. Let the column measure all its lines.
  personText: { gap: spacing.s1, alignSelf: 'stretch' },
  personTextInline: { flex: 1 },
  personName: { flexShrink: 0 },
});
