import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { InterestDetail } from '../../api/catalogs';
import { Disclosure } from '../../design/disclosure';
import { counted, formatCount, formatDate } from '../../design/format';
import { Group } from '../../design/layout';
import { Text } from '../../design/text';
import { colors, hairline, minimumTarget, rhythm } from '../../design/tokens';
import { NewDot } from '../follows/NewDot';
import { registerCategoryLabel, registerEntry } from '../your-mp/model';

/**
 * How the register was read, for the block's source sheet: OCR entries and
 * pages that could not be read (the latter also marks the block partial).
 */
export function registerNotes(r: InterestDetail): string[] {
  return [
    r.ocr_rows > 0
      ? `${formatCount(r.ocr_rows)} entries were read by OCR from scanned pages. Transcription may contain errors; check the original register.`
      : null,
    r.unread_pages
      ? `${formatCount(r.unread_pages)} pages could not be read. The register may be incomplete.`
      : null,
  ].filter((note): note is string => !!note);
}

/**
 * The block's one line (people.md 2.1): "Statement of 4 Aug 2025", or with
 * the changes since it ("Statement of 4 Aug 2025 · 14 changes since").
 */
export function statementLine(r: InterestDetail): string | null {
  const changes = r.alterations.added + r.alterations.deleted;
  const statement = r.statement_date
    ? `Statement of ${formatDate(r.statement_date, 'short')}`
    : null;
  const since = changes
    ? `${counted(changes, 'change', 'changes')}${statement ? ' since' : ''}`
    : null;
  return [statement, since].filter(Boolean).join(' · ') || null;
}

const LONG = 280;

/** The member's own words; a long entry opens with "More". */
function EntryText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > LONG;
  return (
    <View style={styles.entryText}>
      <Text
        wordSafe
        variant="recordText"
        numberOfLines={long && !open ? 6 : undefined}
      >
        {text}
      </Text>
      {long && !open ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More"
          accessibilityHint="Shows the whole entry"
          hitSlop={{ left: 8, right: 8 }}
          onPress={() => setOpen(true)}
          style={styles.more}
        >
          <Text variant="strong" tone="navy">
            More
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * A member's register: the statement line, then one disclosure per category
 * with its count. Inside, each entry in the member's words and when it was
 * added; a category that holds more than it shows says "Newest 6 of 14."
 * (the original register is in the source sheet). `isNew` marks an entry
 * added since the reader last looked.
 */
export function DeclaredInterests({
  register: r,
  isNew,
}: {
  register: InterestDetail;
  isNew?: (row: InterestDetail['buckets'][string]['items'][number]) => boolean;
}) {
  const line = statementLine(r);
  return (
    <Group gap={rhythm.tight}>
      {line ? (
        <Text wordSafe variant="secondary" testID="person-interests-line">
          {line}
        </Text>
      ) : null}
      <View>
        {Object.entries(r.buckets).map(([name, bucket]) => (
          <Disclosure
            key={name}
            label={registerCategoryLabel(name)}
            value={formatCount(bucket.count)}
            testID={`interest-bucket-${name}`}
          >
            {() => (
              <View>
                {bucket.items.map((row, i) => {
                  const entry = registerEntry(row, r.statement_date);
                  const fresh = isNew?.(row) ?? false;
                  return (
                    <View
                      key={i}
                      style={[styles.entry, i ? styles.inset : null]}
                      testID={`interest-entry-${name}-${i}`}
                    >
                      {fresh ? (
                        <NewDot testID={`interest-entry-${name}-${i}-new`} />
                      ) : null}
                      <View style={styles.grow}>
                        {entry.title ? (
                          <Text wordSafe variant="strong">
                            {entry.title}
                          </Text>
                        ) : null}
                        {entry.detail ? (
                          <EntryText text={entry.detail} />
                        ) : null}
                        {entry.meta ? (
                          <Text wordSafe variant="secondary">
                            {entry.meta}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
                {bucket.items.length < bucket.count ? (
                  <Text
                    wordSafe
                    variant="footnote"
                    testID={`interest-bucket-${name}-more`}
                  >
                    Newest {formatCount(bucket.items.length)} of{' '}
                    {formatCount(bucket.count)}.
                  </Text>
                ) : null}
              </View>
            )}
          </Disclosure>
        ))}
      </View>
    </Group>
  );
}

const styles = StyleSheet.create({
  entry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rhythm.tight,
    paddingVertical: rhythm.tight,
  },
  entryText: { gap: rhythm.line, alignItems: 'flex-start' },
  // One line of text is under 44 pt: the target keeps the full height.
  more: { minHeight: minimumTarget, justifyContent: 'center' },
  grow: { flex: 1, gap: rhythm.line },
  inset: { borderTopWidth: hairline, borderTopColor: colors.dividerSubtle },
});
