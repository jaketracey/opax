import { useContext, useEffect, useState, type ReactNode } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  StyleSheet,
  View,
  type KeyboardEvent,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { currentRule, useLayout } from '../../design/adaptive';
import { designFlags } from '../../design/flags';
import { liquidGlass } from '../../design/glass';
import { colors, rhythm } from '../../design/tokens';

/** iOS 26's bottom search field on iPhone, as drawn (w4-seat-01, -ax5-01). */
export const BOTTOM_FIELD_HEIGHT = 48;

/**
 * The space the chooser's list leaves for the bottom search field, or 0.
 * The list ends above the field at every text size, so the last row can
 * be read and tapped without the field covering it. Regular layouts keep
 * search in the bar and Android has no bottom field. Before iOS 26 the
 * iPhone's search field sits in the navigation bar too, so the list runs
 * to the bottom edge and takes the safe area as a content inset like any
 * other list; reserving the field there left an empty band (iOS 18 AX5).
 */
export function bottomFieldClearance(
  safeBottom: number,
  os: string = Platform.OS,
  regular: boolean = currentRule() !== 'phone',
  // The device's own version, and only when `os` is the device's: a
  // version never pairs with another platform's name.
  glass: boolean = os === Platform.OS && liquidGlass(),
): number {
  if (os !== 'ios' || regular || !glass) return 0;
  return safeBottom + BOTTOM_FIELD_HEIGHT + rhythm.tight;
}

/**
 * The same space with the keyboard up. The field rides on the keyboard, a
 * gap above it, so the list must end above both: the keyboard's height (it
 * covers the safe area), then the field and its gap. The scroll view's own
 * keyboard inset stops at the keyboard's top, which left the field over the
 * row behind it (build 79 sweep, the Victorian chooser). With no field to
 * clear (0), the keyboard changes nothing here.
 */
export function fieldClearanceAboveKeyboard(
  clearance: number,
  keyboardHeight: number,
): number {
  if (!clearance || keyboardHeight <= 0) return clearance;
  return Math.max(
    clearance,
    keyboardHeight + BOTTOM_FIELD_HEIGHT + rhythm.tight,
  );
}

/** The keyboard's height while it is up, 0 otherwise; read only if `on`. */
function useKeyboardHeight(on: boolean): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!on) return;
    // What the keyboard covers, from where its top will be: a frame change
    // that moves it off the screen reads as 0, whatever its own height.
    const covered = (event: KeyboardEvent) => {
      const end = event.endCoordinates;
      if (!end) return 0;
      const screen = Dimensions.get('screen').height;
      return Math.max(0, Math.min(end.height, screen - end.screenY));
    };
    const shown = Keyboard.addListener('keyboardWillShow', (event) =>
      setHeight(covered(event)),
    );
    const changed = Keyboard.addListener('keyboardWillChangeFrame', (event) =>
      setHeight(covered(event)),
    );
    const hidden = Keyboard.addListener('keyboardWillHide', () => setHeight(0));
    return () => {
      shown.remove();
      changed.remove();
      hidden.remove();
    };
  }, [on]);
  return on ? height : 0;
}

/** The chooser's list, ended above the bottom search field (see above). */
export function FieldClearance({ children }: { children: ReactNode }) {
  const safeBottom = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  const { regular, rule } = useLayout();
  const resting = bottomFieldClearance(
    safeBottom,
    Platform.OS,
    rule === 'pad' || regular,
  );
  const keyboard = useKeyboardHeight(resting > 0);
  const clearance = fieldClearanceAboveKeyboard(resting, keyboard);
  const ground = designFlags.groupedSurfaces ? colors.sunken : colors.paper;
  return (
    <View
      style={[
        styles.fill,
        clearance
          ? { paddingBottom: clearance, backgroundColor: ground }
          : null,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
