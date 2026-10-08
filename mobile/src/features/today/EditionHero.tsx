import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { EditionView } from '../../api/catalogs';
import { catalogs } from '../../api/runtime';
import { formatDate } from '../../design/format';
import { partyText } from '../../design/party';
import {
  Button,
  MachineWritten,
  Text,
  useAccessibilitySize,
} from '../../design/primitives';
import { colors, hairline, light, spacing } from '../../design/tokens';
import { openOnWeb, webPageUrl } from '../../navigation/external';
import { fromWebPath, personRoute } from '../../navigation/routes';
import { sponsorSlug } from '../bills/sponsors';
import { CachedPortrait } from '../CachedPortrait';
import { Chip, TodayCard, shortDay, useTodayAccent } from './parts';
import {
  brandAccent,
  moneyAccent,
  partyAccent,
  topicAccent,
  type Accent,
} from './tint';

// Where each kind's web page goes (portal/src/daily-post.ts URL builders),
// in the words of docs/IOS-UX.md 4.1 ("Read the report on opax.com.au").
const webLabels: Record<EditionView['kind'], string> = {
  politician: "Read the parliamentarian's record",
  bill: 'Read the bill',
  grant: 'Read the grant record',
  program: 'Read the grant program',
  largest: "Read the month's largest grants",
  topic: 'Read the report',
};

const houses = /^(House of Representatives|Senate)$/;
/**
 * What the cover says about a parliamentarian, in its own words: the
 * recorded party (the line's first part, when it is not the house or the
 * span), the place (the kicker after the kind), and the span of the record.
 */
export function personFacts(edition: EditionView) {
  const parts = (edition.facts.line ?? '').split(' · ').map((p) => p.trim());
  const first = parts[0] ?? '';
  const party =
    first && !houses.test(first) && !/^records\b/.test(first) ? first : null;
  const kicker = edition.facts.kicker ?? '';
  const place = kicker.startsWith(`${edition.kindLabel} · `)
    ? kicker.slice(edition.kindLabel.length + 3).trim() || null
    : null;
  const span = /\brecords (\d{4}) to (\d{4})$/.exec(
    parts.find((p) => /^records\b/.test(p)) ?? '',
  );
  return {
    party,
    place,
    span: span ? `${span[1]}–${span[2]}` : null,
  };
}

/** The cover kicker's detail after the kind: "Education portfolio". */
const kickerDetail = (edition: EditionView) => {
  const kicker = edition.facts.kicker ?? '';
  const [kind, ...rest] = kicker.split(' · ');
  return kind && rest.length ? rest.join(' · ') : null;
};

export function editionAccent(edition: EditionView): Accent {
  if (edition.kind === 'politician')
    return partyAccent(personFacts(edition).party);
  if (['grant', 'program', 'largest'].includes(edition.kind))
    return moneyAccent;
  return brandAccent;
}

interface Figure {
  value: string;
  label: string;
}
/** The edition's own figures, at most two, as the slides give them. */
export function editionFigures(edition: EditionView): Figure[] {
  const figures: Figure[] = [];
  if (edition.facts.division)
    figures.push(
      { value: String(edition.facts.division.ayes), label: 'Ayes' },
      { value: String(edition.facts.division.noes), label: 'Noes' },
    );
  else {
    figures.push(...edition.facts.figures);
    const span =
      edition.kind === 'politician' ? personFacts(edition).span : null;
    if (span) figures.push({ value: span, label: 'Years in the record' });
  }
  return figures.slice(0, 2);
}

/**
 * Opens the record on its native screen where the app has one: a bill by
 * its key, a parliamentarian by the one roster person and directory slug
 * the name identifies (the bill sponsor guard). Anything else, or a name
 * the directory cannot settle, opens the page on the web.
 */
async function openRecord(edition: EditionView) {
  const native = fromWebPath(edition.path);
  if (native) return router.push(native);
  if (edition.kind === 'politician') {
    const slug = await catalogs
      .directory()
      .then((d) => sponsorSlug(edition.title, d.roster.data, d.slugs.data))
      .catch(() => null);
    if (slug) return router.push(personRoute(slug));
  }
  return openOnWeb(edition.path, webLabels[edition.kind]);
}

/**
 * The daily edition as Today's front page: a header in the subject's colour
 * (the party's, or the brand's), the record's own figures and topic labels,
 * the model's text under its label, and one action that opens the record.
 * Every word and number is the frozen edition's own; sources and licences
 * are on the Sources and licences screen, not here.
 */
