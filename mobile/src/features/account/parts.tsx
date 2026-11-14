import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  EXTERNAL_GLYPH,
  Icon,
  RowLink,
  Text,
  haptic,
  useAccessibilitySize,
  type SFSymbol,
} from '../../design/primitives';
import {
  useRowCellStyle,
  useRowHighlight,
  useRowInset,
} from '../../design/row-padding';
import { symbols } from '../../design/symbols';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import { copyText } from '../records/actions';

// The Account sheet's shared parts (specs/account.md 1.4) live in this file,
// not features/account/parts.tsx: the voice-off release bundles only this
// file, AccountRows.tsx and the production entry and store from the folder
// (metro.config.js), and its sheet draws the same rows and foot.

// Copy for the rows here is duplicated from copy.ts on purpose: copy.ts is
// left out of the voice-off release. tests/account-copy.test.ts keeps the two
// in step.
export const linksCopy = {
  ask: 'Ask settings',
  about: 'About OPAX',
  sources: 'Sources and licences',
  methods: 'Methods',
  coverage: 'Coverage by source',
  privacy: 'Privacy policy',
  terms: 'Terms of use',
  support: 'OPAX support',
  correction: 'Report a correction',
  correctionFooter: 'We aim to respond within 2 business days.',
  replayWelcome: 'Replay welcome',
  community: 'Community',
  workbench: 'Design workbench',
  version: (version: string, build: string) => `OPAX ${version} (${build})`,
  versionSpoken: (version: string, build: string) =>
    `Version ${version}, build ${build}`,
  copyVersion: 'Copy version',
  copy: 'Copy',
  opensOnWeb: 'Opens on opax.com.au',
} as const;

const TILE = 29;

/**
 * The rounded-square icon tile, on the Account sheet's rows only (DIR 2.7):
 * a white glyph on `bandPeople`. It grows with text to 1.5x, then stops.
 */
export function SettingsTile({ symbol }: { symbol: SFSymbol }) {
  const { fontScale } = useWindowDimensions();
  const size = Math.round(TILE * Math.min(Math.max(fontScale, 1), 1.5));
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: (size * 7) / TILE,
          borderCurve: 'continuous',
        },
      ]}
    >
      <Icon name={symbol} size={17} weight="semibold" tone="onBand" />
    </View>
  );
}

/**
 * One row of the Account group. With `href` it pushes (a chevron), with
 * `external` it opens a page or mail (the ↗ glyph). With neither it is an
 * `ActionRow`: a button in the tint, or `danger` for what cannot be undone,
 * with no chevron (1.4).
 */
export function SettingsRow({
  title,
  tile,
  leading,
  value,
  valueSpoken,
  href,
  external = false,
  onPress,
  tone = 'navy',
  busy = false,
  disabled = false,
  accessibilityHint,
  testID,
}: {
  title: string;
  tile?: SFSymbol;
  /** A wider leading element (the identity symbol); replaces the tile. */
  leading?: ReactNode;
  value?: string;
  valueSpoken?: string;
  href?: Href;
  external?: boolean;
  onPress?: () => void;
  tone?: 'navy' | 'danger' | 'ink';
  busy?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}) {
  const stacked = useAccessibilitySize();
  const highlight = useRowHighlight();
  const cellStyle = useRowCellStyle();
  useRowInset(leading ? 68 : tile ? 53 : 16);
  const action = !href && !external;
  const inactive = disabled || busy;
  const press = href ? () => router.push(href) : onPress;
  const row = (
    <Pressable
      accessible
      accessibilityRole={action ? 'button' : 'link'}
      accessibilityLabel={[title, valueSpoken ?? value]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={accessibilityHint}
      accessibilityValue={busy ? { text: 'In progress' } : undefined}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      testID={testID}
      onPress={href ? undefined : press}
      style={({ pressed }) => [
        styles.row,
        cellStyle,
        pressed && !inactive && press ? { backgroundColor: highlight } : null,
      ]}
    >
      {leading ?? (tile ? <SettingsTile symbol={tile} /> : null)}
      <View style={[styles.text, stacked ? styles.stacked : styles.inline]}>
        <Text
          wordSafe
          variant="body"
          tone={inactive ? 'inkSoft' : action ? tone : 'ink'}
          style={stacked ? undefined : styles.grow}
        >
          {title}
        </Text>
        {value ? (
          <Text wordSafe variant="body" tabular tone="inkSoft">
            {value}
          </Text>
        ) : null}
      </View>
      {busy ? <ActivityIndicator color={colors.inkSoft} /> : null}
      {href || external ? (
        <Icon
          name={external ? EXTERNAL_GLYPH : symbols.chevron}
          size={13}
          maxScale={1.5}
          tone="inkSoft"
        />
      ) : null}
    </Pressable>
  );
  return href && !inactive ? (
    <RowLink href={href} preview={false}>
      {row}
    </RowLink>
  ) : (
    row
  );
}

/**
 * Close the Account sheet, then present something else once it has gone
 * (2.7): UIKit drops a sheet presented while another is dismissing.
 */
export function closeSheetThen(action: () => void) {
  // Guarded like the shared Done (1.1): a cold open has nothing beneath.
  if (router.canGoBack()) router.back();
  else router.replace('/');
  setTimeout(action, 500);
}

const appVersion = () => {
  const config = Constants.expoConfig;
  const version = config?.version ?? '';
  const build = String(
    (config?.extra as { appBuild?: unknown } | undefined)?.appBuild ?? '',
  );
  return { version, build };
};

/** "OPAX 1.0.1 (36)", centred at the foot; long press or the rotor copies it. */
export function VersionFoot() {
  const { version, build } = appVersion();
  const text = linksCopy.version(version, build);
  const copy = () =>
    void copyText(text).then((copied) => {
      if (copied) {
        haptic('success');
        AccessibilityInfo.announceForAccessibility('Copied');
      }
    });
  return (
    <Pressable
      accessible
      accessibilityRole="text"
      accessibilityLabel={linksCopy.versionSpoken(version, build)}
      accessibilityActions={[{ name: 'copy', label: linksCopy.copyVersion }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'copy') copy();
      }}
      onLongPress={copy}
      testID="account-version"
      style={styles.foot}
    >
      <Text wordSafe variant="footnote" tone="inkSoft" style={styles.centre}>
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  groups: { gap: rhythm.section },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
    backgroundColor: colors.bandPeople,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
    paddingVertical: rhythm.row,
  },
  text: { flex: 1, gap: rhythm.line },
  inline: { flexDirection: 'row', alignItems: 'center', gap: rhythm.tight },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  grow: { flex: 1 },
  foot: {
    alignSelf: 'center',
    minHeight: minimumTarget,
    justifyContent: 'center',
  },
  centre: { textAlign: 'center' },
});
