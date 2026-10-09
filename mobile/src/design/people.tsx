import { router } from 'expo-router';
import { ownsRowPadding } from './row-padding';
import { partyRoute } from '../navigation/routes';
import { isValidElement, useEffect, useState } from 'react';
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
  type PartyContext,
} from './party';
import { Hoverable, useHover } from './adaptive';
import { SelectedMark, selectedWash, splitRowStyles } from './selection';
import { Text } from './text';
import { nameProbeProps } from './text-probe';
import { colors, hairline, light, minimumTarget, rhythm } from './tokens';

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
  outputRange: [light.sunken, light.dividerSubtle],
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
 * Party identity: a 10pt dot beside the party's name, never colour alone and
 * never a fill, and never without its context: a known former member reads
 * "Formerly Labor", a member who changed party reads "One Nation · formerly
 * Nationals". A party the data does not date reads plainly ("Labor"), as on
 * the web. The `label` role in ink-soft, one size. `dense` (tables only)
 * shows the web's short label (ALP, LIB); VoiceOver still reads the full
 * name. An unrecorded party is said in words, with no dot. A link to the
 * party page unless `linked={false}` or the label is not a party.
 */
export function PartyLabel({
  party,
  status,
  formerly,
  dense = false,
  testID,
  linked = true,
  nested = false,
  onDeep = false,
}: PartyContext & {
  dense?: boolean;
  testID?: string;
  linked?: boolean;
  /** @deprecated Ignored: a party is never a filled capsule. */
  chip?: boolean;
  /**
   * Inside a row or control that already says the party: drawn only, not a
   * separate VoiceOver element and never a link of its own.
   */
  nested?: boolean;
  /**
   * On a navy header (Today's edition): the name in onNavySoft and the dot
   * on a raised ring, which keeps every party colour at 3:1 against navy.
   */
  onDeep?: boolean;
}) {
  const identity = partyIdentity(party);
  const dot = partyDot(party);
  const text = partyText({ party, status, formerly }, dense);
  const partyLinked = linked && !nested && isPartyLabel(party);
  const previousLinked =
    linked && !nested && !!text.previous && isPartyLabel(formerly);
  const fixed = useAccessibilitySize();
  const Container = partyLinked ? Pressable : View;
  return (
    <Container
      style={[
        styles.party,
        fixed ? styles.partyFixed : styles.partyHug,
        partyLinked ? styles.partyLinked : null,
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
      accessible={!nested}
      accessibilityLabel={nested ? undefined : text.spoken}
      accessibilityElementsHidden={nested}
      importantForAccessibility={nested ? 'no-hide-descendants' : 'auto'}
      testID={testID}
    >
      {dot ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.dot,
            onDeep ? styles.dotRinged : null,
            { backgroundColor: dot },
          ]}
        />
      ) : null}
      <Text
        wordSafe={fixed}
        variant="label"
        tone={onDeep ? 'onNavySoft' : undefined}
        style={styles.partyText}
      >
        {text.visible}
        {text.previous ? (
          <Text
            variant="label"
            tone={onDeep ? 'onNavySoft' : undefined}
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
    </Container>
  );
}

/**
 * @deprecated Use `PartyLabel` (`dense` for the short label, `linked={false}`
 * inside a row that carries the party action). A party is a dot beside its
 * name, never a tinted capsule: this draws a PartyLabel.
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
  nested?: boolean;
  testID?: string;
}) {
  return (
    <PartyLabel
      party={party}
      status={status}
      formerly={formerly}
      dense={short}
      linked={false}
      nested={nested}
      testID={testID}
    />
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
  /** Replaces the spoken "name, party, place, detail" where a screen needs another order. */
  accessibilityLabel?: string;
  testID?: string;
  /** Opt in only for journeys that inspect native drawn-line bounds. */
  testDrawnName?: boolean;
  /** Canonical public profile path for iPad dragging. */
  dragPath?: string;
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
  accessibilityLabel,
  testID,
  testDrawnName = false,
  dragPath,
  selected,
  highlighted = false,
}: PersonRowProps) {
  const slug = isValidElement<{ slug?: string }>(portrait)
    ? portrait.props.slug
    : undefined;
  const path = dragPath ?? (slug ? `/subject/person/${slug}` : undefined);
  const stacked = useAccessibilitySize();
  const inSplit = selected !== undefined;
  const [hovered, onHover] = useHover();
  const partyContext =
    party === undefined
      ? null
      : { party, status: partyStatus ?? 'unknown', formerly };
  const label =
    accessibilityLabel ??
    [name, partyContext ? partyText(partyContext).spoken : null, place, detail]
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
            <View style={styles.personParty}>
              <PartyLabel {...partyContext} linked={false} nested />
            </View>
          ) : null}
          {place ? (
            <Text wordSafe variant="metadata">
              {place}
            </Text>
          ) : null}
          {detail ? (
            <Text wordSafe variant="fine">
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
  return (
    <Hoverable
      effect={inSplit ? 'none' : 'hover'}
      onHover={inSplit ? onHover : undefined}
      onActivate={onPress}
      drag={path ? { path, title: name } : undefined}
    >
      {row}
    </Hoverable>
  );
}

const styles = StyleSheet.create({
  portrait: {
    backgroundColor: colors.sunken,
    borderWidth: hairline,
    borderColor: colors.dividerSubtle,
  },
  party: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    maxWidth: '100%',
  },
  partyHug: { alignSelf: 'flex-start' },
  partyFixed: { alignSelf: 'stretch', width: '100%' },
  partyLinked: { minHeight: minimumTarget, minWidth: minimumTarget },
  partyText: { flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotRinged: {
    borderWidth: 1.5,
    borderColor: colors.raised,
    boxSizing: 'content-box',
  },
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
  // The party takes its own line, with a little air before the place.
  personParty: { flexDirection: 'row', paddingVertical: 1 },
});

ownsRowPadding(PersonRow);
