import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { webOrigin } from '../../design/environment';
import { haptic } from '../../design/haptics';
import {
  Button,
  InsetGroup,
  Screen,
  SegmentedPicker,
  Text,
  useAccessibilitySize,
} from '../../design/primitives';
import { colors, radii, rhythm } from '../../design/tokens';
import { copyText, shareTextFile } from './actions';
import { citationsFor } from './citations';
import {
  citeNotes,
  rememberCiteStyle,
  sourceStyle,
  stylesFor,
  useCiteStyle,
  type CiteStyleId,
} from './citeStyle';
import { metaLine, recordHeadline } from './model';
import { accessedToday, corpusVersion } from './RecordActions';
import { RecordLoadError } from './RecordLoadError';
import { records } from './runtime';
import { useRead } from './useRead';

/** How long "Copied" stays on the button before it says "Copy" again. */
const COPIED_FOR = 2000;

/**
 * Citation formats (records.md 3): a route sheet for reading, comparing or
 * sharing one record's citation. The sheet's bar says "Citation formats" and
 * Done; the content is the record's title, one style picker, the citation,
 * and one Copy and one Share. The formats are the web's (`citations.ts`).
 */
export default function Citations() {
  const { slug = '' } = useLocalSearchParams<{ slug: string }>();
  const load = useCallback(
    (signal?: AbortSignal) => records.document(slug, signal),
    [slug],
  );
  const { value, error, retry } = useRead(load);
  const [version, setVersion] = useState('unversioned');
  const [accessed] = useState(accessedToday);
  const [copied, setCopied] = useState<string | null>(null);
  const doc = value?.data ?? null;
  const style = useCiteStyle(doc);
  const large = useAccessibilitySize();
  useEffect(() => {
    let active = true;
    void corpusVersion().then((read) => {
      if (active) setVersion(read);
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), COPIED_FOR);
    return () => clearTimeout(timer);
  }, [copied]);
  const styles = doc ? stylesFor(doc) : [];
  const shownId: CiteStyleId | 'source' = styles.length ? style : 'source';
  const label =
    styles.find((entry) => entry.id === shownId)?.label ?? sourceStyle.label;
  const citation = doc
    ? citationsFor(doc, {
        origin: webOrigin,
        corpusVersion: version,
        accessed,
      }).find((entry) => entry.id === shownId)
    : undefined;
  const note = citeNotes[shownId];
  const done = copied === shownId;
  return (
    <Screen grouped testID="doc-citations">
      {error ? (
        <RecordLoadError error={error} slug={slug} onRetry={retry} sheet />
      ) : !doc || !citation ? (
        <CitationSkeleton />
      ) : (
        <>
          <View style={sheet.header}>
            <Text
              wordSafe
              variant="recordHeading"
              accessibilityRole="header"
              testID="cite-title"
            >
              {recordHeadline(doc)}
            </Text>
            <Text wordSafe variant="secondary" tone="inkSoft">
              {metaLine(doc)}
            </Text>
          </View>
          <View style={sheet.body}>
            {styles.length ? (
              <SegmentedPicker
                accessibilityLabel="Style"
                options={styles.map((entry) => ({
                  value: entry.id,
                  label: entry.label,
                  testID: `cite-style-${entry.id}`,
                }))}
                value={style}
                onChange={(next) => {
                  haptic('selection');
                  setCopied(null);
                  rememberCiteStyle(next);
                }}
                testID="cite-style"
              />
            ) : null}
            <InsetGroup
              header={styles.length ? undefined : sourceStyle.label}
              footer={
                note ? (
                  <Text
                    wordSafe
                    variant="footnote"
                    tone="inkSoft"
                    testID={`cite-note-${shownId}`}
                  >
                    {note}
                  </Text>
                ) : undefined
              }
              testID={`cite-${shownId}`}
            >
              <View style={sheet.cell}>
                <Text
                  selectable
                  variant="body"
                  monospace={shownId === 'bibtex' || shownId === 'ris'}
                  testID={`cite-text-${shownId}`}
                >
                  {citation.text}
                </Text>
              </View>
            </InsetGroup>
            <View style={[sheet.actions, large ? sheet.stacked : null]}>
              <Button
                variant="primary"
                icon={done ? 'checkmark' : 'doc.on.doc'}
                label={done ? 'Copied' : 'Copy'}
                accessibilityLabel={done ? `Copied ${label}` : `Copy ${label}`}
                fullWidth={large}
                onPress={() => {
                  void copyText(citation.text, `Copied ${label}`).then((ok) => {
                    if (!ok) return;
                    haptic('success');
                    setCopied(shownId);
                    if (shownId !== 'source') rememberCiteStyle(shownId);
                  });
                }}
                testID={`cite-copy-${shownId}`}
              />
              <Button
                variant="secondary"
                icon="square.and.arrow.up"
                label="Share"
                accessibilityLabel={`Share ${label}`}
                accessibilityHint="Shares the citation as a file"
                fullWidth={large}
                onPress={() => {
                  void shareTextFile(
                    citation.text,
                    `opax-${doc.slug}-${citation.id}.${citation.extension}`,
                  );
                }}
                testID={`cite-share-${shownId}`}
              />
            </View>
          </View>
        </>
      )}
    </Screen>
  );
}

/** The sheet's final shape while the record loads (records.md 3.3). */
function CitationSkeleton() {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading citations"
      accessibilityState={{ busy: true }}
      testID="cite-loading"
      style={sheet.body}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={sheet.body}
      >
        <View style={sheet.header}>
          <View style={[sheet.bar, { width: '100%', height: 24 }]} />
          <View style={[sheet.bar, { width: '70%', height: 24 }]} />
          <View style={[sheet.bar, { width: '50%', height: 16 }]} />
        </View>
        <View style={[sheet.bar, { width: '100%', height: 32 }]} />
        <View style={[sheet.cell, sheet.group]}>
          {[0, 1, 2, 3].map((index) => (
            <View
              key={index}
              style={[
                sheet.bar,
                sheet.onRaised,
                { width: index === 3 ? '60%' : '100%', height: 18 },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const sheet = StyleSheet.create({
  header: { gap: rhythm.line },
  body: { gap: rhythm.block },
  cell: { paddingVertical: rhythm.row, gap: rhythm.tight },
  // InsetGroup's shape: its container corners and 16 pt text inset.
  group: {
    backgroundColor: colors.raised,
    borderRadius: radii.container,
    borderCurve: 'continuous',
    paddingHorizontal: rhythm.block,
  },
  actions: { flexDirection: 'row', gap: rhythm.tight, flexWrap: 'wrap' },
  stacked: { flexDirection: 'column' },
  bar: {
    borderRadius: 4,
    borderCurve: 'continuous',
    backgroundColor: colors.sunken,
  },
  onRaised: { backgroundColor: colors.sunken },
});
