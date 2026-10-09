import { useRef } from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';
import {
  Group,
  Heading,
  LinkRow,
  RowList,
  SourceLine,
  Text,
} from '../../design/primitives';
import { SheetBody } from '../../design/source';
import { useReduceMotion } from '../../design/accessibility';
import { useKeyCommand } from '../../design/keyboard';
import { formatDate } from '../../design/format';
import { rhythm } from '../../design/tokens';
import { openOnWeb, openSource } from '../../navigation/external';
import {
  dateRuler,
  parliaments,
  sourceGroups,
  sourcePassage,
  type Source,
} from './model';

/** "Don Farrell · Labor · Federal · 6 Mar 2023". */
export function sourceMeta(s: Source) {
  return [
    s.speaker,
    s.party,
    s.state ? parliaments[s.state] || '' : '',
    s.date ? formatDate(s.date, 'short') : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * An answer's sources, behind its one source line: the records it cites,
 * numbered as in the answer, each with the passage the answer drew on and
 * its original; what was retrieved but not cited; the dates in the record;
 * and the notes about the answer. Records and originals open once the sheet
 * has gone, so nothing lands behind it.
 */
export function AnswerSources({
  question,
  sources,
  notes,
  viewed,
  onOpen,
  onClose,
}: {
  question: string;
  sources: Source[];
  notes: readonly (string | null | undefined | false)[];
  /** "Viewed 10 Oct 2026". */
  viewed: string;
  /** Opens a record (in the iPad sources pane, or as on the phone). */
  onOpen: (href: string, title: string) => void;
  onClose: () => void;
}) {
  const reduced = useReduceMotion();
  const pending = useRef<(() => void) | null>(null);
  const after = (action: () => void) => {
    if (Platform.OS === 'ios') pending.current = action;
    onClose();
    if (Platform.OS !== 'ios') action();
  };
  useKeyCommand('list-escape', onClose, true);
  const groups = sourceGroups(sources);
  const cited = groups.cited.some((s) => s.cited);
  const dates = dateRuler(sources);
  const shownNotes = notes.filter((note): note is string => !!note);
  const item = (s: Source, n?: number) => (
    <Group key={s.resource} gap={rhythm.tight}>
      <LinkRow
        title={`${n ? `${n}. ` : ''}${s.title}`}
        detail={sourceMeta(s) || undefined}
        onPress={() => after(() => onOpen(s.href, s.title))}
        testID={n ? `ask-source-${n}` : undefined}
      />
      {s.snippet ? (
        <Text wordSafe selectable variant="record">
          {sourcePassage(s.snippet)}
        </Text>
      ) : null}
      {s.url && (s.url.startsWith('https://') || s.url.startsWith('/')) ? (
        <SourceLine
          label="View original"
          accessibilityLabel={`View original: ${s.title}`}
          onPress={() =>
            after(() =>
              s.url!.startsWith('/')
                ? void openOnWeb(s.url!, s.title)
                : void openSource(s.url!, s.title),
            )
          }
        />
      ) : null}
    </Group>
  );
  return (
    <Modal
      visible
      animationType={reduced ? 'none' : 'slide'}
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={() => {
        const action = pending.current;
        pending.current = null;
        action?.();
      }}
    >
      <SheetBody
        title="Sources"
        onClose={onClose}
        testID="ask-answer-sources-sheet"
      >
        <View style={styles.group}>
          <Text wordSafe variant="metadata" testID="ask-sources-sheet-question">
            {question}
          </Text>
          <Text wordSafe variant="fine">
            {viewed}
          </Text>
        </View>
        {groups.cited.length ? (
          <View style={styles.group} testID="ask-sources">
            <Heading level={3}>
              {cited ? 'Cited in the answer' : 'Retrieved records'}
            </Heading>
            <RowList>
              {groups.cited.map((s, i) => item(s, cited ? i + 1 : undefined))}
            </RowList>
          </View>
        ) : (
          <Text wordSafe variant="metadata">
            No records were retrieved for this answer.
          </Text>
        )}
        {groups.also.length ? (
          <View style={styles.group} testID="ask-also">
            <Heading level={3}>Also retrieved, not cited</Heading>
            <RowList>{groups.also.map((s) => item(s))}</RowList>
          </View>
        ) : null}
        {dates.length > 1 ? (
          <View style={styles.group} testID="ask-date-ruler">
            <Heading level={3}>Dates in the record</Heading>
            <RowList>
              {dates.map((s) => (
                <LinkRow
                  key={s.resource}
                  title={s.title}
                  detail={`${formatDate(s.date!, 'short')} · ${s.cited ? 'Cited' : 'Retrieved'}`}
                  onPress={() => after(() => onOpen(s.href, s.title))}
                />
              ))}
            </RowList>
          </View>
        ) : null}
        {shownNotes.length ? (
          <View style={styles.notes} testID="ask-answer-notes">
            <Heading level={3}>About this answer</Heading>
            {shownNotes.map((note, i) => (
              <Text key={i} wordSafe>
                {note}
              </Text>
            ))}
          </View>
        ) : null}
      </SheetBody>
    </Modal>
  );
}

const styles = StyleSheet.create({
  group: { gap: rhythm.tight },
  notes: { gap: rhythm.block },
});
