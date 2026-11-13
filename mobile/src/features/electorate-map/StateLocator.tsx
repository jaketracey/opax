import { Circle, Path } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useColorScheme, View } from 'react-native';
import type { Boundary } from '../../api/electorate-geometry';
import { SizedCanvas } from '../../design/canvas';
import { dark, light } from '../../design/tokens.generated';
import { locatorFor } from './locator';

export const LOCATOR_SIZE = 72;
const DOT_RADIUS = 3.5;
// Room for the dot and its ground ring at the drawing's edge.
const PAD = DOT_RADIUS + 1.5;

/**
 * The state with the electorate as one navy dot, beside the outline (sweep 1
 * item 8). Decorative: the identity line under the title already says the
 * state, so VoiceOver and TalkBack skip it. Draws nothing when the locator
 * would say nothing (see `locatorFor`).
 */
export function StateLocator({
  boundaries,
  state,
  testID = 'electorate-locator',
}: {
  boundaries: Boundary[];
  state: string;
  testID?: string;
}) {
  const locator = useMemo(
    () => locatorFor(boundaries, state, LOCATOR_SIZE - PAD * 2),
    [boundaries, state],
  );
  const palette = useColorScheme() === 'dark' ? dark : light;
  if (!locator) return null;
  return (
    <View
      testID={testID}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: LOCATOR_SIZE,
        height: LOCATOR_SIZE,
        alignItems: 'flex-end',
      }}
    >
      <SizedCanvas
        width={locator.width + PAD * 2}
        height={locator.height + PAD * 2}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Path
          path={locator.path}
          style="fill"
          color={palette.dividerSubtle}
          transform={[{ translateX: PAD }, { translateY: PAD }]}
        />
        <Path
          path={locator.path}
          style="stroke"
          color={palette.inkSoft}
          strokeWidth={0.75}
          strokeJoin="round"
          transform={[{ translateX: PAD }, { translateY: PAD }]}
        />
        <Circle
          cx={locator.dot[0] + PAD}
          cy={locator.dot[1] + PAD}
          r={DOT_RADIUS + 1.5}
          color={palette.paper}
        />
        <Circle
          cx={locator.dot[0] + PAD}
          cy={locator.dot[1] + PAD}
          r={DOT_RADIUS}
          color={palette.navy}
        />
      </SizedCanvas>
    </View>
  );
}
