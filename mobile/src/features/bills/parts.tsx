import { router } from 'expo-router';
import { partyRoute } from '../../navigation/routes';
import { Fragment, useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { BillSplit, billSplits } from '../../api/bill-transforms';
import { openSource, sourceUrl } from '../../navigation/external';
import { formatCount, formatDate } from '../../design/format';
import { isPartyLabel, partyDot, partyIdentity } from '../../design/party';
import {
  Disclosure as DisclosureRow,
  Hoverable,
  Icon,
  MACHINE_BRIEF_EXPLANATION,
  MachineLabel,
  StatusLabel,
  Text,
  useAccessibilitySize,
  useHover,
} from '../../design/primitives';
import {
  colors,
  fonts,
  minimumTarget,
  radii,
  rhythm,
} from '../../design/tokens';
import {
  questionBlocks,
  type QuestionBlock,
  type QuestionRun,
} from './divisions';
import { billRowText, type BillListRow } from './filters';

/**
 * @deprecated Use `StatusLabel`. Kept only for the iPad welcome tour's
 * picture of the bill list (src/onboarding, pass 4D): a status word on its
 * tone with a date beside it, the date on its own line at accessibility
 * sizes.
 */
export function BillStatus({
  status,
  asAt,
}: {
  status: string;
  asAt?: string | null;
}) {
  const stacked = useAccessibilitySize();
  return (
    <View style={[styles.statusLine, stacked ? styles.stacked : null]}>
      <StatusLabel label={status} hidden />
      {asAt ? (
        <Text variant="fine" style={styles.grow}>
          {asAt}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * One bill in the list: a single VoiceOver element that opens the bill. Its
 * status is a StatusLabel; the list's one source line dates it.
 */
export function BillRow({
  bill,
  onPress,
  selected,
}: {
  bill: BillListRow;
  onPress: () => void;
  /**
   * In the iPad split list: true for the bill in the detail pane, false for
   * the others (no chevron; the pane is the destination). Undefined pushes.
   */
  selected?: boolean;
}) {
  const text = billRowText(bill);
  const inSplit = selected !== undefined;
  const [hovered, onHover] = useHover();
  return (
    <Hoverable
      effect="none"
      onHover={onHover}
      onActivate={onPress}
      drag={{ path: `/bill/${bill.key}`, title: text.name }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={text.label}
        accessibilityState={inSplit ? { selected } : undefined}
        testID={`bill-row-${bill.key}`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          inSplit ? styles.rowInSplit : null,
          selected
            ? { backgroundColor: colors.billsWash }
            : pressed || hovered
              ? { backgroundColor: colors.sunken }
              : null,
        ]}
      >
        {selected ? <View style={styles.selectedMark} /> : null}
        <View style={styles.rowText}>
          <StatusLabel label={text.status} hidden />
          <Text variant="strong">{text.name}</Text>
          {/* Chamber names are long single words at AX5 ("Representatives"):
              word-safe steps the line down rather than splitting the word. */}
          {text.where ? (
            <Text variant="metadata" wordSafe>
              {text.where}
            </Text>
          ) : null}
          {text.people ? (
            <Text wordSafe variant="metadata">
              {text.people}
            </Text>
          ) : null}
        </View>
        {inSplit ? null : (
          <Icon name="chevron.right" size={14} tone="inkSoft" />
        )}
      </Pressable>
    </Hoverable>
  );
}

/**
 * A choice in the filter sheet: label, how many bills carry it, and a
 * checkmark when chosen. Selection is said in words (VoiceOver "selected").
 */
export function OptionRow({
  label,
  count,
  selected,
  onPress,
  testID,
}: {
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const stacked = useAccessibilitySize();
  const counted = `${formatCount(count)} ${count === 1 ? 'bill' : 'bills'}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${counted}`}
      accessibilityState={{ selected }}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        pressed ? { backgroundColor: colors.sunken } : null,
      ]}
    >
      <View style={[styles.optionText, stacked ? styles.stacked : null]}>
        <Text
          variant={selected ? 'strong' : 'body'}
          wordSafe
          style={styles.grow}
        >
          {label}
        </Text>
        <Text variant="strong" tabular tone="inkSoft">
          {formatCount(count)}
        </Text>
      </View>
      <View style={styles.check}>
        {selected ? <Icon name="checkmark" size={18} tone="navy" /> : null}
      </View>
    </Pressable>
  );
}

const ayeWords = (n: number) =>
  n === 0 ? 'no ayes' : n === 1 ? '1 aye' : `${formatCount(n)} ayes`;
const noWords = (n: number) =>
  n === 0 ? 'no noes' : n === 1 ? '1 no' : `${formatCount(n)} noes`;
/** What VoiceOver reads for one party's split: "Greens, 9 ayes, no noes". */
export const splitLabel = (s: BillSplit) =>
  `${s.label}, ${ayeWords(s.ayes)}, ${noWords(s.noes)}`;
// Register codes for people who are not a party: no party link for them,
// and no dot except the Independent grey.
const notParty = (split: BillSplit) =>
  !isPartyLabel(split.party) || !isPartyLabel(split.label);

/** Parties drawn as bars under a division; the rest wait behind its disclosure. */
export const SPLITS_SHOWN = 3;
/**
 * A division's parties, largest first: the three that decide it drawn, the
 * rest (and the notes on what the attribution rests on) for the disclosure.
 * Every bar measures against the largest party's total.
 */
export function divisionParties(splits: ReturnType<typeof billSplits>) {
  const all = [...splits.drawn, ...splits.folded];
  return {
    shown: all.slice(0, SPLITS_SHOWN),
    rest: all.slice(SPLITS_SHOWN),
    max: Math.max(...all.map((s) => s.ayes + s.noes), 1),
    notes: splits.notes,
    recorded: splits.recorded,
  };
}

/**
 * One party's ayes and noes on one line: a dot and the party's name, one
 * bar (ayes in bronze, then noes) measured against the largest party, and
 * the counts as "ayes–noes". The bar is decorative: the counts are the text
 * alternative, read as one element ("Labor, no ayes, 21 noes"), which opens
 * the party where the record names one. At accessibility sizes the bar takes
 * its own full-width line under the name and counts.
 */
export function SplitRow({
  split,
  max,
  testID,
}: {
  split: BillSplit;
  max: number;
  testID?: string;
}) {
  const stacked = useAccessibilitySize();
  const linked = !notParty(split);
  const Container = linked ? Pressable : View;
  const dot = partyDot(split.party) && partyDot(split.label);
  const frame = [styles.split, stacked ? styles.splitStacked : null];
  const bar = (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.track, stacked ? null : styles.trackInline]}
    >
      <View
        style={[
          styles.bar,
          {
            width: `${(split.ayes / max) * 100}%`,
            backgroundColor: colors.bronze,
          },
        ]}
      />
      <View
        style={[
          styles.bar,
          {
            width: `${(split.noes / max) * 100}%`,
            backgroundColor: colors.inkFaint,
          },
        ]}
      />
    </View>
  );
  return (
    <Container
      {...(linked
        ? {
            accessibilityRole: 'link' as const,
            accessibilityHint: 'Opens the party record',
            onPress: () => router.push(partyRoute(split.label)),
          }
        : {})}
      accessible
      accessibilityLabel={splitLabel(split)}
      testID={testID}
      style={
        linked
          ? ({ pressed }: { pressed: boolean }) => [
              ...frame,
              pressed ? styles.pressed : null,
            ]
          : frame
      }
    >
      <View style={[styles.party, stacked ? styles.grow : styles.partyColumn]}>
        {dot ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.dot, { backgroundColor: dot }]}
          />
        ) : null}
        <Text variant="body" wordSafe style={styles.grow}>
          {split.label}
        </Text>
      </View>
      {stacked ? null : bar}
      <Text variant="strong" tabular style={styles.counts}>
        {`${formatCount(split.ayes)}–${formatCount(split.noes)}`}
      </Text>
      {stacked ? <View style={styles.full}>{bar}</View> : null}
    </Container>
  );
}

