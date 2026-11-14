import { router } from 'expo-router';
import { Fragment, useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { BillSplit, billSplits } from '../../api/bill-transforms';
import { billName } from '../../api/bill-transforms';
import { Button } from '../../design/controls';
import { counted, formatCount, formatDate } from '../../design/format';
import { haptic } from '../../design/haptics';
import { MACHINE_LABEL, MachinePill } from '../../design/labels';
import { SectionHeader } from '../../design/layout';
import { isPartyLabel, partyDot, partyIdentity } from '../../design/party';
import { PartyLabel } from '../../design/people';
import {
  BillRow,
  Disclosure as DisclosureRow,
  Icon,
  Text,
  useAccessibilitySize,
} from '../../design/primitives';
import { symbols } from '../../design/symbols';
import {
  colors,
  interfaceFonts as fonts,
  minimumTarget,
  radii,
  rhythm,
} from '../../design/tokens';
import {
  canonicalUrl,
  openOnWeb,
  openSource,
  sourceUrl,
} from '../../navigation/external';
import { billRoute, partyRoute } from '../../navigation/routes';
import { trackShare } from '../../navigation/share';
import { copyText } from '../records/actions';
import {
  countWords,
  questionBlocks,
  type QuestionBlock,
  type QuestionRun,
} from './divisions';
import { billRowText, type BillListRow } from './filters';
import { blocNames, blocOrder, partyBloc, type PartyBloc } from './party-codes';
import { TermText } from '../../design/term';

/**
 * One bill in the Bills list: the shared `BillRow` (Today draws the same).
 * The status capsule shows only where the scope does not already say it;
 * VoiceOver reads the status either way.
 */
export function BillIndexRow({
  bill,
  onPress,
  selected,
  showStatus = true,
}: {
  bill: BillListRow;
  onPress?: () => void;
  /**
   * In the iPad split list: true for the bill in the detail pane, false for
   * the others (no chevron; the pane is the destination). Undefined pushes.
   */
  selected?: boolean;
  showStatus?: boolean;
}) {
  const text = billRowText(bill);
  return (
    <BillRow
      billKey={bill.key}
      title={text.name}
      status={text.status}
      rawStatus={bill.status}
      date={text.date}
      showStatus={showStatus}
      meta={text.meta}
      href={
        selected === undefined ? billRoute(bill.key, billName(bill)) : undefined
      }
      onPress={selected === undefined ? undefined : onPress}
      accessibilityLabel={text.label}
      testID={`bill-row-${bill.key}`}
      dragPath={`/bill/${bill.key}`}
      selected={selected}
    />
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
            backgroundColor: colors.navy,
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
            variant="recordText"
            tone="navy"
            style={style}
            accessibilityRole="link"
            accessibilityHint="Opens the source"
            onPress={() => void openSource(url, run.text)}
          >
            {run.text}
          </Text>
        ) : run.strong || run.emphasis || heading ? (
          <Text key={r} variant="recordText" style={style}>
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
                variant="recordText"
                tone={tone}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {block.ordered ? `${block.start + i}.` : '•'}
              </Text>
              <Text variant="recordText" tone={tone} style={styles.grow}>
                <Runs lines={item} />
              </Text>
            </View>
          ))}
        </View>
      );
    return (
      <Text
        key={index}
        variant="recordText"
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
export const BRIEF_EXPLANATION =
  'An automated summary written by a model; not the record.';

/**
 * A bill's stored machine summary: its heading and provenance pill share a
 * wrapping row before the sentences. `testID` prefixes the pill and the text.
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
      <SectionHeader
        title="In short"
        accessory={
          <MachinePill
            note={{
              title: MACHINE_LABEL,
              body: [
                'Written by a machine from the explanatory memorandum. Check the original before relying on it.',
                attribution,
              ].filter(Boolean),
            }}
            testID={`${testID}-label`}
          />
        }
      />
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
      <MachinePill
        note={{ title: 'How this was written', body: [BRIEF_EXPLANATION] }}
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
      <Text wordSafe variant="secondary" style={styles.grow}>
        {identity.name}
      </Text>
    </Container>
  );
}

const styles = StyleSheet.create({
  statusLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  stacked: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
    alignItems: 'flex-start',
  },
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
    borderRadius: radii.bar,
    borderCurve: 'continuous',
  },
  splitStacked: {
    flexWrap: 'wrap',
    rowGap: rhythm.line,
    paddingVertical: rhythm.line,
  },
  // A shared name column, so the bars start together.
  partyColumn: { width: '34%' },
  party: { flexDirection: 'row', alignItems: 'center', gap: rhythm.tight },
  dot: { width: 10, height: 10, borderRadius: 5, borderCurve: 'continuous' },
  track: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: colors.sunken,
    borderCurve: 'continuous',
  },
  trackInline: { flex: 1 },
  bar: { height: 6 },
  // The counts keep their line; the party name wraps.
  counts: { flexShrink: 0, minWidth: 44, textAlign: 'right' },
  disclosed: { gap: rhythm.block },
  showMore: { alignItems: 'flex-start' },
  partyVotes: { gap: rhythm.block },
  bloc: { gap: rhythm.line },
  voteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
    marginHorizontal: -rhythm.line,
    paddingHorizontal: rhythm.line,
    borderRadius: radii.bar,
    borderCurve: 'continuous',
  },
  partyName: { flexShrink: 1, maxWidth: '60%' },
  voteTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.sunken,
  },
  voteCounts: { flexShrink: 0 },
  question: { gap: rhythm.heading },
  recordStrong: { fontFamily: fonts.serifBold },
  emphasis: { fontStyle: 'italic' },
  link: { textDecorationLine: 'underline' },
  quote: {
    gap: rhythm.tight,
    paddingLeft: rhythm.heading + 2,
    borderLeftWidth: 2,
    borderLeftColor: colors.navy,
  },
  list: { gap: rhythm.line },
  bullet: { flexDirection: 'row', gap: rhythm.tight },
  brief: { gap: rhythm.line },
  machineText: { gap: rhythm.tight },
});

/** A menu item for a bill's ⋯: the same items on the bar and in the iPad pane. */
export interface BillMenuItem {
  title: string;
  symbol: 'square.and.arrow.up' | 'link' | 'arrow.up.right.square';
  onPress: () => void;
}
/** Copy link, Open on the Parliament website (when recorded), Open on opax.com.au. */
export function billMenuItems({
  billKey,
  title,
  home,
}: {
  billKey: string;
  title: string;
  home?: { label: string; url: string } | null;
}): BillMenuItem[] {
  const path = `/bill/${billKey}`;
  return [
    {
      title: 'Copy link',
      symbol: 'link',
      onPress: () => {
        void copyText(canonicalUrl(path)).then((copied) => {
          if (!copied) return;
          haptic('success');
          trackShare('copy_link', path);
        });
      },
    },
    ...(home
      ? [
          {
            title: 'Open on the Parliament website',
            symbol: 'arrow.up.right.square' as const,
            onPress: () => void openSource(home.url, home.label),
          },
        ]
      : []),
    {
      title: 'Open on opax.com.au',
      symbol: 'arrow.up.right.square',
      onPress: () => void openOnWeb(path, title),
    },
  ];
}

/**
 * One control for votes and speeches: "Show 9 more votes" with a chevron
 * down, then "Show fewer" with a chevron up.
 */
export function ShowMoreButton({
  hidden,
  noun,
  open,
  onToggle,
  testID,
}: {
  hidden: number;
  /** Plural noun: "votes", "speeches". */
  noun: string;
  open: boolean;
  onToggle: () => void;
  testID?: string;
}) {
  return (
    <View style={styles.showMore}>
      <Button
        variant="plain"
        label={open ? 'Show fewer' : `Show ${formatCount(hidden)} more ${noun}`}
        trailingIcon={open ? 'chevron.up' : 'chevron.down'}
        onPress={onToggle}
        testID={testID}
      />
    </View>
  );
}

const slugOf = (label: string) =>
  label
    .replace(/[^A-Za-z]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
/**
 * A vote's party rows in the fixed groups Labor, the Coalition and the
 * crossbench: each group's summed counts in words, then each party as a
 * row with its own bar (one ink for every party, all on one scale) and
 * counts, opening the party. Zero sides are left out on screen and said by VoiceOver.
 */
export function PartyVotes({
  splits,
  paired,
  notes = [],
  recorded,
  testID,
}: {
  splits: readonly BillSplit[];
  paired?: number;
  /** What the attribution rests on: "2 not placed with a party". */
  notes?: readonly string[];
  recorded: boolean;
  testID: string;
}) {
  if (!recorded || !splits.length)
    return (
      <Text variant="footnote" tone="inkSoft" testID={`${testID}-none`}>
        Party votes not recorded for this vote.
      </Text>
    );
  // One scale for every row, so a small party's bar is not drawn as long as
  // a large one's just because it heads its own group.
  const max = Math.max(...splits.map((r) => r.ayes + r.noes), 1);
  const groups = new Map<PartyBloc, BillSplit[]>();
  for (const split of splits) {
    const bloc = partyBloc(split.party);
    groups.set(bloc, [...(groups.get(bloc) ?? []), split]);
  }
  return (
    <View style={styles.partyVotes} testID={testID}>
      {blocOrder
        .filter((bloc) => groups.get(bloc)?.length)
        .map((bloc) => {
          const rows = groups.get(bloc)!;
          const ayes = rows.reduce((n, r) => n + r.ayes, 0);
          const noes = rows.reduce((n, r) => n + r.noes, 0);
          return (
            <View key={bloc} style={styles.bloc} testID={`${testID}-${bloc}`}>
              <TermText
                variant="strong"
                accessibilityRole="header"
                accessibilityLabel={`${blocNames[bloc]}, ${countWords(ayes, noes, { spoken: true })}`}
                term={bloc === 'crossbench' ? 'crossbench' : null}
              >
                {`${blocNames[bloc]} · ${countWords(ayes, noes)}`}
              </TermText>
              {rows.map((split) => (
                <PartyVoteRow
                  key={split.party}
                  split={split}
                  max={max}
                  testID={`${testID.replace(/-parties$/, '')}-splits-${slugOf(split.label)}`}
                />
              ))}
            </View>
          );
        })}
      {notes.length ? (
        // Without these the party rows need not add up to the vote's count.
        <Text variant="footnote" tone="inkSoft" testID={`${testID}-notes`}>
          {`${notes.join('. ')}.`}
        </Text>
      ) : null}
      {paired ? (
        <TermText variant="footnote" tone="inkSoft" term="pair">
          {`${counted(paired, 'pair', 'pairs')}`}
        </TermText>
      ) : null}
    </View>
  );
}

function PartyVoteRow({
  split,
  max,
  testID,
}: {
  split: BillSplit;
  max: number;
  testID: string;
}) {
  const stacked = useAccessibilitySize();
  const linked = !notParty(split);
  const bar = (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`${testID}-bar`}
      style={[styles.voteTrack, stacked ? styles.full : styles.trackInline]}
    >
      <View
        style={{
          width: `${(split.ayes / max) * 100}%`,
          backgroundColor: colors.ink,
        }}
      />
      <View
        style={{
          width: `${(split.noes / max) * 100}%`,
          backgroundColor: colors.inkFaint,
        }}
      />
    </View>
  );
  const body = (
    <>
      <View style={stacked ? styles.full : styles.partyName}>
        <PartyLabel
          party={split.label}
          status="unknown"
          linked={false}
          nested
        />
      </View>
      {bar}
      <Text variant="secondary" tabular style={styles.voteCounts}>
        {countWords(split.ayes, split.noes)}
      </Text>
      {linked ? (
        <Icon name={symbols.chevron} size={13} maxScale={1.5} tone="inkSoft" />
      ) : null}
    </>
  );
  const style = [styles.voteRow, stacked ? styles.splitStacked : null];
  const label = `${split.label}, ${countWords(split.ayes, split.noes, { spoken: true })}`;
  return linked ? (
    <Pressable
      accessible
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint="Opens the party"
      testID={testID}
      onPress={() => router.push(partyRoute(split.label))}
      style={({ pressed }) => [...style, pressed ? styles.pressed : null]}
    >
      {body}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={label} testID={testID} style={style}>
      {body}
    </View>
  );
}
