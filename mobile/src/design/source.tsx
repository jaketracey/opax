import { Pressable } from './pressable';
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
} from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { presentSource } from '../navigation/sheets';
import { useAccessibilitySize } from './accessibility';
import {
  calendarDate,
  formatDate,
  sourceName,
  unbroken,
  type DateInput,
} from './format';
import { EXTERNAL_GLYPH, Icon, type SFSymbol } from './icon';
import { useRowHighlight } from './row-padding';
import { Text } from './text';
import {
  colors,
  hairline,
  minimumTarget,
  radii,
  rhythm,
  textStyles,
} from './tokens';

/** One original record or register behind a block. */
export interface SourceOriginal {
  /** Who holds it: "They Vote For You", "AusTender register". */
  label: string;
  /** An https source, or an OPAX web path ("/subject/person/…"). */
  url: string;
  /** What the record is: "division, 19 Aug 2026", "record CN3407266". */
  record?: string;
  /** This original's own as-at date, said in the sheet beside it. */
  asOf?: DateInput | null;
}

/**
 * One source a block cites, where the caller knows more than its name: the
 * line's short label, the sheet's full title, and its own as-at date when
 * sources differ ("Hansard · 6 Mar 2023"). A plain string is read with
 * `sourceName()`, so an export's "AEC 2019-05-18 tcp votes" says "AEC
 * election results" on the line and the full title in the sheet.
 */
export interface SourceCitation {
  label: string;
  title?: string;
  asOf?: DateInput | null;
}

/** A state the block is drawn in, said after the source. */
export type SourceState = 'partial' | 'saved' | 'offline';
const stateWords: Record<SourceState, string> = {
  partial: 'partial',
  saved: '',
  offline: '',
};

/** Everything one block's source sheet says. */
export interface SourceDetails {
  /** The source file's own date: meta.as_of, generated_at. */
  asOf?: DateInput | null;
  dateRole?: 'recorded' | 'found';
  /** Ask dates an answer to the minute rather than dating a source record. */
  header?: string;
  /** How a rule-ordered block was selected. */
  rule?: string;
  /** Ask supplies its report action without placing it in route params. */
  report?: { label: string; onPress: () => void; testID?: string };
  /**
   * Who holds the record: one name, or several. The line shows the first
   * short name ("and 2 more"); the sheet lists every full title, each with
   * its own date when the dates differ. (`source` is reserved for image
   * sources.)
   */
  citation?: string | readonly (string | SourceCitation | null | undefined)[];
  /** Coverage after the date: "Divisions to 25 Sep 2026". */
  coverage?: string | null;
  /** The content is a saved copy that could not be refreshed. */
  savedAt?: DateInput | null;
  state?: SourceState | null;
  /** The original records; each opens from the sheet. */
  originals?: readonly SourceOriginal[];
  /** Methodology and caveats, one paragraph each, shown in full. */
  notes?: readonly (string | null | undefined | false)[];
  /**
   * "CC BY 4.0". The sheet's licence row opens Sources and licences, which
   * has every licence in full; "See source terms" is said in plain words.
   */
  licence?: string | null;
  /** The dataset on Sources and licences (`datasets.ts` id) the row opens at. */
  licenceDataset?: string;
  /** Anything else the sheet carries below the notes. */
  extra?: ReactNode;
  /**
   * Replaces the line's "Updated 4 Oct 2026" part; null leaves it out where
   * the coverage dates the block ("Divisions to 25 Sep 2026").
   */
  dateLabel?: string | null;
}

/** A cited source, read: its short label, full title and own date. */
export type CitedSource = Required<Pick<SourceCitation, 'label' | 'title'>> &
  Pick<SourceCitation, 'asOf'>;
