import { useEffect, useState, type Ref } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Image, Text as NativeText, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { localImageURI } from '../../api/image-policy';
import { portraits, yearPictures } from '../../api/runtime';
import type { EditionView } from '../../api/selectors';
import { yearPictureKey } from '../../api/year-picture-policy';
import {
  useAccessibilitySize,
  useReduceMotionSetting,
} from '../../design/accessibility';
import { VoteSplit } from '../../design/charts';
import { formatDate, spokenFigures } from '../../design/format';
import { Icon } from '../../design/icon';
import { Portrait } from '../../design/people';
import { Text } from '../../design/text';
import {
  colors,
  interfaceFonts as fonts,
  motion,
  radii,
  rhythm,
} from '../../design/tokens';
import type { YearPicture } from '../explore/pictures';
import {
  editionInk,
  editionPerson,
  editionSymbol,
  plateLine,
  type EditionTier,
} from './model';
import { timelineKey, timelineMayDraw, timelineShown } from './timeline-draw';

export function Plate({
  edition,
  tier = 'fresh',
  story = false,
  photograph,
  onTitleLayout,
  titleRef,
  shownBelow,
  still = false,
  testID = 'today-edition',
}: {
  edition: EditionView;
  /** Paragraphs drawn under the plate; the detail line drops their sentences. */
  shownBelow?: readonly string[];
  tier?: EditionTier;
  story?: boolean;
  /** Drawn finished, with no motion: for an image of the plate. */
  still?: boolean;
  photograph?: YearPicture;
  onTitleLayout?: (event: LayoutChangeEvent) => void;
  titleRef?: Ref<View>;
  testID?: string;
}) {
  const large = useAccessibilitySize();
  const ink = editionInk(edition);
  const person = edition.kind === 'politician' ? editionPerson(edition) : null;
  const detailLine = plateLine(edition.facts.line, shownBelow, edition);
  const band =
    ink === 'bills'
      ? colors.bandBills
      : ink === 'money'
        ? colors.bandMoney
        : ink === 'people'
          ? colors.bandPeople
          : colors.bandVotes;
  const date = story
    ? formatDate(edition.date, 'long')
    : tier === 'recent'
      ? new Intl.DateTimeFormat('en-AU', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          timeZone: 'Australia/Sydney',
        })
          .format(new Date(`${edition.date}T12:00:00Z`))
          .replace(',', '')
      : formatDate(edition.date, 'short');
  const title = story ? edition.title : edition.cardTitle;
  const role =
    edition.kind === 'politician'
      ? 'pageTitle'
      : edition.kind === 'largest'
        ? 'sectionTitle'
        : story && title.length > 80
          ? 'recordHeading'
          : 'recordTitle';
  const heading =
    !story && large && !['politician', 'largest'].includes(edition.kind) ? (
      <NativeText
        testID={`${testID}-title`}
        accessibilityRole="header"
        allowFontScaling={false}
        style={styles.fixedTitle}
      >
        {title}
      </NativeText>
    ) : (
      <Text
        wordSafe
        variant={role}
        tone="onBand"
        accessibilityRole="header"
        // The story's plate holds six lines from AX1, so its detail line
        // stays on the first screen (sweep 2, item 7.2). VoiceOver reads the
        // title whole, and the bill page prints it in full. Today's card
        // and default sizes are unchanged.
        numberOfLines={story && large ? 6 : undefined}
        ellipsizeMode={story && large ? 'tail' : undefined}
        testID={`${testID}-title`}
      >
        {title}
      </Text>
    );
  return (
    <View
      testID={story ? testID : `${testID}-plate`}
      style={[styles.plate, { backgroundColor: band }, story && styles.rounded]}
    >
      <View style={styles.kicker}>
        <Icon
          name={editionSymbol(edition)}
          size={15}
          tone="onBand"
          type="hierarchical"
        />
        <Text
          wordSafe
          variant="footnote"
          tone="onBandSoft"
          style={styles.kickerText}
          maxFontSizeMultiplier={1.353}
          testID={`${testID}-kicker`}
        >
          {edition.kindShort} · {date}
        </Text>
      </View>
      <View
        ref={titleRef}
        onLayout={onTitleLayout}
        style={[
          styles.heading,
          edition.kind === 'politician' && !large && styles.person,
        ]}
      >
        {edition.kind === 'politician' ? (
          <EditionPortrait name={edition.title} />
        ) : null}
        <View style={styles.title}>{heading}</View>
      </View>
      {person && (person.party || person.place) ? (
        <View style={styles.personDetail}>
          {person.party ? (
            <View
              style={[styles.dot, { backgroundColor: colors.onBandSoft }]}
            />
          ) : null}
          <Text
            wordSafe
            variant="secondary"
            tone="onBandSoft"
            style={styles.title}
            maxFontSizeMultiplier={large ? 1.353 : undefined}
          >
            {[person.party, person.place].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ) : detailLine ? (
        <Text
          wordSafe
          variant="secondary"
          tone="onBandSoft"
          testID={`${testID}-line`}
          maxFontSizeMultiplier={large ? 1.353 : undefined}
        >
          {detailLine}
        </Text>
      ) : null}
      <PlateArt
        edition={edition}
        story={story}
        still={still}
        testID={`${testID}-art`}
      />
      {photograph ? (
        <ArchivePhotograph
          photograph={photograph}
          onBand
          testID={`${testID}-photo`}
        />
      ) : null}
    </View>
  );
}

