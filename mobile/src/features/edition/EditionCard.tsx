import { StyleSheet, View, useColorScheme } from 'react-native';
import type { Block, EditionView } from '../../api/selectors';
import { Card } from '../../design/card';
import { Icon } from '../../design/icon';
import { LoadingStatus, Skeleton } from '../../design/states';
import { SourceLine } from '../../design/source';
import { Text } from '../../design/text';
import { colors, hairline, minimumTarget, radii } from '../../design/tokens';
import { editionRoute } from '../../navigation/routes/edition';
import { presentSource } from '../../navigation/sheets';
import { counted, formatDate } from '../../design/format';
import { copy } from '../../design/copy';
import { symbols } from '../../design/symbols';
import { canShare } from '../../navigation/share';
import { editionSources, editionTier, type EditionTier } from './model';
import { editionMenu, shareEdition } from './actions';
import { useEditionSubject } from './data';
import { Plate } from './Plate';

/**
 * The edition card's outline while it loads (sweep 3, item 1): the raised
 * card with its corners, a hairline edge and, on Today, the card's shadow;
 * the plate a block one step darker than the bars. Sunken on sunken, the
 * plate vanished into Today's ground and left a square-topped body.
 */
export function EditionSkeleton({ story = false }: { story?: boolean }) {
  const dark = useColorScheme() === 'dark';
  return (
    <View
      testID={story ? undefined : 'today-edition-loading-outline'}
      style={!story && !dark ? styles.shadow : undefined}
    >
      <LoadingStatus
        testID={story ? 'edition-loading' : 'today-edition-loading'}
        accessibilityLabel="Loading the daily edition"
        accessible
        accessibilityRole="progressbar"
        style={styles.skeleton}
      >
        {/* Laid out as the card is: the plate full-bleed, then the body and
            the source line inside the card's padding, so no bar meets the
            card's edges (build 61, nit 8). */}
        <View
          testID={story ? undefined : 'today-edition-loading-plate'}
          style={[styles.plateSkeleton, { height: story ? 220 : 196 }]}
        />
        <View
          testID={story ? undefined : 'today-edition-loading-body'}
          style={[styles.body, story ? styles.storyBody : null]}
        >
          <Skeleton shape="text" count={3} label="Loading the daily edition" />
          {story ? <Skeleton shape="card" count={1} /> : null}
        </View>
        {!story ? (
          <View style={styles.source}>
            <View style={styles.sourceBand}>
              <View
                testID="today-edition-loading-source"
                style={styles.sourceSkeleton}
              />
            </View>
          </View>
        ) : null}
        {/* Drawn over the content, so the hairline adds nothing to the
            card's geometry and the loaded card lands where this one was. */}
        <View
          testID={story ? undefined : 'today-edition-loading-edge'}
          pointerEvents="none"
          style={styles.edge}
        />
      </LoadingStatus>
    </View>
  );
}

/** The source line owns its 44 pt band, outside the whole-card link. */
export function EditionCard({
  edition: block,
  tier,
  today,
}: {
  edition: Block<EditionView> | null;
  tier?: EditionTier;
  today?: Date | string;
}) {
  const subject = useEditionSubject(
    block?.status === 'ready' ? block.data : null,
  );
  const edition = subject.edition;
  const dark = useColorScheme() === 'dark';
  if (!block || block.status === 'loading') return <EditionSkeleton />;
  if (
    block.status !== 'ready' ||
    !edition ||
    (tier ?? editionTier(edition.date, today)) === 'old'
  )
    return null;
  const details = editionSources(edition, subject.originals);
  const source = {
    ...details,
    notes:
      block.stale && block.savedAt != null
        ? [copy.savedCopyNote(block.savedAt), ...(details.notes ?? [])]
        : details.notes,
    dateLabel:
      block.stale && block.savedAt != null
        ? `Saved ${formatDate(block.savedAt, 'short')}`
        : undefined,
  };
  const openSources = () =>
    presentSource(source, { testID: 'today-edition-sources' });
  const figure = edition.facts.figures[0];
  const division = edition.facts.division;
  const artLabel = division
    ? `${counted(division.ayes, 'vote')} to ${division.noes}.`
    : ['program', 'grant', 'largest'].includes(edition.kind) && figure
      ? `${figure.value}, ${figure.label}.`
      : '';
  const menu = [
    ...(canShare
      ? [
          {
            title: 'Share',
            symbol: 'square.and.arrow.up' as const,
            onPress: () => void shareEdition(edition),
          },
        ]
      : []),
    ...editionMenu(edition),
  ];
  return (
    <View style={!dark ? styles.shadow : undefined}>
      <View style={styles.card} testID="today-edition-card">
        <Card
          padded={false}
          href={editionRoute()}
          zoom
          menu={menu}
          testID="today-edition"
          accessibilityLabel={`Daily edition. ${edition.kindShort}, ${formatDate(edition.date, 'long')}. ${edition.title}.${edition.machineWritten ? ' Machine-written.' : ''} ${edition.paragraphs[0] ?? ''}${artLabel ? ` ${artLabel}` : ''}`}
          accessibilityHint="Double-tap to read."
          accessibilityActions={[
            { name: 'Sources', label: 'Sources', onAction: openSources },
            ...(canShare
              ? [
                  {
                    name: 'Share',
                    label: 'Share',
                    onAction: () => void shareEdition(edition),
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
              edition={edition}
              tier={tier ?? editionTier(edition.date, today)}
              shownBelow={edition.paragraphs.slice(0, 1)}
            />
            <View style={styles.body}>
              {edition.machineWritten ? (
                <View style={styles.machine} testID="today-edition-machine">
                  <Icon name={symbols.machine} size={12} tone="navy" />
                  <Text wordSafe variant="capsule" tone="navy">
                    Machine-written
                  </Text>
                </View>
              ) : null}
              {edition.paragraphs[0] ? (
                <Text wordSafe variant="body" testID="today-edition-text">
                  {edition.paragraphs[0]}
                </Text>
              ) : null}
            </View>
          </View>
        </Card>
        <View style={styles.source}>
          <SourceLine {...source} testID="today-edition-sources" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.raised,
    borderRadius: radii.container,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
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
  skeleton: {
    borderRadius: radii.container,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.raised,
  },
  // One step darker than the bars (sunken), so the plate reads on Today's
  // sunken ground and the card's top corners show.
  plateSkeleton: { backgroundColor: colors.dividerSubtle },
  edge: {
    ...StyleSheet.absoluteFill,
    borderRadius: radii.container,
    borderCurve: 'continuous',
    borderWidth: hairline,
    borderColor: colors.dividerSubtle,
  },
  storyBody: { paddingBottom: 20 },
  // The source line's 44 pt band, its footnote centred.
  sourceBand: { minHeight: minimumTarget, justifyContent: 'center' },
  sourceSkeleton: {
    height: 14,
    width: '60%',
    backgroundColor: colors.sunken,
    borderRadius: radii.bar,
    borderCurve: 'continuous',
  },
});
