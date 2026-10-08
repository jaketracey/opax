import { router } from 'expo-router';
import { ownsRowPadding } from './row-padding';
import { partyRoute } from '../navigation/routes';
import { useEffect, useState } from 'react';
import { localImageURI } from '../api/image-policy';
import type { ReactNode } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useAccessibilitySize, useReduceMotion } from './accessibility';
import { Icon } from './icon';
import type { PartyStatus } from '../api/party-transforms';
import {
  isPartyLabel,
  partyDot,
  partyIdentity,
  partyText,
  partyWash,
  type PartyContext,
} from './party';
import { Hoverable, useHover } from './adaptive';
import { SelectedMark, selectedWash, splitRowStyles } from './selection';
import { Text } from './text';
import { nameProbeProps } from './text-probe';
import {
  colors,
  hairline,
  light,
  minimumTarget,
  rhythm,
  spacing,
} from './tokens';

const portraitSizes = { row: 44, profile: 96 } as const;

// One beat for every waiting portrait, so a list of them breathes together.
// Colour only: the veil steps between two opaque roles.
const beat = new Animated.Value(0);
let waiting = 0;
let beating: Animated.CompositeAnimation | null = null;
function useBeat(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (waiting++ === 0) {
      beat.setValue(0);
      beating = Animated.loop(
        Animated.sequence(
          [1, 0].map((toValue) =>
            Animated.timing(beat, {
              toValue,
              duration: 800,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: false,
            }),
          ),
        ),
      );
      beating.start();
    }
    return () => {
      if (--waiting === 0) {
        beating?.stop();
        beating = null;
      }
    };
  }, [active]);
}
const veilBeat = beat.interpolate({
  inputRange: [0, 1],
  outputRange: [light.sunken, light.line],
});

/**
 * An unchanged local portrait, or the existing blank circle. Never initials.
 * While `loading` (the lookup is still running) or the image is still being
 * decoded, a veil over the blank circle breathes softly between sunken and
 * the hairline colour; once the photo is drawn the veil clears, so the photo
 * fades in. Under Reduce Motion the veil is still and clears at once.
 * Nothing changes size, so nothing around it moves.
 */
