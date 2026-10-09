import {
  BigFigure,
  Disclosure,
  Group,
  RowList,
  Text,
} from '../../design/primitives';
import { formatCount, formatDate } from '../../design/format';
import { rhythm } from '../../design/tokens';
import type { InterestDetail } from '../../api/catalogs';
import {
  registerCategoryLabel,
  registerEntry,
  registerTotalsLine,
} from '../your-mp/model';

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
 * A member's register file: the entry total, then one disclosure per
 * category. Each entry is the declared item in plain words (see
 * registerEntry); the export serves at most six per category, so a capped
 * category says how many the original register holds. The total says where
 * its entries came from only when that adds something ("20 in the statement
 * of 4 Aug 2025 · 8 added since"), never the total again.
 */
export function DeclaredInterests({
  register: r,
  figure = true,
}: {
  register: InterestDetail;
  /** False where the page's figure strip already shows the total. */
  figure?: boolean;
}) {
  // Where the entries came from, without saying the total twice: the
  // statement's date alone, or the statement and its alterations.
  const { added, deleted } = r.alterations;
  const totals =
    added || deleted
      ? registerTotalsLine(r)
      : r.statement_date
        ? `In the statement of ${formatDate(r.statement_date, 'short')}`
        : null;
  return (
    <Group>
      {figure ? (
        <BigFigure
          value={formatCount(r.total)}
          label="Declared entries"
          detail={totals ?? undefined}
        />
      ) : totals ? (
        <Text wordSafe variant="metadata">
          {totals}
        </Text>
      ) : null}
      <RowList>
        {Object.entries(r.buckets).map(([name, bucket]) => (
          <Disclosure
            key={name}
            label={registerCategoryLabel(name)}
            value={formatCount(bucket.count)}
            testID={`interest-bucket-${name}`}
          >
            {() => (
              <Group gap={rhythm.tight}>
                <RowList>
                  {bucket.items.map((row, i) => {
                    const entry = registerEntry(row, r.statement_date);
                    return (
                      <Group
                        key={i}
                        gap={rhythm.line}
                        testID={`interest-entry-${name}-${i}`}
                      >
                        {entry.title ? (
                          <Text wordSafe variant="strong">
                            {entry.title}
                          </Text>
                        ) : null}
                        {entry.detail ? (
                          <Text wordSafe>{entry.detail}</Text>
                        ) : null}
                        {entry.meta ? (
                          <Text wordSafe variant="fine">
                            {entry.meta}
                          </Text>
                        ) : null}
                      </Group>
                    );
                  })}
                </RowList>
                {bucket.items.length < bucket.count ? (
                  <Text
                    wordSafe
                    variant="fine"
                    testID={`interest-bucket-${name}-more`}
                  >
                    Showing the latest {formatCount(bucket.items.length)} of{' '}
                    {formatCount(bucket.count)}. The original register has them
                    all.
                  </Text>
                ) : null}
              </Group>
            )}
          </Disclosure>
        ))}
      </RowList>
    </Group>
  );
}
