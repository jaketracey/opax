import { RouteOptions } from '../../navigation/preview';

import {
  InsetGroup,
  LinkRow,
  Screen,
  Section,
  Text,
} from '../../design/primitives';
import { openOnWeb } from '../../navigation/external';

// The account/Community bridge is Swift-only. Do not offer an Android sign-in
// route that is deliberately excluded from this build or a futile Retry action.
// The bar says Community, so no heading repeats it; the row's symbol says it
// leaves the app.
export function AndroidCommunityScreen() {
  return (
    <>
      <RouteOptions options={{ title: 'Community' }} />
      <Screen testID="community-home">
        <Section>
          <Text wordSafe>
            Community discussions, profiles and messages are available on
            opax.com.au. Community sign-in is not available in this Android
            build.
          </Text>
          <InsetGroup>
            <LinkRow
              title="Community on opax.com.au"
              external
              accessibilityHint="Opens on opax.com.au"
              testID="community-open-web"
              onPress={() => void openOnWeb('/community', 'Community')}
            />
          </InsetGroup>
        </Section>
      </Screen>
    </>
  );
}
