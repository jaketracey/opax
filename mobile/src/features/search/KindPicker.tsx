import { ActionSheetIOS, Platform } from 'react-native';
import { showMenu } from '../../design/menu';
import { LinkRow } from '../../design/primitives';
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
    <LinkRow
      title="Kind"
      detail={kindLabel(value)}
      testID="search-kind-menu"
      onPress={() => {
        if (Platform.OS === 'android') {
          showMenu(
            'Search kind',
            scopeKinds.map((kind) => ({
              title: kind.label,
              onPress: () => onChange(kind.value),
            })),
          );
          return;
        }
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
        );
      }}
    />
  );
}
