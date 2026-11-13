import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '../../design/text';
import { rhythm, textStyles } from '../../design/tokens';
import { changeAccessibilityLabel, changeText, type Change } from './changes';
import { NewDot } from './NewDot';
export interface ChangeLineProps {
  change: Change;
  /** An unseen change: led by the new dot and set in ink (sweep 2 item 4). */
  fresh?: boolean;
  testID?: string;
}
/** SF action and the record's own date. Titles belong to the page rows. */
export function ChangeLine({ change, fresh = false, testID }: ChangeLineProps) {
  const { fontScale } = useWindowDimensions();
  const line = (
    <Text
      wordSafe
      variant="secondary"
      tone={fresh ? 'ink' : undefined}
      testID={testID}
      accessibilityLabel={changeAccessibilityLabel(change)}
      style={fresh ? styles.grow : undefined}
    >
      {changeText(change)}
    </Text>
  );
  if (!fresh) return line;
  return (
    <View style={styles.fresh}>
      <View
        style={[
          styles.dot,
          // Centred on the first line of the change.
          { height: textStyles.secondary.lineHeight * fontScale },
        ]}
      >
        <NewDot testID={testID && `${testID}-new`} />
      </View>
      {line}
    </View>
  );
}

const styles = StyleSheet.create({
  fresh: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    columnGap: rhythm.tight,
  },
  dot: { justifyContent: 'center' },
  grow: { flexShrink: 1, flexGrow: 1 },
});
