import { router } from 'expo-router';
import { isProduction } from '../design/environment';
import { showTour } from '../onboarding/state';
import { Button, Group, Screen, Section, Text } from '../design/primitives';

const independence =
  'OPAX is independent and non-partisan. It is not a government app and is not affiliated with any parliament, government or political party.';

/** Placeholder for the voice lane's sheet (IOS-UX section 4.10). */
export function TalkComingSoon() {
  return (
    <Screen testID="talk-sheet">
      <Group>
        <Text variant="lede" testID="talk-sheet-message">
          Talk to OPAX is not in this version of the app yet.
        </Text>
        <Text>
          It will let you ask about Australian politics, spending and the public
          record by voice, with links to the records behind each answer. Talking
          will need a free OPAX account. Everything else in the app works
          without one.
        </Text>
      </Group>
    </Screen>
  );
}

/** Placeholder for the account lane's sheet (IOS-UX section 4.9). */
export function AccountComingSoon() {
  return (
    <Screen testID="account-sheet">
      <Section title="Account">
        <Text testID="account-sheet-message">
          Signing in is not in this version of the app yet. An account will only
          be needed to talk to OPAX.
        </Text>
      </Section>
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
        // Development and e2e builds only; the workbench route is not in release bundles.
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
