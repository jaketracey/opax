import { useEffect, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { router, type Href } from 'expo-router';
import { haptic } from '../../design/haptics';
import { InsetGroup, Screen } from '../../design/layout';
import { LinkRow } from '../../design/rows';
import { useAccount } from '../account/store';
import { SwitchRow } from '../../design/controls';
import { confirmDeleteAll } from './conversation-actions';
import { askConsentGiven, giveAskConsent, resetAskConsent } from './consent';
import { chatsSnapshot, loadChats, subscribeChats } from './store';

export const askSettingsCopy = {
  saved: 'Saved conversations',
  notice: 'Show the notice before asking',
  noticeDone: 'The notice will show before your next question.',
  deleteAll: 'Delete all conversations',
  confirm: 'Delete',
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
  const [notice, setNotice] = useState(true);
  const [canSkip, setCanSkip] = useState(false);
  useEffect(() => {
    let active = true;
    void askConsentGiven().then((given) => {
      if (active) {
        setNotice(!given);
        setCanSkip(given);
      }
    });
    return () => {
      active = false;
    };
  }, []);
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
        <SwitchRow
          label={askSettingsCopy.notice}
          value={notice}
          disabled={!canSkip}
          onValueChange={(next) => {
            // Only a reader who has already accepted may turn the repeat notice off.
            if (!canSkip) return;
            setNotice(next);
            void (next ? resetAskConsent() : giveAskConsent())
              .catch(() => undefined)
              .then(() => {
                haptic('success');
                if (next)
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
            // Conversations' bar menu says Delete All Conversations; here the
            // row already names it, so the sheet's button is Delete.
            onPress={() => confirmDeleteAll(status, askSettingsCopy.confirm)}
            testID="ask-settings-delete-all"
          />
        ) : null}
      </InsetGroup>
    </Screen>
  );
}