export function Portrait({
  size = 'row',
  testID,
  localURI,
  name,
  official = false,
  nameBeside = true,
  ring,
  onDisplay,
  loading = false,
}: {
  size?: keyof typeof portraitSizes;
  testID?: string;
  localURI?: string;
  name?: string;
  official?: boolean;
  nameBeside?: boolean;
  /** A party colour drawn as a ring around a profile portrait. */
  ring?: string | null;
  onDisplay?: (visible: boolean) => void;
  /** The portrait lookup has not answered yet. */
  loading?: boolean;
}) {
  const [failedURI, setFailedURI] = useState<string | null>(null);
  const [shownURI, setShownURI] = useState<string | null>(null);
  const [clearedURI, setClearedURI] = useState<string | null>(null);
  const [reveal] = useState(() => new Animated.Value(0));
  const reduced = useReduceMotion();
  const dimension = portraitSizes[size];
  let uri: string | undefined;
  try {
    if (localURI && localURI !== failedURI) uri = localImageURI(localURI);
  } catch {
    /* Blank fallback for anything outside the cache. */
  }
  const decorative = nameBeside || !name || !uri;
  const shown = !!uri && shownURI === uri;
  const pending = !shown && (loading || !!uri);
  useBeat(pending && !reduced);
  const veil = shown
    ? clearedURI === uri
      ? null
      : reveal.interpolate({
          inputRange: [0, 1],
          outputRange: [light.sunken, `${light.sunken}00`],
        })
    : pending
      ? reduced
        ? light.sunken
        : veilBeat
      : null;
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
        ring ? { borderWidth: 3, borderColor: ring, padding: 0 } : null,
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
          onLoad={() => {
            const drawn = uri!;
            setShownURI(drawn);
            if (reduced) setClearedURI(drawn);
            else {
              reveal.setValue(0);
              Animated.timing(reveal, {
                toValue: 1,
                duration: 220,
                easing: Easing.out(Easing.quad),
                useNativeDriver: false,
              }).start(() => setClearedURI(drawn));
            }
            onDisplay?.(true);
          }}
          onError={() => {
            setFailedURI(uri!);
            onDisplay?.(false);
          }}
        />
      ) : null}
      {veil ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: veil }]}
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
  linked = true,
  chip = false,
}: PartyContext & {
  dense?: boolean;
  testID?: string;
  linked?: boolean;
  /** Draw as a tinted capsule (profile headers); still a 44pt link. */
  chip?: boolean;
}) {
  const identity = partyIdentity(party);
  const dot = partyDot(party);
  const text = partyText({ party, status, formerly }, dense);
  const tone = dense ? 'inkSoft' : 'ink';
  const partyLinked = linked && isPartyLabel(party);
  const previousLinked = linked && !!text.previous && isPartyLabel(formerly);
  const Container = partyLinked ? Pressable : View;
  return (
    <Container
      style={[
        styles.party,
        partyLinked
          ? {
              minHeight: minimumTarget,
              minWidth: minimumTarget,
              alignSelf: 'flex-start',
              maxWidth: '100%',
            }
          : null,
      ]}
      {...(partyLinked
        ? {
            accessibilityRole: 'link' as const,
            accessibilityHint: 'Opens the party record',
            onPress: () => router.push(partyRoute(identity.name)),
          }
        : {})}
      {...(previousLinked
        ? {
            accessibilityActions: formerly
              ? [
                  {
                    name: 'openPreviousParty',
                    label: `Open ${formerly} party page`,
                  },
                ]
              : undefined,
            onAccessibilityAction: (event: {
              nativeEvent: { actionName: string };
            }) => {
              if (
                event.nativeEvent.actionName === 'openPreviousParty' &&
                formerly &&
                isPartyLabel(formerly)
              )
                router.push(partyRoute(formerly));
            },
          }
        : {})}
      accessible
      accessibilityLabel={text.spoken}
      testID={testID}
    >
      {chip ? (
        <>
          <PartyChip
            party={party}
            status={status}
            formerly={formerly}
            short={false}
            nested
          />
          {partyLinked ? (
            <Icon name="chevron.right" size={11} tone="inkSoft" />
          ) : null}
        </>
      ) : null}
      {!chip && dot ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.dot, { backgroundColor: dot }]}
        />
      ) : null}
      {chip ? null : (
        <Text
          wordSafe
          variant={dense ? 'metadata' : 'body'}
          tone={tone}
          style={{ flexShrink: 1 }}
        >
          {text.visible}
          {text.previous ? (
            <Text
              variant={dense ? 'metadata' : 'body'}
              tone="inkSoft"
              onPress={
                previousLinked && formerly
                  ? (event) => {
                      event.stopPropagation();
                      router.push(partyRoute(formerly));
                    }
                  : undefined
              }
            >
              {` · ${text.previous}`}
            </Text>
          ) : null}
        </Text>
      )}
    </Container>
  );
}

/**
 * A party as a small tinted capsule: the dot on a raised ring and the short
 * label (ALP, LIB, GRN), "Formerly ALP" for a known former member. Reads as
 * the full name. Not a link on its own: the row around it carries the
 * "Open party page" action. An unrecorded party is said in plain words.
 */
