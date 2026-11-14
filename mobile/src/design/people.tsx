import { useRowIsMyMember } from '../features/your-mp/MyMemberContext';
import { Pressable } from './pressable';
import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { isValidElement, useState } from 'react';
import {
  Image,
  StyleSheet,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import { localImageURI } from '../api/image-policy';
import type { PartyStatus } from '../api/party-transforms';
import { partyRoute } from '../navigation/routes';
import { useAccessibilitySize } from './accessibility';
import { Hoverable, useHover } from './adaptive';
import { Icon } from './icon';
import {
  formerMember,
  isPartyLabel,
  partyDot,
  partyIdentity,
  partyText,
  type PartyContext,
} from './party';
import {
  RowLink,
  rowMenus,
  useRowFollow,
  type RowMenuAction,
} from './row-link';
import {
  ownsRowPadding,
  useRowCellStyle,
  useRowHighlight,
  useRowInset,
  useRowSelected,
} from './row-padding';
import { selectedWash, useSplitBleed } from './selection';
import { symbols } from './symbols';
import { Text } from './text';
import { nameProbeProps } from './text-probe';
import { partyFromCode } from '../features/bills/party-codes';
import {
  colors,
  hairline,
  minimumTarget,
  rhythm,
  size as sizeTokens,
  textStyles,
} from './tokens';

const portraitSizes = { row: sizeTokens.portraitRow, profile: 96 } as const;
/** A circular portrait; an absent or failed image leaves a blank circle (a person symbol when unnamed). */
export function Portrait({
  size = 'row',
  testID,
  localURI,
  uri,
  name,
  official = false,
  nameBeside = true,
  onDisplay,
  loading: _loading = false,
}: {
  size?: keyof typeof portraitSizes | 28 | 40 | 44 | 56 | 72 | 80 | 96;
  testID?: string;
  localURI?: string;
  uri?: string | null;
  name?: string;
  official?: boolean;
  nameBeside?: boolean;
  onDisplay?: (visible: boolean) => void;
  loading?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const dimension = typeof size === 'number' ? size : portraitSizes[size];
  const input = localURI ?? uri;
  let source: string | undefined;
  try {
    if (input && input !== failed) source = localImageURI(input);
  } catch {
    /* Retain the placeholder for a rejected URI. */
  }
  const decorative = nameBeside || !name || !source;
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
          borderCurve: 'continuous',
          overflow: 'hidden',
        },
      ]}
    >
      {source ? (
        <Image
          source={{ uri: localImageURI(source) }}
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
          onLoad={() => onDisplay?.(true)}
          onError={() => {
            setFailed(input!);
            onDisplay?.(false);
          }}
        />
      ) : (
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          {/* A named person with no portrait is a blank circle, never
              initials (the web's rule). Only an unnamed face, such as a
              face stack's empty place, keeps the person symbol. */}
          {name?.trim() ? null : (
            <Icon
              name={symbols.person}
              tone="inkSoft"
              size={dimension / 2}
              maxScale={1}
            />
          )}
        </View>
      )}
    </View>
  );
}

