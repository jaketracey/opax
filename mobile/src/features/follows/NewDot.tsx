import { View, useWindowDimensions } from 'react-native';
import { colors } from '../../design/tokens';
export function NewDot({ testID }: { testID?: string }) {
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
        backgroundColor: colors.navy,
      }}
    />
  );
}
