import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useAccessibilitySize } from './accessibility';
import { Icon } from './icon';
import { InfoSheet } from './info';
import { Text } from './text';
import {
  colors,
  hairline,
  minimumTarget,
  radii,
  rhythm,
  statusTones,
  type StatusTone,
} from './tokens';

// The five kinds of small label (design review, principle 6), all sentence
// case and never letter-spaced:
//   StatusLabel  a word with a tone (a bill's stage, an outcome, a vote);
//   Tag          a topic, in bronze;
//   PartyLabel   a dot beside the party's name (people.tsx);
//   ChoiceChip / FilterChip  you choose it or remove it (controls.tsx);
//   MachineLabel the machine-written pill.
// Nothing else gets a pill. Things you read are 4-radius; things you press
// are pills (D1). At accessibility sizes a label takes its column's full
// width, a fixed frame for word-safe text: a hugging label's width would
// follow its own size, which word-safe sizing could chase.

/**
 * The tone a recorded status reads as. The word always carries the meaning;
 * the tone only reinforces it. Ended is checked first, so "Not passed" and
 * "Not agreed to" never read as done.
 */
export function statusTone(status: string | null | undefined): StatusTone {
  const s = (status ?? '').toLocaleLowerCase('en-AU');
  if (
    /fail|lapse|withdr[ae]w|negativ|not[ _-]?(passed|agreed|carried)|discharg|removed|defeat|reject|against|ended|struck/.test(
      s,
    )
  )
    return 'ended';
  if (/exposure|draft|consultation/.test(s)) return 'draft';
  if (/pass|assent|\bact\b|agreed|carried|became law|voted for|\bfor\b/.test(s))
    return 'done';
  if (/before|introduced|reading|committee|second|third|debate/.test(s))
    return 'active';
  return 'ended';
}

/**
 * A status as a word on its tone's wash: "Passed", "Before parliament",
 * "Negatived", "Voted against". 4-radius (a thing you read), the `label`
 * role. Never a button, and at most one per row.
 */
export function StatusLabel({
  label,
  tone = statusTone(label),
  accessibilityLabel,
  hidden = false,
  testID,
}: {
  /** The recorded word, in sentence case. */
  label: string;
  /** Inferred from the word when not given. */
  tone?: StatusTone;
  /** What VoiceOver says, where the row around it does not. */
  accessibilityLabel?: string;
  /** Inside an element that already says the status. */
  hidden?: boolean;
  testID?: string;
}) {
  const fixed = useAccessibilitySize();
  const { ink, wash } = statusTones[tone];
  return (
    <View
      accessible={!hidden}
      accessibilityLabel={hidden ? undefined : (accessibilityLabel ?? label)}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      testID={testID}
      style={[
        styles.status,
        fixed ? styles.fixed : styles.hug,
        { backgroundColor: colors[wash] },
      ]}
    >
      <Text wordSafe={fixed} variant="label" tone={ink} style={styles.shrink}>
        {label}
      </Text>
    </View>
  );
}

/**
 * A topic: bronze ink on the bronze wash, 4-radius. With `onPress` it is a
 * link to the topic, with a 44pt target around its 28pt face; pressed keeps
 * the 4.5:1 label and adds an outline and an underline. Never a filter, a
 * status, a count or a submit button. VoiceOver: "Topic: Housing".
 */
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
  const face = (pressed: boolean) => (
    <View
      style={[
        styles.tag,
        fixed ? styles.fixed : styles.hug,
        pressed ? styles.tagPressed : null,
      ]}
    >
      <Text
        wordSafe={fixed}
        variant="label"
        tone="bronzeInk"
        accessible={false}
        style={[styles.shrink, pressed ? styles.underline : null]}
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
export const MACHINE_GUIDANCE =
  'OPAX labels every passage a model wrote. Check the original record before relying on it. Patterns are leads, not findings.';
/** What a stored machine brief is, for its pill's sheet and VoiceOver. */
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
 * on the pill: "Machine-written. Written by a model …". 26pt drawn, 44pt to
 * touch.
 */
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
                  backgroundColor: pressed ? colors.sunken : colors.billsWash,
                },
              ]}
            >
              <Icon name="sparkles" size={12} tone="billsInk" />
              <Text
                wordSafe={fixed}
                variant="label"
                tone="billsInk"
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

const styles = StyleSheet.create({
  hug: { alignSelf: 'flex-start', maxWidth: '100%' },
  fixed: { alignSelf: 'stretch' },
  shrink: { flexShrink: 1 },
  center: { textAlign: 'center' },
  underline: { textDecorationLine: 'underline' },
  status: {
    borderRadius: radii.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  // A linked tag: its 28pt face centred in a 44pt target.
  tagTarget: { justifyContent: 'center', minHeight: minimumTarget },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 28,
    borderRadius: radii.sm,
    backgroundColor: colors.bronzeWash,
    paddingHorizontal: rhythm.tight,
    paddingVertical: rhythm.line,
  },
  // The outline replaces the 1pt of padding it occupies, so nothing moves.
  tagPressed: {
    borderWidth: hairline,
    borderColor: colors.bronzeInk,
    paddingHorizontal: rhythm.tight - hairline,
    paddingVertical: rhythm.line - hairline,
  },
  // The pill is 26pt drawn; its row is the 44pt target.
  machineTarget: {
    minHeight: minimumTarget,
    justifyContent: 'center',
    marginVertical: -rhythm.tight,
  },
  machine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 26,
    paddingLeft: rhythm.tight,
    paddingRight: 10,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderCurve: 'continuous',
  },
  machineFixed: { alignSelf: 'stretch', borderRadius: radii.md },
  // The row of chips decides alignment; a chip only hugs its label.
  choice: {
    minHeight: 36,
    maxWidth: '100%',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: rhythm.line,
    borderRadius: radii.pill,
    borderCurve: 'continuous',
  },
  choiceFixed: { alignSelf: 'stretch', borderRadius: radii.md },
});
