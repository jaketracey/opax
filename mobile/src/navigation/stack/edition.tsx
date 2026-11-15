import { screen, untitled } from './screen';
import { StyleSheet, View } from 'react-native';
import { colors } from '../../design/tokens';
import { designFlags } from '../../design/flags';
import { glassBar, groundBar, opaqueBar, type UnderBar } from '../chrome';

export function editionScreens(underBar: UnderBar = false) {
  const ground = designFlags.groupedSurfaces ? colors.sunken : colors.paper;
  // Beside a vertical bar the edition runs under a clear bar like every other
  // pushed page: its own ground is then behind the bar, so there is no band
  // for the glass edge to sample Today through, and nothing to back.
  if (underBar)
    return [
      screen('edition', 'Daily edition', {
        ...untitled,
        // Off the rail the page clears the bar before its first frame, and
        // the registration asks for no hairline either.
        ...(underBar === 'plain' ? groundBar(ground) : opaqueBar(ground)),
        contentStyle: { backgroundColor: ground },
      }),
    ];
  return [
    screen('edition', 'Daily edition', {
      ...untitled,
      ...opaqueBar(ground),
      headerTransparent: false,
      contentStyle: { backgroundColor: ground },
      scrollEdgeEffects: { top: 'hard', bottom: 'soft' },
      // The page ground stops below the native bar. During overscroll the
      // glass scroll edge can sample Today behind that band, even with opaque
      // native appearances. This inline route needs a permanent backing,
      // independent of the tab roots' soft scroll edge.
      ...(glassBar()
        ? {
            headerBackground: () => (
              <View
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[styles.bar, { backgroundColor: ground }]}
              />
            ),
          }
        : {}),
    }),
  ];
}

const styles = StyleSheet.create({ bar: { flex: 1 } });
