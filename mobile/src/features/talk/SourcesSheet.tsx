import { router } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import {
  EmptyState,
  InsetGroup,
  LinkRow,
  Screen,
  Text,
} from '../../design/primitives';
import type { VoiceSource } from '../../voice';
import { chooseSource, useTalkLive } from './live';
import { talkCopy } from './model';
import {
  askDraftDestination,
  canOpenSource,
  recordDestination,
  sourceHeading,
  sourceMeta,
  sourceSpeaker,
} from './sources';

/** Sources a call can open: validated OPAX record paths and Ask pay rows. */
export const openableSources = (sources: readonly VoiceSource[]) =>
  sources.filter((source) => canOpenSource(source.path));

/**
 * `/talk/sources`, a form sheet over the call (specs/account.md 7.8) titled
 * "Sources" with Done. Each row reads as Ask's do: its type and date (or
 * that the date is not published), the record's title, then the speaker or
 * body. A record the app draws opens inside Talk (a chevron); one on
 * opax.com.au, or an Ask pay row, waits for the call to end (↗). The sheet
 * closes first, and the Talk screen opens the choice, so an alert never
 * appears under the sheet.
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
            const ask = askDraftDestination(source.path) !== null;
            const meta = sourceMeta(source);
            const title = sourceHeading(source);
            const speaker = sourceSpeaker(source);
            const metadata = (
              <Text wordSafe variant="secondary" style={styles.meta}>
                {meta}
              </Text>
            );
            return (
              <LinkRow
                key={source.path}
                title={title}
                {...(Platform.OS === 'android'
                  ? { aboveTitle: metadata }
                  : { leading: metadata })}
                secondary={
                  speaker ? (
                    <Text
                      wordSafe
                      variant="secondary"
                      testID={`talk-source-${index}-speaker`}
                    >
                      {speaker}
                    </Text>
                  ) : undefined
                }
                external={!native}
                testID={`talk-source-${index}`}
                accessibilityLabel={[meta, title, speaker]
                  .filter(Boolean)
                  .join(', ')}
                accessibilityHint={
                  native
                    ? talk.active
                      ? 'Opens the record within the call'
                      : 'Opens the record'
                    : ask
                      ? talk.active
                        ? 'Opens in Ask after the call'
                        : 'Opens in Ask'
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
