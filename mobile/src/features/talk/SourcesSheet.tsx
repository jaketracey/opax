import { router } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import {
  EmptyState,
  InsetGroup,
  LinkRow,
  Screen,
  Text,
} from '../../design/primitives';
import { webPageUrl } from '../../navigation/external';
import type { VoiceSource } from '../../voice';
import { chooseSource, useTalkLive } from './live';
import { talkCopy } from './model';
import { recordDestination, sourceMeta } from './sources';

/** Sources a call can open: validated OPAX record paths only. */
export const openableSources = (sources: readonly VoiceSource[]) =>
  sources.filter((source) => webPageUrl(source.path));

/**
 * `/talk/sources`, a form sheet over the call (specs/account.md 7.8) titled
 * "Sources" with Done. Each row says its kind and date, or that the date is
 * not published. A record the app draws opens inside Talk (a chevron); one on
 * opax.com.au waits for the call to end (↗). The sheet closes first, and the
 * Talk screen opens the choice, so an alert never appears under the sheet.
 */
export function TalkSourcesScreen() {
  const talk = useTalkLive();
  const sources = openableSources(talk.sources);
  return (
    <Screen testID="talk-sources-sheet">
      {sources.length ? (
        <InsetGroup>
          {sources.map((source, index) => {
            const native = recordDestination(source.path) !== null;
            const meta = sourceMeta(source);
            const metadata = (
              <Text wordSafe variant="secondary" style={styles.meta}>
                {meta}
              </Text>
            );
            return (
              <LinkRow
                key={source.path}
                title={source.title}
                {...(Platform.OS === 'android'
                  ? { aboveTitle: metadata }
                  : { leading: metadata })}
                external={!native}
                testID={`talk-source-${index}`}
                accessibilityLabel={`${meta}, ${source.title}`}
                accessibilityHint={
                  native
                    ? talk.active
                      ? 'Opens the record within the call'
                      : 'Opens the record'
                    : talk.active
                      ? 'Opens on opax.com.au after the call'
                      : 'Opens on opax.com.au'
                }
                onPress={() => {
                  chooseSource(source);
                  router.back();
                }}
              />
            );
          })}
        </InsetGroup>
      ) : (
        <EmptyState message={talkCopy.sourcesEmpty} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ meta: { marginBottom: 2 } });
