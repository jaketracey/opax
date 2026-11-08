import { useRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Heading,
  InsetGroup,
  LinkRow,
  Screen,
  SourceLine,
  Text,
} from '../../design/primitives';
import { copy } from '../../design/copy';
import { formatDate } from '../../design/format';
import { rhythm } from '../../design/tokens';
import { openCorrection, openOnWeb } from '../../navigation/external';
import { coverageRoute, sourcesRoute } from '../../navigation/routes/reference';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { methodsCopy as text, type MethodsSection } from './copy';
import { reference, stateCoverage } from './repository';
import { useRead, useShareItem } from './read';

/**
 * Methods (records.md 6): a reading page on paper, in the Account stack.
 * Static copy from the bundle, so it reads the same offline; the record
 * summary only adds the state coverage years and its known defects to the
 * limitations, and nothing says so when it can't be read.
 */
export default function Methods() {
  const summary = useRead(reference.summary);
  useShareItem({ path: '/methods', title: text.title });
  const titleRef = useRef<View>(null);
  const bar = useTitleOnScroll(titleRef, text.title);
  const corpus = summary.record?.data ?? null;
  const states = corpus ? stateCoverage(corpus) : [];
  const limits = [
    ...section('limits').paragraphs,
    states.length ? text.stateCoverage(states) : text.stateCoverageFallback,
    ...(corpus?.known_defects ?? []),
  ];
  const extra: Partial<Record<MethodsSection['id'], ReactNode>> = {
    holds: (
      <InsetGroup>
        <LinkRow
          title={text.coverageRow}
          href={coverageRoute}
          testID="methods-coverage"
        />
      </InsetGroup>
    ),
    ask: (
      <InsetGroup>
        <LinkRow
          title={text.technicalRow}
          external
          accessibilityHint="Opens on opax.com.au"
          onPress={() => void openOnWeb('/methods', text.title)}
          testID="methods-technical"
        />
      </InsetGroup>
    ),
    corrections: (
      <View style={styles.paragraphs}>
        {text.corrections.map((entry) => (
          <View key={entry.date} style={styles.entry}>
            <Text wordSafe variant="strong">
              {formatDate(entry.date)}
            </Text>
            <Text wordSafe variant="body">
              {entry.text}
            </Text>
          </View>
        ))}
        <InsetGroup footer={text.correctionResponse}>
          <LinkRow
            title={text.correctionRow}
            detail={copy.correctionsEmail}
            external
            onPress={() => void openCorrection()}
            testID="methods-correction"
          />
        </InsetGroup>
      </View>
    ),
    licence: (
      <InsetGroup>
        <LinkRow
          title={text.codeRow}
          external={{ url: text.codeUrl, label: text.codeRow }}
          testID="methods-code"
        />
        <LinkRow
          title={text.sourcesRow}
          href={sourcesRoute}
          testID="methods-sources"
        />
      </InsetGroup>
    ),
  };
  return (
    <Screen testID="methods-screen" onScroll={bar.onScroll}>
      <View ref={titleRef} onLayout={bar.onTitleLayout}>
        <Heading level={1} kind="page" testID="methods-title">
          {text.title}
        </Heading>
      </View>
      {text.sections.map((item) => (
        <View
          key={item.id}
          testID={`methods-section-${item.id}`}
          style={styles.section}
        >
          <Heading level={2}>{item.title}</Heading>
          {item.id === 'limits' ? (
            <Bullets items={limits} />
          ) : item.paragraphs.length ? (
            <View style={styles.paragraphs}>
              {item.paragraphs.map((paragraph) => (
                <Text key={paragraph} wordSafe variant="body">
                  {paragraph}
                </Text>
              ))}
            </View>
          ) : null}
          {extra[item.id]}
        </View>
      ))}
      <SourceLine
        asOf={text.asAt}
        citation={text.sourceCitation}
        originals={[{ label: text.sourceOriginal, url: '/methods' }]}
        notes={[text.sourceNote]}
        testID="methods-source"
      />
    </Screen>
  );
}

function section(id: MethodsSection['id']): MethodsSection {
  return text.sections.find((item) => item.id === id)!;
}

/** A plain bulleted list: each item one accessibility element. */
function Bullets({ items }: { items: readonly string[] }) {
  return (
    <View style={styles.paragraphs}>
      {items.map((item) => (
        <View
          key={item}
          accessible
          accessibilityLabel={item}
          style={styles.bullet}
        >
          <Text variant="body" importantForAccessibility="no">
            {'•'}
          </Text>
          <Text wordSafe variant="body" style={styles.grow}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: rhythm.heading },
  paragraphs: { gap: rhythm.row },
  entry: { gap: rhythm.line },
  bullet: { flexDirection: 'row', gap: rhythm.tight },
  grow: { flex: 1 },
});