function EditionPortrait({ name }: { name: string }) {
  const [uri, setURI] = useState<{ name: string; uri: string } | null>(null);
  useEffect(() => {
    let active = true;
    void portraits
      .get({ name })
      .then((photo) => {
        if (active && photo)
          setURI({ name, uri: localImageURI(photo.localURI) });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [name]);
  return (
    <Portrait
      size={72}
      name={name}
      localURI={uri?.name === name ? localImageURI(uri.uri) : undefined}
    />
  );
}

/** A compact rendering of recorded values, with no decorative illustration. */
export function PlateArt({
  edition,
  story = false,
  still = false,
  testID,
}: {
  edition: EditionView;
  story?: boolean;
  /** The timeline finished, with no motion (an image of the plate). */
  still?: boolean;
  testID?: string;
}) {
  const large = useAccessibilitySize();
  const { figures, events, division, bars } = edition.facts;
  if (
    !(edition.kind === 'bill' && events.length) &&
    !division &&
    !(
      ['program', 'grant', 'largest'].includes(edition.kind) && figures.length
    ) &&
    !(edition.kind === 'topic' && bars)
  )
    return null;
  const first = events[0];
  const latest = events.at(-1);
  const provenance = {
    dateRange: { start: edition.date, end: edition.date },
    citation: 'OPAX daily edition',
  };
  return (
    <View testID={testID} style={styles.art}>
      {edition.kind === 'bill' && first && latest ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.stageArt}
        >
          <StageTimeline
            key={timelineKey(edition)}
            drawKey={timelineKey(edition)}
            stops={events.length}
            still={still}
            testID={testID && `${testID}-timeline`}
          />
          {large ? (
            <Text
              testID={testID && `${testID}-ends`}
              variant="footnote"
              tone="onBandSoft"
              maxFontSizeMultiplier={1.353}
              // One line when the ends fit; a long stage name wraps to a
              // second line rather than ending in an ellipsis.
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={{ marginTop: rhythm.tight, textAlign: 'left' }}
            >
              {first.text.split(/ in |,/)[0]}{' '}
              {first.date.replace(/ \d{4}$/, '')}
              {' · '}
              {latest.text.split(/ in |,/)[0]}{' '}
              {latest.date.replace(/ \d{4}$/, '')}
            </Text>
          ) : (
            <View style={styles.ends}>
              <Text
                wordSafe
                variant="footnote"
                tone="onBandSoft"
                style={styles.end}
              >
                {first.text.split(/ in |,/)[0]}{' '}
                {first.date.replace(/ \d{4}$/, '')}
              </Text>
              <Text
                wordSafe
                variant="footnote"
                tone="onBandSoft"
                style={[styles.end, styles.latest]}
              >
                {latest.text.split(/ in |,/)[0]}{' '}
                {latest.date.replace(/ \d{4}$/, '')}
              </Text>
            </View>
          )}
        </View>
      ) : division ? (
        <VoteSplit {...division} countsStyle="votes" onBand {...provenance} />
      ) : ['program', 'grant', 'largest'].includes(edition.kind) &&
        figures[0] ? (
        <View
          accessible
          accessibilityLabel={spokenFigures(
            `${figures[0].value}, ${figures[0].label}, ${formatDate(edition.date, 'long')}`,
          )}
        >
          <Text wordSafe variant="figure" tone="onBand">
            {figures[0].value}
          </Text>
          <Text wordSafe variant="secondary" tone="onBandSoft">
            {figures[0].label}
          </Text>
        </View>
      ) : edition.kind === 'topic' && bars ? (
        <View style={styles.bars}>
          {bars.items.slice(0, 4).map((bar, i) => (
            <View
              key={i}
              accessible
              accessibilityLabel={`${bar.label}, ${bar.pct} percent`}
            >
              <View style={styles.barLabel}>
                <Text
                  wordSafe
                  variant="secondary"
                  tone="onBandSoft"
                  style={styles.title}
                >
                  {bar.label}
                </Text>
                <Text variant="secondary" tone="onBandSoft">
                  {bar.pct}%
                </Text>
              </View>
              <View
                style={[
                  styles.share,
                  { width: `${bar.pct}%`, height: large ? 2 : story ? 6 : 4 },
                ]}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** The rail's draw, left to right; the last stop's swell follows it. */
export const TIMELINE_DRAW_MS = 600;
export const TIMELINE_SETTLE_MS = 240;
/** The share of the rail over which a stop lands as the line reaches it. */
const LANDING = 0.12;

/**
 * A stop's look while the rail draws: it lands (fades in, growing from 60
 * per cent) as the line reaches it, `at` along the rail; the last stop then
 * rises to 1.25 and settles back as `settle` runs 0 to 1. Both at 1 is the
 * finished line: every stop whole, at its size.
 */
export function timelineStop(
  progress: number,
  settle: number,
  at: number,
  last: boolean,
): { opacity: number; scale: number } {
  'worklet';
  const landed = Math.min(
    1,
    Math.max(0, (progress - at * (1 - LANDING)) / LANDING),
  );
  const swell = last && settle < 1 ? 1 + 0.25 * Math.sin(Math.PI * settle) : 1;
  return { opacity: landed, scale: (0.6 + 0.4 * landed) * swell };
}

/**
 * The bill plate's stage line (sweep 3, item 8). On the edition's first
 * appearance this launch the rail draws left to right over 600 ms with the
 * standard ease, each stop landing as the line reaches it, and the last stop
 * swells slightly and settles. Every other time, under Reduce Motion (or
 * before the setting is known), and for a still plate it is drawn finished
 * from its first frame: never a partly drawn line in an image.
 */
function StageTimeline({
  drawKey,
  stops,
  still,
  testID,
}: {
  drawKey: string;
  stops: number;
  still: boolean;
  testID?: string;
}) {
  const reduce = useReduceMotionSetting();
  // Decided once, at mount: a re-render never restarts or skips the draw.
  const [draws] = useState(
    () => !still && reduce === false && timelineMayDraw(drawKey),
  );
  const progress = useSharedValue(draws ? 0 : 1);
  const settle = useSharedValue(draws ? 0 : 1);
  useEffect(() => {
    // An image of the plate is not the reader seeing it: its turn stays.
    if (!still) timelineShown(drawKey);
    if (!draws) return;
    progress.set(
      withTiming(1, {
        duration: TIMELINE_DRAW_MS,
        easing: Easing.bezier(...motion.easing.standard),
      }),
    );
    settle.set(
      withDelay(
        TIMELINE_DRAW_MS,
        withTiming(1, { duration: TIMELINE_SETTLE_MS }),
      ),
    );
  }, [draws, drawKey, still, progress, settle]);
  // Reduce Motion turned on mid-draw: the finished line at once.
  useEffect(() => {
    if (!draws || reduce !== true) return;
    cancelAnimation(progress);
    cancelAnimation(settle);
    progress.set(1);
    settle.set(1);
  }, [draws, reduce, progress, settle]);
  const rail = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }));
  return (
    <>
      <Animated.View
        testID={testID && `${testID}-rail`}
        style={[styles.rail, rail]}
      />
      <View style={styles.dots}>
        {Array.from({ length: stops }, (_, i) => (
          <TimelineStop
            key={i}
            at={stops > 1 ? i / (stops - 1) : 0}
            last={i === stops - 1}
            progress={progress}
            settle={settle}
            testID={testID && `${testID}-stop-${i}`}
          />
        ))}
      </View>
    </>
  );
}

function TimelineStop({
  at,
  last,
  progress,
  settle,
  testID,
}: {
  /** Where the stop sits along the rail, 0 to 1. */
  at: number;
  last: boolean;
  progress: SharedValue<number>;
  settle: SharedValue<number>;
  testID?: string;
}) {
  const style = useAnimatedStyle(() => {
    const look = timelineStop(progress.value, settle.value, at, last);
    return { opacity: look.opacity, transform: [{ scale: look.scale }] };
  });
  return <Animated.View testID={testID} style={[styles.dot, style]} />;
}

/** Shared with the archive card: cached local pixels and an unclamped credit. */
export function ArchivePhotograph({
  photograph,
  onBand = false,
  testID,
}: {
  photograph: YearPicture;
  onBand?: boolean;
  testID?: string;
}) {
  const [image, setImage] = useState<{ file: string; uri: string } | null>(
    null,
  );
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void yearPictures
      .get(yearPictureKey(`/${photograph.file}`))
      .then((uri) => {
        if (active && uri)
          setImage({ file: photograph.file, uri: localImageURI(uri) });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [photograph.file]);
  return (
    <View testID={testID} style={styles.bars}>
      {image?.file === photograph.file && failed !== photograph.file ? (
        <Image
          source={{ uri: localImageURI(image.uri) }}
          accessibilityLabel={photograph.caption}
          accessibilityIgnoresInvertColors
          style={styles.photo}
          onError={() => setFailed(photograph.file)}
        />
      ) : null}
      <Text
        wordSafe
        variant="footnote"
        tone={onBand ? 'onBandSoft' : 'inkSoft'}
      >
        Photo: {photograph.credit}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  plate: { padding: 20, gap: rhythm.line },
  rounded: { borderRadius: radii.container, borderCurve: 'continuous' },
  kicker: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  kickerText: { flex: 1, fontWeight: '600' },
  heading: { gap: 12, marginTop: 4 },
  person: { flexDirection: 'row', alignItems: 'center' },
  personDetail: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1 },
  fixedTitle: {
    fontFamily: fonts.serifBold,
    fontWeight: '700',
    // a11y-ok(raw-font-size): from AX1 up the edition card's title holds
    // 34 pt (recordHeading's AX1 size) by design, so a long record name
    // stays under half the screen at AX5 (Today spec, refinement 3).
    fontSize: 34,
    lineHeight: 44,
    color: colors.onBand,
  },
  // The plate already contributes its 4 pt sibling gap to the 16 pt art spacing.
  art: { marginTop: rhythm.block - rhythm.line },
  stageArt: { paddingTop: 4 },
  rail: {
    position: 'absolute',
    top: 8,
    left: 5,
    right: 5,
    height: 2,
    backgroundColor: colors.onBandSoft,
    // It draws from the first stop's centre.
    transformOrigin: 'left',
  },
  dots: { flexDirection: 'row', justifyContent: 'space-between' },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderCurve: 'continuous',
    backgroundColor: colors.onBand,
  },
  ends: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 8,
  },
  end: { flex: 1 },
  latest: { textAlign: 'right' },
  bars: { gap: 8 },
  barLabel: { flexDirection: 'row', gap: 8 },
  share: {
    backgroundColor: colors.onBand,
    borderRadius: 2,
    borderCurve: 'continuous',
  },
  photo: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: radii.container,
    borderCurve: 'continuous',
  },
});
