import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { NativeStackNavigationOptions } from 'expo-router';
import { ContentUnavailable, Text } from '../../design/primitives';
import { EXTERNAL_GLYPH, Icon } from '../../design/icon';
import { useRowHighlight } from '../../design/row-padding';
import { useListSearchBar } from '../../design/search-bar';
import { symbols } from '../../design/symbols';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import { opaqueBar } from '../../navigation/chrome';
import { openSource } from '../../navigation/external';

export const sourcesCopy = {
  title: 'Sources and licences',
  datasets: 'Datasets',
  portraits: 'Portraits',
  photos: 'Time machine photographs',
  fonts: 'Fonts',
  searchDatasets: 'Datasets and publishers',
  searchPortraits: 'Name or photographer',
  searchPhotos: 'Year, caption or photographer',
  licence: 'Licence',
  originals: 'Originals',
  licenceAndCopyright: 'Licence and copyright',
  allDatasets: 'All datasets',
  missingTitle: 'This dataset isn’t listed',
  missingBody: 'It may have been renamed or removed.',
  partial: 'Some details for this dataset couldn’t be loaded.',
  loadingTerms: 'Loading licence terms',
  loadingMore: 'Loading more datasets',
  loadingPortraits: 'Loading portrait credits',
  loadingPhotos: 'Loading photo credits',
  portraitsError: 'Portrait credits couldn’t be loaded.',
  photosError: 'Photo credits couldn’t be loaded.',
  fontsError: 'The font licences couldn’t be read.',
  fontLicence: 'SIL Open Font License 1.1',
  fontText: 'Licence text',
  androidFont: 'Used in the Android app.',
  noResults: (query: string) => `No results for “${query}”`,
  tryName: 'Check the spelling or try another name.',
  tryPublisher: 'Check the spelling or try another publisher.',
} as const;

/** A plain reference list on paper, so its bar matches its ground. */
export const paperBar: NativeStackNavigationOptions = opaqueBar(colors.paper);

/** Words in any order, ignoring case: "act legislative" finds both. */
export function matches(
  query: string,
  fields: readonly (string | undefined)[],
) {
  const words = query.toLocaleLowerCase('en-AU').split(/\s+/).filter(Boolean);
  const haystack = fields.filter(Boolean).join(' ').toLocaleLowerCase('en-AU');
  return words.every((word) => haystack.includes(word));
}

/**
 * The native bar search field for a long list (no drawn field, no visible
 * label), hidden as the list scrolls, as account.md 4.3 and 4.5 ask.
 */
export function useBarSearch(placeholder: string) {
  const [query, setQuery] = useState('');
  const bar = useListSearchBar({
    placeholder,
    onChangeText: setQuery,
    onSearchButtonPress: setQuery,
    onCancelButtonPress: () => setQuery(''),
  });
  const options = useMemo(() => ({ ...bar, hideWhenScrolling: true }), [bar]);
  return { query: query.trim(), setQuery, options };
}

/** The system's search empty state: no "0 of N". */
export function NoResults({
  query,
  body,
  testID,
}: {
  query: string;
  body: string;
  testID?: string;
}) {
  return (
    <ContentUnavailable
      symbol={symbols.search}
      title={sourcesCopy.noResults(query)}
      body={body}
      testID={testID}
    />
  );
}

/**
 * One credit: the name or caption, the credit line and, when there is one,
 * the attribution. A credit with its own source page opens it in the in-app
 * browser and shows the external glyph; an official portrait is text only.
 */
export function CreditRow({
  title,
  detail,
  note,
  url,
  label,
  testID,
}: {
  title: string;
  detail: string;
  note?: string | null;
  url?: string | null;
  label?: string;
  testID?: string;
}) {
  const highlight = useRowHighlight();
  const body = (
    <>
      <View style={styles.text}>
        <Text wordSafe variant="body">
          {title}
        </Text>
        <Text wordSafe variant="secondary">
          {detail}
        </Text>
        {note ? (
          <Text wordSafe variant="footnote">
            {note}
          </Text>
        ) : null}
      </View>
      {url ? (
        <Icon name={EXTERNAL_GLYPH} size={13} maxScale={1.5} tone="inkSoft" />
      ) : null}
    </>
  );
  const spoken = [title, detail, note].filter(Boolean).join(', ');
  return url ? (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={spoken}
      accessibilityHint="Opens the photo’s source and licence"
      onPress={() => void openSource(url, label ?? title)}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: highlight } : null,
      ]}
    >
      {body}
    </Pressable>
  ) : (
    <View
      accessible
      accessibilityLabel={spoken}
      testID={testID}
      style={styles.row}
    >
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: minimumTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    paddingVertical: rhythm.row,
  },
  text: { flex: 1, gap: rhythm.line },
});
