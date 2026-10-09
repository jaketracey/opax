import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Path, useCanvasRef } from '@shopify/react-native-skia';
import {
  EmptyState,
  Group,
  InfoButton,
  SourceLink,
  Text,
} from '../../design/primitives';
import { light, radii, rhythm } from '../../design/tokens';
import { useOutlineProbe } from './outline-probe';
import {
  displayBoundary,
  outlinePath,
  type Boundary,
} from '../../api/electorate-geometry';
export function OutlineMap({
  boundaries,
  name,
  state,
}: {
  boundaries: Boundary[];
  name: string;
  state: string;
}) {
  const boundary = displayBoundary(boundaries),
    ref = useCanvasRef();
  const [width, setWidth] = useState(0);
  const height = 250,
    path =
      boundary?.geometry && width > 32
        ? outlinePath(boundary.geometry, width, height)
        : '';
  const probeID = useOutlineProbe(ref, path);
  if (!boundary?.geometry)
    return (
      <EmptyState
        message="No display outline is held for this electorate."
        testID="outline-unavailable"
      />
    );
  const origin =
    boundary.geometry_kind === 'official' ? 'AEC' : 'ABS statistical geography';
  return (
    <Group gap={rhythm.tight}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Outline of ${name}, ${state.toUpperCase()}; display outline from the ${origin} ${boundary.vintage} boundaries`}
        testID={probeID}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{
          height,
          backgroundColor: light.sunken,
          borderRadius: radii.md,
          overflow: 'hidden',
        }}
      >
        <Canvas
          ref={ref}
          style={{ width, height }}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {path ? (
            <>
              <Path path={path} style="fill" color={light.navyWash} />
              <Path
                path={path}
                style="stroke"
                color={light.navy}
                strokeWidth={2}
                strokeJoin="round"
              />
            </>
          ) : null}
        </Canvas>
      </View>
      <View style={styles.caption}>
        <View style={styles.grow}>
          <Text wordSafe variant="metadata" testID="outline-label">
            Display outline · {boundary.vintage}
          </Text>
          <Text wordSafe variant="fine" testID="outline-limit">
            Not for address allocation.
          </Text>
        </View>
        <InfoButton
          title="About this outline"
          notes={[
            'Not for address allocation. This simplified outline does not establish your current electorate. North is up. No basemap is shown; the saved outline works offline.',
          ]}
          testID="outline-info"
        />
      </View>
      {boundary.source_geometry_url ? (
        <SourceLink
          citation="Electorate boundary"
          url={boundary.source_geometry_url}
          kind="record"
          testID="outline-source"
        />
      ) : null}
    </Group>
  );
}
const styles = StyleSheet.create({
  caption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rhythm.tight,
  },
  grow: { flex: 1, gap: 2 },
});
