import { router } from 'expo-router';
import { useRef, useState, type ReactNode, type Ref } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { openOnWeb, openSource } from '../navigation/external';
import { useAccessibilitySize, useReduceMotion } from './accessibility';
import { formatDate, savedText, type DateInput } from './format';
import { Icon, type SFSymbol } from './icon';
import { useKeyCommand } from './keyboard';
import { Heading, Text } from './text';
import { colors, hairline, minimumTarget, radii, rhythm } from './tokens';

/** One original record or register behind a block. */
export interface SourceOriginal {
  /** Who holds it: "They Vote For You", "AusTender register". */
  label: string;
  /** An https source, or an OPAX web path ("/subject/person/…"). */
  url: string;
  /** What the record is: "division, 19 Aug 2026", "record CN3407266". */
  record?: string;
}

/** A state the block is drawn in, said after the source. */
export type SourceState = 'partial' | 'saved' | 'offline';
const stateWords: Record<SourceState, string> = {
  partial: 'partial',
  saved: 'saved copy',
  offline: 'offline',
};

/** Everything one block's source sheet says. */
export interface SourceDetails {
  /** The source file's own date: meta.as_of, generated_at. */
  asOf?: DateInput | null;
  /**
   * Who holds the record: one name, or several. The line shows the first
   * ("and 2 more"); the sheet lists them all. (`source` is reserved for
   * image sources.)
   */
  citation?: string | readonly string[];
  /** Coverage after the date: "Divisions to 25 Sep 2026". */
  coverage?: string | null;
  /** The content is a saved copy that could not be refreshed. */
  savedAt?: DateInput | null;
  state?: SourceState | null;
  /** The original records; each opens from the sheet. */
  originals?: readonly SourceOriginal[];
  /** Methodology and caveats, one paragraph each, shown in full. */
  notes?: readonly (string | null | undefined | false)[];
  /** "CC BY 4.0"; Sources and licences has every licence in full. */
  licence?: string | null;
  /** Anything else the sheet carries below the notes. */
  extra?: ReactNode;
  /**
   * Replaces the line's "Updated 4 Oct 2026" part; null leaves it out where
   * the coverage dates the block ("Divisions to 25 Sep 2026").
   */
  dateLabel?: string | null;
}

const citations = (citation: SourceDetails['citation']) =>
  (typeof citation === 'string' ? [citation] : (citation ?? [])).filter(
    (name): name is string => !!name?.trim(),
  );
/** "Updated 4 Oct 2026", a year-only date as "Updated 2021". */
export function updatedText(asOf: DateInput | null | undefined): string | null {
  if (asOf == null) return null;
  if (typeof asOf === 'string' && /^\d{4}$/.test(asOf))
    return `Updated ${asOf}`;
  const date = formatDate(asOf, 'short');
  return date ? `Updated ${date}` : null;
}

/**
 * What the line says, in parts: the date (or "Date not published"), the
 * source's name, then the coverage and the state. The source is a separate
 * part so it can take the link colour.
 */
export function sourceLineParts({
  asOf,
  citation,
  coverage,
  savedAt,
  state,
  dateLabel,
}: SourceDetails): {
  date: string | null;
  name: string | null;
  rest: string[];
} {
  const names = citations(citation);
  const name = names.length
    ? names.length === 1
      ? names[0]!
      : `${names[0]} and ${names.length - 1} more`
    : null;
  const shownState = state ?? (savedAt != null ? 'saved' : null);
  const saved = savedAt != null ? formatDate(savedAt, 'short') : '';
  const rest = [
    coverage || null,
    shownState
      ? shownState === 'saved' && saved
        ? `Saved ${saved}`
        : stateWords[shownState]
      : null,
  ].filter((part): part is string => !!part);
  // Every block stays dated: an undated source says so.
  const date =
    dateLabel !== undefined
      ? dateLabel
      : (updatedText(asOf) ?? 'Date not published');
  return { date, name, rest };
}

