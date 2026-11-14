import { router } from 'expo-router';
import { RouteOptions } from '../navigation/preview';
import { StyleSheet, View } from 'react-native';
import { ContentUnavailable } from '../design/states';
import { colors } from '../design/tokens';

/**
 * A link the app has no page for: an old or mistyped address. It says so
 * and offers the way back, instead of the router's development screen.
 */
export default function NotFound() {
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  return (
    <View style={styles.screen} testID="not-found">
      <RouteOptions options={{ title: 'Page not found', headerShown: true }} />
      <ContentUnavailable
        symbol="link"
        title="This page isn’t in the app"
        body="The link may be old, or the page may have moved."
        action={{
          label: router.canGoBack() ? 'Go back' : 'Go to Today',
          onPress: back,
          testID: 'not-found-back',
        }}
        testID="not-found-state"
      />
    </View>
  );
}
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.paper,
  },
});
