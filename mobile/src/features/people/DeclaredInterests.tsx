import {
  BigFigure,
  Disclosure,
  Group,
  RowList,
  Text,
} from '../../design/primitives';
import { formatCount } from '../../design/format';
import { rhythm } from '../../design/tokens';
import type { InterestDetail } from '../../api/catalogs';
import {
  registerCategoryLabel,
  registerEntry,
  registerTotalsLine,
} from '../your-mp/model';

/**
 * A member's register file: the entry total and where the entries came from,
 * then one disclosure per category. Each entry is the declared item in plain
 * words (see registerEntry); the export serves at most six per category, so a
 * capped category says how many the original register holds.
 */
export function DeclaredInterests({
  register: r,
}: {
  register: InterestDetail;
}) {
  return (
    <Group>
      <BigFigure
        value={formatCount(r.total)}
        label="Declared entries"
        detail={registerTotalsLine(r)}
        accent="interests"
      />
      {r.ocr_rows > 0 ? (
        <Text wordSafe variant="fine" testID="person-ocr">
          {formatCount(r.ocr_rows)} entries were read by OCR from scanned pages.
          Transcription may contain errors; check the original register.
        </Text>
      ) : null}
      {r.unread_pages ? (
        <Text wordSafe variant="fine">
          {formatCount(r.unread_pages)} pages could not be read. The register
          may be incomplete.
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
                    {formatCount(bucket.count)}. View original has the full
                    register.
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
