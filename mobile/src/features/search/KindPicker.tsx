import { ActionSheetIOS } from 'react-native';
import { Button } from '../../design/primitives';
import { chrome } from '../../design/tokens';
import { kindLabel, scopeKinds, type SearchKind } from './model';

/** A native menu keeps complete kind names readable on narrow phones. */
export function KindPicker({
  value,
  onChange,
}: {
  value: SearchKind;
  onChange: (kind: SearchKind) => void;
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
            options: [...scopeKinds.map((kind) => kind.label), 'Cancel'],
            cancelButtonIndex: scopeKinds.length,
            tintColor: chrome.tint,
            userInterfaceStyle: 'light',
          },
          (index) => {
            const kind = scopeKinds[index];
            if (kind) onChange(kind.value);
          },
        )
      }
    />
  );
}
