import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type RefObject,
} from 'react';
import { View, useWindowDimensions, type ScrollView } from 'react-native';
import { useSplitCursor } from '../../design/primitives';
import { ownsRowPadding } from '../../design/row-padding';
import { useHeaderBottom } from '../../design/useHeaderBottom';
import { rhythm } from '../../design/tokens';

type Rows = Map<string, RefObject<View | null>>;

/**
 * A row in a cursor-mode split list (Search on iPad): it draws the
 * keyboard's highlight and registers itself so the list can scroll it into
 * view. Only rendered in the split; the phone draws its rows directly.
 */
export const CursorRow = ownsRowPadding(function CursorRow({
  rowKey,
  rows,
  children,
}: {
  rowKey: string;
  rows: Rows;
  children: (highlighted: boolean) => ReactElement;
}) {
  const cursor = useSplitCursor();
  const ref = useRef<View>(null);
  useEffect(() => {
    rows.set(rowKey, ref);
    return () => {
      if (rows.get(rowKey) === ref) rows.delete(rowKey);
    };
  }, [rowKey, rows]);
  return (
    <View ref={ref} collapsable={false}>
      {children(cursor === rowKey)}
    </View>
  );
});

/**
 * Scrolls a cursor row into view inside a screen's scroll view: `rows` for
 * the `CursorRow`s, `onScroll` for the screen, `reveal(key)` for the split.
 */
export function useCursorReveal(scroll: RefObject<ScrollView | null>) {
  const [rows] = useState<Rows>(() => new Map());
  const offset = useRef(0);
  const top = useHeaderBottom();
  const { height } = useWindowDimensions();
  return {
    rows,
    onScroll: (y: number) => {
      offset.current = y;
    },
    reveal(key: string) {
      rows.get(key)?.current?.measureInWindow((_x, y, _width, rowHeight) => {
        const above = y - (top + rhythm.block);
        const below = y + rowHeight - (height - rhythm.section);
        const by = above < 0 ? above : below > 0 ? below : 0;
        if (by)
          scroll.current?.scrollTo({ y: offset.current + by, animated: true });
      });
    },
  };
}