/** Decorative group of faces; the containing row supplies the count in words. */
export function FaceStack({
  portraits,
  max = 6,
}: {
  portraits: (string | null)[];
  max?: number;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row' }}
    >
      {portraits.slice(0, Math.max(0, Math.min(6, max))).map((uri, index) => (
        <View
          key={index}
          style={{
            marginLeft: index ? -8 : 0,
            borderRadius: 999,
            borderCurve: 'continuous',
          }}
        >
          <Portrait size={28} uri={uri} />
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                borderWidth: 2,
                borderColor: colors.raised,
                borderRadius: 999,
                borderCurve: 'continuous',
              },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const DOT = 10;
const DOT_MAX = 16;
/**
 * The party dot's size at a font scale: 10pt, growing with the text beside
 * it to 16pt (pass 5, P3-14).
 */
export function partyDotSize(fontScale: number): number {
  return Math.round(DOT * Math.min(Math.max(fontScale, 1), DOT_MAX / DOT));
}

/**
 * Party identity: a 10pt dot (growing with text to 16pt) beside the party's
 * name, never colour alone and never a fill: the party they sit (or last sat) for, "Labor", and "One
 * Nation · formerly Nationals" only for a change of party. Whether they
 * still sit is the row's to say ("Former member"), never the label's. The `label` role in ink-soft, one size. `dense` (tables only)
 * shows the web's short label (ALP, LIB); VoiceOver still reads the full
 * name. An unrecorded party is said in words, with no dot. A link to the
 * party page unless `linked={false}` or the label is not a party.
 */
export function PartyLabel({
  party,
  status = 'unknown',
  formerly,
  dense = false,
  testID,
  nested = false,
  linked = !nested,
  href,
  onDeep = false,
  compact = false,
  singleLine = false,
  prefix,
}: Omit<PartyContext, 'status'> & {
  status?: PartyStatus;
  dense?: boolean;
  testID?: string;
  linked?: boolean;
  href?: Href;
  /**
   * Inside a row: drawn only by default. With linked, use an inline link
   * that stops the row press. Grouped rows also expose party actions.
   */
  nested?: boolean;
  /**
   * On a navy header (Today's edition): the name in onNavySoft and the dot
   * on a raised ring, which keeps every party colour at 3:1 against navy.
   */
  onDeep?: boolean;
  /** Tight text stacks; the parent must leave room below for the hit target. */
  compact?: boolean;
  /** Compact bill previews on Today. */
  singleLine?: boolean;
  prefix?: string;
}) {
  const identity = partyIdentity(party);
  const scheme = useColorScheme();
  const dot = partyDot(party, scheme === 'dark' ? 'dark' : 'light');
  const text = partyText({ party, status, formerly }, dense);
  const partyLinked = linked && (!!href || isPartyLabel(party));
  const previousLinked = linked && !!text.previous && isPartyLabel(formerly);
  const fixed = useAccessibilitySize();
  const dotSize = partyDotSize(useWindowDimensions().fontScale);
  const Container = partyLinked && (!nested || compact) ? Pressable : View;
  const openParty = () =>
    router.push(href ?? partyRoute(partyFromCode(identity.name)));
  return (
    <Container
      style={[
        styles.party,
        fixed ? styles.partyFixed : styles.partyHug,
        partyLinked
          ? compact
            ? styles.partyCompactLink
            : styles.partyLinked
          : null,
      ]}
      {...(partyLinked && (!nested || compact)
        ? {
            accessibilityRole: nested ? undefined : ('link' as const),
            accessibilityHint: nested ? undefined : 'Opens the party record',
            hitSlop: compact
              ? { bottom: minimumTarget - textStyles.secondary.lineHeight }
              : undefined,
            onPress: (event: import('react-native').GestureResponderEvent) => {
              if (nested) event.stopPropagation();
              openParty();
            },
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
                router.push(partyRoute(partyFromCode(formerly)));
            },
          }
        : {})}
      accessible={!nested}
      accessibilityLabel={nested ? undefined : text.spoken}
      accessibilityElementsHidden={nested && !partyLinked && !previousLinked}
      importantForAccessibility={
        nested && !partyLinked && !previousLinked
          ? 'no-hide-descendants'
          : 'auto'
      }
      testID={testID}
    >
      {prefix ? (
        <Text
          variant="secondary"
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{ flexShrink: 1 }}
        >
          {prefix}
        </Text>
      ) : null}
      {dot ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.dotRinged,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              borderCurve: 'continuous',
              backgroundColor: dot,
            },
          ]}
        />
      ) : null}
      <Text
        wordSafe={fixed && !singleLine}
        numberOfLines={singleLine ? 1 : undefined}
        ellipsizeMode={singleLine ? 'tail' : undefined}
        variant="secondary"
        tone={
          onDeep ? 'onNavySoft' : nested && partyLinked ? 'link' : undefined
        }
        style={styles.partyText}
        accessibilityRole={nested && partyLinked ? 'link' : undefined}
        accessibilityLabel={
          nested && partyLinked ? `Open ${identity.name} party page` : undefined
        }
        onPress={
          nested && partyLinked
            ? (event) => {
                event.stopPropagation();
                openParty();
              }
            : undefined
        }
        testID={testID && `${testID}-link`}
      >
        {text.visible}
        {text.previous ? (
          <Text
            variant="secondary"
            tone={
              onDeep
                ? 'onNavySoft'
                : nested && previousLinked
                  ? 'link'
                  : undefined
            }
            accessibilityRole={previousLinked ? 'link' : undefined}
            accessibilityLabel={
              previousLinked ? `Open ${formerly} party page` : undefined
            }
            onPress={
              previousLinked && formerly
                ? (event) => {
                    event.stopPropagation();
                    router.push(partyRoute(partyFromCode(formerly)));
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

/** Shared mark under the party line; the row owns its spoken suffix. */
export function YourMPMark({ testID }: { testID?: string }) {
  return (
    <View
      testID={testID}
      style={{ flexDirection: 'row', alignItems: 'center', gap: rhythm.line }}
    >
      <Icon name={symbols.yourMP} size={13} tone="inkSoft" />
      <Text wordSafe variant="footnote" tone="inkSoft">
        Your MP
      </Text>
    </View>
  );
}

export interface PersonRowProps {
  name: string;
  portrait?: ReactNode;
  party?: string | null;
  partyStatus?: PartyStatus;
  formerly?: string | null;
  place?: string | null;
  detail?: string | null;
  size?: 44 | 56;
  href?: Href;
  partyHref?: Href;
  menu?: RowMenuAction[] | 'person';
  zoomSource?: boolean;
  yourMP?: boolean;
  onPress?: () => void;
  select?: () => void;
  accessibilityLabel?: string;
  testID?: string;
  testDrawnName?: boolean;
  dragPath?: string;
  selected?: boolean;
  highlighted?: boolean;
  statusShown?: boolean;
}
function PersonLink({
  slug,
  name,
  href,
  zoom,
  children,
  select,
}: {
  slug: string;
  name: string;
  href: Href;
  zoom?: boolean;
  children: React.ReactElement;
  select?: () => void;
}) {
  const follow = useRowFollow('person', slug, name);
  return (
    <RowLink
      href={href}
      select={select}
      zoom={zoom}
      menu={rowMenus.person({ slug, name, ...follow })}
    >
      {children}
    </RowLink>
  );
}
/** Shared row identity for profile links and portrait-only member slots. */
export function personRowSlug(href?: Href, portrait?: ReactNode) {
  const portraitSlug = isValidElement<{ slug?: string }>(portrait)
    ? portrait.props.slug
    : undefined;
  return typeof href === 'object' && 'params' in href
    ? String(href.params?.slug ?? '')
    : typeof href === 'string'
      ? href.split('/').pop()
      : portraitSlug;
}

/** One anatomy for every roster member, including the saved-seat mark. */
export function PersonRow({
  name,
  portrait,
  party,
  partyStatus,
  formerly,
  place,
  detail,
  size = 44,
  href,
  partyHref,
  menu = 'person',
  zoomSource,
  yourMP: suppliedYourMP = false,
  onPress,
  select,
  accessibilityLabel,
  testID,
  testDrawnName = false,
  dragPath,
  selected,
  highlighted,
  statusShown = false,
}: PersonRowProps) {
  const slug = personRowSlug(href, portrait);
  const ownMember = useRowIsMyMember(slug);
  const yourMP = suppliedYourMP || ownMember;
  const path = dragPath ?? (slug ? `/subject/person/${slug}` : undefined);
  const stacked = useAccessibilitySize();
  const highlight = useRowHighlight();
  const cellStyle = useRowCellStyle();
  const split = selected !== undefined;
  useRowSelected(!!selected);
  const splitBleed = useSplitBleed();
  const [hovered, onHover] = useHover();
  const onActivate =
    select ?? onPress ?? (href ? () => router.push(href) : undefined);
  useRowInset(stacked ? 16 : 16 + size + rhythm.tight);
  const context =
    party === undefined
      ? null
      : { party, status: partyStatus ?? ('unknown' as const), formerly };
  const former = statusShown ? null : formerMember(context?.status);
  const label =
    (accessibilityLabel
      ? [accessibilityLabel, yourMP ? 'Your MP' : null]
          .filter(Boolean)
          .join(', ')
      : undefined) ??
    [
      name,
      context ? partyText(context).spoken : null,
      former,
      place,
      detail,
      yourMP ? 'Your MP' : null,
    ]
      .filter(Boolean)
      .join(', ');
  const body = (
    <>
      <View style={[styles.personMain, stacked ? styles.personStacked : null]}>
        {typeof portrait === 'string' ||
        portrait === null ||
        portrait === undefined ? (
          <Portrait
            size={size}
            uri={typeof portrait === 'string' ? portrait : undefined}
          />
        ) : (
          portrait
        )}
        <View
          style={[styles.personText, stacked ? null : styles.personTextInline]}
        >
          <Text
            wordSafe
            variant="name"
            {...(testDrawnName ? nameProbeProps : {})}
            testID={testID && `${testID}-name`}
            style={styles.personName}
          >
            {name}
          </Text>
          {context || yourMP || former || place || detail ? (
            <View
              style={[
                styles.personDetails,
                context ? styles.personParty : null,
              ]}
            >
              {context ? (
                <PartyLabel
                  {...context}
                  linked
                  nested
                  compact
                  href={partyHref}
                  testID={testID && `${testID}-party`}
                />
              ) : null}
              {yourMP ? (
                <YourMPMark testID={testID && `${testID}-your-mp`} />
              ) : null}
              {former ? (
                <Text
                  wordSafe
                  variant="secondary"
                  testID={testID && `${testID}-former`}
                >
                  {former}
                </Text>
              ) : null}
              {place ? (
                <Text wordSafe variant="secondary">
                  {place}
                </Text>
              ) : null}
              {detail ? (
                <Text wordSafe variant="secondary">
                  {detail}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
      {!split && (href || onPress || select) ? (
        <Icon name={personChevron} size={13} maxScale={1.5} tone="inkSoft" />
      ) : null}
    </>
  );
  const partyActions = [
    ...(partyHref || (context && isPartyLabel(context.party))
      ? [
          {
            name: 'openParty',
            label: partyHref
              ? 'Open party'
              : `Open ${partyIdentity(context?.party).name} party page`,
          },
        ]
      : []),
    ...(context?.formerly &&
    isPartyLabel(context.formerly) &&
    context.formerly !== context.party
      ? [
          {
            name: 'openPreviousParty',
            label: `Open ${context.formerly} party page`,
          },
        ]
      : []),
  ];
  const onPartyAction = (event: { nativeEvent: { actionName: string } }) => {
    if (event.nativeEvent.actionName === 'openParty') {
      if (partyHref) router.push(partyHref);
      else if (context?.party && isPartyLabel(context.party))
        router.push(partyRoute(partyFromCode(context.party)));
    }
    if (
      event.nativeEvent.actionName === 'openPreviousParty' &&
      context?.formerly &&
      isPartyLabel(context.formerly)
    )
      router.push(partyRoute(partyFromCode(context.formerly)));
  };
  if (!href && !onPress && !select)
    return (
      <View
        accessible
        accessibilityLabel={label}
        accessibilityActions={partyActions}
        onAccessibilityAction={onPartyAction}
        testID={testID}
        style={[styles.person, cellStyle]}
      >
        {body}
      </View>
    );
  const row = (
    <Pressable
      accessible
      accessibilityRole={href ? 'link' : 'button'}
      accessibilityLabel={label}
      accessibilityState={selected !== undefined ? { selected } : undefined}
      accessibilityActions={partyActions}
      onAccessibilityAction={onPartyAction}
      testID={testID}
      onPress={select ?? onPress}
      style={({ pressed }) => [
        styles.person,
        split ? splitBleed : null,
        cellStyle,
        selected
          ? selectedWash()
          : pressed || highlighted || hovered
            ? { backgroundColor: highlight }
            : null,
      ]}
    >
      {body}
    </Pressable>
  );
  const link = href ? (
    menu === 'person' && slug ? (
      <PersonLink
        slug={slug}
        name={name}
        href={href}
        zoom={zoomSource}
        select={select ?? (selected !== undefined ? onPress : undefined)}
      >
        {row}
      </PersonLink>
    ) : (
      <RowLink
        href={href}
        zoom={zoomSource}
        menu={Array.isArray(menu) ? menu : undefined}
        select={select ?? (selected !== undefined ? onPress : undefined)}
      >
        {row}
      </RowLink>
    )
  ) : (
    row
  );
  return (
    <Hoverable
      effect="none"
      onActivate={onActivate}
      onHover={onHover}
      drag={path ? { path, title: name } : undefined}
    >
      {link}
    </Hoverable>
  );
}
const personChevron = 'chevron.right';

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
  partyCompactLink: { minWidth: minimumTarget },
  partyText: { flexShrink: 1, fontWeight: '600' },
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
    paddingVertical: rhythm.row,
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
  personDetails: { gap: rhythm.line },
  // Seat and role sit within the compact party link's expanded hit target,
  // so only a stack without those lines needs blank space below the party.
  personParty: { minHeight: minimumTarget },
});

ownsRowPadding(PersonRow);
