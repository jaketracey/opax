import { screen, untitled } from './screen';
import { StyleSheet, View } from 'react-native';
import { colors } from '../../design/tokens';
import { designFlags } from '../../design/flags';
import { glassBar, opaqueBar } from '../chrome';

export function editionScreens() {
  const ground = designFlags.groupedSurfaces ? colors.sunken : colors.paper;
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