/** Party rows under a division, in the order given. */
export function DivisionSplits({
  splits,
  max,
  testID,
  rowTestID = testID,
}: {
  splits: readonly BillSplit[];
  max: number;
  testID: string;
  /** Each row is `<rowTestID>-<party>`: "bill-division-0-splits-labor". */
  rowTestID?: string;
}) {
  return (
    <View style={styles.splitList} testID={testID}>
      {splits.map((split) => (
        <SplitRow
          key={split.party}
          split={split}
          max={max}
          testID={`${rowTestID}-${split.label.replace(/[^A-Za-z]+/g, '-').toLowerCase()}`}
        />
      ))}
    </View>
  );
}

/**
 * A control that shows and hides a block: the design system's disclosure
 * row (label, chevron, expanded state). Collapsed by default; the body is
 * built only while open.
 */
export function Disclosure({
  label,
  accessibilityLabel,
  testID,
  bodyTestID,
  children,
}: {
  label: string;
  /** What VoiceOver reads when it should say more than the label. */
  accessibilityLabel?: string;
  testID: string;
  bodyTestID?: string;
  children: ReactNode | (() => ReactNode);
}) {
  return (
    <DisclosureRow
      label={label}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      bodyTestID={bodyTestID ?? `${testID}-body`}
    >
      {() => (
        <View style={styles.disclosed}>
          {typeof children === 'function' ? children() : children}
        </View>
      )}
    </DisclosureRow>
  );
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
/** A machine brief up to this many characters reads inline; longer ones fold. */
export const BRIEF_INLINE_LIMIT = 500;

/** A link the source policy opens (HTTPS, no user information, no OPAX route the app never opens). */
export function openableUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return sourceUrl(url);
  } catch {
    return null;
  }
}

