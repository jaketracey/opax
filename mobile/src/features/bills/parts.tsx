import { router } from 'expo-router';
import { partyRoute } from '../../navigation/routes';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type {
  BillNoteLink,
  BillSplit,
  billSplits,
} from '../../api/bill-transforms';
import { sourceUrl } from '../../navigation/external';
import { formatCount, formatDate } from '../../design/format';
import { partyIdentity } from '../../design/party';
import {
  Icon,
  SourceLink,
  Text,
  useAccessibilitySize,
  type SFSymbol,
} from '../../design/primitives';
import { colors, fonts, minimumTarget, spacing } from '../../design/tokens';
import { billRowText, type BillListRow } from './filters';

/** One bill in the list: a single VoiceOver element that opens the bill. */
export function BillRow({
  bill,
  onPress,
}: {
  bill: BillListRow;
  onPress: () => void;
}) {
  const text = billRowText(bill);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text.label}
      testID={`bill-row-${bill.key}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: colors.raised } : null,
      ]}
    >
      <View style={styles.rowText}>
        <Text variant="strong">{text.name}</Text>
        <Text variant="metadata">
          <Text variant="metadata" tone="ink" style={styles.semibold}>
            {text.status}
          </Text>
          {text.asAt ? ` · ${text.asAt}` : ''}
        </Text>
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
      <Icon name="chevron.right" size={14} tone="inkSoft" />
    </Pressable>
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
        <Text variant="figureInline" tone="inkSoft">
          {formatCount(count)}
        </Text>
      </View>
      <View style={styles.check}>
        {selected ? <Icon name="checkmark" size={18} tone="navy" /> : null}
      </View>
    </Pressable>
  );
}

/** A text link inside the record: bronze ink, 44pt target, VoiceOver link. */
export function InlineLink({
  label,
  onPress,
  accessibilityLabel,
  icon = 'chevron.right',
  testID,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  icon?: SFSymbol;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.link,
        pressed ? { backgroundColor: colors.sunken } : null,
      ]}
    >
      <Text wordSafe variant="body" tone="bronzeInk" style={styles.grow}>
        {label}
      </Text>
      <Icon name={icon} size={14} tone="bronzeInk" />
    </Pressable>
  );
}

const ayeWords = (n: number) =>
  n === 0 ? 'no ayes' : n === 1 ? '1 aye' : `${formatCount(n)} ayes`;
const noWords = (n: number) =>
  n === 0 ? 'no noes' : n === 1 ? '1 no' : `${formatCount(n)} noes`;
const countText = (s: { ayes: number; noes: number }) =>
  `${formatCount(s.ayes)} ${s.ayes === 1 ? 'aye' : 'ayes'} · ${formatCount(s.noes)} ${s.noes === 1 ? 'no' : 'noes'}`;
/** What VoiceOver reads for one party's split: "Greens, 9 ayes, no noes". */
export const splitLabel = (s: BillSplit) =>
  `${s.label}, ${ayeWords(s.ayes)}, ${noWords(s.noes)}`;
// Register codes for people who are not a party: no party dot for them.
const notParty = new Set(['', 'PRES', 'SPK']);

/**
 * One party's ayes and noes: the party as a dot and its name, the counts in
 * words and figures, and two bars (ayes above, noes below) measured against
 * the largest party in the division. The bars are decorative: the counts are
 * the text alternative, read as one element.
 */
function SplitRow({
  split,
  max,
  testID,
}: {
  split: BillSplit;
  max: number;
  testID?: string;
}) {
  const stacked = useAccessibilitySize();
  const Container = notParty.has(split.party.trim()) ? View : Pressable;
  const dot = notParty.has(split.party.trim())
    ? null
    : partyIdentity(split.label).color;
  return (
    <Container
      {...(notParty.has(split.party.trim())
        ? {}
        : {
            accessibilityRole: 'link' as const,
            accessibilityHint: 'Opens the party record',
            onPress: () => router.push(partyRoute(split.label)),
          })}
      accessible
      accessibilityLabel={splitLabel(split)}
      testID={testID}
      style={styles.split}
    >
      <View style={[styles.splitHead, stacked ? styles.stacked : null]}>
        <View style={[styles.party, styles.grow]}>
          {dot ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[styles.dot, { backgroundColor: dot }]}
            />
          ) : null}
          <Text variant="body" style={styles.grow}>
            {split.label}
          </Text>
        </View>
        <Text variant="figureInline" style={stacked ? null : styles.counts}>
          {countText(split)}
        </Text>
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.bars}
      >
        <View style={styles.track}>
          <View
            style={[
              styles.bar,
              {
                width: `${(split.ayes / max) * 100}%`,
                backgroundColor: colors.bronze,
              },
            ]}
          />
        </View>
        <View style={styles.track}>
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
      </View>
    </Container>
  );
}

/**
 * A division's party splits behind a disclosure. Every party the record
 * places is listed with its counts; small parties share one line, in full.
 * The party basis note says what the attribution rests on.
 */
export function PartySplits({
  splits,
  basisNote,
  testID,
}: {
  splits: ReturnType<typeof billSplits>;
  basisNote: string;
  testID: string;
}) {
  if (!splits.recorded)
    return (
      <Text variant="fine" testID={`${testID}-none`}>
        Party split not recorded for this division.
      </Text>
    );
  const parties = splits.drawn.length + splits.folded.length;
  return (
    <Disclosure
      label="Party splits"
      accessibilityLabel={`Party splits, ${parties} ${parties === 1 ? 'party' : 'parties'}`}
      testID={testID}
      bodyTestID={`${testID}-list`}
    >
      {splits.drawn.map((split) => (
        <SplitRow
          key={split.party}
          split={split}
          max={splits.max}
          testID={`${testID}-${split.label.replace(/[^A-Za-z]+/g, '-').toLowerCase()}`}
        />
      ))}
      {splits.folded.length ? (
        <Text
          variant="fine"
          accessibilityLabel={`Also ${splits.folded.map(splitLabel).join('; ')}.`}
        >
          Also{' '}
          {splits.folded
            .map((s) => `${s.label} ${s.ayes}–${s.noes}`)
            .join(', ')}
          .
        </Text>
      ) : null}
      {splits.folded
        .filter((split) => !notParty.has(split.party.trim()))
        .map((split) => (
          <InlineLink
            key={split.party}
            label={splitLabel(split)}
            onPress={() => router.push(partyRoute(split.label))}
          />
        ))}
      {splits.notes.length ? (
        <Text variant="fine">{splits.notes.join(' · ')}</Text>
      ) : null}
      <Text variant="fine">{basisNote}</Text>
    </Disclosure>
  );
}

/**
 * A control that shows and hides a block: its label, a chevron, and the
 * expanded state for VoiceOver. Collapsed by default.
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
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.splits}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ expanded: open }}
        testID={testID}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [
          styles.disclosure,
          pressed ? { backgroundColor: colors.sunken } : null,
        ]}
      >
        <Text variant="control" tone="navy" wordSafe style={styles.grow}>
          {label}
        </Text>
        <Icon name={open ? 'chevron.up' : 'chevron.down'} size={14} />
      </Pressable>
      {open ? (
        <View style={styles.splitList} testID={bodyTestID ?? `${testID}-body`}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
/** A division note up to this many characters reads inline; longer ones fold. */
export const NOTE_INLINE_LIMIT = 200;
/** A machine brief up to this many characters reads inline; longer ones fold. */
export const BRIEF_INLINE_LIMIT = 500;

/**
 * A note's citations the app can open: each destination once, and only those
 * the source-link policy accepts (HTTPS, no user information, no OPAX route
 * the app never opens). The rest stay words in the note.
 */
export function noteCitations(links: readonly BillNoteLink[]) {
  const seen = new Set<string>();
  const out: { label: string; url: string; host: string }[] = [];
  for (const link of links) {
    let url: string;
    try {
      url = sourceUrl(link.url);
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      label: link.label,
      url,
      host: new URL(url).hostname.replace(/^www\./, ''),
    });
  }
  return out;
}

/**
 * The record's prose about a division. Short notes read inline; a long note
 * folds behind "Division note" so the motion, counts, splits and source come
 * first. Its own citations follow it as source links.
 */
export function DivisionNote({
  note,
  links,
  testID,
}: {
  note: string;
  links: readonly BillNoteLink[];
  testID: string;
}) {
  const citations = noteCitations(links);
  if (!note && !citations.length) return null;
  const body = (
    <>
      {note ? (
        <Text variant="metadata" testID={`${testID}-text`}>
          {note}
        </Text>
      ) : null}
      {citations.length ? (
        <View style={styles.citations}>
          <Text variant="kicker">Linked in the note</Text>
          {citations.map((c, i) => (
            <SourceLink
              key={c.url}
              citation={c.host}
              record={c.label}
              url={c.url}
              kind="record"
              testID={`${testID}-link-${i}`}
            />
          ))}
        </View>
      ) : null}
    </>
  );
  if (note.length <= NOTE_INLINE_LIMIT)
    return (
      <View style={styles.citations} testID={testID}>
        {body}
      </View>
    );
  return (
    <Disclosure
      label="Division note"
      accessibilityLabel={`Division note, ${words(note)} words`}
      testID={testID}
    >
      {body}
    </Disclosure>
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
    <View style={styles.citations}>
      <Text variant="kicker" testID={`${testID}-label`}>
        {label}
      </Text>
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
  const recorded = identity.recorded && !notParty.has(party.trim());
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
      {recorded && identity.color ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.dot, { backgroundColor: identity.color }]}
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
    gap: spacing.s4,
    minHeight: minimumTarget,
    paddingVertical: spacing.s3,
  },
  rowText: { flex: 1, gap: spacing.s1 },
  semibold: { fontFamily: fonts.sansSemiBold },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: minimumTarget,
    paddingVertical: spacing.s2,
  },
  optionText: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.s3,
  },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  check: { width: 36, alignItems: 'center' },
  grow: { flexShrink: 1, flexGrow: 1 },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: minimumTarget,
    paddingVertical: spacing.s2,
  },
  splits: { gap: spacing.s3 },
  citations: { gap: spacing.s1 },
  disclosure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: minimumTarget,
    paddingVertical: spacing.s2,
  },
  splitList: { gap: spacing.s4 },
  split: { gap: spacing.s2 },
  splitHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.s3,
  },
  // Side by side, the counts keep their line and the party name wraps.
  counts: { flexShrink: 0 },
  party: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  bars: { gap: 2 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.sunken },
  bar: { height: 6, borderRadius: 3 },
  bullet: { flexDirection: 'row', gap: spacing.s3 },
});
