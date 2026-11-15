import { useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { InsetGroup } from '../design/primitives';
import { Text } from '../design/text';
import { rhythm } from '../design/tokens';
import { layoutProbeEnabled } from './layout-probe-flag';
import {
  layoutProbeText,
  layoutProbeVersion,
  subscribeLayoutProbe,
} from './layout-probe';

/**
 * The layout probe's readings, in Account, as text that can be selected and
 * copied. Drawn only in a build made with the probe's flag; see
 * `layout-probe.ts`. Nothing here leaves the device.
 */
function Readings() {
  useSyncExternalStore(
    subscribeLayoutProbe,
    layoutProbeVersion,
    layoutProbeVersion,
  );
  const text = layoutProbeText();
  return (
    <InsetGroup header="Layout probe">
      <View style={{ padding: rhythm.block }} testID="account-layout-probe">
        <Text wordSafe variant="footnote" selectable>
          {text ||
            'No pages measured yet. Open a few pages, then come back here.'}
        </Text>
      </View>
    </InsetGroup>
  );
}

/**
 * Chosen once, when the module loads: without the build flag this draws
 * nothing and subscribes to nothing.
 */
export const LayoutProbeRow = layoutProbeEnabled ? Readings : () => null;
