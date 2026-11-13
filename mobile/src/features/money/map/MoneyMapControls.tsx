import { StyleSheet, View } from 'react-native';
import { useAccessibilityFocusRequest } from '../../../design/keyboard';
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
  horizontal = false,
}: {
  onSearch: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  horizontal?: boolean;
}) {
  // Closing search puts VoiceOver back on the button that opened it.
  const searchRef = useAccessibilityFocusRequest('money-map-search');
  return (
    <View
      style={[styles.stack, horizontal ? styles.horizontal : null]}
      testID="money-map-controls"
    >
      <IconButton
        ref={searchRef}
        symbol={symbols.search}
        accessibilityLabel="Search the map"
        onPress={onSearch}
        testID="money-map-search"
      />
      <View style={[styles.rule, horizontal ? styles.verticalRule : null]} />
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
      <View style={[styles.rule, horizontal ? styles.verticalRule : null]} />
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
  horizontal: {
    flexDirection: 'row',
    paddingVertical: 0,
    paddingHorizontal: 2,
  },
  verticalRule: {
    width: hairline,
    height: 20,
    marginVertical: 0,
    marginHorizontal: 2,
  },
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