function Runs({
  lines,
  heading = false,
}: {
  lines: readonly (readonly QuestionRun[])[];
  heading?: boolean;
}) {
  return lines.map((line, l) => (
    <Fragment key={l}>
      {l ? '\n' : null}
      {line.map((run, r) => {
        const url = openableUrl(run.url);
        const style = [
          run.strong || heading ? styles.recordStrong : null,
          run.emphasis ? styles.emphasis : null,
          url ? styles.link : null,
        ];
        return url ? (
          <Text
            key={r}
            variant="record"
            tone="bronzeInk"
            style={style}
            accessibilityRole="link"
            accessibilityHint="Opens the source"
            onPress={() => void openSource(url, run.text)}
          >
            {run.text}
          </Text>
        ) : run.strong || run.emphasis || heading ? (
          <Text key={r} variant="record" style={style}>
            {run.text}
          </Text>
        ) : (
          run.text
        );
      })}
    </Fragment>
  ));
}

function Blocks({
  blocks,
  quoted = false,
}: {
  blocks: readonly QuestionBlock[];
  quoted?: boolean;
}) {
  const tone = quoted ? 'inkSoft' : undefined;
  return blocks.map((block, index) => {
    if (block.kind === 'quote')
      return (
        <View key={index} style={styles.quote}>
          <Blocks blocks={block.blocks} quoted />
        </View>
      );
    if (block.kind === 'list')
      return (
        <View key={index} style={styles.list}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.bullet}>
              <Text
                variant="record"
                tone={tone}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {block.ordered ? `${block.start + i}.` : '•'}
              </Text>
              <Text variant="record" tone={tone} style={styles.grow}>
                <Runs lines={item} />
              </Text>
            </View>
          ))}
        </View>
      );
    return (
      <Text
        key={index}
        variant="record"
        tone={tone}
        accessibilityRole={block.kind === 'heading' ? 'header' : undefined}
      >
        <Runs lines={block.lines} heading={block.kind === 'heading'} />
      </Text>
    );
  });
}

/**
 * The question a division put, in the record's words, from its Markdown:
 * headings, paragraphs, quotes (a bronze rule, the text softer) and lists,
 * never raw `###` or `>`. A citation the source policy opens is a link in
 * place; any other stays its words. Serif: this is the record speaking.
 */
export function DivisionQuestion({
  text,
  testID,
}: {
  text: string;
  testID?: string;
}) {
  const blocks = useMemo(() => questionBlocks(text), [text]);
  return (
    <View style={styles.question} testID={testID}>
      <Blocks blocks={blocks} />
    </View>
  );
}

/** What a stored machine brief is, for its pill's sheet and VoiceOver. */
export const BRIEF_EXPLANATION = MACHINE_BRIEF_EXPLANATION;

/**
 * A bill's stored machine summary. Its pill comes first, so no reader meets
 * the summary as the record; the record's own attribution opens from it and
 * VoiceOver hears it there. `testID` prefixes the label and text.
 */
export function MachineSummary({
  attribution,
  sentences,
  testID,
}: {
  attribution: string;
  sentences: string[];
  testID: string;
}) {
  return (
    <>
      <MachineLabel explanation={attribution} testID={`${testID}-label`} />
      <View style={styles.machineText} testID={`${testID}-text`}>
        {sentences.filter(Boolean).map((sentence, index) => (
          <Text key={index} variant="body">
            {sentence}
          </Text>
        ))}
      </View>
    </>
  );
}

