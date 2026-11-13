import { router } from 'expo-router';
import { RouteOptions } from '../navigation/preview';
import { Screen } from '../design/layout';
import { ContentUnavailable } from '../design/states';

/**
 * A link the app has no page for: an old or mistyped address. It says so
 * and offers the way back, instead of the router's development screen.
 *
 * Every unknown link opens this inside a tab's stack, through the shared
 * folder's own `+not-found` route, so the tab bar stays (sweep 2, item 2).
 * This root copy is the fallback for a path the tabs cannot take. It is the
 * shared not-found pattern: centred on the page, with one way on.
 */
export default function NotFound() {
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  return (
    <>
      <RouteOptions options={{ title: 'Page not found', headerShown: true }} />
      <Screen centred testID="not-found">
        <ContentUnavailable
          symbol="link"
          title="This page isn't in the app"
          body="The link may be old, or the page may have moved."
          action={{
            label: router.canGoBack() ? 'Go back' : 'Go to Today',
            onPress: back,
            testID: 'not-found-back',
          }}
          testID="not-found-state"
        />
      </Screen>
    </>
  );
}