export function EditionHero({ edition }: { edition: EditionView }) {
  const stacked = useAccessibilitySize();
  const accent = useTodayAccent(editionAccent(edition));
  const person = edition.kind === 'politician' ? personFacts(edition) : null;
  const detail = person ? person.place : kickerDetail(edition);
  const figures = editionFigures(edition);
  // Side by side only while every figure fits half the card at this size.
  const tiles =
    !stacked && figures.length > 1 && figures.every((f) => f.value.length <= 6);
  const topics =
    edition.kind === 'politician' && edition.facts.bars?.items.length
      ? edition.facts.bars
      : null;
  // A parliamentarian's post repeats its figures in words: the figures
  // replace it. Other kinds keep their text, which the figures only add to.
  const showText =
    edition.paragraphs.length > 0 &&
    !(person && (figures.length > 0 || topics));
  const date = formatDate(edition.date);
  const partyWords = person?.party
    ? partyText({ party: person.party, status: 'unknown' }).spoken
    : null;
  const native =
    fromWebPath(edition.path) !== null || edition.kind === 'politician';
  const web = webPageUrl(edition.path) !== null;
  const [opening, setOpening] = useState(false);
  const open = () => {
    setOpening(true);
    void openRecord(edition).finally(() => setOpening(false));
  };
  const actionLabel =
    edition.kind === 'bill'
      ? 'Open the bill'
      : person
        ? `Open ${edition.title}'s record`
        : webLabels[edition.kind];
  return (
    <TodayCard testID="today-edition-card" ground={accent.wash}>
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={[
          `Daily edition, ${edition.kindLabel}, ${date}: ${edition.title}`,
          partyWords,
          detail,
        ]
          .filter(Boolean)
          .join(', ')}
        style={[styles.head, { backgroundColor: accent.deep }]}
        testID="today-edition-head"
      >
        <Text
          wordSafe
          variant="kicker"
          style={[styles.kicker, { color: accent.soft }]}
          testID="today-edition-kicker"
        >
          {`Daily edition · ${edition.kindLabel} · ${shortDay(edition.date)}`.toLocaleUpperCase(
            'en-AU',
          )}
        </Text>
        <View
          style={[
            styles.identity,
            person && !stacked ? styles.identityRow : null,
          ]}
        >
          {person ? (
            <View style={styles.portraitRing}>
              <CachedPortrait
                name={edition.title}
                size="profile"
                testID="today-edition-portrait"
              />
            </View>
          ) : null}
          <View style={styles.titles}>
            <Text
              wordSafe
              variant={person ? 'title' : 'subheading'}
              tone="onNavy"
              testID="today-edition-title"
            >
              {edition.title}
            </Text>
            {person?.party || detail ? (
              <View style={styles.subline}>
                {person?.party ? (
                  <Chip
                    label={person.party}
                    ground={light.raised}
                    color={light.ink}
                    dot={accent.base}
                    testID="today-edition-party"
                  />
                ) : null}
                {detail ? (
                  <Text
                    wordSafe
                    variant="metadata"
                    style={[styles.detail, { color: accent.soft }]}
                    testID="today-edition-detail"
                  >
                    {detail}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </View>
      <View style={styles.body}>
        {edition.machineWritten ? (
          <MachineWritten
            explanation={edition.machineWritten.attribution}
            testID="today-edition-machine"
          >
            <Chip
              label="Machine-written"
              ground={light.raised}
              color={accent.ink}
              icon="sparkles"
            />
          </MachineWritten>
        ) : null}
        {showText ? (
          <View
            accessible
            accessibilityLabel={edition.paragraphs.join('\n')}
            style={styles.text}
            testID="today-edition-text"
          >
            {edition.paragraphs.map((paragraph, index) => (
              <Text key={index} variant={index === 0 ? 'lede' : 'metadata'}>
                {paragraph}
              </Text>
            ))}
          </View>
        ) : null}
        {figures.length ? (
          tiles ? (
            <View style={styles.figures} testID="today-edition-figures">
              {figures.map((figure, index) => (
                <View
                  key={figure.label}
                  accessible
                  accessibilityLabel={`${figure.value}, ${figure.label}`}
                  style={[styles.figure, styles.figureTile]}
                  testID={`today-edition-figure-${index}`}
                >
                  <Text variant="figure" style={{ color: accent.ink }}>
                    {figure.value}
                  </Text>
                  <Text wordSafe variant="metadata">
                    {figure.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            // A long figure ("2008–2026") gets the full width: a figure is
            // never broken across lines to fit a half tile.
            <View
              style={[styles.figure, styles.figureRows]}
              testID="today-edition-figures"
            >
              {figures.map((figure, index) => (
                <View
                  key={figure.label}
                  accessible
                  accessibilityLabel={`${figure.value}, ${figure.label}`}
                  style={[
                    styles.figureRow,
                    stacked ? styles.figureRowStacked : null,
                    index > 0 ? styles.figureRule : null,
                  ]}
                  testID={`today-edition-figure-${index}`}
                >
                  <Text
                    variant="figure"
                    style={[styles.figureValue, { color: accent.ink }]}
                  >
                    {figure.value}
                  </Text>
                  <Text wordSafe variant="metadata" style={styles.figureLabel}>
                    {figure.label}
                  </Text>
                </View>
              ))}
            </View>
          )
        ) : null}
        {topics ? (
          <View
            accessible
            accessibilityLabel={`${topics.title}: ${topics.items
              .map((t) => `${t.label}, ${t.pct} percent`)
              .join('; ')}.${topics.note ? ` ${topics.note}` : ''}`}
            style={styles.topics}
            testID="today-edition-topics"
          >
            <Text wordSafe variant="kicker">
              {topics.title}
            </Text>
            <View style={styles.chips}>
              {topics.items.map((item, index) => {
                const tint = topicAccent(index);
                return (
                  <Chip
                    key={item.label}
                    label={`${item.label} ${item.pct}%`}
                    ground={light.raised}
                    color={tint.ink}
                    dot={tint.base}
                  />
                );
              })}
            </View>
            {topics.note ? (
              <Text wordSafe variant="fine">
                {topics.note}
              </Text>
            ) : null}
          </View>
        ) : null}
        {edition.facts.events.length ? (
          <View
            accessible
            accessibilityLabel={edition.facts.events
              .map((e) => `${e.date}, ${e.text}`)
              .join('. ')}
            style={styles.events}
            testID="today-edition-events"
          >
            {edition.facts.events.map((event, index) => (
              <View key={index} style={styles.event}>
                <View style={styles.rail}>
                  <View
                    style={[
                      styles.node,
                      {
                        backgroundColor:
                          index === edition.facts.events.length - 1
                            ? accent.base
                            : light.raised,
                        borderColor: accent.base,
                      },
                    ]}
                  />
                  {index < edition.facts.events.length - 1 ? (
                    <View
                      style={[styles.line, { backgroundColor: accent.base }]}
                    />
                  ) : null}
                </View>
                <View style={styles.eventText}>
                  <Text variant="kicker" style={{ color: accent.ink }}>
                    {event.date}
                  </Text>
                  <Text wordSafe variant="metadata" tone="ink">
                    {event.text}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
        {native ? (
          <Button
            label={actionLabel}
            variant="primary"
            fullWidth
            loading={opening}
            accessibilityHint={
              edition.kind === 'bill' || person
                ? 'Opens the record in the app'
                : undefined
            }
            onPress={open}
            testID="today-edition-open"
          />
        ) : web ? (
          <Button
            label={webLabels[edition.kind]}
            variant="primary"
            icon="safari"
            fullWidth
            accessibilityHint="Opens on opax.com.au"
            onPress={() =>
              void openOnWeb(edition.path, webLabels[edition.kind])
            }
            testID="today-edition-link"
          />
        ) : null}
      </View>
    </TodayCard>
  );
}

const styles = StyleSheet.create({
  head: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s4 + spacing.s1,
    gap: spacing.s3 + spacing.s1,
  },
  kicker: { letterSpacing: 0.6 },
  identity: { gap: spacing.s4 },
  identityRow: { flexDirection: 'row', alignItems: 'center' },
  portraitRing: {
    alignSelf: 'flex-start',
    padding: 3,
    borderRadius: 999,
    backgroundColor: colors.raised,
  },
  titles: { flex: 1, gap: spacing.s3, alignSelf: 'stretch' },
  subline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.s3,
  },
  detail: { flexShrink: 1 },
  body: { padding: spacing.s4, gap: spacing.s4 },
  grow: { flexGrow: 1, flexShrink: 1, flexBasis: 160 },
  text: { gap: spacing.s3 },
  figures: { flexDirection: 'row', gap: spacing.s3 },
  figure: {
    gap: 2,
    padding: spacing.s3 + spacing.s1,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: colors.raised,
  },
  figureTile: { flex: 1 },
  figureRows: { paddingVertical: spacing.s1, gap: 0 },
  figureRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.s3,
    paddingVertical: spacing.s2,
  },
  figureRowStacked: { flexDirection: 'column', gap: 2 },
  // The figure keeps its width; its label takes what is left and wraps.
  figureValue: { flexShrink: 0 },
  figureLabel: { flex: 1 },
  figureRule: {
    borderTopWidth: hairline,
    borderTopColor: colors.dividerSubtle,
  },
  topics: { gap: spacing.s3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s3 },
  events: { gap: 0 },
  event: { flexDirection: 'row', gap: spacing.s3 },
  rail: { width: 12, alignItems: 'center', paddingTop: 4 },
  node: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  line: { width: 2, flex: 1, marginVertical: 2 },
  eventText: { flex: 1, gap: 1, paddingBottom: spacing.s3 },
});
