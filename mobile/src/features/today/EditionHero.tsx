import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { EditionView } from '../../api/catalogs';
import { catalogs } from '../../api/runtime';
import { formatDate } from '../../design/format';
import { partyText } from '../../design/party';
import {
  Button,
  MachineLabel,
  PartyLabel,
  Tag,
  Text,
  useAccessibilitySize,
  Card,
} from '../../design/primitives';
import {
  accentTint,
  colors,
  hairline,
  radii,
  rhythm,
  type AccentTint,
} from '../../design/tokens';
import { openOnWeb, webPageUrl } from '../../navigation/external';
import { fromWebPath, personRoute } from '../../navigation/routes';
import { sponsorSlug } from '../bills/sponsors';
import { CachedPortrait } from '../CachedPortrait';
import { shortDay } from './parts';
import { StageLine } from './StageLine';

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

/**
 * The edition's colour moment: its subject's accent from the tokens. A
 * parliamentarian is the people accent (navy); the party is a dot beside
 * its name, never the ground.
 */
export function editionAccent(edition: EditionView): AccentTint {
  if (['grant', 'program', 'largest'].includes(edition.kind))
    return accentTint('money');
  if (edition.kind === 'bill') return accentTint('bills');
  return accentTint('people');
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
 * The daily edition as Today's front page and its one colour moment: a
 * header band in the subject's accent (a bill teal, money green, a person
 * navy) with the sentence-case label, the title and one meta line; then, on
 * the card's raised ground, the model's label before the model's text, the
 * record's own figures and topic labels, one stage line in place of the
 * timeline, and one action that opens the record. The body stays on the
 * raised role, never the accent's wash, so the machine-written pill (drawn
 * on the bills wash) keeps its edge on every subject. Every word and number
 * is the frozen edition's own; its sources are in Today's source line.
 */
export function EditionHero({ edition }: { edition: EditionView }) {
  const stacked = useAccessibilitySize();
  const accent = editionAccent(edition);
  const person = edition.kind === 'politician' ? personFacts(edition) : null;
  const detail = person ? person.place : kickerDetail(edition);
  const figures = editionFigures(edition);
  // Side by side only while every figure fits half the card at this size.
  const across =
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
    <Card padded={false} testID="today-edition-card">
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
          variant="label"
          style={{ color: accent.softOnDeep }}
          testID="today-edition-kicker"
        >
          {`Daily edition · ${edition.kindLabel} · ${shortDay(edition.date)}`}
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
                  <PartyLabel
                    party={person.party}
                    status="unknown"
                    linked={false}
                    nested
                    onDeep
                    testID="today-edition-party"
                  />
                ) : null}
                {detail ? (
                  <Text
                    wordSafe
                    variant="metadata"
                    style={[styles.detail, { color: accent.softOnDeep }]}
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
          <MachineLabel
            explanation={edition.machineWritten.attribution}
            testID="today-edition-machine"
          />
        ) : null}
        {showText ? (
          <View
            accessible
            accessibilityLabel={edition.paragraphs.join('\n')}
            style={styles.text}
            testID="today-edition-text"
          >
            {edition.paragraphs.map((paragraph, index) => (
              <Text key={index} variant={index === 0 ? 'body' : 'metadata'}>
                {paragraph}
              </Text>
            ))}
          </View>
        ) : null}
        {figures.length ? (
          // A strip of the edition's figures, ruled, never boxed. A long
          // figure ("2008–2026") gets the full width: a figure is never
          // broken across lines to fit half the card.
          <View
            style={across ? styles.across : null}
            testID="today-edition-figures"
          >
            {figures.map((figure, index) => (
              <View
                key={figure.label}
                accessible
                accessibilityLabel={`${figure.value}, ${figure.label}`}
                style={[
                  across ? styles.figureAcross : styles.figureRow,
                  !across && stacked ? styles.figureStacked : null,
                  index > 0
                    ? across
                      ? styles.ruleStart
                      : styles.ruleTop
                    : null,
                ]}
                testID={`today-edition-figure-${index}`}
              >
                <Text
                  variant="display"
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
            <Text wordSafe variant="label">
              {topics.title}
            </Text>
            <View style={styles.tags}>
              {topics.items.map((item) => (
                <Tag key={item.label} label={`${item.label} ${item.pct}%`} />
              ))}
            </View>
            {topics.note ? (
              <Text wordSafe variant="fine">
                {topics.note}
              </Text>
            ) : null}
          </View>
        ) : null}
        {edition.facts.events.length ? (
          <StageLine
            events={edition.facts.events}
            color={accent.base}
            testID="today-edition-events"
          />
        ) : null}
        {native ? (
          <Button
            label={actionLabel}
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
            icon="safari"
            accessibilityHint="Opens on opax.com.au"
            onPress={() =>
              void openOnWeb(edition.path, webLabels[edition.kind])
            }
            testID="today-edition-link"
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: {
    paddingHorizontal: rhythm.block,
    paddingTop: rhythm.block,
    paddingBottom: rhythm.block + rhythm.line,
    gap: rhythm.heading,
  },
  identity: { gap: rhythm.block },
  identityRow: { flexDirection: 'row', alignItems: 'center' },
  portraitRing: {
    alignSelf: 'flex-start',
    padding: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.raised,
  },
  titles: { flex: 1, gap: rhythm.tight, alignSelf: 'stretch' },
  subline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: rhythm.heading,
    rowGap: rhythm.line,
  },
  detail: { flexShrink: 1 },
  body: { padding: rhythm.block, gap: rhythm.block },
  text: { gap: rhythm.tight },
  across: { flexDirection: 'row' },
  // Each figure keeps its width; its label takes what is left and wraps.
  figureAcross: { flex: 1, gap: 2, paddingEnd: rhythm.heading },
  figureRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: rhythm.heading,
    paddingVertical: rhythm.tight,
  },
  figureStacked: { flexDirection: 'column', gap: 2 },
  figureValue: { flexShrink: 0 },
  figureLabel: { flexShrink: 1 },
  ruleStart: {
    paddingStart: rhythm.heading,
    borderStartWidth: hairline,
    borderStartColor: colors.dividerSubtle,
  },
  ruleTop: {
    borderTopWidth: hairline,
    borderTopColor: colors.dividerSubtle,
  },
  topics: { gap: rhythm.tight },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: rhythm.tight },
});
