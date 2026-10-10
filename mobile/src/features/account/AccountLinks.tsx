import { router } from 'expo-router';
import { isProduction } from '../../design/environment';
import { LinkRow, RowList, Section } from '../../design/primitives';
import { showTour } from '../../onboarding/state';

/**
 * The Account sheet's one list of rows: Community (where the platform has
 * it natively), About OPAX, Sources and licences, and the welcome tour. The
 * design workbench joins them in development and e2e builds only.
 */
export function AccountLinks({
  community,
  first = false,
  testID,
}: {
  /** Opens Community; absent where Community is a web hand-off. */
  community?: () => void;
  /** The sheet's first block: no top rule. */
  first?: boolean;
  testID?: string;
}) {
  return (
    <Section rule={!first} testID={testID}>
      <RowList>
        {community ? (
          <LinkRow
            title="Community"
            detail="Questions and sources worth following"
            testID="account-community"
            onPress={community}
          />
        ) : null}
        <LinkRow
          title="About OPAX"
          detail="Coverage, corrections and privacy"
          testID="account-about"
          onPress={() => router.push('/account/about')}
        />
        <LinkRow
          title="Sources and licences"
          detail="Datasets, portrait credits and fonts"
          testID="account-sources"
          onPress={() => router.push('/account/sources')}
        />
        <LinkRow
          title="Replay welcome tour"
          testID="account-replay-tour"
          onPress={() => {
            // The tour draws above the tabs, so the sheet closes first.
            router.back();
            showTour();
          }}
        />
        {isProduction ? null : (
          // Development and e2e only, whatever the voice switch says; the
          // workbench route is not in release bundles.
          <LinkRow
            title="Design workbench"
            detail="Development builds only"
            testID="account-workbench"
            onPress={() => router.push('/workbench')}
          />
        )}
      </RowList>
    </Section>
  );
}
