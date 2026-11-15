import type { ReactTestInstance } from 'react-test-renderer';

/**
 * Reports the band under the map's panel the way the device would: to the
 * probe where the screen has one (iOS, unmanaged), else as the panel host's
 * layout above that band.
 */
export function reportBand(
  root: ReactTestInstance,
  panel: ReactTestInstance,
  stageHeight: number,
  gap: number,
  shown: number,
) {
  const probe = root.findAll((n) => n.props.testID === 'money-map-band')[0];
  if (probe) probe.props.onLayout({ nativeEvent: { layout: { height: gap } } });
  else
    panel.parent!.props.onLayout({
      nativeEvent: {
        layout: { y: stageHeight - gap - shown, height: shown },
      },
    });
}