/** A stored machine brief: its label always shows; a long brief folds. */
export function MachineBrief({
  label,
  brief,
  testID,
}: {
  label: string;
  brief: string;
  testID: string;
}) {
  return (
    <View style={styles.brief}>
      <MachineLabel
        explanation={BRIEF_EXPLANATION}
        testID={`${testID}-label`}
      />
      {brief.length <= BRIEF_INLINE_LIMIT ? (
        <Text variant="body" testID={`${testID}-text`}>
          {brief}
        </Text>
      ) : (
        <Disclosure
          label="Read the brief"
          accessibilityLabel={`Read the ${label.toLowerCase()}, ${words(brief)} words`}
          testID={`${testID}-more`}
        >
          <Text variant="body" testID={`${testID}-text`}>
            {brief}
          </Text>
        </Disclosure>
      )}
    </View>
  );
}

/** "19 Aug 2026", or "17 Aug 2026 to 18 Aug 2026" for a span. */
export function dateSpan(
  from: string,
  to: string | null,
  style: 'short' | 'long' = 'short',
) {
  return to
    ? `${formatDate(from, style)} to ${formatDate(to, style)}`
    : formatDate(from, style);
}

/** A bulleted item whose bullet VoiceOver skips. */
export function Bullet({ children }: { children: string }) {
  return (
    <View style={styles.bullet}>
      <Text
        variant="body"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        •
      </Text>
      <Text variant="body" style={styles.grow}>
        {children}
      </Text>
    </View>
  );
}

/** A party dot and its label as the record names it (no current/former claim). */
export function RecordedParty({ party }: { party: string }) {
  const identity = partyIdentity(party);
  const recorded = isPartyLabel(party);
  const dot = partyDot(party);
  const Container = recorded ? Pressable : View;
  return (
    <Container
      style={[styles.party, { minHeight: minimumTarget }]}
      {...(recorded
        ? {
            accessibilityRole: 'link' as const,
            accessibilityHint: 'Opens the party record',
            onPress: () => router.push(partyRoute(identity.name)),
          }
        : {})}
      accessibilityLabel={identity.name}
    >
      {dot ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.dot, { backgroundColor: dot }]}
        />
      ) : null}
      <Text wordSafe variant="metadata" style={styles.grow}>
        {identity.name}
      </Text>
    </Container>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.block,
    minHeight: minimumTarget,
    paddingVertical: rhythm.heading,
  },
  rowText: { flex: 1, gap: rhythm.line },
  // The split list: the row bleeds 12pt into the margin so its selected
  // wash has room around the text, and a 3pt bills-ink mark leads it.
  rowInSplit: {
    marginHorizontal: -rhythm.heading,
    paddingHorizontal: rhythm.heading,
    borderRadius: radii.md,
    borderCurve: 'continuous',
  },
  selectedMark: {
    position: 'absolute',
    left: 0,
    top: rhythm.heading,
    bottom: rhythm.heading,
    width: 3,
    borderRadius: 1.5,
    backgroundColor: colors.billsInk,
  },
  statusLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
    paddingVertical: rhythm.line,
  },
  optionText: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: rhythm.tight,
  },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  check: { width: 36, alignItems: 'center' },
  grow: { flexShrink: 1, flexGrow: 1 },
  full: { width: '100%' },
  pressed: { backgroundColor: colors.sunken },
  splitList: { gap: rhythm.line },
  // One line per party: name, bar, counts; 44pt so a linked row is a target.
  split: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.heading,
    minHeight: minimumTarget,
    marginHorizontal: -rhythm.line,
    paddingHorizontal: rhythm.line,
    borderRadius: radii.sm,
  },
  splitStacked: {
    flexWrap: 'wrap',
    rowGap: rhythm.line,
    paddingVertical: rhythm.line,
  },
  // A shared name column, so the bars start together.
  partyColumn: { width: '34%' },
  party: { flexDirection: 'row', alignItems: 'center', gap: rhythm.tight },
  dot: { width: 10, height: 10, borderRadius: 5 },
  track: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: colors.sunken,
  },
  trackInline: { flex: 1 },
  bar: { height: 6 },
  // The counts keep their line; the party name wraps.
  counts: { flexShrink: 0, minWidth: 44, textAlign: 'right' },
  disclosed: { gap: rhythm.block },
  question: { gap: rhythm.heading },
  recordStrong: { fontFamily: fonts.serifBold },
  emphasis: { fontStyle: 'italic' },
  link: { textDecorationLine: 'underline' },
  quote: {
    gap: rhythm.tight,
    paddingLeft: rhythm.heading + 2,
    borderLeftWidth: 2,
    borderLeftColor: colors.bronze,
  },
  list: { gap: rhythm.line },
  bullet: { flexDirection: 'row', gap: rhythm.tight },
  brief: { gap: rhythm.line },
  machineText: { gap: rhythm.tight },
});
