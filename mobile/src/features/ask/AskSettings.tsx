import { useEffect, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { router, type Href } from 'expo-router';
import { haptic } from '../../design/haptics';
import { InsetGroup, Screen } from '../../design/layout';
import { LinkRow } from '../../design/rows';
import { useAccount } from '../account/store';
import { confirmDeleteAll } from './conversation-actions';
import { conversationsCopy } from './Conversations';
import { resetAskConsent } from './consent';
import { chatsSnapshot, loadChats, subscribeChats } from './store';

export const askSettingsCopy = {
  saved: 'Saved conversations',
  notice: 'Show the notice before asking',
  noticeDone: 'The notice will show before your next question.',
  deleteAll: 'Delete all conversations',
} as const;

/**
 * Account › Ask (journeys/ask.md 7, account row; 13 item 11): the saved
 * conversations, the notice again, and Delete all, last and confirmed.
 */
export default function AskSettings() {
  const saved = useSyncExternalStore(
    subscribeChats,
    chatsSnapshot,
    chatsSnapshot,
  );
  const status = useAccount().status;
  useEffect(() => {
    void loadChats().catch(() => undefined);
  }, []);
  const count = saved.chats.length;
  return (
    <Screen grouped testID="ask-settings">
      <InsetGroup>
        <LinkRow
          title={askSettingsCopy.saved}
          value={String(count)}
          onPress={() => router.push('/account/conversations' as Href)}
          testID="ask-settings-conversations"
        />
        <LinkRow
          title={askSettingsCopy.notice}
          accessory="none"
          onPress={() => {
            void resetAskConsent()
              .catch(() => undefined)
              .then(() => {
                haptic('success');
                AccessibilityInfo.announceForAccessibility(
                  askSettingsCopy.noticeDone,
                );
              });
          }}
          testID="ask-settings-notice"
        />
        {count ? (
          <LinkRow
            title={askSettingsCopy.deleteAll}
            destructive
            accessory="none"
            onPress={() =>
              confirmDeleteAll(status, conversationsCopy.deleteAll)
            }
            testID="ask-settings-delete-all"
          />
        ) : null}
      </InsetGroup>
    </Screen>
  );
}
