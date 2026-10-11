import { useState } from 'react';
import { View } from 'react-native';
import { Canvas, Path, useCanvasRef } from '@shopify/react-native-skia';
import { EmptyState, Group, SourceLine } from '../../design/primitives';
import { colors, light, radii, rhythm } from '../../design/tokens';
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
  const official = boundary.geometry_kind === 'official';
  const origin = official ? 'AEC' : 'ABS statistical geography';
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
          backgroundColor: colors.sunken,
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
      {/* One source line: the boundary and who drew it, with "not for
          address allocation" and how the outline is drawn in its sheet
          (pass 5, P2-7). */}
      <SourceLine
        title="About this outline"
        dateLabel={`${boundary.vintage} boundary`}
        citation={[
          {
            label: official ? 'AEC' : 'ABS',
            title: official
              ? 'Australian Electoral Commission boundary'
              : 'ABS statistical geography (an approximation of the boundary)',
          },
        ]}
        originals={
          boundary.source_geometry_url
            ? [
                {
                  label: 'Electorate boundary',
                  url: boundary.source_geometry_url,
                },
              ]
            : []
        }
        notes={[
          'Not for address allocation. This simplified outline does not establish your current electorate.',
          'North is up. No basemap is shown; the saved outline works offline.',
        ]}
        testID="outline-source"
      />
    </Group>
  );
}
