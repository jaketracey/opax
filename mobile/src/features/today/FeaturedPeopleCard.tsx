import { useContext, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useColorScheme,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { catalogs } from '../../api/runtime';
import { useReduceMotionSetting } from '../../design/accessibility';
import { Card } from '../../design/card';
import { copy } from '../../design/copy';
import { GroundFade } from '../../design/ground-fade';
import { formatDate } from '../../design/format';
import { Icon } from '../../design/icon';
import { SurfaceContext } from '../../design/row-padding';
import { SourceLine } from '../../design/source';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { colors, minimumTarget, radii } from '../../design/tokens';
import { personRoute } from '../../navigation/routes/people';
import { canShare } from '../../navigation/share';
import { presentSheet, presentSource } from '../../navigation/sheets';
import { editionMenu, shareEdition } from '../edition/actions';
import { EditionCard } from '../edition/EditionCard';
import { Plate } from '../edition/Plate';
import { editionTier } from '../edition/model';
import { featuredPeople, type FeaturedPerson } from './featured-people';
import { useTodayRead } from './TodayBlock';

const GAP = 12;
const PEEK = 16;
/**
 * The pages run this far past the column on both sides, into the page margin
 * or the gutter between columns (never less than 16 pt), so a neighbouring
 * card fades out there instead of stopping dead at the column's edge.
 */
const BLEED = 16;

/** Today keeps the edition's existing loading, absence and freshness rules. */
export function TodayEditionCard({
  attempt = 0,
  ...props
}: React.ComponentProps<typeof EditionCard> & { attempt?: number }) {
  const edition = props.edition?.status === 'ready' ? props.edition.data : null;
  const tier =
    props.tier ?? (edition ? editionTier(edition.date, props.today) : null);
  const key =
    edition?.kind === 'politician' && tier !== 'old'
      ? `${edition.date}:${edition.title}`
      : null;
  const read = useTodayRead(
    key,
    async (refresh) => {
      const [roster, slugs] = await Promise.all([
        catalogs.roster(refresh),
        catalogs.slugs(refresh),
      ]);
      return { roster, slugs };
    },
    attempt,
  );
  const people = useMemo(
    () =>
      edition && read
        ? featuredPeople(edition, read.roster.data, read.slugs.data)
        : [],
    [edition, read],
  );
  if (tier === 'old') return null;
  if (!people.length || !read) return <EditionCard {...props} />;
  return (
    <FeaturedPeopleCarousel
      key={`${key}:${people.map((person) => person.slug).join(',')}`}
      people={people}
      tier={tier ?? undefined}
      savedAt={props.edition?.stale ? props.edition.savedAt : null}
      rosterSavedAt={read.roster.stale ? read.roster.savedAt : null}
    />
  );
}

/**
 * One card's VoiceOver label: its place, the title, the line and the first
 * paragraph, with no empty parts, and "Machine-written" as the card shows
 * (the card's body is hidden from VoiceOver, so the label must carry it).
 */
export function featuredLabel(
  person: Pick<FeaturedPerson, 'edition'>,
  index: number,
  total: number,
): string {
  const { edition } = person;
  return [
    `Featured parliamentarian, ${index + 1} of ${total}`,
    edition.title,
    edition.facts.line,
    edition.machineWritten ? 'Machine-written' : null,
    edition.paragraphs[0],
  ]
    .map((part) => part?.trim().replace(/\.$/, ''))
    .filter(Boolean)
    .join('. ')
    .concat('.');
}

/**
 * Native snapping, no auto-advance, and natural card heights at AX5. A card
 * that runs off either side fades into the page; the fades lie beyond the
 * selected card, so they never cover it, the dots or a control.
 */
export function FeaturedPeopleCarousel({
  people,
  tier = 'fresh',
  savedAt,
  rosterSavedAt,
}: {
  people: readonly FeaturedPerson[];
  tier?: React.ComponentProps<typeof Plate>['tier'];
  savedAt?: number | null;
  rosterSavedAt?: number | null;
}) {
  const scroll = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  // Which sides have a card running off them, followed through a swipe.
  const [offset, setOffset] = useState(0);
  const ground = useContext(SurfaceContext);
  const reduced = useReduceMotionSetting() !== false;
  const dark = useColorScheme() === 'dark';
  const multiple = people.length > 1;
  const trailing = multiple ? GAP + PEEK : 0;
  const cardWidth = Math.max(1, width - trailing);
  const interval = cardWidth + GAP;
  const end = (people.length - 1) * interval;
  const before = multiple && width > 0 && offset > 0.5;
  const after = multiple && width > 0 && offset < end - 0.5;
  const go = (index: number, animated = !reduced) => {
    const next = Math.max(0, Math.min(people.length - 1, index));
    setPage(next);
    if (!animated) setOffset(next * interval);
    scroll.current?.scrollTo({ x: next * interval, animated });
  };
  const settled = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setOffset(event.nativeEvent.contentOffset.x);
    setPage(
      Math.max(
        0,
        Math.min(
          people.length - 1,
          Math.round(event.nativeEvent.contentOffset.x / interval),
        ),
      ),
    );
  };
  if (!people.length) return null;
  return (
    <View
      testID="today-featured"
      style={styles.carousel}
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width;
        setWidth(nextWidth);
        // Preserve the selected person through rotation or split-view resize.
        const x = page * (Math.max(1, nextWidth - trailing) + GAP);
        setOffset(x);
        scroll.current?.scrollTo({ x, animated: false });
      }}
    >
      <View style={multiple ? styles.pages : undefined}>
        <ScrollView
          ref={scroll}
          testID="today-featured-pages"
          horizontal
          accessible={false}
          accessibilityRole="list"
          accessibilityLabel="Featured parliamentarians"
          showsHorizontalScrollIndicator={false}
          snapToInterval={interval}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          scrollEnabled={multiple && width > 0}
          onMomentumScrollEnd={settled}
          onScrollEndDrag={settled}
          onScroll={(event) => setOffset(event.nativeEvent.contentOffset.x)}
          scrollEventThrottle={16}
          contentContainerStyle={{
            gap: GAP,
            paddingLeft: multiple ? BLEED : 0,
            paddingRight: multiple ? trailing + BLEED : 0,
          }}
        >
          {people.map((person, index) => {
            const cardSavedAt = index === 0 ? savedAt : rosterSavedAt;
            const source = {
              ...person.source,
              notes: [
                ...(cardSavedAt != null
                  ? [copy.savedCopyNote(cardSavedAt)]
                  : []),
                ...(person.source.notes ?? []),
              ],
              dateLabel:
                cardSavedAt != null
                  ? `Saved ${formatDate(cardSavedAt, 'short')}`
                  : undefined,
            };
            return (
              <View
                key={person.slug}
                style={width ? { width: cardWidth } : styles.unmeasured}
              >
                <View
                  style={[styles.card, !dark && styles.shadow]}
                  testID={index === 0 ? 'today-edition-card' : undefined}
                >
                  <Card
                    padded={false}
                    href={personRoute(person.slug, person.edition.title)}
                    testID={
                      index === 0
                        ? 'today-edition'
                        : `today-featured-${person.slug}`
                    }
                    style={styles.link}
                    menu={[
                      ...(canShare
                        ? [
                            {
                              title: 'Share',
                              symbol: 'square.and.arrow.up' as const,
                              onPress: () => void shareEdition(person.edition),
                            },
                          ]
                        : []),
                      ...editionMenu(person.edition).map((action) =>
                        action.title === copy.howChosen
                          ? {
                              ...action,
                              onPress: () =>
                                presentSheet({
                                  kind: 'rule',
                                  title: copy.howChosen,
                                  rule: person.source.rule!,
                                }),
                            }
                          : action,
                      ),
                    ]}
                    accessibilityLabel={featuredLabel(
                      person,
                      index,
                      people.length,
                    )}
                    accessibilityHint="Opens this person’s parliamentary record"
                    accessibilityActions={[
                      {
                        name: 'Sources',
                        label: 'Sources',
                        onAction: () => presentSource(source),
                      },
                      ...(canShare
                        ? [
                            {
                              name: 'Share',
                              label: 'Share',
                              onAction: () => void shareEdition(person.edition),
                            },
                          ]
                        : []),
                    ]}
                  >
                    <View
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    >
                      <Plate
                        edition={person.edition}
                        tier={tier}
                        shownBelow={person.edition.paragraphs.slice(0, 1)}
                        testID={
                          index === 0
                            ? 'today-edition'
                            : `today-featured-${person.slug}`
                        }
                      />
                      <View style={styles.body}>
                        {person.edition.machineWritten ? (
                          <View style={styles.machine}>
                            <Icon
                              name={symbols.machine}
                              size={12}
                              tone="navy"
                            />
                            <Text wordSafe variant="capsule" tone="navy">
                              Machine-written
                            </Text>
                          </View>
                        ) : null}
                        {person.edition.paragraphs[0] ? (
                          <Text wordSafe variant="body">
                            {person.edition.paragraphs[0]}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </Card>
                  <View style={styles.source}>
                    <SourceLine
                      {...source}
                      testID={
                        index === 0
                          ? 'today-edition-sources'
                          : `today-featured-${person.slug}-sources`
                      }
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
        {before ? (
          <GroundFade
            side="left"
            ground={ground}
            testID="today-featured-edge-leading"
            style={styles.before}
          />
        ) : null}
        {after ? (
          <GroundFade
            side="right"
            ground={ground}
            testID="today-featured-edge-trailing"
            style={styles.after}
          />
        ) : null}
      </View>
      {multiple ? (
        <View style={styles.dots} testID="today-featured-dots">
          {people.map((person, index) => (
            <Pressable
              key={person.slug}
              testID={`today-featured-page-${index + 1}`}
              accessibilityRole="button"
              accessibilityLabel={`Show ${person.edition.title}, ${index + 1} of ${people.length}`}
              accessibilityState={{ selected: page === index }}
              onPress={() => go(index)}
              style={styles.pageTarget}
            >
              <View
                style={[styles.dot, page === index && styles.selectedDot]}
              />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  carousel: { gap: 4 },
  pages: { marginHorizontal: -BLEED },
  // Over the margin only: the selected card starts where this ends.
  before: { position: 'absolute', top: 0, bottom: 0, left: 0, width: BLEED },
  // From the next card's leading edge to where the pages are clipped.
  after: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: PEEK + BLEED,
  },
  unmeasured: { width: '100%' },
  card: {
    flexGrow: 1,
    backgroundColor: colors.raised,
    borderRadius: radii.container,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  link: { flexGrow: 1 },
  shadow: {
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
  },
  body: { padding: 20, paddingBottom: 0, gap: 12 },
  source: { paddingHorizontal: 20, paddingBottom: 12 },
  machine: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.navyWash,
    borderRadius: radii.capsule,
    borderCurve: 'continuous',
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  dots: { flexDirection: 'row', justifyContent: 'center' },
  pageTarget: {
    width: minimumTarget,
    height: minimumTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderCurve: 'continuous',
    backgroundColor: colors.inkFaint,
  },
  selectedDot: { width: 16, backgroundColor: colors.navy },
});
