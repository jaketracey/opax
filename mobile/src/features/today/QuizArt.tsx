import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useDrawnColour } from '../../design/engraving';
import { colors } from '../../design/tokens';

/**
 * The quiz card's header: a field of dots with a question mark lit in it,
 * in the masthead map's own language (navy dots, the lit ones bronze). It
 * is drawn in code as two vector paths, so it is crisp at every size and
 * scale, and it fills the same 4:3 frame as the archive photograph beside
 * it, in its final size on the first frame (the frame is laid out by its
 * aspect ratio; nothing is measured).
 *
 * One image for every question. It shows no person, no party colour and
 * nothing of either answer. It does not move.
 */

/** The art's own units: a 4:3 box the frame scales to its width. */
export const QUIZ_ART = { width: 320, height: 240, step: 10 } as const;

/** The question mark, one character per dot of the field. */
const MARK = [
  '...#####...',
  '..#######..',
  '.###...###.',
  '.##.....##.',
  '........##.',
  '.......###.',
  '......###..',
  '.....###...',
  '....###....',
  '....##.....',
  '....##.....',
  '...........',
  '....##.....',
  '....##.....',
] as const;

/** One dot as a closed path: two half circles about its centre. */
const dot = (x: number, y: number, r: number) =>
  `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

/**
 * The field's dots and the lit ones, as path data. The mark sits in the
 * middle of the field, on the field's own grid.
 */
export function quizArtPaths(): { field: string; lit: string; count: number } {
  const { width, height, step } = QUIZ_ART;
  const columns = width / step - 1;
  const rows = height / step - 1;
  const left = Math.floor((columns - MARK[0].length) / 2);
  const top = Math.floor((rows - MARK.length) / 2);
  const field: string[] = [];
  const lit: string[] = [];
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const on = MARK[row - top]?.[column - left] === '#';
      const x = (column + 1) * step;
      const y = (row + 1) * step;
      (on ? lit : field).push(dot(x, y, on ? 3 : 1.5));
    }
  return { field: field.join(''), lit: lit.join(''), count: lit.length };
}

// Worked out once: the same two paths for every card.
let drawn: ReturnType<typeof quizArtPaths> | undefined;
const artPaths = () => (drawn ??= quizArtPaths());

/** The frame's width over its height: the archive photograph's. */
export const QUIZ_ART_RATIO = 4 / 3;

export function QuizArt({
  testID = 'today-question-art',
}: {
  testID?: string;
}) {
  // Hex for the drawing, following the appearance and Increase Contrast as
  // `colors` does natively; the ground is a view, so it takes the role.
  const navy = useDrawnColour('navy');
  const bronze = useDrawnColour('todayDotBronze');
  const paths = artPaths();
  return (
    <View
      testID={testID}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.frame}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${QUIZ_ART.width} ${QUIZ_ART.height}`}
        preserveAspectRatio="xMidYMid slice"
      >
        <Path d={paths.field} fill={navy} fillOpacity={0.22} />
        <Path d={paths.lit} fill={bronze} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // The archive photograph's frame: the card's full width, 4:3, square
  // corners (the card clips its own).
  frame: {
    width: '100%',
    aspectRatio: QUIZ_ART_RATIO,
    overflow: 'hidden',
    backgroundColor: colors.navyWash,
  },
});
