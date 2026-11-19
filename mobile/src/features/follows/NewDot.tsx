import { View, useWindowDimensions } from 'react-native';
import { useColors } from '../../design/use-colors';
export function NewDot({ testID }: { testID?: string }) {
  const colors = useColors();

  const { fontScale } = useWindowDimensions();
  const size = 8 * fontScale;
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel="New"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderCurve: 'continuous',
        backgroundColor: colors.navy,
      }}
    />
  );
}
