import { act } from 'react';
import type TestRenderer from 'react-test-renderer';

/** Supply native Text advances explicitly; Jest has no native font renderer. */
export function measureBarTitle(
  view: TestRenderer.ReactTestRenderer,
  widths: Record<string, number> = {},
) {
  act(() => {
    for (const node of view.root.findAll(
      (node) =>
        typeof node.type !== 'string' &&
        ['bar-title-probe', 'bar-back-probe'].includes(node.props?.testID),
    )) {
      const text = node.props.children as string;
      node.props.onTextLayout({
        nativeEvent: {
          lines: [{ width: widths[text] ?? text.length * 7, height: 20 }],
        },
      });
    }
  });
}
