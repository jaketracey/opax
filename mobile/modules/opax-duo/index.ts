import type { ComponentType } from 'react';
import { Platform, type ViewProps } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ReservedRegions } from '../../src/design/fold';

export interface WindowTraits {
  horizontal: 'compact' | 'regular';
  vertical: 'compact' | 'regular';
  foldable: boolean;
}

export interface OpaxDuoModule {
  getWindowTraits(): WindowTraits;
  addListener(
    event: 'onWindowTraits',
    listener: (event: WindowTraits) => void,
  ): { remove(): void };
}

export interface ReservedRegionViewProps extends ViewProps {
  onReservedRegions?: (event: { nativeEvent: ReservedRegions }) => void;
}

// Both iOS idioms use window traits. Jest never loads the native bridge.
export const OpaxDuo =
  Platform.OS === 'ios' && process.env.NODE_ENV !== 'test'
    ? requireOptionalNativeModule<OpaxDuoModule>('OpaxDuo')
    : null;

export const ReservedRegionView: ComponentType<ReservedRegionViewProps> | null =
  OpaxDuo ? requireNativeView<ReservedRegionViewProps>('OpaxDuo') : null;
