import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Icon } from './icon';
import { SourceSheet, type SourceDetails } from './source';
import { colors, minimumTarget, radii, rhythm } from './tokens';

export interface InfoNotes {
  /** The sheet's title: "About these figures". */
  title: string;
  /** Methodology and caveats, one paragraph each, shown in full. */
  notes: readonly (string | null | undefined | false)[];
  /** Anything else the sheet carries below the notes. */
  extra?: SourceDetails['extra'];
}

/**
 * @deprecated A block's notes belong in its SourceLine (`notes`), which
 * opens the same sheet with the as-at date, the originals and the licence.
 * Screens move in pass 3; until then the ⓘ is a 44pt round button that
 * opens the source sheet with the notes. VoiceOver: "About these figures,
 * button".
 */
export function InfoButton({
  title,
  notes,
  extra,
  testID,
}: InfoNotes & { testID?: string }) {
  const [open, setOpen] = useState(false);
  const shown = notes.filter((note): note is string => !!note);
  if (!shown.length && !extra) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint="Opens the notes"
        accessibilityShowsLargeContentViewer
        accessibilityLargeContentTitle={title}
        testID={testID}
        hitSlop={8}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.button,
          pressed ? { backgroundColor: colors.sunken } : null,
        ]}
      >
        <Icon name="info.circle" size={20} tone="navy" />
      </Pressable>
      <InfoSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={title}
        notes={shown}
        extra={extra}
        testID={testID ? `${testID}-sheet` : undefined}
      />
    </>
  );
}

/**
 * The notes sheet: the source sheet with notes alone (methodology, caveats,
 * a machine-written attribution). A native page sheet with a Done button.
 */
export function InfoSheet({
  visible,
  onClose,
  title,
  notes,
  extra,
  testID,
}: InfoNotes & {
  visible: boolean;
  onClose: () => void;
  testID?: string;
}) {
  return (
    <SourceSheet
      visible={visible}
      onClose={onClose}
      title={title}
      notes={notes}
      extra={extra}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    width: minimumTarget,
    height: minimumTarget,
    marginVertical: -rhythm.tight,
    marginRight: -rhythm.tight,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
