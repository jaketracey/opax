import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { confirmAction } from '../../design/menu';
import { InsetGroup, LinkRow, Screen } from '../../design/primitives';
import { openOnWeb } from '../../navigation/external';
import { readConsent, setConsent } from '../talk/bridge';
import { VoiceConsentText } from '../talk/Consent';
import { accountCopy } from './copy';
import { SettingsRow } from './parts';

/**
 * `/account/consent` (specs/account.md 2.2): what voice sends and keeps, the
 * privacy page, and Withdraw consent while it is given. Consent is only ever
 * given in context, on Talk's consent sheet; withdrawing is reversible, so
 * the action is the tint, not red.
 */
export function ConsentScreen() {
  const [given, setGiven] = useState<boolean | null>(null);
  useFocusEffect(
    useCallback(() => {
      let current = true;
      void readConsent().then((value) => {
        if (current) setGiven(value);
      });
      return () => {
        current = false;
      };
    }, []),
  );
  const withdraw = () =>
    confirmAction(
      accountCopy.withdrawTitle,
      [
        {
          title: accountCopy.withdraw,
          onPress: () =>
            void setConsent(false).then((stored) => {
              if (!stored) return;
              setGiven(false);
              AccessibilityInfo.announceForAccessibility(
                accountCopy.consentWithdrawn,
              );
            }),
        },
      ],
      undefined,
      accountCopy.withdrawMessage,
    );
  return (
    <Screen grouped testID="account-consent-screen">
      <VoiceConsentText />
      <InsetGroup
        footer={given === false ? accountCopy.consentNotGivenFooter : undefined}
        testID={given === false ? 'account-consent-status' : undefined}
      >
        <LinkRow
          title={accountCopy.voicePrivacy}
          external
          accessibilityHint={accountCopy.opensOnWeb}
          testID="account-consent-privacy"
          onPress={() => void openOnWeb('/privacy', accountCopy.voicePrivacy)}
        />
      </InsetGroup>
      {given ? (
        <InsetGroup>
          <SettingsRow
            title={accountCopy.withdrawConsent}
            onPress={withdraw}
            testID="account-withdraw-consent"
          />
        </InsetGroup>
      ) : null}
    </Screen>
  );
}
