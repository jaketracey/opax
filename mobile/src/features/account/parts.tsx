import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  appearanceChoices,
  appearanceSettingOffered,
  setAppearance,
  useAppearanceChoice,
  type AppearanceChoice,
} from '../../design/appearance-setting';
import { PlainPressable as Pressable } from '../../design/pressable';
import {
  EXTERNAL_GLYPH,
  Icon,
  InsetGroup,
  LinkRow,
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
import { minimumTarget, rhythm } from '../../design/tokens';
import { makeStyles, useColors } from '../../design/use-colors';
import { testReportTap } from '../../analytics/test-report';
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
  appearance: 'Appearance',
  appearanceSystem: 'Match phone',
  appearanceLight: 'Light',
  appearanceDark: 'Dark',
  appearanceFooter: 'Match phone follows your phone’s light or dark setting.',
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
  const styles = useStyles();

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
 *
 * `opensPage` is for a row whose `onPress` leads to a page by another way
 * than a push in this sheet (the guide closes the sheet and opens in the
 * tab beneath): to the reader it opens a page, so it is drawn and spoken as
 * one, with the chevron, and not as an action.
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
  opensPage = false,
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
  /** `onPress` opens a page: the row is a link with a chevron. */
  opensPage?: boolean;
  tone?: 'navy' | 'danger' | 'ink';
  busy?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}) {
  const colors = useColors();
  const styles = useStyles();

  const stacked = useAccessibilitySize();
  const highlight = useRowHighlight();
  const cellStyle = useRowCellStyle();
  useRowInset(leading ? 68 : tile ? 53 : 16);
  const action = !href && !external && !opensPage;
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
      {href || external || opensPage ? (
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

const appearanceTitles: Record<AppearanceChoice, string> = {
  system: linksCopy.appearanceSystem,
  light: linksCopy.appearanceLight,
  dark: linksCopy.appearanceDark,
};

/**
 * The Appearance group (20 Nov 2026): Match phone, Light or Dark for OPAX
 * itself, one chosen, as the filter sheets draw a single choice (a trailing
 * checkmark, and the selected state for VoiceOver and TalkBack). Choosing a
 * row changes the whole app at once and is kept on this device
 * (design/appearance-setting.ts). A light-only build draws nothing here.
 */
export function AppearanceGroup() {
  const chosen = useAppearanceChoice();
  if (!appearanceSettingOffered()) return null;
  return (
    <InsetGroup
      header={linksCopy.appearance}
      footer={linksCopy.appearanceFooter}
      testID="account-appearance"
    >
      {appearanceChoices.map((choice) => (
        <LinkRow
          key={choice}
          title={appearanceTitles[choice]}
          accessory="checkmark"
          selected={chosen === choice}
          onPress={() => {
            if (chosen === choice) return;
            haptic('selection');
            setAppearance(choice);
          }}
          testID={`account-appearance-${choice}`}
        />
      ))}
    </InsetGroup>
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
  const styles = useStyles();

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
      feedback="none"
      accessible
      accessibilityRole="text"
      accessibilityLabel={linksCopy.versionSpoken(version, build)}
      accessibilityActions={[{ name: 'copy', label: linksCopy.copyVersion }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'copy') copy();
      }}
      // Seven taps within a few seconds offer a test error report
      // (analytics/test-report.ts). The label and role are unchanged.
      onPress={() => testReportTap()}
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

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
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
  }),
);