/** Every cited source with a label and a title, once each by title. */
export function sourceCitations(
  citation: SourceDetails['citation'],
): CitedSource[] {
  const list = typeof citation === 'string' ? [citation] : (citation ?? []);
  const out: CitedSource[] = [];
  for (const item of list) {
    if (!item) continue;
    const named =
      typeof item === 'string'
        ? item.trim()
          ? sourceName(item)
          : null
        : item.label.trim()
          ? {
              label: item.label.trim(),
              title: item.title?.trim() || item.label.trim(),
              asOf: item.asOf,
            }
          : null;
    if (named && !out.some((o) => o.title === named.title)) out.push(named);
  }
  return out;
}
/** The labels a line names: each short name once. */
const lineNames = (citation: SourceDetails['citation']) => [
  ...new Set(sourceCitations(citation).map((s) => s.label)),
];
const dayNumber = (value: DateInput | null | undefined) => {
  const date = value == null ? null : calendarDate(value);
  return date ? Date.UTC(date.year, date.month, date.day) : null;
};
/** The newest of the sources' own dates, for a block that gives none. */
function newestSourceDate(
  citation: SourceDetails['citation'],
): DateInput | null {
  let newest: { value: DateInput; day: number } | null = null;
  for (const { asOf } of sourceCitations(citation)) {
    const day = dayNumber(asOf);
    if (asOf != null && day != null && (!newest || day > newest.day))
      newest = { value: asOf, day };
  }
  return newest?.value ?? null;
}
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
  dateRole,
}: SourceDetails): {
  date: string | null;
  name: string | null;
  rest: string[];
} {
  const names = lineNames(citation);
  const name = names.length
    ? names.length === 1
      ? names[0]!
      : // "and 3 more" never breaks, so "more" is never left alone.
        `${names[0]} ${unbroken(`and ${names.length - 1} more`)}`
    : null;
  const shownState = state ?? (savedAt != null ? 'saved' : null);
  const saved = savedAt != null ? formatDate(savedAt, 'short') : '';
  const rest = [
    coverage || null,
    shownState === 'saved' && saved && dateLabel !== undefined
      ? `Saved ${saved}`
      : shownState
        ? stateWords[shownState]
        : null,
  ].filter((part): part is string => !!part);
  // Every block stays dated: an undated source says so.
  const date =
    dateLabel !== undefined
      ? dateLabel
      : dateRole && asOf != null
        ? `${dateRole === 'found' ? 'Found ' : ''}${sheetDate(asOf, 'short')}`
        : shownState === 'saved' && saved
          ? `Saved ${saved}`
          : (updatedText(asOf ?? newestSourceDate(citation)) ??
            'Date not published');
  return { date, name, rest };
}

type SourceRegistry = {
  /** Each drawn line's text, with the lines that draw it in tree order. */
  lines: Map<string, number[]>;
  listeners: Set<() => void>;
};
let lineIds = 0;
/** Ids follow render order, which is tree order for blocks drawn together. */
const nextLineId = () => ++lineIds;
const SourceSectionContext = createContext<SourceRegistry | null>(null);

/**
 * One section of a page: cards and charts inside it that carry the same
 * source line ("Updated 13 Nov 2026 · OPAX daily edition") show it once,
 * under the first of them, rather than under every card. A line that says
 * something different (another date, source or state) still shows. VoiceOver
 * reads the line once, as drawn. Sections can sit anywhere on a page; a
 * `Section` is one.
 */
export function SourceSection({ children }: { children: ReactNode }) {
  const [registry] = useState<SourceRegistry>(() => ({
    lines: new Map(),
    listeners: new Set(),
  }));
  return (
    <SourceSectionContext.Provider value={registry}>
      {children}
    </SourceSectionContext.Provider>
  );
}

/**
 * What a line's sheet holds beyond the drawn text: its originals, notes,
 * licence and rule. Two lines fold into one only when their sheets match, so
 * a hidden line never takes a fuller sheet with it.
 */
export function sheetFingerprint(details: SourceDetails): string {
  return JSON.stringify([
    (details.originals ?? []).map((original) => [
      original.label,
      original.url,
      original.record ?? null,
      original.asOf == null ? null : String(original.asOf),
    ]),
    (details.notes ?? []).filter(Boolean),
    details.licence ?? null,
    details.licenceDataset ?? null,
    details.rule ?? null,
    details.header ?? null,
    sourceCitations(details.citation).map((cited) => [
      cited.label,
      cited.title,
    ]),
  ]);
}

