import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from '../design/primitives';
import { colors, minimumTarget, spacing } from '../design/tokens';

/** A wrapping native navigation row; all visible record text is in its label. */
export function RecordRow({
  title,
  detail,
  onPress,
  testID,
}: {
  title: string;
  detail?: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={[title, detail].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      <View style={styles.text}>
        <Text variant="strong">{title}</Text>
        {detail ? <Text variant="metadata">{detail}</Text> : null}
      </View>
      <Icon name="chevron.right" size={14} tone="inkSoft" />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: minimumTarget,
    paddingVertical: spacing.s3,
  },
  text: { flex: 1, gap: spacing.s1 },
  pressed: { backgroundColor: colors.raised },
});
