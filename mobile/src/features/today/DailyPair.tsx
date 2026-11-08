import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useAccessibilitySize } from '../../design/accessibility';
import { Card } from '../../design/card';
import { Icon } from '../../design/icon';
import type { RowMenuAction } from '../../design/row-link';
import { Skeleton } from '../../design/states';
import { Text } from '../../design/text';
import { rhythm } from '../../design/tokens';
import { exploreQuizRoute, exploreToolRoute } from '../../navigation/routes';
import { presentSheet } from '../../navigation/sheets';
import { shareRecord } from '../../navigation/share';
import type { YearPicture } from '../explore/pictures';
import { Picture } from '../explore/Picture';
import { frontPageDeck } from '../explore/quiz/data';
import type { FrontPageQuestion } from '../explore/quiz-model';
import { explore } from '../explore/runtime';
import { archiveYear, questionIndex, type SydneyDate } from './rules';
import { rules } from './sources';
import { useTodayRead } from './TodayBlock';

/** A licence that allows the photograph on the front page (no NC or ND terms). */
export const frontPageLicence = (licence: string) =>
  !/\b(NC|ND)\b|non-?commercial|no-?deriv/i.test(licence);

/** The day's photograph: the first in the day's year whose licence allows it. */
export function archivePicture(
  pictures: Record<string, readonly YearPicture[]> | null | undefined,
  today: SydneyDate,
): { year: number; picture: YearPicture } | null {
  const year = archiveYear(today);
  const picture = (pictures?.[String(year)] ?? []).find((p) =>
    frontPageLicence(p.licence),
  );
  return picture ? { year, picture } : null;
}

/** Today's question from the reviewed front-page deck, or null with no deck. */
export function dailyQuestion(
  today: SydneyDate,
  deck: readonly FrontPageQuestion[] = frontPageDeck,
): FrontPageQuestion | null {
  const index = questionIndex(today, deck.length);
  return index < 0 ? null : deck[index]!;
}

const howChosen = (rule: string): RowMenuAction => ({
  title: 'How this is chosen',
  symbol: 'info.circle',
  onPress: () =>
    presentSheet({ kind: 'rule', title: 'How this is chosen', rule }),
});

/** The card's kicker: a symbol and a footnote line ("From the archive"). */
function Kicker({
  symbol,
  ink,
  children,
}: {
  symbol: 'clock.arrow.circlepath' | 'puzzlepiece.extension';
  ink: 'tint' | 'votes';
  children: string;
}) {
  return (
    <View style={styles.kicker}>
      <Icon
        name={symbol}
        size={15}
        maxScale={1.5}
        tone={ink === 'votes' ? 'votesInk' : 'link'}
        type="hierarchical"
      />
      <Text wordSafe variant="footnote" tone="inkSoft">
        {children}
      </Text>
    </View>
  );
}

/**
 * From the archive (today.md 5.10): the day's photograph at 16:10, the year,
 * the caption clamped to three lines (the full caption is a tap away in the
 * Time machine) and "Photo: {credit}", never clamped. One element; it opens
 * the Time machine on that year with that photograph first.
 */
export function ArchiveCard({
  year,
  picture,
}: {
  year: number;
  picture: YearPicture;
}) {
  return (
    <Card
      testID="today-archive"
      padded={false}
      href={exploreToolRoute('tm', {
        year: String(year),
        photo: picture.file,
      })}
      accessibilityRole="link"
      accessibilityLabel={`From the archive, ${year}. ${picture.caption}. Photo: ${picture.credit}.`}
      accessibilityHint="Opens the Time machine"
      menu={[
        howChosen(rules.archive),
        {
          title: 'Share',
          symbol: 'square.and.arrow.up',
          onPress: () =>
            void shareRecord({
              title: `From the archive, ${year}`,
              path: `/explore?game=tm&year=${year}`,
            }),
        },
      ]}
      style={styles.card}
    >
      <Picture file={picture.file} ratio={16 / 10} rounded={false} />
      <View style={styles.words}>
        <Kicker symbol="clock.arrow.circlepath" ink="tint">
          From the archive
        </Kicker>
        <Text variant="tileFigure">{String(year)}</Text>
        <Text wordSafe variant="secondary" numberOfLines={3}>
          {picture.caption}
        </Text>
        <Text wordSafe variant="footnote" tone="inkSoft">
          {`Photo: ${picture.credit}`}
        </Text>
      </View>
    </Card>
  );
}

/**
 * Today's question (today.md 5.10): the question in OPAX's words, no answer
 * and no options; it opens the quiz on that question.
 */
export function QuestionCard({ question }: { question: FrontPageQuestion }) {
  return (
    <Card
      testID="today-question"
      href={exploreQuizRoute(question.id)}
      accessibilityRole="link"
      accessibilityLabel={`Today’s question. ${question.prompt}`}
      accessibilityHint="Opens the quiz on this question"
      menu={[howChosen(rules.question)]}
      style={styles.card}
    >
      <View style={styles.question}>
        <Kicker symbol="puzzlepiece.extension" ink="votes">
          Today’s question
        </Kicker>
        <Text wordSafe variant="subsectionTitle">
          {question.prompt}
        </Text>
      </View>
    </Card>
  );
}

/**
 * The daily pair: From the archive and Today's question, side by side and
 * stretched to the taller card; one per line at accessibility sizes or
 * below 375 pt. A card whose data is missing is absent and the other takes
 * the full width; with both absent, nothing is drawn.
 */
export function DailyPair({
  today,
  attempt,
}: {
  today: SydneyDate;
  attempt: number;
}) {
  const large = useAccessibilitySize();
  const { width } = useWindowDimensions();
  const stacked = large || width < 375;
  const read = useTodayRead(
    'pictures',
    // The manifest is optional: a failed read collapses the archive card.
    () => explore.pictures().catch(() => null),
    attempt,
  );
  const loading = read === null && attempt === 0;
  const archive = read ? archivePicture(read.data, today) : null;
  const question = dailyQuestion(today);
  if (!loading && !archive && !question) return null;
  return (
    <View
      testID="today-pair"
      style={[styles.pair, stacked ? null : styles.row]}
    >
      {loading ? (
        <View style={[styles.cell, styles.loading]}>
          <Skeleton
            shape="card"
            count={1}
            label="Loading the archive photograph"
            testID="today-archive-loading"
          />
        </View>
      ) : archive ? (
        <View style={styles.cell}>
          <ArchiveCard year={archive.year} picture={archive.picture} />
        </View>
      ) : null}
      {question ? (
        <View style={styles.cell}>
          <QuestionCard question={question} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pair: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  cell: { flex: 1 },
  loading: { minHeight: 200 },
  card: { flex: 1 },
  words: { padding: 12, gap: rhythm.line },
  question: { gap: rhythm.tight },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
