import { Children, useState, type ReactNode } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type TextLayoutEvent,
} from 'react-native';
import { Link, type Href } from 'expo-router';
import { Heading, Text } from '../../design/text';
import { Icon } from '../../design/icon';
import { symbols } from '../../design/symbols';
import { LinkRow } from '../../design/rows';
import { FollowButton } from '../../design/controls';
import { useAccessibilitySize } from '../../design/accessibility';
import { partyDotSize } from '../../design/people';
import { partyDot } from '../../design/party';
import { colors, hairline, rhythm } from '../../design/tokens';
import type { FollowKind } from '../follows/store';

/** One row under the header: the party, a seat, the official page. */
export interface IdentityRow {
  kind: 'party' | 'seat' | 'official';
  title: string;
  detail?: string;
  /** A row with no `href` and no `external` is static text. */
  href?: Href;
  external?: { url: string; label: string };
  /** The party whose dot leads the row. */
  dot?: string | null;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

/**
 * The party's dot: 10 pt, growing with the text beside it to 16 pt. The name
 * that follows says the party, so the dot is hidden from VoiceOver.
 */
export function PartyDot({
  party,
  line,
}: {
  party: string | null | undefined;
  /** The first line of the text beside it, to centre the dot on. */
  line?: { y: number; height: number } | null;
}) {
  const { fontScale } = useWindowDimensions();
  const colour = partyDot(party);
  const size = partyDotSize(fontScale);
  return colour ? (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderCurve: 'continuous',
          backgroundColor: colour,
        },
        line === undefined
          ? null
          : line
            ? { marginTop: firstLineOffset(line, size) }
            : { alignSelf: 'center' },
      ]}
    />
  ) : null;
}

/**
 * The top margin that centres a dot of `size` on a text's first line, so a
 * party name that wraps keeps its dot on the line it starts.
 */
export function firstLineOffset(
  line: { y: number; height: number },
  size: number,
): number {
  return Math.max(0, line.y + (line.height - size) / 2);
}

/** The portrait's zoom target for a card that opens this page with a zoom. */
function ZoomTarget({ children }: { children: ReactNode }) {
  const Target = (
    Link as unknown as
      | { AppleZoomTarget?: (props: { children: ReactNode }) => ReactNode }
      | undefined
  )?.AppleZoomTarget;
  return Platform.OS === 'ios' && Target ? (
    <Target>{Children.only(children)}</Target>
  ) : (
    <>{children}</>
  );
}

/**
 * The subject's header on a profile or a party page (people.md 2.1, 2.2;
 * shell.md S1): the portrait (or the party's dot), the name as the page's
 * title, the role line, "Your MP" on the reader's own member, then
 * `FollowButton` as the only action in content, and the identity rows.
 * Share is the bar's button and Ask sits in ⋯. Centred, Contacts-style, for
 * a person at default sizes; left-aligned at accessibility sizes and for a
 * party, which has no portrait.
 */
export function ProfileHeader({
  variant = 'person',
  name,
  portrait,
  role,
  yourMP = false,
  identityRows = [],
  follow,
  footer,
  testID,
  titleTestID,
  onTitleLayout,
}: {
  variant?: 'person' | 'party';
  name: string;
  portrait?: ReactNode;
  role?: string | null;
  /** The reader's own member, computed on the device. */
  yourMP?: boolean;
  identityRows?: IdentityRow[];
  follow?: { kind: FollowKind; id: string } | null;
  /** A line under the Follow button (an offline line). */
  footer?: ReactNode;
  testID: string;
  titleTestID?: string;
  onTitleLayout?: () => void;
}) {
  const large = useAccessibilitySize();
  const centred = variant === 'person' && !large;
  const align = centred ? styles.centre : styles.leading;
  // The party title's first line, measured, so its dot sits on that line
  // and not at the top of a taller line box. Null until the title lays out:
  // the dot centres on the title, which is right for one line.
  const [firstLine, setFirstLine] = useState<{
    y: number;
    height: number;
  } | null>(null);
  const titleLayout = (event: TextLayoutEvent) => {
    const line = event.nativeEvent.lines[0];
    if (variant === 'party' && line)
      setFirstLine((seen) =>
        seen && seen.y === line.y && seen.height === line.height
          ? seen
          : { y: line.y, height: line.height },
      );
    onTitleLayout?.();
  };
  return (
    <View style={styles.header} testID={`${testID}-header`}>
      <View style={[styles.identity, align]}>
        {variant === 'person' && portrait ? (
          <ZoomTarget>
            <View>{portrait}</View>
          </ZoomTarget>
        ) : null}
        <View
          style={
            variant === 'party'
              ? styles.partyTitle
              : centred
                ? styles.centre
                : styles.leading
          }
        >
          {variant === 'party' ? (
            <PartyDot party={name} line={firstLine} />
          ) : null}
          {/* The subject's name is OPAX's heading, not the record's words:
              the system page title role, never the serif (D1). */}
          <Heading
            level={1}
            kind="page"
            testID={titleTestID}
            style={[centred ? styles.centredText : null, styles.shrink]}
            onTextLayout={titleLayout}
          >
            {name}
          </Heading>
        </View>
        {role ? (
          <Text
            wordSafe
            variant="secondary"
            style={centred ? styles.centredText : null}
            testID={
              role.startsWith('Former ') ? `${testID}-former` : `${testID}-role`
            }
          >
            {role}
          </Text>
        ) : null}
        {yourMP ? (
          <View
            accessible
            accessibilityLabel="Your MP"
            style={styles.yourMP}
            testID={`${testID}-your-mp`}
          >
            <Icon
              name={symbols.yourMP}
              size={15}
              maxScale={1.5}
              tone="inkSoft"
            />
            <Text variant="secondary">Your MP</Text>
          </View>
        ) : null}
        {follow ? (
          <View style={large ? styles.followFull : null}>
            <FollowButton
              kind={follow.kind}
              id={follow.id}
              title={name}
              testID={`${testID}-follow`}
              centred={centred}
            />
          </View>
        ) : null}
        {footer}
      </View>
      {identityRows.length ? (
        <View testID={`${testID}-identity`}>
          {identityRows.map((row, index) => (
            <View key={`${row.kind}-${row.title}`}>
              {index ? <View style={styles.inset} /> : null}
              <LinkRow
                title={row.title}
                detail={row.detail}
                href={row.href}
                external={row.external}
                leading={row.dot ? <PartyDot party={row.dot} /> : undefined}
                accessory={row.href || row.external ? 'chevron' : 'none'}
                accessibilityLabel={row.accessibilityLabel}
                accessibilityHint={row.accessibilityHint}
                testID={row.testID}
              />
            </View>
          ))}
          <View style={styles.end} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: rhythm.block },
  identity: { gap: rhythm.tight },
  centre: { alignItems: 'center' },
  leading: { alignItems: 'flex-start' },
  centredText: { textAlign: 'center' },
  shrink: { flexShrink: 1 },
  partyTitle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rhythm.tight,
  },
  yourMP: { flexDirection: 'row', alignItems: 'center', gap: rhythm.line },
  followFull: { alignSelf: 'stretch' },
  inset: { height: hairline, backgroundColor: colors.dividerSubtle },
  end: { height: hairline, backgroundColor: colors.dividerSubtle },
});
