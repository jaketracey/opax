import { Circle, Group, Path, Rect } from '@shopify/react-native-skia';
import { StyleSheet, View } from 'react-native';
import { SizedCanvas } from '../../design/canvas';
import { useDrawnColour } from '../../design/engraving';
import { Icon } from '../../design/icon';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { colors, hairline, radii, rhythm } from '../../design/tokens';
import outline from '../today/australia-outline.json';
import { minuteCopy } from './copy';

/**
 * The drawings of "Parliament in a minute". Each shows the idea its words
 * say, in the app's own register: paper, hairlines, navy, and one bronze
 * mark for "yours". The chambers take their own colours (`houseInk`,
 * `senateInk`), never a category ink. Every colour follows the appearance
 * and Increase Contrast (`useDrawnColour`). All are decorative and hidden
 * from VoiceOver: the words beside them carry everything they show. Nothing
 * moves, so Reduce Motion has nothing to stop.
 */
const hidden = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/** Australia, with one bronze mark: 150 electorates, one of them yours. */
export function ElectorateArt({ height = 150 }: { height?: number }) {
  const wash = useDrawnColour('navyWash');
  const line = useDrawnColour('inkFaint');
  const bronze = useDrawnColour('bronze');
  const bronzeWash = useDrawnColour('bronzeWash');
  const scale = height / outline.height;
  const width = Math.round(outline.width * scale);
  // On the east coast; no real electorate is implied.
  const pin = { x: outline.width * 0.9, y: outline.height * 0.66 };
  const ring = 20 / scale / 2.2;
  return (
    <View style={styles.centre} {...hidden} testID="minute-art-electorate">
      <SizedCanvas width={width} height={height}>
        <Group transform={[{ scale }]}>
          {outline.states.map((s) => (
            <Group key={s.code}>
              <Path path={s.d} color={wash} />
              <Path
                path={s.d}
                color={line}
                style="stroke"
                strokeWidth={1 / scale}
              />
            </Group>
          ))}
          <Circle cx={pin.x} cy={pin.y} r={ring} color={bronzeWash} />
          <Circle
            cx={pin.x}
            cy={pin.y}
            r={ring}
            color={bronze}
            style="stroke"
            strokeWidth={1.5 / scale}
          />
          <Circle cx={pin.x} cy={pin.y} r={4 / scale} color={bronze} />
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
  testID,
}: {
  seats: number;
  rows: number;
  ink: string;
  /** Seat indexes drawn in bronze: yours. */
  mine: readonly number[];
  size: number;
  testID: string;
}) {
  const bronze = useDrawnColour('bronze');
  const step = size / 2 / (rows + 2.2);
  const inner = step * 2.4;
  const dots = hemicycle(seats, rows, inner, step);
  const r = step * 0.36;
  const outer = inner + (rows - 1) * step + r;
  const height = outer + r + 2;
  return (
    <SizedCanvas width={size} height={height} testID={testID}>
      <Group transform={[{ translateX: size / 2 }, { translateY: outer + 1 }]}>
        {dots.map((d) => {
          const yours = mine.includes(d.index);
          return (
            <Circle
              key={d.index}
              cx={d.x}
              cy={d.y}
              r={yours ? r * 1.25 : r}
              color={yours ? bronze : ink}
            />
          );
        })}
      </Group>
    </SizedCanvas>
  );
}

/** The House's seats and the Senate's, as each chamber is laid out. */
export const chamberSeats = { house: 150, senate: 76, perState: 12 } as const;

/**
 * The two rooms in their own colours: the House green, the Senate red. One
 * bronze seat in the House is your MP; twelve in the Senate are your
 * state's senators. Side by side, or stacked at accessibility sizes.
 */
export function ChambersArt({
  size = 150,
  stacked = false,
}: {
  size?: number;
  stacked?: boolean;
}) {
  const house = useDrawnColour('houseInk');
  const senate = useDrawnColour('senateInk');
  // The outer row's last twelve seats: one state's block.
  const state = Array.from(
    { length: chamberSeats.perState },
    (_, i) => chamberSeats.senate - chamberSeats.perState + i,
  );
  return (
    <View
      style={[styles.chambers, stacked ? styles.chambersStacked : null]}
      {...hidden}
      testID="minute-art-chambers"
    >
      <View style={styles.chamber}>
        <Chamber
          seats={chamberSeats.house}
          rows={6}
          ink={house}
          mine={[112]}
          size={size}
          testID="minute-art-house"
        />
        <Text wordSafe variant="footnote" tone="inkSoft" style={styles.centred}>
          {minuteCopy.house}
        </Text>
      </View>
      <View style={styles.chamber}>
        <Chamber
          seats={chamberSeats.senate}
          rows={4}
          ink={senate}
          mine={state}
          size={size}
          testID="minute-art-senate"
        />
        <Text wordSafe variant="footnote" tone="inkSoft" style={styles.centred}>
          {minuteCopy.senate}
        </Text>
      </View>
    </View>
  );
}

/**
 * A division: every name counted, on one side or the other. The two groups
 * are a picture, not a real vote, so the captions carry no figures.
 */
export function DivisionArt({ width = 280 }: { width?: number }) {
  const ayeInk = useDrawnColour('votesInk');
  const noInk = useDrawnColour('inkFaint');
  const track = useDrawnColour('dividerSubtle');
  const ayes = 82;
  const noes = 54;
  const cols = 17;
  const cell = width / cols;
  const r = cell * 0.3;
  const rowsOf = (n: number) => Math.ceil(n / cols);
  const gap = cell * 0.9;
  const height = (rowsOf(ayes) + rowsOf(noes)) * cell + gap + 8;
  const grid = (n: number, top: number, color: string) =>
    Array.from({ length: n }, (_, i) => (
      <Circle
        key={`${top}-${i}`}
        cx={(i % cols) * cell + cell / 2}
        cy={top + Math.floor(i / cols) * cell + cell / 2}
        r={r}
        color={color}
      />
    ));
  const barTop = rowsOf(ayes) * cell + gap / 2 - 2;
  return (
    <View style={styles.centre} {...hidden} testID="minute-art-division">
      <SizedCanvas width={width} height={height}>
        {grid(ayes, 0, ayeInk)}
        <Rect x={0} y={barTop} width={width} height={4} color={track} />
        <Rect
          x={0}
          y={barTop}
          width={(width * ayes) / (ayes + noes)}
          height={4}
          color={ayeInk}
        />
        {grid(noes, rowsOf(ayes) * cell + gap, noInk)}
      </SizedCanvas>
      <View style={[styles.tally, { width }]}>
        <Text wordSafe variant="footnote" tone="inkSoft">
          {minuteCopy.ayes}
        </Text>
        <Text wordSafe variant="footnote" tone="inkSoft">
          {minuteCopy.noes}
        </Text>
      </View>
    </View>
  );
}

/** What OPAX holds on each person, each line with its source mark. */
export function RecordArt() {
  const rows = [
    { symbol: symbols.vote, ink: 'votes', label: minuteCopy.record.votes },
    {
      symbol: symbols.interests,
      ink: 'interests',
      label: minuteCopy.record.interests,
    },
    { symbol: symbols.money, ink: 'money', label: minuteCopy.record.pay },
  ] as const;
  return (
    <View style={styles.record} {...hidden} testID="minute-art-record">
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
          <Text wordSafe variant="strong" style={styles.grow}>
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
  chamber: { alignItems: 'center', gap: rhythm.tight, flexShrink: 1 },
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
    borderRadius: radii.tile,
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
