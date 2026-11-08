import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Host, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  accessibilityLabel as nativeLabel,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import { PopUpButton, SegmentedControl, haptic } from '../../design/primitives';
import {
  contentSizeCategory,
  minimumTarget,
  rhythm,
} from '../../design/tokens';
import { scopes, type Scope } from './scopes';

/** The menu replaces the segments from AX3 (journeys/search.md 3.4). */
export function scopeMenuAt(fontScale: number) {
  return ['ax3', 'ax4', 'ax5'].includes(contentSizeCategory(fontScale));
}

/**
 * The four scopes, first in the results list header: All, People, Bills,
 * Speeches. A `SegmentedPicker` to AX2 (four labels fit 375 pt there); a
 * pop-up button with the current scope from AX3. Android draws its own
 * segmented control, with a bottom-sheet menu at the largest sizes.
 */
export function ScopeBar({
  value,
  onChange,
}: {
  value: Scope;
  onChange: (scope: Scope) => void;
}) {
  const { fontScale } = useWindowDimensions();
  const menu = scopeMenuAt(fontScale);
  const choose = (next: Scope) => {
    if (next === value) return;
    haptic('selection');
    onChange(next);
  };
  if (menu)
    return (
      <View style={styles.band}>
        <PopUpButton
          label="Scope"
          value={value}
          options={scopes.map((s) => ({
            ...s,
            testID: `search-scope-${s.value}`,
          }))}
          onChange={choose}
          testID="search-scope-menu"
        />
      </View>
    );
  if (Platform.OS !== 'ios')
    return (
      <View style={styles.band}>
        <SegmentedControl
          segments={scopes.map((s) => ({
            ...s,
            testID: `search-scope-${s.value}`,
          }))}
          value={value}
          onChange={choose}
          testID="search-scope"
        />
      </View>
    );
  return (
    <View style={styles.band} testID="search-scope">
      <Host
        style={{ alignSelf: 'stretch', minHeight: minimumTarget }}
        matchContents={{ vertical: true }}
      >
        <Picker
          label="Scope"
          selection={value}
          onSelectionChange={(next: Scope) => choose(next)}
          modifiers={[
            pickerStyle('segmented'),
            nativeLabel('Scope'),
            accessibilityIdentifier('search-scope-picker'),
          ]}
        >
          {scopes.map((s) => (
            <SwiftText
              key={s.value}
              modifiers={[
                tag(s.value),
                accessibilityIdentifier(`search-scope-${s.value}`),
              ]}
            >
              {s.label}
            </SwiftText>
          ))}
        </Picker>
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { paddingVertical: rhythm.tight },
});