export function PartyChip({
  party,
  status,
  formerly,
  short = true,
  nested = false,
  testID,
}: PartyContext & {
  short?: boolean;
  /** Inside a control that carries the accessible name. */
  nested?: boolean;
  testID?: string;
}) {
  const dot = partyDot(party);
  const text = partyText({ party, status, formerly }, short);
  const wash = partyWash(party);
  if (!partyIdentity(party).recorded)
    return (
      <Text variant="metadata" testID={testID} accessible={!nested}>
        {text.visible}
      </Text>
    );
  return (
    <View
      accessible={!nested}
      accessibilityLabel={nested ? undefined : text.spoken}
      testID={testID}
      style={[
        styles.chip,
        nested ? styles.chipNested : null,
        { backgroundColor: wash },
      ]}
    >
      {dot ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.chipDot, { backgroundColor: dot }]}
        />
      ) : null}
      <Text variant="chip" style={styles.chipText}>
        {text.visible}
        {text.previous ? (
          <Text variant="chip" tone="inkSoft">
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
  /**
   * In an iPad split list: true for the person in the detail pane, false for
   * the others (no chevron). Undefined is an ordinary row (every iPhone row).
   */
  selected?: boolean;
  /** The keyboard's place in a split list. */
  highlighted?: boolean;
};
/**
 * A row for a roster parliamentarian: portrait (blank circle without one)
 * aligned to the top of its text, then the name, the party chip on its own
 * line, the place ("Member for Grayndler · NSW") and any detail below, and a
 * chevron. Not for donors, witnesses, suppliers or other
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
  selected,
  highlighted = false,
}: PersonRowProps) {
  const stacked = useAccessibilitySize();
  const inSplit = selected !== undefined;
  const [hovered, onHover] = useHover();
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
          {partyContext ? (
            <View style={styles.personChip}>
              <PartyChip {...partyContext} />
            </View>
          ) : null}
          {place ? (
            <Text wordSafe variant="metadata">
              {place}
            </Text>
          ) : null}
          {detail ? (
            <Text wordSafe variant="caption">
              {detail}
            </Text>
          ) : null}
        </View>
      </View>
      {onPress && !inSplit ? (
        <Icon name="chevron.right" size={14} tone="inkSoft" />
      ) : null}
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
  const row = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={inSplit ? { selected } : undefined}
      accessibilityActions={
        partyContext
          ? [
              ...(isPartyLabel(partyContext.party)
                ? [
                    {
                      name: 'openParty',
                      label: `Open ${partyIdentity(partyContext.party).name} party page`,
                    },
                  ]
                : []),
              ...(isPartyLabel(partyContext.formerly) &&
              partyContext.formerly !== partyContext.party
                ? [
                    {
                      name: 'openPreviousParty',
                      label: `Open ${partyContext.formerly} party page`,
                    },
                  ]
                : []),
            ]
          : undefined
      }
      onAccessibilityAction={(event) => {
        if (
          event.nativeEvent.actionName === 'openParty' &&
          partyContext?.party &&
          isPartyLabel(partyContext.party)
        )
          router.push(partyRoute(partyContext.party));
        if (
          event.nativeEvent.actionName === 'openPreviousParty' &&
          partyContext?.formerly &&
          isPartyLabel(partyContext.formerly)
        )
          router.push(partyRoute(partyContext.formerly));
      }}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.person,
        inSplit ? splitRowStyles.bleed : null,
        selected
          ? selectedWash('people')
          : // Raised, not sunken: every party dot keeps 3:1 against the highlight.
            pressed || (inSplit && (hovered || highlighted))
            ? { backgroundColor: colors.raised }
            : null,
      ]}
    >
      {selected ? <SelectedMark accent="people" /> : null}
      {body}
    </Pressable>
  );
  // Pointer hover only in a split list; other rows keep their view tree.
  return inSplit ? (
    <Hoverable effect="none" onHover={onHover}>
      {row}
    </Hoverable>
  ) : (
    row
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
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    maxWidth: '100%',
    paddingLeft: 6,
    paddingRight: rhythm.tight,
    paddingVertical: 2,
    borderRadius: 999,
  },
  // The raised ring keeps every party colour at 3:1 against what touches it.
  chipDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.raised,
    boxSizing: 'content-box',
  },
  chipText: { flexShrink: 1 },
  chipNested: { alignSelf: 'center' },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.heading,
    minHeight: minimumTarget,
    paddingVertical: 6,
  },
  // The portrait sits at the top of the text block, level with the name.
  personMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rhythm.heading,
  },
  personStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: rhythm.tight,
  },
  // flex: 1 allocates width beside the portrait, but becomes a zero height
  // basis when the main axis stacks. Let the column measure all its lines.
  personText: { gap: rhythm.line, alignSelf: 'stretch' },
  personTextInline: { flex: 1 },
  personName: { flexShrink: 0 },
  // The chip takes its own line, with a little air before the place.
  personChip: { flexDirection: 'row', paddingVertical: 1 },
});

ownsRowPadding(PersonRow);
