import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { IconButton, Text, type SFSymbol } from '../../design/primitives';
import { symbols } from '../../design/symbols';
import { controlHeight, rhythm } from '../../design/tokens';
import { talkCopy } from './model';

/** AX3 and larger: the four controls become a 2 by 2 grid. */
const AX3 = 2.3;

/**
 * The call's four controls (specs/account.md 7.4): Mute, Type, Sources and
 * End, 56 pt round buttons with a footnote label under each, evenly spaced
 * like the Phone app's. The symbols keep their size at every text size;
 * the labels and the Sources count grow with it.
 */
export function CallControls({
  muted,
  canMute,
  typing,
  canType,
  sources,
  ending,
  live,
  onMute,
  onType,
  onSources,
  onEnd,
}: {
  muted: boolean;
  canMute: boolean;
  typing: boolean;
  canType: boolean;
  sources: number;
  ending: boolean;
  live: boolean;
  onMute: () => void;
  onType: () => void;
  onSources: () => void;
  onEnd: () => void;
}) {
  const { fontScale } = useWindowDimensions();
  const grid = fontScale >= AX3;
  const controls = [
    <Control
      key="mute"
      symbol={muted ? 'mic.slash.fill' : symbols.mute}
      label={talkCopy.controls.mute}
      selected={muted}
      disabled={!canMute}
      onPress={onMute}
      testID="talk-mute"
    />,
    <Control
      key="type"
      symbol="keyboard"
      label={talkCopy.controls.type}
      selected={typing}
      disabled={!canType}
      onPress={onType}
      testID="talk-type"
    />,
    <Control
      key="sources"
      symbol="doc.text.magnifyingglass"
      label={talkCopy.controls.sources}
      spoken={sources ? talkCopy.sourcesSpoken(sources) : undefined}
      badge={sources}
      disabled={!sources}
      onPress={onSources}
      testID="talk-sources"
    />,
    <Control
      key="end"
      symbol="phone.down.fill"
      label={talkCopy.controls.end}
      spoken={live ? 'End call' : 'Cancel call'}
      danger
      disabled={ending}
      onPress={onEnd}
      testID="talk-end"
    />,
  ];
  if (!grid) return <View style={styles.row}>{controls}</View>;
  return (
    <View style={styles.grid}>
      <View style={styles.row}>{controls.slice(0, 2)}</View>
      <View style={styles.row}>{controls.slice(2)}</View>
    </View>
  );
}

function Control({
  symbol,
  label,
  spoken,
  selected,
  badge,
  danger = false,
  disabled = false,
  onPress,
  testID,
}: {
  symbol: SFSymbol;
  label: string;
  spoken?: string;
  selected?: boolean;
  badge?: number;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <View style={styles.control}>
      <IconButton
        symbol={symbol}
        accessibilityLabel={spoken ?? label}
        variant={danger ? 'danger' : 'default'}
        size="large"
        selected={selected}
        disabled={disabled}
        badge={badge || undefined}
        onPress={onPress}
        testID={testID}
      />
      {/* The button carries the name; the label is drawn, not read twice. */}
      <Text
        wordSafe
        variant="footnote"
        tone={disabled ? 'inkSoft' : 'ink'}
        style={styles.label}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-start',
  },
  grid: { gap: rhythm.block },
  control: {
    alignItems: 'center',
    gap: rhythm.line,
    minWidth: controlHeight.large,
    flex: 1,
  },
  label: { textAlign: 'center' },
});
