import { router } from 'expo-router';
import { isProduction } from '../../design/environment';
import { Button, Screen, Section, Text } from '../../design/primitives';
import { showTour } from '../../onboarding/state';
import { AccountSection } from './AccountSection';

const independence =
  'OPAX is independent and non-partisan. It is not a government app and is not affiliated with any parliament, government or political party.';

/**
 * Account and about (IOS-UX 4.9) in development and e2e builds. Production
 * selects entry.production.ts only when the production voice switch is off.
 */
export function AccountScreen() {
  return (
    <Screen testID="account-sheet">
      <AccountSection />
      <Section title="About OPAX">
        <Text variant="subheading">
          Open Parliamentary Accountability Exchange
        </Text>
        <Text>
          The Open Parliamentary Accountability Exchange brings together
          Australian parliamentary speeches, votes, political funding and public
          disclosures.
        </Text>
        <Text>{independence}</Text>
        <Button
          label="About and sources"
          testID="account-about"
          onPress={() => router.push('/account/about')}
        />
        <Button
          label="Replay welcome tour"
          testID="account-replay-tour"
          onPress={() => {
            // The tour draws above the tabs, so the sheet closes first.
            router.back();
            showTour();
          }}
        />
      </Section>
      {isProduction ? null : (
        // Development and e2e only, whatever the voice switch says; the
        // workbench route is not in release bundles.
        <Section title="Development">
          <Button
            label="Design workbench"
            testID="account-workbench"
            onPress={() => router.push('/workbench')}
          />
        </Section>
      )}
    </Screen>
  );
}
