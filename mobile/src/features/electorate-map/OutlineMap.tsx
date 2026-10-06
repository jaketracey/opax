import { useState } from 'react';
import { View } from 'react-native';
import { Canvas, Path, useCanvasRef } from '@shopify/react-native-skia';
import { Group, Text, SourceLink, EmptyState } from '../../design/primitives';
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
    <Group>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Outline of ${name}, ${state.toUpperCase()}; display outline from the ${origin} ${boundary.vintage} boundaries`}
        testID={probeID}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height, backgroundColor: '#F1EFE8' }}
      >
        <Canvas
          ref={ref}
          style={{ width, height }}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {path ? (
            <Path path={path} style="stroke" color="#142A43" strokeWidth={2} />
          ) : null}
        </Canvas>
      </View>
      <Text wordSafe testID="outline-label">
        Display outline · {origin} · {boundary.vintage}
      </Text>
      <Text wordSafe variant="fine" testID="outline-limit">
        Not for address allocation. This simplified outline does not establish
        your current electorate. North is up. No basemap is shown; the saved
        outline works offline.
      </Text>
      {boundary.source_geometry_url ? (
        <SourceLink
          citation="Source geometry"
          url={boundary.source_geometry_url}
          kind="record"
          testID="outline-source"
        />
      ) : null}
    </Group>
  );
}