/** Whether this line is the first in its section to say `text`. */
function useFirstInSection(text: string | null): boolean {
  const registry = useContext(SourceSectionContext);
  const [id] = useState(nextLineId);
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!registry) return () => {};
      registry.listeners.add(listener);
      return () => {
        registry.listeners.delete(listener);
      };
    },
    [registry],
  );
  const first = useSyncExternalStore(
    subscribe,
    () => (registry && text ? (registry.lines.get(text)?.[0] ?? null) : null),
    () => null,
  );
  useLayoutEffect(() => {
    if (!registry || !text) return;
    const notify = () => registry.listeners.forEach((listener) => listener());
    registry.lines.set(
      text,
      [...(registry.lines.get(text) ?? []), id].sort((a, b) => a - b),
    );
    notify();
    return () => {
      const rest = (registry.lines.get(text) ?? []).filter((n) => n !== id);
      if (rest.length) registry.lines.set(text, rest);
      else registry.lines.delete(text);
      notify();
    };
  }, [registry, text, id]);
  return first === null || first === id;
}

/** Adjacent blocks in one section can share one dated source line. */
export function SourceLineGroup({
  children,
  ...details
}: SourceDetails & { children: ReactNode; testID?: string }) {
  return (
    <View style={{ gap: rhythm.block }}>
      {children}
      <SourceLine {...details} />
    </View>
  );
}

/**
 * One source line at the foot of a block: a document glyph, the date and the
 * source's name in navy, and a state when there is one ("Updated 4 Oct
 * 2026 · AEC annual returns · saved copy"). Tapping it opens the source
 * sheet: the original records, the as-at date and coverage, the notes and
 * caveats, and the licence, with Sources and licences one row further. It
 * replaces a block's separate as-at line, "View original", ⓘ and caveat
 * paragraphs: every figure stays dated and one tap from its source.
 *
 * 44pt to touch (48 on Android); the column's full width at
 * accessibility sizes, so its word-safe text has a fixed frame. VoiceOver
 * hears the line as drawn ("Updated 4 Oct 2026, AEC annual returns") and
 * that it opens the sources.
 */
