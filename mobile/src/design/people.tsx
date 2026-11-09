import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { isValidElement, useState } from 'react';
import {
  Image,
  Pressable,
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
} from './row-padding';
import { SelectedMark, selectedWash, splitRowStyles } from './selection';
import { Text } from './text';
import { nameProbeProps } from './text-probe';
import { colors, hairline, minimumTarget, rhythm } from './tokens';

const portraitSizes = { row: 44, profile: 96 } as const;
/** A circular portrait; an absent or failed image stays a blank circle. */
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
  size?: keyof typeof portraitSizes | 28 | 44 | 56 | 72 | 80 | 96;
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
    /* Retain the blank circle for a rejected URI. */
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
          <Text variant="strong" tone="inkSoft" maxFontSizeMultiplier={1.353}>
            {name
              ?.trim()
              .split(/\s+/)
              .map((word) => word[0])
              .filter(Boolean)
              .slice(0, 2)
              .join('') || '○'}
          </Text>
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
  linked = true,
  nested = false,
  onDeep = false,
}: Omit<PartyContext, 'status'> & {
  status?: PartyStatus;
  dense?: boolean;
  testID?: string;
  linked?: boolean;
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
  const scheme = useColorScheme();
  const dot = partyDot(party, scheme === 'dark' ? 'dark' : 'light');
  const text = partyText({ party, status, formerly }, dense);
  const partyLinked = linked && !nested && isPartyLabel(party);
  const previousLinked =
    linked && !nested && !!text.previous && isPartyLabel(formerly);
  const fixed = useAccessibilitySize();
  const dotSize = partyDotSize(useWindowDimensions().fontScale);
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
        wordSafe={fixed}
        variant="secondary"
        tone={onDeep ? 'onNavySoft' : undefined}
        style={styles.partyText}
      >
        {text.visible}
        {text.previous ? (
          <Text
            variant="secondary"
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
/** One anatomy for every roster member. Callers decide whether this is Your MP. */
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
  yourMP = false,
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
  const portraitSlug = isValidElement<{ slug?: string }>(portrait)
    ? portrait.props.slug
    : undefined;
  const slug =
    typeof href === 'object' && 'params' in href
      ? String(href.params?.slug ?? '')
      : typeof href === 'string'
        ? href.split('/').pop()
        : portraitSlug;
  const path = dragPath ?? (slug ? `/subject/person/${slug}` : undefined);
  const stacked = useAccessibilitySize();
  const highlight = useRowHighlight();
  const cellStyle = useRowCellStyle();
  const split = selected !== undefined;
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
    accessibilityLabel ??
    [
      name,
      yourMP ? 'Your MP' : null,
      context ? partyText(context).spoken : null,
      former,
      place,
      detail,
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
          {yourMP ? (
            <Text wordSafe variant="secondary">
              Your MP
            </Text>
          ) : null}
          {context ? (
            <View style={styles.personParty}>
              <PartyLabel {...context} linked={false} nested />
            </View>
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
      </View>
      {!split && (href || onPress || select) ? (
        <Icon name={personChevron} size={13} maxScale={1.5} tone="inkSoft" />
      ) : null}
    </>
  );
  if (!href && !onPress && !select)
    return (
      <View
        accessible
        accessibilityLabel={label}
        testID={testID}
        style={[styles.person, cellStyle]}
      >
        {body}
      </View>
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
  const row = (
    <Pressable
      accessible
      accessibilityRole={href ? 'link' : 'button'}
      accessibilityLabel={label}
      accessibilityState={selected !== undefined ? { selected } : undefined}
      accessibilityActions={partyActions}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'openParty') {
          if (partyHref) router.push(partyHref);
          else if (context?.party && isPartyLabel(context.party))
            router.push(partyRoute(context.party));
        }
        if (
          event.nativeEvent.actionName === 'openPreviousParty' &&
          context?.formerly &&
          isPartyLabel(context.formerly)
        )
          router.push(partyRoute(context.formerly));
      }}
      testID={testID}
      onPress={select ?? onPress}
      style={({ pressed }) => [
        styles.person,
        split ? splitRowStyles.bleed : null,
        cellStyle,
        selected
          ? selectedWash()
          : pressed || highlighted || hovered
            ? { backgroundColor: highlight }
            : null,
      ]}
    >
      {selected ? <SelectedMark /> : null}
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
  // The party takes its own line, with a little air before the place.
  personParty: { flexDirection: 'row', paddingVertical: 1 },
});

ownsRowPadding(PersonRow);
