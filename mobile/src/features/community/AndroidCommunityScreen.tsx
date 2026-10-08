import { Stack } from 'expo-router';
import { LinkRow, Screen, Section, Text } from '../../design/primitives';
import { openOnWeb } from '../../navigation/external';

// The account/Community bridge is Swift-only. Do not offer an Android sign-in
// route that is deliberately excluded from this build or a futile Retry action.
export function AndroidCommunityScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Community' }} />
      <Screen testID="community-home">
        <Section title="Community on the web" rule={false}>
          <Text>
            Community discussions, profiles and messages are available on
            opax.com.au. Community sign-in is not available in this Android
            build.
          </Text>
          <LinkRow
            title="Open Community on the web"
            detail="Opens on opax.com.au in your browser"
            testID="community-open-web"
            onPress={() => void openOnWeb('/community', 'Community')}
          />
        </Section>
      </Screen>
    </>
  );
}
