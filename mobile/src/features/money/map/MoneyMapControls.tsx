import { StyleSheet, View } from 'react-native';
import { IconButton } from '../../../design/primitives';
import { symbols } from '../../../design/symbols';
import { colors, hairline, radii } from '../../../design/tokens';

/**
 * The stage's trailing stack: search, zoom in, zoom out, fit. Every map
 * gesture has a button here, so switch and VoiceOver users get the same
 * ways around.
 */
export function MoneyMapControls({
  onSearch,
  onZoomIn,
  onZoomOut,
  onFit,
}: {
  onSearch: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}) {
  return (
    <View style={styles.stack} testID="money-map-controls">
      <IconButton
        symbol={symbols.search}
        accessibilityLabel="Search the map"
        onPress={onSearch}
        testID="money-map-search"
      />
      <View style={styles.rule} />
      <IconButton
        symbol="plus.circle"
        accessibilityLabel="Zoom in"
        onPress={onZoomIn}
        testID="money-map-zoom-in"
      />
      <IconButton
        symbol="minus.circle"
        accessibilityLabel="Zoom out"
        onPress={onZoomOut}
        testID="money-map-zoom-out"
      />
      <View style={styles.rule} />
      <IconButton
        symbol={symbols.fitMap}
        accessibilityLabel="Show the whole map"
        onPress={onFit}
        testID="money-fit"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    backgroundColor: colors.raised,
    borderRadius: radii.capsule,
    borderCurve: 'continuous',
    borderWidth: hairline,
    borderColor: colors.dividerSubtle,
    paddingVertical: 2,
    alignItems: 'center',
  },
  rule: {
    width: 20,
    height: hairline,
    backgroundColor: colors.dividerSubtle,
    marginVertical: 2,
  },
});
