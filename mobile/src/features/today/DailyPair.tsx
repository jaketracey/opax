import { StyleSheet, View } from 'react-native';
import { useAccessibilitySize } from '../../design/accessibility';
import { Card } from '../../design/card';
import { Icon } from '../../design/icon';
import type { RowMenuAction } from '../../design/row-link';
import { LoadingStatus } from '../../design/states';
import { formatDate } from '../../design/format';
import { Text } from '../../design/text';
import { radii, rhythm } from '../../design/tokens';
import { makeStyles } from '../../design/use-colors';
import { exploreQuizRoute, exploreToolRoute } from '../../navigation/routes';
import { shareRecord } from '../../navigation/share';
import { presentSheet } from '../../navigation/sheets';
import { Picture } from '../explore/Picture';
import { archiveAttribution } from '../explore/photo-credit';
import type { YearPicture } from '../explore/pictures';
import type { FrontPageQuestion } from '../explore/quiz-model';
import { frontPageDeck } from '../explore/quiz/data';
import { explore } from '../explore/runtime';
import { archiveYear, questionIndex, type SydneyDate } from './rules';
import { frontPageSkip } from './archive-review';
import { rules } from './sources';
import { QuizArt } from './QuizArt';
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
  const styles = useStyles();

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
 * The card's label. A photograph from an earlier year is "From the
 * archive" with its year. One from this year is not an archive piece: it is
 * "From the record" with its full date ("3 Nov 2026"), or the year when the
 * photograph carries no whole date.
 */
export function archiveLabel(
  year: number,
  date: string | null,
  today?: SydneyDate,
): { kicker: string; figure: string } {
  if (!today || today.slice(0, 4) !== String(year))
    return { kicker: 'From the archive', figure: String(year) };
  const whole =
    date && /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : '';
  return {
    kicker: 'From the record',
    figure: (whole && formatDate(whole, 'short')) || String(year),
  };
}

/**
 * From the archive: the day's photograph fills a 4:3 frame, then the year,
 * the caption up to three lines, expanding at accessibility text sizes,
 * and "Photo: {author} · {licence}", never clamped. One element; it opens
 * the Time machine on that year with that photograph first.
 *
 * The frame keeps its 4:3 shape whatever happens to the photograph: a
 * photo that cannot be loaded leaves the frame with a faint mark. It used to give
 * the frame back, and everything under the card moved up about 150 pt.
 */
