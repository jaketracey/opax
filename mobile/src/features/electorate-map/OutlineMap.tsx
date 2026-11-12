import { Path, useCanvasRef } from '@shopify/react-native-skia';
import { useState } from 'react';
import { useColorScheme, View } from 'react-native';
import {
  displayBoundary,
  outlinePath,
  type Boundary,
} from '../../api/electorate-geometry';
import { useAccessibilitySize } from '../../design/accessibility';
import { SizedCanvas } from '../../design/canvas';
import { ReservedRegionArea, useReservedRegions } from '../../design/fold-area';
import { jurisdictionName } from '../../design/parliament';
import { SourceLine } from '../../design/source';
import { radii } from '../../design/tokens';
import { dark, light } from '../../design/tokens.generated';
import { useOutlineProbe } from './outline-probe';
import { mapRegions } from '../money/map/regions';

/** The outline's colours by the ground it is drawn on (Dir 2.2). */
export function outlineColours(
  ground: 'sunken' | 'raised',
  scheme: 'light' | 'dark',
): { fill: string; stroke: string } {
  if (scheme === 'light') {
    const { navyWash: fill, navy: stroke } = light;
    return { fill, stroke };
  }
  return ground === 'sunken'
    ? { fill: dark.raised, stroke: dark.inkSoft }
    : { fill: dark.sunken, stroke: dark.inkSoft };
}

/** "Map of Grayndler, New South Wales": the state in words, never a code. */
export function outlineLabel(name: string, state: string): string {
  const place = jurisdictionName(state);
  return place ? `Map of ${name}, ${place}` : `Map of ${name}`;
}

export function hasOutline(boundaries: readonly Boundary[]): boolean {
  return !!displayBoundary([...boundaries])?.geometry;
}

/**
 * The drawing alone. `header` sits on the electorate page's ground with no
 * panel; `thumb` sits at the top of a card with the card's top corners. The
 * caller places the source line and leaves the drawing out when the file has
 * no outline (this draws nothing then).
 */
export function OutlineMap(props: Parameters<typeof OutlineMapContent>[0]) {
  return (
    <ReservedRegionArea>
      <OutlineMapContent {...props} />
    </ReservedRegionArea>
  );
}

function OutlineMapContent({
  boundaries,
  name,
  state,
  variant = 'header',
  ground = variant === 'thumb' ? 'raised' : 'sunken',
  height: fixedHeight,
  topInset = 0,
  onSources,
}: {
  boundaries: Boundary[];
  name: string;
  state: string;
  variant?: 'thumb' | 'header';
  ground?: 'sunken' | 'raised';
  /** Overrides the variant's height (the iOS 26 header box under glass). */
  height?: number;
  /** Space above the drawing inside the box (half the glass bar's height). */
  topInset?: number;
  /** The header's custom action "Sources". */
  onSources?: () => void;
}) {
  const boundary = displayBoundary(boundaries),
    ref = useCanvasRef();
  const [width, setWidth] = useState(0);
  const regions = useReservedRegions();
  const large = useAccessibilitySize();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const height =
    fixedHeight ??
    (variant === 'thumb' ? (large ? 72 : 120) : large ? 120 : 200);
  const drawn = Math.max(0, height - topInset);
  const { scene } = mapRegions(
    { x: 0, y: topInset, width, height: drawn },
    regions,
  );
  const path =
    boundary?.geometry && scene.width > 32 && scene.height > 32
      ? outlinePath(boundary.geometry, scene.width, scene.height)
      : '';
  // Only the page's own drawing is probed. A thumb can sit on a tab that is
  // mounted but not on screen (NativeTabs mounts every tab at launch), where
  // the Skia view never lays out natively and a snapshot aborts the app.
  const probeID = useOutlineProbe(ref, path, variant === 'header');
  if (!boundary?.geometry) return null;
  const { fill, stroke } = outlineColours(ground, scheme);
  const decorative = variant === 'thumb';
  return (
    <View
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : outlineLabel(name, state)}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      accessibilityActions={
        !decorative && onSources ? [{ name: 'sources', label: 'Sources' }] : []
      }
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'sources') onSources?.();
      }}
      testID={probeID}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{
        height,
        paddingTop: topInset,
        overflow: 'hidden',
        ...(decorative
          ? {
              borderTopLeftRadius: radii.thumb,
              borderTopRightRadius: radii.thumb,
              borderCurve: 'continuous',
            }
          : null),
      }}
    >
      <SizedCanvas
        ref={ref}
        width={scene.width}
        height={scene.height}
        style={{ position: 'absolute', left: scene.x, top: scene.y }}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {path ? (
          <>
            <Path path={path} style="fill" color={fill} />
            <Path
              path={path}
              style="stroke"
              color={stroke}
              strokeWidth={2}
              strokeJoin="round"
            />
          </>
        ) : null}
      </SizedCanvas>
    </View>
  );
}

/** The outline's own source: who drew the boundary and when. */
export function outlineSourceDetails(
  boundaries: Boundary[],
  jurisdiction = 'federal',
) {
  const boundary = displayBoundary(boundaries);
  if (!boundary?.geometry) return null;
  const official = boundary.geometry_kind === 'official';
  // An official state outline is the state commission's; federal is the AEC's.
  const state = jurisdiction.toLowerCase() === 'vic' ? 'VEC' : null;
  return {
    title: 'About this outline',
    dateLabel: `${boundary.vintage} boundary`,
    citation: [
      {
        label: official ? (state ?? 'AEC') : 'ABS',
        title: official
          ? state
            ? 'Victorian Electoral Commission boundary'
            : 'Australian Electoral Commission boundary'
          : 'ABS statistical geography (an approximation of the boundary)',
      },
    ],
    originals: boundary.source_geometry_url
      ? [{ label: 'Electorate boundary', url: boundary.source_geometry_url }]
      : [],
    notes: [
      'Not for address allocation. This simplified outline does not establish your current electorate.',
      'North is up. No basemap is shown; the saved outline works offline.',
    ],
  };
}

/** The caption under the header drawing. Draws nothing without an outline. */
export function OutlineSource({
  boundaries,
  jurisdiction,
  testID = 'outline-source',
}: {
  boundaries: Boundary[];
  jurisdiction?: string;
  testID?: string;
}) {
  const details = outlineSourceDetails(boundaries, jurisdiction);
  return details ? <SourceLine {...details} testID={testID} /> : null;
}
