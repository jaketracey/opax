import { symbols } from '../../design/symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAccessibilitySize } from '../../design/accessibility';
import { PartyLabel } from '../../design/people';
import { RowLink } from '../../design/row-link';
import { Icon } from '../../design/icon';
import { Text } from '../../design/text';
import { minimumTarget, rhythm } from '../../design/tokens';
import { vicSeatRoute } from '../../navigation/routes/vic-election';
import { vicCopy as c } from './copy';
import type { District, Region } from './decoders';
import {
  contestName,
  decimal,
  rowFigure,
  shareSpoken,
  shareText,
} from './model';

export function SeatRow({
  district: d,
  share = null,
  place = '',
  testID,
}: {
  district: District;
  share?: number | null;
  place?: string;
  testID?: string;
}) {
  const large = useAccessibilitySize();
  const figure = share === null ? rowFigure(d) : shareText(share);
  const caption =
    share !== null
      ? c.residents
      : d.result && d.result.kind !== 'general'
        ? contestName(d.result)
        : null;
  const ax =
    share !== null
      ? c.shareAX(
          d.name,
          shareSpoken(share),
          place,
          d.member.name,
          d.member.party,
        )
      : c.rowAX(
          d.name,
          d.member.name,
          d.member.party,
          d.result
            ? c.resultAX(
                d.result.party,
                decimal(d.result.margin),
                contestName(d.result),
              )
            : '',
        );
  const figures = (
    <View
      style={{
        gap: rhythm.line,
        alignItems: large ? 'flex-start' : 'flex-end',
        flexShrink: 1,
      }}
    >
      {figure ? (
        <Text
          wordSafe
          variant="body"
          tone="inkSoft"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {figure}
        </Text>
      ) : null}
      {caption ? (
        <Text wordSafe variant="footnote" tone="inkSoft">
          {caption}
        </Text>
      ) : null}
    </View>
  );
  return (
    <RowLink href={vicSeatRoute(d.slug)}>
      <Pressable
        accessible
        accessibilityRole="link"
        accessibilityLabel={ax}
        testID={testID ?? `vic-election-district-${d.slug}`}
        style={styles.row}
      >
        <View style={{ flex: 1, minWidth: 0, gap: rhythm.line }}>
          <View
            style={{
              flexDirection: large ? 'column' : 'row',
              gap: rhythm.tight,
              alignItems: 'flex-start',
            }}
          >
            <View style={{ flex: 1, minWidth: 0, gap: rhythm.line }}>
              <Text wordSafe variant="strong">
                {d.name}
              </Text>
              <View style={[styles.line, large ? styles.stacked : null]}>
                <Text wordSafe variant="secondary" tone="inkSoft">
                  {d.member.name}
                </Text>
                {d.member.party ? (
                  <PartyLabel party={d.member.party} nested />
                ) : null}
              </View>
            </View>
            {!large ? figures : null}
          </View>
          {large ? figures : null}
        </View>
        <Icon name={symbols.chevron} size={13} tone="inkFaint" />
      </Pressable>
    </RowLink>
  );
}
export function RegionRow({
  region: r,
  testID,
}: {
  region: Region;
  testID?: string;
}) {
  const names = r.members.map((m) => m.name);
  const detail = [
    ...names.slice(0, 3),
    ...(names.length > 3 ? [c.more(names.length - 3)] : []),
  ].join(', ');
  return (
    <RowLink href={vicSeatRoute(r.slug)}>
      <Pressable
        accessible
        accessibilityRole="link"
        accessibilityLabel={`${r.name}. ${names.join(', ')}.`}
        testID={testID ?? `vic-election-region-${r.slug}`}
        style={styles.row}
      >
        <View style={{ flex: 1, minWidth: 0, gap: rhythm.line }}>
          <Text wordSafe variant="strong">
            {r.name}
          </Text>
          <Text wordSafe variant="secondary" tone="inkSoft">
            {detail}
          </Text>
        </View>
        <Icon name={symbols.chevron} size={13} tone="inkFaint" />
      </Pressable>
    </RowLink>
  );
}
const styles = StyleSheet.create({
  // The record row's name-and-party line (design/rows.tsx): the party is
  // drawn only, so it is one text line tall and shares the name's line; at
  // accessibility sizes it takes its own line under the name.
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: rhythm.tight,
    rowGap: rhythm.line,
  },
  stacked: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
    alignItems: 'flex-start',
  },
  row: {
    minHeight: minimumTarget,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: rhythm.tight,
    gap: rhythm.tight,
  },
});
