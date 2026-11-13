import { symbols } from './symbols';
import { Pressable } from './pressable';
import { useContext } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { presentSheet } from '../navigation/sheets';
import { useAccessibilitySize } from './accessibility';
import { Icon } from './icon';
import { SurfaceContext, useRowHighlight } from './row-padding';
import { type SourceDetails } from './source';
import { Text } from './text';
import {
  androidControls,
  colors,
  minimumTarget,
  radii,
  rhythm,
} from './tokens';

// Labels use continuous capsules. Only MachinePill acts; its navy wash keeps
// it distinct from an active bill's never-interactive status capsule.
/** Active parliamentary business has one tone; all other statuses are neutral. */
export function statusTone(
  status: string | null | undefined,
): 'active' | 'neutral' {
  const word = (status ?? '').toLocaleLowerCase('en-AU');
  if (
    /fail|lapse|withdr|negativ|not[ _-]?(passed|agreed|carried)|discharg|removed|defeat|reject|against|ended|struck|pass|assent|agreed|carried|voted for|became law/.test(
      word,
    )
  )
    return 'neutral';
  return /before|introduc|reading|committee|debate|exposure|draft|consultation/.test(
    word,
  )
    ? 'active'
    : 'neutral';
}
export function StatusCapsule({
  status,
  label = status,
  testID,
  hidden = false,
  accessibilityLabel,
}: {
  status: string;
  /** Reader-facing words; the raw status still determines the colour. */
  label?: string;
  testID?: string;
  hidden?: boolean;
  accessibilityLabel?: string;
}) {
  const surface = useContext(SurfaceContext);
  const active = statusTone(status) === 'active';
  return (
    <View
      accessible={!hidden}
      accessibilityLabel={
        hidden ? undefined : (accessibilityLabel ?? `Status: ${label}`)
      }
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      testID={testID}
      style={[
        styles.status,
        // Hugs its label at every size; a long label wraps inside it.
        styles.hug,
        {
          backgroundColor: active
            ? colors.billsWash
            : surface === 'sunken'
              ? colors.raised
              : colors.sunken,
        },
      ]}
    >
      <Text
        wordSafe
        variant="capsule"
        tone={active ? 'billsInk' : 'inkSoft'}
        style={styles.shrink}
      >
        {label}
      </Text>
    </View>
  );
}

