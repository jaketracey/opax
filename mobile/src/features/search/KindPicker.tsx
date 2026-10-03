import { ActionSheetIOS } from 'react-native';
import type { CatalogKind } from '../../api/policy';
import { Button } from '../../design/primitives';
import { colors } from '../../design/tokens';
import { kindLabel, searchKinds } from './model';

/** A native menu keeps complete kind names readable on narrow phones. */
export function KindPicker({
  value,
  onChange,
}: {
  value: CatalogKind;
  onChange: (kind: CatalogKind) => void;
}) {
  return (
    <Button
      label={`Kind: ${kindLabel(value)}`}
      icon="chevron.down"
      testID="search-kind-menu"
      onPress={() =>
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: 'Search kind',
            options: [...searchKinds.map((kind) => kind.label), 'Cancel'],
            cancelButtonIndex: searchKinds.length,
            tintColor: colors.navy,
            userInterfaceStyle: 'light',
          },
          (index) => {
            const kind = searchKinds[index];
            if (kind) onChange(kind.value);
          },
        )
      }
    />
  );
}
