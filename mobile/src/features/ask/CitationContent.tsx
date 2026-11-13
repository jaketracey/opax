import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  View,
  findNodeHandle,
} from 'react-native';
import { router } from 'expo-router';
import { CitationBadge } from '../../design/citation-mark';
import { InsetGroup } from '../../design/layout';
import { LinkRow } from '../../design/rows';
import { SourceAffordance } from '../../design/source';
import { Text } from '../../design/text';
import { colors, radii, rhythm } from '../../design/tokens';
import { personRoute } from '../../navigation/routes';
import type { SourcePlacement } from '../../analytics/events';
import { openSource } from '../../navigation/external';
import type { Source } from './model';
import { sourcePassage } from './model';
import type { AskPerson } from './people';
import {
  personName,
  sourceDate,
  sourceMeta,
  sourceTitle,
} from './source-present';

export const citationCopy = {
  previous: 'Previous source',
  next: 'Next source',
  openRecord: 'Open record',
  passage: 'Cited passage',
  noPassage: 'This record has no passage to show.',
} as const;
/** Case, spacing and punctuation folded, so a passage can be compared with a title. */
function folded(text: string) {
  return text
    .toLocaleLowerCase('en-AU')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
/**
 * The passage to draw, or null when there is none or it only repeats the
 * title (cleaned or as stored): a wash holding the heading again says nothing.
 */
export function citationPassage(source: Source): string | null {
  const passage = sourcePassage(source.snippet);
  if (!passage) return null;
  const text = folded(passage);
  if (!text) return null;
  return text === folded(sourceTitle(source)) || text === folded(source.title)
    ? null
    : passage;
}
/** The original's site, for the record's source line ("ParlInfo"). */
export function originName(url: string | undefined): string | null {
  if (!url?.startsWith('https://')) return null;
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (host.endsWith('aph.gov.au')) return 'ParlInfo';
  if (host.endsWith('legislation.gov.au'))
    return 'Federal Register of Legislation';
  if (host.endsWith('aec.gov.au')) return 'AEC';
  if (host.endsWith('tenders.gov.au')) return 'AusTender';
  if (host.endsWith('grants.gov.au')) return 'GrantConnect';
  return host;
}

/**
 * One cited source in the `/citation` anatomy (journeys/ask.md 4.6): the
 * numeral and title, one meta line with the speaker as a link, the whole
 * cited passage on a wash (the Worker sends no sentence span yet, so none is
 * picked inside it), Open record, then the record's own source line. Shared
 * by the sheet and the iPad pane.
 */
export function CitationContent({
  record: source,
  n,
  profiles,
  onOpenRecord,
  onOpenPerson,
  focusKey,
  placement = 'inline',
}: {
  record: Source;
  n: number;
  profiles?: Map<string, AskPerson>;
  onOpenRecord?: () => void;
  onOpenPerson?: (person: AskPerson) => void;
  /** Changes on re-targeting, so VoiceOver focus moves to the new title. */
  focusKey?: string;
  /** Where the citation is shown, for analytics: the answer or the pane. */
  placement?: SourcePlacement;
}) {
  const title = sourceTitle(source);
  const meta = sourceMeta(source);
  const speaker = source.speaker ? personName(source.speaker) : null;
  const person = source.speaker
    ? (profiles?.get(source.speaker) ?? profiles?.get(speaker ?? ''))
    : undefined;
  const passage = citationPassage(source);
  const origin = originName(source.url);
  const heading = useRef<View>(null);
  useEffect(() => {
    const node = heading.current && findNodeHandle(heading.current);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, [focusKey]);
  return (
    <View style={styles.content}>
      <View
        ref={heading}
        style={styles.title}
        accessible
        accessibilityRole="header"
        accessibilityLabel={`Source ${n}, ${title}`}
      >
        <CitationBadge label={String(n)} />
        <Text
          wordSafe
          variant="recordHeading"
          style={styles.grow}
          testID="citation-title"
        >
          {title}
        </Text>
      </View>
      <Text wordSafe variant="secondary" testID="citation-meta">
        {meta}
        {speaker ? (
          <>
            {' · '}
            {person ? (
              <Text
                variant="secondary"
                tone="navy"
                accessibilityRole="link"
                accessibilityLabel={`Open ${person.name}`}
                onPress={() =>
                  onOpenPerson
                    ? onOpenPerson(person)
                    : router.push(personRoute(person.slug))
                }
                testID="citation-speaker"
              >
                {speaker}
              </Text>
            ) : (
              speaker
            )}
          </>
        ) : null}
      </Text>
      {passage ? (
        <View
          style={styles.passage}
          accessible
          accessibilityLabel={`${citationCopy.passage}, ${passage}`}
          testID="citation-passage"
        >
          <Text wordSafe selectable variant="recordText">
            {passage}
          </Text>
        </View>
      ) : (
        <Text wordSafe variant="secondary" testID="citation-no-passage">
          {citationCopy.noPassage}
        </Text>
      )}
      {onOpenRecord ? (
        <InsetGroup>
          <LinkRow
            title={citationCopy.openRecord}
            onPress={onOpenRecord}
            testID="citation-open-record"
          />
        </InsetGroup>
      ) : null}
      {origin && source.url ? (
        <SourceAffordance
          glyph="doc.text"
          date={sourceDate(source)}
          name={origin}
          accessibilityRole="link"
          accessibilityLabel={`Original: ${origin}${sourceDate(source) ? `, ${sourceDate(source)}` : ''}`}
          accessibilityHint="Opens the original"
          onPress={() => void openSource(source.url!, title, placement)}
          testID="citation-open"
        />
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  content: { gap: rhythm.block },
  title: { flexDirection: 'row', alignItems: 'flex-start', gap: rhythm.tight },
  grow: { flex: 1 },
  passage: {
    backgroundColor: colors.navyWash,
    borderRadius: radii.container,
    borderCurve: 'continuous',
    padding: rhythm.block,
  },
});