export function SourceLine({
  title,
  label,
  accessibilityLabel,
  onPress,
  testID,
  overlap = false,
  ...details
}: SourceDetails & {
  /** Today: the touch band overlaps upward so the text follows the group gap. */
  overlap?: boolean;
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
  // Compatibility props remain accepted until their feature lanes migrate.
  void title;
  const hasPayload = Object.keys(details).length > 0;
  const parts = sourceLineParts(details);
  const visible = label
    ? { date: null, name: label, rest: [] as string[] }
    : parts;
  const spoken = [visible.date, visible.name, ...visible.rest]
    .filter(Boolean)
    .join(', ')
    .replace(/\u00a0/g, ' ');
  // A link line ("View original"), or one whose sheet carries an action or
  // extra content, is never folded into a section's line.
  const shown = useFirstInSection(
    label || details.extra || details.report || onPress
      ? null
      : `${spoken}\n${sheetFingerprint(details)}`,
  );
  if (!shown) return null;
  return (
    <>
      <SourceAffordance
        glyph={label ? EXTERNAL_GLYPH : sourceSymbol}
        date={visible.date}
        name={visible.name}
        rest={visible.rest}
        accessibilityLabel={accessibilityLabel ?? spoken}
        accessibilityHint={
          !hasPayload && onPress ? 'Opens the source' : 'Opens the sources'
        }
        accessibilityRole={!hasPayload && onPress ? 'link' : 'button'}
        onPress={() =>
          hasPayload || !onPress
            ? presentSource(details, { testID })
            : onPress()
        }
        testID={testID}
        overlap={overlap}
      />
    </>
  );
}

/**
 * The drawn source line shared by SourceLine, AnswerView and CitationContent:
 * one anatomy for block provenance and Ask's source footers.
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
  overlap = false,
}: {
  overlap?: boolean;
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
  const [textHeight, setTextHeight] = useState<number>(
    textStyles.footnote.lineHeight,
  );
  const bandInset = Math.max(0, (minimumTarget - textHeight) / 2);
  const highlight = useRowHighlight();
  // The footnote line until the text reports its own (Dynamic Type).
  const [firstLine, setFirstLine] = useState<number>(
    textStyles.footnote.lineHeight,
  );
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
        ...(overlap
          ? [
              {
                marginTop: -bandInset,
                paddingVertical: bandInset,
                alignItems: 'flex-start' as const,
              },
            ]
          : []),
        fixed ? styles.fixed : styles.hug,
        pressed ? { backgroundColor: highlight } : null,
      ]}
    >
      {() => (
        <View style={styles.lineContent}>
          {/* As tall as the text's first line, so the glyph is centred on
              that line whether the text wraps or not. */}
          <View
            testID={testID && `${testID}-glyph`}
            style={[styles.glyph, { minHeight: firstLine }]}
          >
            <Icon name={glyph} size={13} maxScale={1.5} tone="inkSoft" />
          </View>
          <Text
            wordSafe={fixed}
            variant="footnote"
            // A bare name ("View original") is one run in the link colour.
            tone={name && !date && !rest.length ? 'navy' : undefined}
            accessible={false}
            style={styles.shrink}
            onTextLayout={(event) => {
              const total = event.nativeEvent.lines.reduce(
                (sum, line) => sum + line.height,
                0,
              );
              if (overlap && total > 0) setTextHeight(total);
              const height = event.nativeEvent.lines[0]?.height;
              if (height && Math.abs(height - firstLine) > 0.5)
                setFirstLine(height);
            }}
          >
            {lineChildren(date, name, rest)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/**
 * The dot after the date stays on the date's line: a no-break space before
 * it, so a wrap falls after the dot, never before it ("Updated 21 Sep 2026
 * / · GrantConnect" at AX3, sweep 2 item 11).
 */
export const dateSeparator = '\u00a0· ';

/**
 * The line's text runs: plain strings where there is no name (so the text is
 * one string), the name as its own run in the link colour otherwise.
 */
function lineChildren(
  date: string | null | undefined,
  name: string | null | undefined,
  rest: readonly string[],
): ReactNode {
  if (!name)
    return date && rest.length
      ? `${date}${dateSeparator}${rest.join(' · ')}`
      : [date, ...rest].filter(Boolean).join(' · ');
  if (!date && !rest.length) return name;
  return [
    date ? `${date}${dateSeparator}` : '',
    <Text key="name" variant="footnote" tone="navy">
      {name}
    </Text>,
    rest.length ? ` · ${rest.join(' · ')}` : '',
  ];
}

/** A licence as the sheet says it; "See source terms" in plain words. */
export function licenceText(licence: string): string {
  return /^see (the )?source('s)? terms\.?$/i.test(licence.trim())
    ? 'The source’s own terms'
    : licence.trim();
}

const sourceSymbol = 'doc.text.magnifyingglass';

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.line + 2,
    minHeight: minimumTarget,
    paddingHorizontal: rhythm.tight,
    marginHorizontal: -rhythm.tight,
    borderRadius: radii.thumb,
    borderCurve: 'continuous',
  },
  hug: { alignSelf: 'flex-start', maxWidth: '100%' },
  // The column's full width, whatever row the line sits in.
  fixed: { alignSelf: 'stretch', width: '100%' },
  // Glyph and text start together; the glyph's box is the first line's
  // height, so the glyph sits on that line's centre (not the row's).
  lineContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rhythm.line + 2,
    flexShrink: 1,
  },
  glyph: { justifyContent: 'center' },
  shrink: { flexShrink: 1 },
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
  barAndroid: { paddingTop: rhythm.heading },
  grab: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: radii.capsule,
    backgroundColor: colors.dividerDefault,
    marginBottom: rhythm.heading,
    borderCurve: 'continuous',
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

/** A date in the sheet: "4 September 2026", a year-only vintage as "2021". */
function sheetDate(
  value: DateInput | null | undefined,
  style: 'long' | 'short' = 'long',
): string {
  if (value == null) return '';
  if (typeof value === 'string' && /^\d{4}$/.test(value)) return value;
  return formatDate(value, style);
}
