import { useState } from 'react';
import { TextInput, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { catalogs } from '../api/runtime';
import type { SearchPage } from '../api/catalogs';
import type { RecordResult } from '../api/client';
import { Button, Divider, Group, Screen, Text } from '../design/primitives';
import { colors, fonts, radius, spacing } from '../design/tokens';
import { personRoute } from '../navigation/routes';
export default function Search() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<RecordResult<SearchPage> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function search() {
    if (!query.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await catalogs.search(query.trim(), 'person'));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'The directory could not be loaded. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Search" testID="search-screen">
      <Text>
        The full search screen is not built yet. This directory searches people
        in the public parliamentary record.
      </Text>
      <Group>
        <Text accessibilityRole="header">Find a parliamentarian</Text>
        <TextInput
          testID="search-input"
          accessibilityLabel="Find a parliamentarian"
          allowFontScaling
          maxFontSizeMultiplier={0}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          returnKeyType="search"
          autoCorrect={false}
          style={styles.input}
        />
        <Button
          label={busy ? 'Searching' : 'Search people'}
          variant="primary"
          testID="search-submit"
          onPress={search}
          disabled={busy || !query.trim()}
        />
      </Group>
      {error ? (
        <Text accessibilityRole="alert" testID="search-error">
          {error}
        </Text>
      ) : null}
      {result ? (
        <Group>
          <Text variant="fine" testID="search-cache-state">
            {result.stale
              ? `Offline · Saved ${date(result.savedAt)}`
              : 'Public catalog results'}
          </Text>
          {result.data.results.length === 0 ? (
            <Text testID="search-empty">
              No people found in the available directory.
            </Text>
          ) : (
            result.data.results
              .filter((row) => row.kind === 'person')
              .map((row) => (
                <Group key={row.slug}>
                  <Divider subtle />
                  <Pressable
                    testID={`search-result-${row.personSlug ?? row.slug}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${row.title}`}
                    disabled={!row.personSlug}
                    accessibilityState={{ disabled: !row.personSlug }}
                    onPress={() => {
                      if (row.personSlug)
                        router.push(personRoute(row.personSlug));
                    }}
                    style={styles.result}
                  >
                    <Text variant="heading">{row.title}</Text>
                    <Text variant="metadata">{row.snippet}</Text>
                  </Pressable>
                </Group>
              ))
          )}
        </Group>
      ) : null}
    </Screen>
  );
}
export const date = (value: number | string) =>
  new Date(value).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
const styles = StyleSheet.create({
  input: {
    borderColor: colors.lineStrong,
    borderWidth: 1,
    borderRadius: radius,
    minHeight: 48,
    padding: spacing.s3,
    fontSize: 17,
    fontFamily: fonts.sans,
    color: colors.ink,
    backgroundColor: colors.raised,
  },
  result: { minHeight: 44, paddingVertical: spacing.s3, gap: spacing.s3 },
});
