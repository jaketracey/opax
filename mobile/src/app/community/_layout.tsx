import { Stack } from 'expo-router';
import {
  closeSheetItem,
  headerItems,
  useStackChrome,
} from '../../navigation/chrome';
import { openSource } from '../../navigation/external';
import { webOrigin } from '../../design/environment';
export default function CommunityStack() {
  const chrome = useStackChrome();
  return (
    <Stack
      screenOptions={{
        ...chrome,
        ...headerItems(() => [
          {
            type: 'button',
            label: 'Support',
            accessibilityLabel: 'Contact OPAX support',
            icon: { type: 'sfSymbol', name: 'questionmark.circle' },
            onPress: () =>
              void openSource(`${webOrigin}/support`, 'OPAX support'),
          },
          { ...closeSheetItem(), variant: 'plain' },
        ]),
      }}
    />
  );
}
