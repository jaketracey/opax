import { useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  Canvas,
  Path,
  useCanvasRef,
  ColorType,
  AlphaType,
} from '@shopify/react-native-skia';
import { Group, Text, SourceLink, EmptyState } from '../../design/primitives';
import { isE2E } from '../../design/environment';
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
  const [width, setWidth] = useState(0),
    [pixels, setPixels] = useState(0);
  const height = 250,
    path =
      boundary?.geometry && width > 32
        ? outlinePath(boundary.geometry, width, height)
        : '';
  useEffect(() => {
    if (!isE2E || !path) return;
    let active = true,
      tries = 0;
    const timer = setInterval(() => {
      // Probe the native canvas's actual raster, not JS geometry or an AX label.
      const image = ref.current?.makeImageSnapshot();
      const bytes = image?.readPixels(0, 0, {
        width: image.width(),
        height: image.height(),
        colorType: ColorType.RGBA_8888,
        alphaType: AlphaType.Unpremul,
      });
      let drawn = 0;
      if (bytes)
        for (let i = 3; i < bytes.length; i += 4)
          if (
            bytes[i]! > 0 &&
            bytes[i - 3]! < 50 &&
            bytes[i - 2]! < 70 &&
            bytes[i - 1]! < 100
          )
            drawn++;
      image?.dispose();
      if (active && drawn > 40) {
        setPixels(drawn);
        clearInterval(timer);
      }
      if (++tries >= 20) clearInterval(timer);
    }, 250);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [path, ref]);
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
        testID={
          isE2E && pixels > 40
            ? `electorate-outline-drawn-pixels-${pixels}`
            : 'electorate-outline'
        }
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