/**
 * One source line at the foot of a block: a document glyph, the date and the
 * source's name in bronze ink, and a state when there is one ("Updated 4 Oct
 * 2026 · AEC annual returns · saved copy"). Tapping it opens the source
 * sheet: the original records, the as-at date and coverage, the notes and
 * caveats, and the licence, with Sources and licences one row further. It
 * replaces a block's separate as-at line, "View original", ⓘ and caveat
 * paragraphs: every figure stays dated and one tap from its source.
 *
 * 32pt drawn, 44pt to touch (48 on Android); the column's full width at
 * accessibility sizes, so its word-safe text has a fixed frame. VoiceOver
 * hears the line as drawn ("Updated 4 Oct 2026, AEC annual returns") and
 * that it opens the sources.
 */
export function SourceLine({
  title = 'Sources and notes',
  label,
  accessibilityLabel,
  onPress,
  testID,
  ...details
}: SourceDetails & {
  /** The sheet's title. */
  title?: string;
  /** Replaces the drawn text: "View original". */
  label?: string;
  /** Replaces the spoken line where a screen's journeys read a sentence. */
  accessibilityLabel?: string;
  /** Replaces opening the sheet (a single original opens directly). */
  onPress?: () => void;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const parts = sourceLineParts(details);
  const visible = label
    ? { date: null, name: label, rest: [] as string[] }
    : parts;
  const spoken = [visible.date, visible.name, ...visible.rest]
    .filter(Boolean)
    .join(', ');
  return (
    <>
      <SourceAffordance
        glyph={label ? 'arrow.up.right.square' : 'doc.text'}
        date={visible.date}
        name={visible.name}
        rest={visible.rest}
        accessibilityLabel={accessibilityLabel ?? spoken}
        accessibilityHint={
          onPress ? 'Opens the source' : 'Opens the sources, notes and licence'
        }
        accessibilityRole={onPress ? 'link' : 'button'}
        onPress={onPress ?? (() => setOpen(true))}
        testID={testID}
      />
      {onPress ? null : (
        <SourceSheet
          visible={open}
          onClose={() => setOpen(false)}
          title={title}
          testID={testID ? `${testID}-sheet` : undefined}
          {...details}
        />
      )}
    </>
  );
}

/**
 * The drawn source line, shared by SourceLine and the provenance adapters
 * (SourceLink, ViewOriginal): one anatomy for every way into a source.
 */
export function SourceAffordance({
  glyph,
  date,
  name,
  rest = [],
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  onPress,
  testID,
  ref,
}: {
  glyph: SFSymbol;
  date?: string | null;
  /** The source's name (or "View original"), in the link colour. */
  name?: string | null;
  rest?: readonly string[];
  accessibilityLabel: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'link';
  onPress: () => void;
  testID?: string;
  ref?: Ref<View>;
}) {
  // A hugging line's width follows its text, so word-safe sizing could chase
  // its own frame. At accessibility sizes it takes the column's full width.
  const fixed = useAccessibilitySize();
  return (
    <Pressable
      ref={ref}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
      hitSlop={Platform.OS === 'android' ? 0 : { top: 6, bottom: 6 }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.line,
        fixed ? styles.fixed : styles.hug,
        pressed ? styles.pressed : null,
      ]}
    >
      {({ pressed }) => (
        <>
          <View style={styles.glyph}>
            <Icon name={glyph} size={14} tone="bronzeInk" />
          </View>
          <Text
            wordSafe={fixed}
            variant="fine"
            // A bare name ("View original") is one run in the link colour.
            tone={name && !date && !rest.length ? 'bronzeInk' : undefined}
            accessible={false}
            style={[
              styles.shrink,
              pressed && name && !date && !rest.length
                ? styles.underline
                : null,
            ]}
          >
            {lineChildren(date, name, rest, pressed)}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * The line's text runs: plain strings where there is no name (so the text is
 * one string), the name as its own run in the link colour otherwise.
 */
function lineChildren(
  date: string | null | undefined,
  name: string | null | undefined,
  rest: readonly string[],
  pressed: boolean,
): ReactNode {
  if (!name) return [date, ...rest].filter(Boolean).join(' · ');
  if (!date && !rest.length) return name;
  return [
    date ? `${date} · ` : '',
    <Text
      key="name"
      variant="fine"
      tone="bronzeInk"
      style={pressed ? styles.underline : null}
    >
      {name}
    </Text>,
    rest.length ? ` · ${rest.join(' · ')}` : '',
  ];
}

/**
 * The source sheet: a native page sheet with a Done button. Original
 * records first (each opens the record), then the as-at date and coverage,
 * the sources, the notes and caveats in full, the licence, and a row to
 * Sources and licences. With notes alone it is the notes sheet (ⓘ).
 */
export function SourceSheet({
  visible,
  onClose,
  title,
  testID,
  ...details
}: SourceDetails & {
  visible: boolean;
  onClose: () => void;
  title: string;
  testID?: string;
}) {
  const reduced = useReduceMotion();
  // An original opens once the sheet has gone, so a native route or the
  // browser never lands behind it.
  const pending = useRef<(() => void) | null>(null);
  const after = (action: () => void) => {
    if (Platform.OS === 'ios') pending.current = action;
    onClose();
    if (Platform.OS !== 'ios') action();
  };
  useKeyCommand('list-escape', onClose, visible);
  return (
    <Modal
      visible={visible}
      animationType={reduced ? 'none' : 'slide'}
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={() => {
        const action = pending.current;
        pending.current = null;
        action?.();
      }}
    >
      <SheetBody title={title} onClose={onClose} testID={testID}>
        <SourceDetailsBody details={details} after={after} testID={testID} />
      </SheetBody>
    </Modal>
  );
}

function SourceDetailsBody({
  details,
  after,
  testID,
}: {
  details: SourceDetails;
  after: (action: () => void) => void;
  testID?: string;
}) {
  const { asOf, coverage, savedAt, originals, notes, licence, extra } = details;
  const names = citations(details.citation);
  const usable = (originals ?? []).filter(
    (s, i, all) =>
      (s.url.startsWith('https://') || s.url.startsWith('/')) &&
      all.findIndex((o) => o.url === s.url) === i,
  );
  const shownNotes = (notes ?? []).filter((note): note is string => !!note);
  // A year-only date (Census vintages) is said as a year.
  const year = typeof asOf === 'string' && /^\d{4}$/.test(asOf) ? asOf : null;
  const date = year ?? (asOf == null ? '' : formatDate(asOf));
  const dated = !!date || !!coverage || savedAt != null;
  const provenance =
    dated || names.length > 0 || usable.length > 0 || !!licence;
  return (
    <>
      {usable.length ? (
        <View style={styles.group}>
          <Heading level={3}>Original records</Heading>
          {usable.map((original, index) => (
            <OriginalRow
              key={original.url}
              original={original}
              onOpen={() =>
                after(() =>
                  original.url.startsWith('/')
                    ? void openOnWeb(original.url, original.label)
                    : void openSource(
                        original.url,
                        original.record
                          ? `${original.label} · ${original.record}`
                          : original.label,
                      ),
                )
              }
              testID={testID ? `${testID}-original-${index}` : undefined}
            />
          ))}
        </View>
      ) : null}
      {dated ? (
        <View style={styles.group}>
          <Heading level={3}>As at</Heading>
          <Text wordSafe variant="body">
            {date ? `As at ${date}` : 'Date not published'}
          </Text>
          {coverage ? (
            <Text wordSafe variant="metadata">
              {coverage}
            </Text>
          ) : null}
          {savedAt != null ? (
            <Text wordSafe variant="metadata">
              {savedText(savedAt)}
            </Text>
          ) : null}
        </View>
      ) : null}
      {names.length ? (
        <View style={styles.group}>
          <Heading level={3}>
            {names.length === 1 ? 'Source' : 'Sources'}
          </Heading>
          {names.map((name) => (
            <Text key={name} wordSafe variant="body">
              {name}
            </Text>
          ))}
        </View>
      ) : null}
      {shownNotes.length ? (
        <View style={[styles.group, styles.notes]}>
          {provenance ? <Heading level={3}>Notes</Heading> : null}
          {shownNotes.map((note, index) => (
            <Text key={index} wordSafe variant="body">
              {note}
            </Text>
          ))}
        </View>
      ) : null}
      {licence ? (
        <View style={styles.group}>
          <Heading level={3}>Licence</Heading>
          <Text wordSafe variant="body">
            {licence}
          </Text>
        </View>
      ) : null}
      {extra}
      {provenance ? (
        <OriginalRow
          original={{ label: 'Sources and licences', url: '' }}
          internal
          onOpen={() => after(() => router.push('/account/sources'))}
          testID={testID ? `${testID}-licences` : undefined}
        />
      ) : null}
    </>
  );
}

function OriginalRow({
  original,
  onOpen,
  internal = false,
  testID,
}: {
  original: SourceOriginal;
  onOpen: () => void;
  internal?: boolean;
  testID?: string;
}) {
  const stacked = useAccessibilitySize();
  return (
    <Pressable
      accessibilityRole={internal ? 'button' : 'link'}
      accessibilityLabel={[
        internal ? null : 'View original',
        original.label,
        original.record,
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={internal ? undefined : 'Opens the source'}
      testID={testID}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.row,
        stacked ? styles.rowStacked : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.rowText}>
        <Text wordSafe variant="strong" tone={internal ? 'ink' : 'bronzeInk'}>
          {original.label}
        </Text>
        {original.record ? (
          <Text wordSafe variant="metadata">
            {original.record}
          </Text>
        ) : null}
      </View>
      <Icon
        name={internal ? 'chevron.right' : 'arrow.up.right.square'}
        size={internal ? 13 : 16}
        tone={internal ? 'inkSoft' : 'bronzeInk'}
      />
    </Pressable>
  );
}

/** A page sheet's bar (grab handle, title, Done) over its scrolling body. */
export function SheetBody({
  title,
  onClose,
  testID,
  children,
}: {
  title: string;
  onClose: () => void;
  testID?: string;
  children: ReactNode;
}) {
  // A page sheet sits below the status bar; only the home indicator needs
  // room, so no inset provider (a modal would need its own).
  const Container = Platform.OS === 'android' ? SafeAreaView : View;
  return (
    <Container style={styles.sheet} testID={testID} accessibilityViewIsModal>
      <View style={styles.bar}>
        <View style={styles.grab} />
        <View style={styles.head}>
          <Heading level={2} style={styles.title}>
            {title}
          </Heading>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Done"
            testID={testID ? `${testID}-done` : undefined}
            onPress={onClose}
            hitSlop={8}
            style={styles.done}
          >
            <Text variant="control" tone="navy">
              Done
            </Text>
          </Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
    </Container>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.line + 2,
    minHeight: Platform.OS === 'android' ? minimumTarget : 32,
    paddingHorizontal: rhythm.line,
    marginHorizontal: -rhythm.line,
    borderRadius: radii.sm,
  },
  hug: { alignSelf: 'flex-start', maxWidth: '100%' },
  // The column's full width, whatever row the line sits in.
  fixed: { alignSelf: 'stretch', width: '100%' },
  // The glyph sits on the first line's centre when the text wraps.
  glyph: { alignSelf: 'flex-start', paddingTop: 2 },
  shrink: { flexShrink: 1 },
  underline: { textDecorationLine: 'underline' },
  pressed: { backgroundColor: colors.sunken },
  group: { gap: rhythm.tight },
  notes: { gap: rhythm.block },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.heading,
    minHeight: minimumTarget,
    paddingVertical: 6,
    borderTopWidth: hairline,
    borderTopColor: colors.dividerSubtle,
  },
  rowStacked: { alignItems: 'flex-start' },
  rowText: { flex: 1, gap: 2 },
  sheet: { flex: 1, backgroundColor: colors.paper },
  bar: {
    paddingHorizontal: rhythm.screen,
    paddingTop: rhythm.tight,
    paddingBottom: rhythm.heading,
    borderBottomWidth: hairline,
    borderBottomColor: colors.dividerSubtle,
  },
  grab: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.dividerDefault,
    marginBottom: rhythm.heading,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: rhythm.block },
  title: { flex: 1 },
  done: {
    minHeight: minimumTarget,
    minWidth: minimumTarget,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  content: {
    paddingHorizontal: rhythm.screen,
    paddingTop: rhythm.block,
    // The home indicator plus a section's breath.
    paddingBottom: 34 + rhythm.section,
    gap: rhythm.group,
  },
});
