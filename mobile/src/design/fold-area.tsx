import { createContext, useContext, useState, type ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { ReservedRegionView } from '../../modules/opax-duo';
import { emptyReservedRegions, type ReservedRegions } from './fold';

const ReservedRegionsOverrideContext = createContext<ReservedRegions | null>(
  null,
);
const ReservedRegionsContext = createContext<ReservedRegions | null>(null);

/** A local geometry override for tests or manually supplied reserved regions. */
export function ReservedRegionsProvider({
  value,
  children,
}: {
  value: ReservedRegions;
  children: ReactNode;
}) {
  return (
    <ReservedRegionsOverrideContext.Provider value={value}>
      <ReservedRegionsContext.Provider value={value}>
        {children}
      </ReservedRegionsContext.Provider>
    </ReservedRegionsOverrideContext.Provider>
  );
}

/** Regions are in the nearest area's coordinates; no margins need adding. */
export function useReservedRegions(): ReservedRegions {
  return useContext(ReservedRegionsContext) ?? emptyReservedRegions;
}

/**
 * A plain container whose children consume its local device regions. A
 * provider supplies the fallback geometry when there is no native bridge.
 * Scrolling content should keep flowing across divisions without moving.
 */
export function ReservedRegionArea({
  children,
  style,
  onChange,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onChange?: (regions: ReservedRegions) => void;
  testID?: string;
}) {
  const override = useContext(ReservedRegionsOverrideContext);
  const [regions, setRegions] = useState(emptyReservedRegions);
  const content = (
    <ReservedRegionsContext.Provider
      value={
        override ?? (Platform.OS === 'ios' ? regions : emptyReservedRegions)
      }
    >
      {children}
    </ReservedRegionsContext.Provider>
  );
  if (Platform.OS !== 'ios' || !ReservedRegionView) {
    return (
      <View style={style} testID={testID}>
        {content}
      </View>
    );
  }
  return (
    <ReservedRegionView
      style={style}
      testID={testID}
      onReservedRegions={({ nativeEvent }) => {
        const next = {
          divisions: nativeEvent.divisions,
          occlusions: nativeEvent.occlusions,
        };
        setRegions(next);
        onChange?.(next);
      }}
    >
      {content}
    </ReservedRegionView>
  );
}
