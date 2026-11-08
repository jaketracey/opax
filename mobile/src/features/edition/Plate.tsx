import { useEffect, useState, type Ref } from 'react';
import { Image, StyleSheet, Text as NativeText, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import type { EditionView } from '../../api/selectors';
import { portraits, yearPictures } from '../../api/runtime';
import { localImageURI } from '../../api/image-policy';
import { yearPictureKey } from '../../api/year-picture-policy';
import { useAccessibilitySize } from '../../design/accessibility';
import { formatDate } from '../../design/format';
import { Icon } from '../../design/icon';
import { Portrait } from '../../design/people';
import { Text } from '../../design/text';
import { VoteSplit } from '../../design/charts';
import { colors, fonts, radii, rhythm } from '../../design/tokens';
import type { YearPicture } from '../explore/pictures';
import {
  editionInk,
  editionSymbol,
  editionPerson,
  type EditionTier,
} from './model';

export function Plate({
  edition,
  tier = 'fresh',
  story = false,
  photograph,
  onTitleLayout,
  titleRef,
  testID = 'today-edition',
}: {
  edition: EditionView;
  tier?: EditionTier;
  story?: boolean;
  photograph?: YearPicture;
  onTitleLayout?: (event: LayoutChangeEvent) => void;
  titleRef?: Ref<View>;
  testID?: string;
}) {
  const large = useAccessibilitySize();
  const ink = editionInk(edition);
  const person = edition.kind === 'politician' ? editionPerson(edition) : null;
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
          >
            {[person.party, person.place].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ) : edition.facts.line ? (
        <Text wordSafe variant="secondary" tone="onBandSoft">
          {edition.facts.line}
        </Text>
      ) : null}
      <PlateArt edition={edition} story={story} testID={`${testID}-art`} />
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
  testID,
}: {
  edition: EditionView;
  story?: boolean;
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
    source: 'OPAX daily edition',
  };
  return (
    <View testID={testID} style={styles.art}>
      {edition.kind === 'bill' && first && latest ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.stageArt}
        >
          <View style={styles.rail} />
          <View style={styles.dots}>
            {events.map((_, i) => (
              <View key={i} style={styles.dot} />
            ))}
          </View>
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
        </View>
      ) : division ? (
        <VoteSplit {...division} countsStyle="votes" onBand {...provenance} />
      ) : ['program', 'grant', 'largest'].includes(edition.kind) &&
        figures[0] ? (
        <View
          accessible
          accessibilityLabel={`${figures[0].value}, ${figures[0].label}, ${formatDate(edition.date, 'long')}`}
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
        Photo: {photograph.credit} · {photograph.licence}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  plate: { padding: 20, gap: 4 },
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
    fontSize: 34,
    lineHeight: 44,
    color: colors.onBand,
  },
  art: { marginTop: rhythm.block },
  stageArt: { paddingTop: 4 },
  rail: {
    position: 'absolute',
    top: 8,
    left: 5,
    right: 5,
    height: 2,
    backgroundColor: colors.onBandSoft,
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
