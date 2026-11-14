import { Circle, Group, Path, RoundedRect } from '@shopify/react-native-skia';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { SizedCanvas } from '../../design/canvas';
import { Icon } from '../../design/icon';
import { paletteFor } from '../../design/palette';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { colors, hairline, rhythm } from '../../design/tokens';
import outline from '../today/australia-outline.json';

/**
 * The lessons' drawings (newcomer design pass; prototype). Each one shows
 * the idea its card says, in the app's own register: paper, hairlines, navy
 * and one bronze mark for "yours". All decorative: the words beside them
 * carry everything, so they are hidden from VoiceOver.
 */
const hidden = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

function usePalette() {
  return paletteFor(useColorScheme() === 'dark' ? 'dark' : 'light');
}

/** Australia, with one bronze mark: 150 electorates, one of them yours. */
export function ElectorateArt({ height = 150 }: { height?: number }) {
  const palette = usePalette();
  const scale = height / outline.height;
  const width = Math.round(outline.width * scale);
  // The mark sits on the east coast; no real electorate is implied.
  const pin = { x: outline.width * 0.9, y: outline.height * 0.66 };
  return (
    <View style={styles.centre} {...hidden} testID="newcomer-art-electorate">
      <SizedCanvas width={width} height={height}>
        <Group transform={[{ scale }]}>
          {outline.states.map((s) => (
            <Group key={s.code}>
              <Path path={s.d} color={palette.navyWash} />
              <Path
                path={s.d}
                color={palette.inkFaint}
                style="stroke"
                strokeWidth={1 / scale}
              />
            </Group>
          ))}
          <Circle
            cx={pin.x}
            cy={pin.y}
            r={20 / scale / 2.2}
            color={palette.bronzeWash}
          />
          <Circle
            cx={pin.x}
            cy={pin.y}
            r={20 / scale / 2.2}
            color={palette.bronze}
            style="stroke"
            strokeWidth={1.5 / scale}
          />
          <Circle cx={pin.x} cy={pin.y} r={4 / scale} color={palette.bronze} />
        </Group>
      </SizedCanvas>
    </View>
  );
}

/** Seats on concentric arcs, the way both chambers are laid out. */
export function hemicycle(
  seats: number,
  rows: number,
  inner: number,
  step: number,
): { x: number; y: number; row: number; index: number }[] {
  const radii = Array.from({ length: rows }, (_, i) => inner + i * step);
  const total = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map((r) => Math.round((seats * r) / total));
  counts[rows - 1]! += seats - counts.reduce((a, b) => a + b, 0);
  const out: { x: number; y: number; row: number; index: number }[] = [];
  let index = 0;
  radii.forEach((r, row) => {
    const n = counts[row]!;
    for (let i = 0; i < n; i++) {
      const angle = Math.PI - (Math.PI * (i + 0.5)) / n;
      out.push({
        x: r * Math.cos(angle),
        y: -r * Math.sin(angle),
        row,
        index: index++,
      });
    }
  });
  return out;
}

function Chamber({
  seats,
  rows,
  ink,
  mine,
  size,
}: {
  seats: number;
  rows: number;
  ink: string;
  /** Seat indexes drawn in bronze: yours. */
  mine: readonly number[];
  size: number;
}) {
  const palette = usePalette();
  const step = size / 2 / (rows + 2.2);
  const inner = step * 2.4;
  const dots = hemicycle(seats, rows, inner, step);
  const r = step * 0.36;
  const outer = inner + (rows - 1) * step + r;
  const height = outer + r + 2;
  return (
    <SizedCanvas width={size} height={height}>
      <Group transform={[{ translateX: size / 2 }, { translateY: outer + 1 }]}>
        {dots.map((d) => (
          <Circle
            key={d.index}
            cx={d.x}
            cy={d.y}
            r={mine.includes(d.index) ? r * 1.25 : r}
            color={mine.includes(d.index) ? palette.bronze : ink}
            opacity={mine.includes(d.index) ? 1 : 0.55}
          />
        ))}
      </Group>
    </SizedCanvas>
  );
}

/**
 * The two rooms, in their real colours (the House is green, the Senate red).
 * One bronze seat in the House is your MP; twelve in the Senate are your
 * state's senators.
 */