/** A topic on navyWash. Legacy linked tags retain their 44 pt target. */
export function Tag({
  label,
  onPress,
  kind = 'Topic',
  testID,
}: {
  label: string;
  onPress?: () => void;
  /** What VoiceOver says before the label: "Topic: Housing". */
  kind?: string;
  testID?: string;
}) {
  const fixed = useAccessibilitySize();
  const highlight = useRowHighlight();
  const face = (pressed: boolean) => (
    <View
      style={[
        styles.tag,
        ...(Platform.OS === 'android' && onPress
          ? [
              {
                borderRadius: androidControls.chipRadius,
                borderCurve: 'continuous',
                paddingHorizontal: 12,
                backgroundColor: 'transparent',
              } as const,
            ]
          : []),
        styles.hug,
        pressed ? { backgroundColor: highlight } : null,
      ]}
    >
      <Text
        wordSafe={Platform.OS === 'android' || fixed}
        variant="capsule"
        tone={onPress ? 'navy' : 'ink'}
        accessible={false}
        style={styles.shrink}
      >
        {label}
      </Text>
    </View>
  );
  // A plain tag is its 28pt face; only a linked tag needs the 44pt target.
  if (!onPress)
    return (
      <View
        accessible
        accessibilityLabel={`${kind}: ${label}`}
        testID={testID}
        style={styles.hug}
      >
        {face(false)}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${kind}: ${label}`}
      testID={testID}
      onPress={onPress}
      style={[
        styles.tagTarget,
        styles.hug,
        ...(Platform.OS === 'android'
          ? [
              {
                borderRadius: androidControls.chipRadius,
                borderCurve: 'continuous',
                borderWidth: 1,
                borderColor: colors.lineControl,
                backgroundColor: colors.navyWash,
              } as const,
            ]
          : []),
      ]}
    >
      {({ pressed }) => face(pressed)}
    </Pressable>
  );
}
/** The one phrase, everywhere: on the pill, in the sheet and to VoiceOver. */
export const MACHINE_LABEL = 'Machine-written';

/**
 * One choice among peers in a filter row or sheet: a pill, a navy wash, navy
 * when chosen. 36pt drawn, 44pt to touch. It reads its label, "selected" and
 * its place ("2 of 4"), as a segment does. Use FilterChip to remove an
 * applied filter, and a row or link to navigate.
 */
/** Android chip fallback; iOS uses the native picker controls. */
export function ChoiceChip({
  label,
  selected,
  onPress,
  accessibilityLabel,
  position,
  disabled = false,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  /** "2 of 4", where the chip is one of a set. */
  position?: string;
  disabled?: boolean;
  testID?: string;
}) {
  const fixed = useAccessibilitySize();
  if (Platform.OS === 'ios') return null;
  return (
    <Pressable
      accessibilityRole={Platform.OS === 'android' ? 'checkbox' : 'button'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{
        selected,
        disabled,
        ...(Platform.OS === 'android' ? { checked: selected } : {}),
      }}
      accessibilityValue={position ? { text: position } : undefined}
      testID={testID}
      disabled={disabled}
      hitSlop={Platform.OS === 'android' ? 6 : 4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        Platform.OS === 'android'
          ? ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              minHeight: androidControls.target,
              borderRadius: androidControls.chipRadius,
              borderCurve: 'continuous',
              borderWidth: 1,
              borderColor: colors.lineControl,
            } as const)
          : null,
        fixed ? styles.choiceFixed : null,
        ...(Platform.OS === 'android'
          ? [
              {
                borderRadius: androidControls.chipRadius,
                borderCurve: 'continuous',
              } as const,
            ]
          : []),
        {
          backgroundColor:
            Platform.OS === 'android'
              ? disabled
                ? colors.sunken
                : selected
                  ? colors.navyWash
                  : 'transparent'
              : disabled
                ? colors.sunken
                : selected
                  ? pressed
                    ? colors.navyRaised
                    : colors.navy
                  : pressed
                    ? colors.sunken
                    : colors.navyWash,
        },
      ]}
    >
      {selected && Platform.OS === 'android' ? (
        <Icon
          name={symbols.selected}
          size={18}
          maxScale={1}
          tone={disabled ? 'inkSoft' : 'navy'}
        />
      ) : null}
      <Text
        variant="strong"
        tone={
          disabled
            ? 'inkSoft'
            : selected && Platform.OS !== 'android'
              ? 'onNavy'
              : 'navy'
        }
        wordSafe={Platform.OS === 'android' || fixed}
        style={fixed ? styles.shrink : styles.center}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const machineSymbol = 'sparkles';

const styles = StyleSheet.create({
  hug: { alignSelf: 'flex-start', maxWidth: '100%' },
  shrink: { flexShrink: 1 },
  center: { textAlign: 'center' },
  status: {
    borderRadius: radii.capsule,
    borderCurve: 'continuous',
    minHeight: 22,
    paddingHorizontal: rhythm.tight,
    paddingVertical: rhythm.line,
  },
  // A linked tag: its 28pt face centred in a 44pt target.
  tagTarget: { justifyContent: 'center', minHeight: minimumTarget },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 28,
    borderRadius: radii.capsule,
    borderCurve: 'continuous',
    backgroundColor: colors.navyWash,
    paddingHorizontal: rhythm.tight,
    paddingVertical: rhythm.line,
  },
  // The pill is 32pt drawn; its row is the 44pt target.
  machineTarget: {
    minHeight: minimumTarget,
    maxWidth: '100%',
    justifyContent: 'center',
    marginVertical: -rhythm.tight,
  },
  androidMachineTarget: {
    borderRadius: androidControls.chipRadius,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.lineControl,
    backgroundColor: colors.navyWash,
  },
  machine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 32,
    paddingLeft: rhythm.tight,
    paddingRight: 10,
    paddingVertical: 2,
    borderRadius: radii.capsule,
    borderCurve: 'continuous',
  },
  machineFixed: {
    alignSelf: 'stretch',
    borderRadius: radii.capsule,
    borderCurve: 'continuous',
  },
  // The row of chips decides alignment; a chip only hugs its label.
  choice: {
    minHeight: 36,
    maxWidth: '100%',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: rhythm.line,
    borderRadius: radii.capsule,
    borderCurve: 'continuous',
  },
  choiceFixed: {
    alignSelf: 'stretch',
    borderRadius: radii.container,
    borderCurve: 'continuous',
  },
});

export interface MachineNote {
  title: string;
  body: string[];
  sources?: SourceDetails;
}
/** Wave 3 moves this payload from the compatibility sheet to /machine-note. */
export function MachinePill({
  note,
  testID,
}: {
  note: MachineNote;
  testID?: string;
}) {
  const highlight = useRowHighlight();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Machine-written"
        accessibilityHint="Opens how this was written"
        accessibilityShowsLargeContentViewer
        accessibilityLargeContentTitle="Machine-written"
        testID={testID}
        onPress={() => presentSheet({ kind: 'machine', note, testID })}
        style={
          Platform.OS === 'android'
            ? [styles.machineTarget, styles.androidMachineTarget]
            : styles.machineTarget
        }
      >
        {({ pressed }) => (
          <View
            style={[
              styles.machine,
              styles.hug,
              ...(Platform.OS === 'android'
                ? [
                    {
                      borderRadius: androidControls.chipRadius,
                      borderCurve: 'continuous',
                    } as const,
                  ]
                : []),
              { backgroundColor: pressed ? highlight : colors.navyWash },
            ]}
          >
            <Icon name={machineSymbol} size={12} maxScale={1.5} tone="navy" />
            <Text wordSafe variant="capsule" tone="navy" style={styles.shrink}>
              Machine-written
            </Text>
          </View>
        )}
      </Pressable>
    </>
  );
}
