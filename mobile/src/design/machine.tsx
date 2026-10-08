import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from './icon';
import { InfoSheet } from './info';
import { Text } from './text';
import { colors, minimumTarget, rhythm } from './tokens';

/** What every machine-written sheet adds after the text's own attribution. */
export const MACHINE_GUIDANCE =
  'OPAX labels every passage a model wrote. Check the original record before relying on it. Patterns are leads, not findings.';

/**
 * The machine-written label: only the pill (a sparkle and "Machine-written",
 * "Machine summary" or "Machine brief") sits above the text it labels.
 * Tapping it opens a sheet with the attribution in full ("Written by a model
 * from the explanatory memorandum; not the record"). VoiceOver hears the
 * whole disclosure on the pill itself: "Machine-written. Written by a model
 * …". `children` replaces the drawn face where a surface tints its own chips
 * (Today's edition card); the pill keeps its 44pt target either way.
 */
export function MachineWritten({
  explanation,
  label = 'Machine-written',
  testID,
  children,
}: {
  /** The attribution in the record's own words. */
  explanation: string;
  label?: string;
  testID?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const sentence = explanation.trim().replace(/\.?$/, '.');
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${sentence}`}
        accessibilityHint="Opens the explanation"
        testID={testID}
        onPress={() => setOpen(true)}
        style={styles.target}
      >
        {({ pressed }) =>
          children ?? (
            <View
              style={[
                styles.pill,
                {
                  backgroundColor: pressed ? colors.sunken : colors.billsWash,
                },
              ]}
            >
              <Icon name="sparkles" size={12} tone="billsInk" />
              <Text variant="chip" tone="billsInk" style={styles.label}>
                {label}
              </Text>
            </View>
          )
        }
      </Pressable>
      <InfoSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        notes={[sentence, MACHINE_GUIDANCE]}
        testID={testID ? `${testID}-sheet` : undefined}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // The capsule is 28pt drawn; its row is the 44pt target.
  target: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: minimumTarget,
    justifyContent: 'center',
    marginVertical: -rhythm.tight,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    minHeight: 28,
    paddingLeft: rhythm.tight,
    paddingRight: 10,
    paddingVertical: 3,
    borderRadius: 999,
    borderCurve: 'continuous',
  },
  label: { flexShrink: 1 },
});
