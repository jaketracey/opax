import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useAccessibilitySize } from './accessibility';
import { Icon } from './icon';
import { InfoSheet } from './info';
import { Text } from './text';
import { SourceLine, type SourceDetails } from './source';
import { SurfaceContext, useRowHighlight } from './row-padding';
import { useContext } from 'react';
import {
  colors,
  minimumTarget,
  radii,
  rhythm,
  type StatusTone,
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
  testID,
  hidden = false,
  accessibilityLabel,
}: {
  status: string;
  testID?: string;
  hidden?: boolean;
  accessibilityLabel?: string;
}) {
  const fixed = useAccessibilitySize();
  const surface = useContext(SurfaceContext);
  const active = statusTone(status) === 'active';
  return (
    <View
      accessible={!hidden}
      accessibilityLabel={
        hidden ? undefined : (accessibilityLabel ?? `Status: ${status}`)
      }
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      testID={testID}
      style={[
        styles.status,
        fixed ? styles.fixed : styles.hug,
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
        {status}
      </Text>
    </View>
  );
}
/** @deprecated Use StatusCapsule. */
export function StatusLabel({
  label,
  tone: _tone,
  ...props
}: {
  label: string;
  tone?: StatusTone;
  hidden?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  return (
    <StatusCapsule
      status={label}
      accessibilityLabel={props.accessibilityLabel ?? label}
      {...props}
    />
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
        fixed ? styles.fixed : styles.hug,
        pressed ? { backgroundColor: highlight } : null,
      ]}
    >
      <Text
        wordSafe={fixed}
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
        style={fixed ? styles.fixed : styles.hug}
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
      style={[styles.tagTarget, fixed ? styles.fixed : styles.hug]}
    >
      {({ pressed }) => face(pressed)}
    </Pressable>
  );
}

/** What every machine-written sheet adds after the text's own attribution. */
/** @deprecated Put this guidance in the MachineNote body. */
export const MACHINE_GUIDANCE =
  'OPAX labels every passage a model wrote. Check the original record before relying on it. Patterns are leads, not findings.';
/** What a stored machine brief is, for its pill's sheet and VoiceOver. */
/** @deprecated Put the attribution in the MachineNote body. */
export const MACHINE_BRIEF_EXPLANATION =
  'An automated summary written by a model; not the record.';
/** The one phrase, everywhere: on the pill, in the sheet and to VoiceOver. */
export const MACHINE_LABEL = 'Machine-written';

/**
 * The machine-written label: a pill (a sparkle and "Machine-written") once
 * at the top of each machine-written block, never a sentence, a badge plus a
 * paragraph or one per paragraph. Tapping it opens a sheet with the text's
 * own attribution ("Written by a model from the explanatory memorandum; not
 * the record") and `MACHINE_GUIDANCE`. VoiceOver hears the whole disclosure
 * on the pill: "Machine-written. Written by a model …". 32pt drawn, 44pt to
 * touch.
 */
/** @deprecated Use MachinePill. */
export function MachineLabel({
  explanation,
  testID,
  children,
}: {
  /** The attribution in the record's own words. */
  explanation: string;
  testID?: string;
  /**
   * @deprecated A surface's own face for the pill (Today's edition card).
   * Pass 3 draws the pill there too.
   */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const fixed = useAccessibilitySize();
  const sentence = explanation.trim().replace(/\.?$/, '.');
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${MACHINE_LABEL}. ${sentence}`}
        accessibilityHint="Opens the explanation"
        testID={testID}
        onPress={() => setOpen(true)}
        style={[styles.machineTarget, fixed ? styles.fixed : styles.hug]}
      >
        {({ pressed }) =>
          children ?? (
            <View
              style={[
                styles.machine,
                fixed ? styles.machineFixed : styles.hug,
                {
                  backgroundColor: pressed ? colors.sunken : colors.navyWash,
                },
              ]}
            >
              <Icon name={machineSymbol} size={12} tone="navy" />
              <Text
                wordSafe={fixed}
                variant="capsule"
                tone="navy"
                style={styles.shrink}
              >
                {MACHINE_LABEL}
              </Text>
            </View>
          )
        }
      </Pressable>
      <InfoSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={MACHINE_LABEL}
        notes={[sentence, MACHINE_GUIDANCE]}
        testID={testID ? `${testID}-sheet` : undefined}
      />
    </>
  );
}

/**
 * One choice among peers in a filter row or sheet: a pill, a navy wash, navy
 * when chosen. 36pt drawn, 44pt to touch. It reads its label, "selected" and
 * its place ("2 of 4"), as a segment does. Use FilterChip to remove an
 * applied filter, and a row or link to navigate.
 */
/** @deprecated Use ChoiceChips to group peers into a native picker on iOS. */
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      accessibilityValue={position ? { text: position } : undefined}
      testID={testID}
      disabled={disabled}
      hitSlop={Platform.OS === 'android' ? 6 : 4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        fixed ? styles.choiceFixed : null,
        {
          backgroundColor: disabled
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
      <Text
        variant="control"
        tone={disabled ? 'inkSoft' : selected ? 'onNavy' : 'navy'}
        wordSafe={fixed}
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
  fixed: { alignSelf: 'stretch' },
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
    justifyContent: 'center',
    marginVertical: -rhythm.tight,
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
  const [open, setOpen] = useState(false);
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
        onPress={() => setOpen(true)}
        style={styles.machineTarget}
      >
        {({ pressed }) => (
          <View
            style={[
              styles.machine,
              styles.hug,
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
      <InfoSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={note.title}
        notes={note.body}
        extra={note.sources ? <SourceLine {...note.sources} /> : undefined}
        testID={testID && `${testID}-sheet`}
      />
    </>
  );
}
