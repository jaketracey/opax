import { useState, type ReactNode } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Heading, Text } from './text';
import { Icon } from './icon';
import { colors, hairline, minimumTarget, rhythm } from './tokens';
import { useReduceMotion } from './accessibility';

export interface InfoNotes {
  /** The sheet's title: "About these figures". */
  title: string;
  /** Methodology and caveats, one paragraph each, shown in full. */
  notes: readonly (string | null | undefined | false)[];
  /** Anything else the sheet carries below the notes. */
  extra?: ReactNode;
}

/**
 * An ⓘ button that opens a sheet with a block's methodology and caveats.
 * Long notes live here so a screen keeps its figures first; nothing is cut.
 * VoiceOver: "About these figures, button".
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

/** The notes sheet: a native page sheet with a Done button. */
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
  const reduced = useReduceMotion();
  return (
    <Modal
      visible={visible}
      animationType={reduced ? 'none' : 'slide'}
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* A page sheet sits below the status bar; only the home indicator
          needs room, so no inset provider (a modal would need its own). */}
      <SheetBody
        title={title}
        notes={notes}
        extra={extra}
        onClose={onClose}
        testID={testID}
      />
    </Modal>
  );
}

function SheetBody({
  title,
  notes,
  extra,
  onClose,
  testID,
}: InfoNotes & { onClose: () => void; testID?: string }) {
  const Container = Platform.OS === 'android' ? SafeAreaView : View;
  return (
    <Container style={styles.sheet} testID={testID} accessibilityViewIsModal>
      <View style={styles.bar}>
        <View style={styles.grab} />
        <View style={styles.head}>
          <Heading level={2} style={styles.title}>
            {title}
          </Heading>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Done"
            testID={testID ? `${testID}-done` : undefined}
            onPress={onClose}
            hitSlop={8}
            style={styles.done}
          >
            <Text variant="control" tone="navy">
              Done
            </Text>
          </Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {notes
          .filter((note): note is string => !!note)
          .map((note, index) => (
            <Text key={index} wordSafe variant="body">
              {note}
            </Text>
          ))}
        {extra}
      </ScrollView>
    </Container>
  );
}

const styles = StyleSheet.create({
  button: {
    width: minimumTarget,
    height: minimumTarget,
    marginVertical: -rhythm.tight,
    marginRight: -rhythm.tight,
    borderRadius: minimumTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: { flex: 1, backgroundColor: colors.paper },
  bar: {
    paddingHorizontal: rhythm.screen,
    paddingTop: rhythm.tight,
    paddingBottom: rhythm.heading,
    borderBottomWidth: hairline,
    borderBottomColor: colors.dividerSubtle,
  },
  grab: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.dividerDefault,
    marginBottom: rhythm.heading,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: rhythm.block },
  title: { flex: 1 },
  done: {
    minHeight: minimumTarget,
    minWidth: minimumTarget,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  content: {
    paddingHorizontal: rhythm.screen,
    paddingTop: rhythm.block,
    // The home indicator plus a section's breath.
    paddingBottom: 34 + rhythm.section,
    gap: rhythm.block,
  },
});
