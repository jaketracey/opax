import { Canvas, Path } from '@shopify/react-native-skia';
import { View } from 'react-native';
import { Icon, type SFSymbol } from '../design/icon';
import { colors } from '../design/tokens';

// The bundled Material Symbols font has no FILL axis API. Draw the four
// selected silhouettes here; Search keeps its conventional lens in both states.
const filled: Record<string, string> = {
  newspaper:
    'M3 3H21V21H3Z M5 6V12H11V6Z M13 6V8H19V6Z M13 10V12H19V10Z M5 14V16H19V14Z M5 18V19H19V18Z',
  'building.columns':
    'M12 2L2 7V9H22V7Z M4 10H8V19H4Z M10 10H14V19H10Z M16 10H20V19H16Z M2 20H22V22H2Z',
  'doc.text': 'M4 2H14L20 8V22H4Z M14 3V9H19Z M7 12V14H17V12Z M7 16V18H17V16Z',
  'text.bubble': 'M2 3H22V19H7L2 23Z M5 7V9H19V7Z M5 12V14H16V12Z',
};

export function AndroidTabIcon({
  symbol,
  focused,
}: {
  symbol: SFSymbol;
  focused: boolean;
}) {
  const path = focused ? filled[symbol] : undefined;
  return path ? (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: 24, height: 24 }}
    >
      <Canvas style={{ width: 24, height: 24 }}>
        <Path path={path} fillType="evenOdd" color={colors.navy as string} />
      </Canvas>
    </View>
  ) : (
    <Icon
      name={symbol}
      tone={focused ? 'navy' : 'inkSoft'}
      size={24}
      maxScale={1}
    />
  );
}