export function ArchiveCard({
  year,
  picture,
  today,
}: {
  year: number;
  picture: YearPicture;
  /** Today in Sydney: a photograph from this year is not "the archive". */
  today?: SydneyDate;
}) {
  const styles = useStyles();

  const large = useAccessibilitySize();
  const attribution = archiveAttribution(picture);
  const { kicker, figure } = archiveLabel(year, picture.date, today);
  return (
    <Card
      testID="today-archive"
      padded={false}
      href={exploreToolRoute('tm', {
        year: String(year),
        photo: picture.file,
      })}
      accessibilityRole="link"
      accessibilityLabel={`${kicker}, ${figure}. ${picture.caption}.${attribution ? ` Photo: ${attribution}.` : ''}`}
      accessibilityHint="Opens the Time machine"
      menu={[
        howChosen(rules.archive),
        {
          title: 'Share',
          symbol: 'square.and.arrow.up',
          onPress: () =>
            void shareRecord({
              title: `${kicker}, ${figure}`,
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
        failure="mark"
      />
      <View style={styles.words}>
        <Kicker symbol="clock.arrow.circlepath" ink="tint">
          {kicker}
        </Kicker>
        {/* Word-safe: at the largest sizes in a narrow column the date
            wraps at its spaces or steps down, never inside "2026". */}
        <Text wordSafe variant="tileFigure" testID="today-archive-figure">
          {figure}
        </Text>
        <Text
          wordSafe
          variant="secondary"
          numberOfLines={large ? undefined : 3}
        >
          {picture.caption}
        </Text>
        {attribution ? (
          <Text
            wordSafe
            variant="footnote"
            tone="inkSoft"
            testID="today-archive-credit"
          >{`Photo: ${attribution}`}</Text>
        ) : null}
      </View>
    </Card>
  );
}

/** One line of the archive card while it loads, as tall as the real line. */
function Bone({
  variant,
  width,
}: {
  variant: 'footnote' | 'tileFigure' | 'secondary';
  width: `${number}%`;
}) {
  const styles = useStyles();

  return (
    <View>
      <Text variant={variant} numberOfLines={1} style={styles.boneLine}>
        {'\u00a0'}
      </Text>
      <View style={[styles.boneBar, { width }]} />
    </View>
  );
}

/**
 * The archive card while the day's photograph is looked up, in the card's
 * own shape: the 4:3 frame, then the kicker, the year, three lines of
 * caption and the credit. The loaded card lands on it, so the cards under
 * it do not move (they were pushed down about 150 pt by a shorter stand-in).
 */
export function ArchiveSkeleton() {
  const styles = useStyles();

  return (
    <LoadingStatus
      accessibilityLabel="Loading the archive photograph"
      testID="today-archive-loading"
      style={styles.fill}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="today-archive-loading-shape"
        style={styles.fill}
      >
        <Card padded={false} style={styles.card}>
          <View testID="today-archive-loading-frame" style={styles.boneFrame} />
          <View testID="today-archive-loading-words" style={styles.words}>
            <Bone variant="footnote" width="40%" />
            <Bone variant="tileFigure" width="25%" />
            <Bone variant="secondary" width="100%" />
            <Bone variant="secondary" width="100%" />
            <Bone variant="secondary" width="60%" />
            <Bone variant="footnote" width="70%" />
          </View>
        </Card>
      </View>
    </LoadingStatus>
  );
}

/**
 * Today's question (today.md 5.10): the question in OPAX's words, no answer
 * and no options; it opens the quiz on that question. Its header is the
 * quiz art in the archive photograph's frame (the card's full width, 4:3,
 * the card's own corners), so the two cards start alike and, side by side,
 * end on the same line. The art is decoration: the card is one link, read
 * as before.
 */
export function QuestionCard({ question }: { question: FrontPageQuestion }) {
  const styles = useStyles();

  return (
    <Card
      testID="today-question"
      padded={false}
      href={exploreQuizRoute(question.id)}
      accessibilityRole="link"
      accessibilityLabel={`Today’s question. ${question.prompt}`}
      accessibilityHint="Opens the quiz on this question"
      menu={[howChosen(rules.question)]}
      style={styles.card}
    >
      <QuizArt />
      <View style={[styles.words, styles.question]}>
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
  const styles = useStyles();

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
          <View style={styles.cell}>
            <ArchiveSkeleton />
          </View>
        ) : archive ? (
          <View style={styles.cell}>
            <ArchiveCard
              year={archive.year}
              picture={archive.picture}
              today={today}
            />
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

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    pair: { gap: 12, alignItems: 'stretch' },
    // The skeleton's wrappers pass the row's height on to its card, so beside
    // a taller question card it ends where the loaded card will.
    fill: { flexGrow: 1 },
    // Side by side, each cell is as tall as the row, and its card fills it.
    cell: { alignSelf: 'stretch', flexGrow: 1 },
    // The photograph's frame, as Picture draws it before the photo arrives.
    boneFrame: {
      width: '100%',
      aspectRatio: 4 / 3,
      backgroundColor: colors.sunken,
    },
    boneLine: { opacity: 0 },
    boneBar: {
      position: 'absolute',
      left: 0,
      top: 3,
      bottom: 3,
      borderRadius: radii.bar,
      borderCurve: 'continuous',
      backgroundColor: colors.sunken,
    },
    card: { flexGrow: 1, flexShrink: 1 },
    words: { padding: 12, gap: rhythm.line },
    question: { gap: rhythm.tight },
    kicker: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  }),
);
