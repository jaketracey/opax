import { Text as NativeText, StyleSheet } from 'react-native';
import { Text } from '../../design/primitives';
import { colors } from '../../design/tokens';
import { passageText, serverPassage } from '../../api/passage-text';

/** A Worker document row (32-hex resource id) carries a normalized
 * /api/search snippet; a catalog row's snippet is raw published text. */
export const isWorkerSnippet = (resource: string | null | undefined) =>
  /^[a-f0-9]{32}$/.test(resource ?? '');

/** The longest passage a result draws; the whole record is the row's link. */
export const PASSAGE_MAX = 280;

/**
 * The words that matched, in the order they appear, as the web marks them
 * (app.js highlightHTML): a quoted phrase whole, otherwise each query word of
 * three letters or more, case-insensitively and at the start of a word
 * ("housing" marks "Housing" and "housings", never "rehousing").
 */
export function highlightParts(text: string, query: string | undefined) {
  const q = (query ?? '').toLowerCase();
  const phrases = [...q.matchAll(/["“]([^"”]{2,})["”]/g)].map((m) =>
    m[1]!.trim(),
  );
  const words = [
    ...new Set(
      phrases.length
        ? phrases
        : q.split(/[^\p{L}\p{N}']+/u).filter((word) => word.length >= 3),
    ),
  ];
  if (!words.length) return [{ text, match: false }];
  const escaped = words
    .sort((a, b) => b.length - a.length)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${escaped.join('|')})[\\p{L}\\p{N}]*`,
    'giu',
  );
  const parts: { text: string; match: boolean }[] = [];
  let last = 0;
  for (const found of text.matchAll(pattern)) {
    if (found.index > last)
      parts.push({ text: text.slice(last, found.index), match: false });
    parts.push({ text: found[0], match: true });
    last = found.index + found[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false });
  return parts;
}

/**
 * A result's passage: the record's own words in the serif, cut on a word
 * with an ellipsis after about three lines, with the searched words marked.
 * The whole record is one tap away on the row, so there is no disclosure
 * under each result.
 */
export function Excerpt({
  snippet: raw,
  resource,
  query,
  prefix,
  testID,
}: {
  snippet: string;
  resource?: string | null;
  /** The search, whose words are marked in the passage. */
  query?: string;
  /** Said before the passage ("From the record") where briefs sit beside it. */
  prefix?: string;
  testID?: string;
}) {
  const snippet = isWorkerSnippet(resource)
    ? serverPassage(raw, { max: PASSAGE_MAX })
    : passageText(raw, { max: PASSAGE_MAX });
  if (!snippet) return null;
  const parts = highlightParts(snippet, query);
  return (
    <Text
      wordSafe
      variant="record"
      testID={testID}
      accessibilityLabel={prefix ? `${prefix}: ${snippet}` : undefined}
    >
      {parts.length === 1 && !parts[0]!.match
        ? snippet
        : parts.map((part, index) =>
            part.match ? (
              <NativeText key={index} style={styles.match}>
                {part.text}
              </NativeText>
            ) : (
              part.text
            ),
          )}
    </Text>
  );
}

const styles = StyleSheet.create({
  // The search highlight: bronze wash behind the record's own ink.
  match: { backgroundColor: colors.bronzeWash },
});
