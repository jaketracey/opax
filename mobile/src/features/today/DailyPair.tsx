import { StyleSheet, View } from 'react-native';
import { useAccessibilitySize } from '../../design/accessibility';
import { Card } from '../../design/card';
import { Icon } from '../../design/icon';
import type { RowMenuAction } from '../../design/row-link';
import { Skeleton } from '../../design/states';
import { Text } from '../../design/text';
import { rhythm } from '../../design/tokens';
import { exploreQuizRoute, exploreToolRoute } from '../../navigation/routes';
import { shareRecord } from '../../navigation/share';
import { presentSheet } from '../../navigation/sheets';
import { Picture } from '../explore/Picture';
import { creditShown } from '../explore/photo-credit';
import type { YearPicture } from '../explore/pictures';
import type { FrontPageQuestion } from '../explore/quiz-model';
import { frontPageDeck } from '../explore/quiz/data';
import { explore } from '../explore/runtime';
import { archiveYear, questionIndex, type SydneyDate } from './rules';
import { frontPageSkip } from './archive-review';
import { rules } from './sources';
import { SurfaceGrid } from './SurfaceGrid';
import { useTodayRead } from './TodayBlock';

export { creditShown } from '../explore/photo-credit';

/** A licence that allows the photograph on the front page (no NC or ND terms). */
export const frontPageLicence = (licence: string) =>
  !/\b(NC|ND)\b|non-?commercial|no-?deriv/i.test(licence);

/** The first reviewed, licensed photograph in the day's year, or no card. */
export function archivePicture(
  pictures: Record<string, readonly YearPicture[]> | null | undefined,
  today: SydneyDate,
  skip: ReadonlySet<string> = frontPageSkip,
): { year: number; picture: YearPicture } | null {
  const year = archiveYear(today);
  const picture = (pictures?.[String(year)] ?? []).find(
    (p) => !skip.has(p.file) && frontPageLicence(p.licence),
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
 * From the archive: the day's photograph fills a 4:3 frame, then the year,
 * the caption up to three lines, expanding at accessibility text sizes,
 * and "Photo: {credit}", never clamped. One element; it opens
 * the Time machine on that year with that photograph first.
 */
export function ArchiveCard({
  year,
  picture,
}: {
  year: number;
  picture: YearPicture;
}) {
  const large = useAccessibilitySize();
  return (
    <Card
      testID="today-archive"
      padded={false}
      href={exploreToolRoute('tm', {
        year: String(year),
        photo: picture.file,
      })}
      accessibilityRole="link"
      accessibilityLabel={`From the archive, ${year}. ${picture.caption}.${picture.credit ? ` Photo: ${creditShown(picture.credit)}.` : ''}`}
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
      <Picture
        file={picture.file}
        ratio={4 / 3}
        rounded={false}
        resizeMode="cover"
        failure="collapse"
      />
      <View style={styles.words}>
        <Kicker symbol="clock.arrow.circlepath" ink="tint">
          From the archive
        </Kicker>
        <Text variant="tileFigure">{String(year)}</Text>
        <Text
          wordSafe
          variant="secondary"
          numberOfLines={large ? undefined : 3}
        >
          {picture.caption}
        </Text>
        {picture.credit ? (
          <Text
            wordSafe
            variant="footnote"
            tone="inkSoft"
            testID="today-archive-credit"
          >{`Photo: ${creditShown(picture.credit)}`}</Text>
        ) : null}
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
 * The daily pair: From the archive and Today's question each have their
 * own full-width row, with natural heights at every text size. A card
 * whose data is missing is absent; with both absent, nothing is drawn.
 */
export function DailyPair({
  today,
  attempt,
}: {
  today: SydneyDate;
  attempt: number;
}) {
  const read = useTodayRead(
    'pictures',
    // The manifest is optional: a failed read collapses the archive card.
    // The answer is wrapped so a failure (no manifest) is not mistaken for
    // a read still in flight, which would keep the skeleton up for good.
    async () => {
      try {
        return { manifest: await explore.pictures() };
      } catch {
        return { manifest: null };
      }
    },
    attempt,
  );
  const loading = read === null && attempt === 0;
  const archive = read?.manifest
    ? archivePicture(read.manifest.data, today)
    : null;
  const question = dailyQuestion(today);
  if (!loading && !archive && !question) return null;
  return (
    <View testID="today-pair" style={styles.pair}>
      <SurfaceGrid testID="today-pair-grid" gap={12}>
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
      </SurfaceGrid>
    </View>
  );
}

const styles = StyleSheet.create({
  pair: { gap: 12, alignItems: 'stretch' },
  cell: { alignSelf: 'stretch' },
  loading: { minHeight: 200 },
  card: { flexGrow: 0, flexShrink: 1 },
  words: { padding: 12, gap: rhythm.line },
  question: { gap: rhythm.tight },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
