import { StyleSheet } from 'react-native';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

/**
 * Host views laid out as a wrapping column: `flexWrap: 'wrap'` with a column
 * direction (RN's default). Yoga lays the stretched children of a wrapping
 * column out at max-content width, so their text measures at one width and
 * draws in another. Build 33's profile figure strip at AX5 kept the row's
 * wrap when it stacked, and drew two figures blank and one clipped.
 */
export function wrappingColumns(r: ReactTestRenderer): ReactTestInstance[] {
  return r.root.findAll((n) => {
    if (typeof n.type !== 'string') return false;
    const style = StyleSheet.flatten(n.props.style) ?? {};
    const direction = style.flexDirection ?? 'column';
    return (
      (style.flexWrap === 'wrap' || style.flexWrap === 'wrap-reverse') &&
      direction.startsWith('column')
    );
  });
}

/** Test IDs (or host types) of wrapping columns, for a readable failure. */
export const describeWrappingColumns = (r: ReactTestRenderer) =>
  wrappingColumns(r).map((n) => n.props.testID ?? n.type);
