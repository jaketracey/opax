import { View, Text } from 'react-native';
import { colors, rhythm, textStyles } from '../design/tokens';
/** Temporary route body, replaced by the screen's owning lane. */
export function RoutePlaceholder({
  route,
  title,
}: {
  route: string;
  title: string;
}) {
  const id = route
    .split('/')
    .filter((segment) => !segment.startsWith('('))
    .join('/')
    .replace(/\/index$/, '');
  return (
    <View
      testID={`placeholder-${id}`}
      style={{ flex: 1, padding: rhythm.screen, backgroundColor: colors.paper }}
    >
      <Text accessibilityRole="header" style={textStyles.pageTitle}>
        {title}
      </Text>
    </View>
  );
}