export function ChambersArt({
  size = 150,
  stacked = false,
}: {
  size?: number;
  stacked?: boolean;
}) {
  const palette = usePalette();
  // The outer row's last twelve seats: one state's block.
  const senate = Array.from({ length: 12 }, (_, i) => 76 - 12 + i);
  return (
    <View
      style={[styles.chambers, stacked ? styles.chambersStacked : null]}
      {...hidden}
      testID="newcomer-art-chambers"
    >
      <View style={styles.chamber}>
        <Chamber
          seats={150}
          rows={6}
          ink={palette.moneyInk}
          mine={[112]}
          size={size}
        />
        <Text variant="footnote" tone="inkSoft" style={styles.centred}>
          House · 150 MPs
        </Text>
      </View>
      <View style={styles.chamber}>
        <Chamber
          seats={76}
          rows={4}
          ink={palette.danger}
          mine={senate}
          size={size}
        />
        <Text variant="footnote" tone="inkSoft" style={styles.centred}>
          Senate · 76 senators
        </Text>
      </View>
    </View>
  );
}

/** A division: every name counted, on one side or the other. */
export function DivisionArt({ width = 280 }: { width?: number }) {
  const palette = usePalette();
  const ayes = 82;
  const noes = 54;
  const cols = 17;
  const cell = width / cols;
  const r = cell * 0.3;
  const rowsOf = (n: number) => Math.ceil(n / cols);
  const gap = cell * 0.9;
  const height = (rowsOf(ayes) + rowsOf(noes)) * cell + gap + 8;
  const grid = (n: number, top: number, color: string, opacity: number) =>
    Array.from({ length: n }, (_, i) => (
      <Circle
        key={`${top}-${i}`}
        cx={(i % cols) * cell + cell / 2}
        cy={top + Math.floor(i / cols) * cell + cell / 2}
        r={r}
        color={color}
        opacity={opacity}
      />
    ));
  const barTop = rowsOf(ayes) * cell + gap / 2 - 2;
  return (
    <View style={styles.centre} {...hidden} testID="newcomer-art-division">
      <SizedCanvas width={width} height={height}>
        {grid(ayes, 0, palette.votesInk, 1)}
        <RoundedRect
          x={0}
          y={barTop}
          width={width}
          height={4}
          r={2}
          color={palette.dividerSubtle}
        />
        <RoundedRect
          x={0}
          y={barTop}
          width={(width * ayes) / (ayes + noes)}
          height={4}
          r={2}
          color={palette.votesInk}
        />
        {grid(noes, rowsOf(ayes) * cell + gap, palette.inkFaint, 0.55)}
      </SizedCanvas>
      <View style={[styles.tally, { width }]}>
        <Text variant="footnote" tone="inkSoft">
          82 said yes (the ayes)
        </Text>
        <Text variant="footnote" tone="inkSoft">
          54 said no (the noes)
        </Text>
      </View>
    </View>
  );
}

/** What OPAX holds on each person, each line with its source. */
export function RecordArt() {
  const rows = [
    { symbol: symbols.vote, ink: 'votes', label: 'How they voted' },
    {
      symbol: symbols.interests,
      ink: 'interests',
      label: 'What they declared',
    },
    { symbol: symbols.money, ink: 'money', label: 'What they’re paid' },
  ] as const;
  return (
    <View style={styles.record} {...hidden} testID="newcomer-art-record">
      {rows.map((row, i) => (
        <View
          key={row.label}
          style={[styles.recordRow, i ? styles.recordRule : null]}
        >
          <Icon
            name={row.symbol}
            size={22}
            type="hierarchical"
            ink={row.ink}
            maxScale={1.3}
          />
          <Text variant="strong" style={styles.grow}>
            {row.label}
          </Text>
          <Icon name={symbols.source} size={15} tone="inkSoft" maxScale={1.3} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  centred: { textAlign: 'center' },
  grow: { flex: 1 },
  chambers: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: rhythm.block,
  },
  chambersStacked: { flexDirection: 'column', alignItems: 'center' },
  chamber: { alignItems: 'center', gap: rhythm.tight },
  tally: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: rhythm.line,
    marginTop: rhythm.tight,
  },
  record: {
    alignSelf: 'stretch',
    backgroundColor: colors.raised,
    borderRadius: 16,
    borderCurve: 'continuous',
    paddingHorizontal: rhythm.block,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.row,
    paddingVertical: rhythm.row,
  },
  recordRule: {
    borderTopWidth: hairline,
    borderTopColor: colors.dividerSubtle,
  },
});
