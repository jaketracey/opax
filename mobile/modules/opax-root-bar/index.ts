import { requireOptionalNativeModule } from 'expo';
import { Platform, type ColorValue } from 'react-native';

interface RootBarModule {
  update(
    identifier: string,
    progress: number,
    ground: ColorValue,
    divider: ColorValue,
  ): Promise<void>;
  remove(identifier: string): Promise<void>;
}

export const RootBar =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<RootBarModule>('OpaxRootBar')
    : null;
