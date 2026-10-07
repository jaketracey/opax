import { router } from 'expo-router';
import { isProduction } from '../../design/environment';
import {
  LinkRow,
  RowList,
  Screen,
  Section,
  Text,
} from '../../design/primitives';
import { showTour } from '../../onboarding/state';

const independence =
  'OPAX is independent and non-partisan. It is not a government app and is not affiliated with any parliament, government or political party.';

/**
 * Android About. Account sign-in and voice are absent until their native port.
 */
export default function AndroidAboutScreen() {
  return (
    <Screen testID="account-sheet">
      <Section title="About OPAX" icon="building.columns" accent="people">
        <Text variant="subheading">
          Open Parliamentary Accountability Exchange
        </Text>
        <Text>
          The Open Parliamentary Accountability Exchange brings together
          Australian parliamentary speeches, votes, political funding and public
          disclosures.
        </Text>
        <Text variant="metadata">{independence}</Text>
        <RowList>
          <LinkRow
            title="About OPAX"
            detail="Coverage, corrections and privacy"
            icon="info.circle"
            accent="people"
            testID="account-about"
            onPress={() => router.push('/account/about')}
          />
          <LinkRow
            title="Sources and licences"
            detail="Datasets, portrait credits and fonts"
            icon="books.vertical"
            accent="leads"
            testID="account-sources"
            onPress={() => router.push('/account/sources')}
          />
          <LinkRow
            title="Replay welcome tour"
            icon="sparkles"
            accent="bills"
            testID="account-replay-tour"
            onPress={() => {
              // The tour draws above the tabs, so the sheet closes first.
              router.back();
              showTour();
            }}
          />
        </RowList>
      </Section>
      {isProduction ? null : (
        // Development and e2e only, whatever the voice switch says; the
        // workbench route is not in release bundles.
        <Section title="Development" icon="hammer" accent="people">
          <RowList>
            <LinkRow
              title="Design workbench"
              icon="square.grid.2x2"
              accent="people"
              testID="account-workbench"
              onPress={() => router.push('/workbench')}
            />
          </RowList>
        </Section>
      )}
    </Screen>
  );
}
