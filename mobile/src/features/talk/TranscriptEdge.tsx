import { StyleSheet } from 'react-native';
import { GroundFade } from '../../design/ground-fade';

export const TRANSCRIPT_EDGE_HEIGHT = 28;

/** Opaque at the scroll boundary, clear before the first line's top inset. */
export function TranscriptEdge() {
  return (
    <GroundFade side="top" testID="talk-transcript-edge" style={styles.edge} />
  );
}

const styles = StyleSheet.create({
  edge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: TRANSCRIPT_EDGE_HEIGHT,
  },
});
