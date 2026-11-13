import { Children, type ComponentProps } from 'react';
import { View } from 'react-native';
import { PadGrid, useLayout, useMeasuredRegion } from '../../design/adaptive';
import { ReservedRegionArea, useReservedRegions } from '../../design/fold-area';
import { activeVerticalFold } from '../../design/fold';
import { rhythm } from '../../design/tokens';

/** Local to these surfaces while the shared design layer belongs to foundation. */
export function SurfaceGrid(props: ComponentProps<typeof PadGrid>) {
  const { regular } = useLayout();
  // One card takes the whole width: a second column with nothing in it
  // left half of a regular phone empty (Today, a Victorian seat in Nov 2026).
  if (!regular || Children.toArray(props.children).length < 2)
    return <>{props.children}</>;
  return (
    <ReservedRegionArea>
      <FoldGrid {...props} />
    </ReservedRegionArea>
  );
}

function FoldGrid({
  gap = rhythm.block,
  minItemWidth,
  columns,
  ...props
}: ComponentProps<typeof PadGrid>) {
  const layout = useLayout();
  const [onLayout, measured] = useMeasuredRegion();
  const reserved = useReservedRegions();
  const width = measured?.width ?? layout.width;
  const fold = activeVerticalFold(reserved.divisions);
  // Equal columns, with a gutter containing the whole fold, even off centre.
  const gutter = fold
    ? Math.max(gap, width - 2 * fold.x, 2 * (fold.x + fold.width) - width)
    : gap;
  const phone = layout.rule === 'phone-regular';
  return (
    <View onLayout={onLayout}>
      <PadGrid
        {...props}
        gap={gutter}
        columns={phone || fold ? { compact: 2, regular: 2, wide: 2 } : columns}
        minItemWidth={
          phone || fold
            ? Math.max(1, Math.min(minItemWidth ?? 272, (width - gutter) / 2))
            : minItemWidth
        }
      />
    </View>
  );
}
