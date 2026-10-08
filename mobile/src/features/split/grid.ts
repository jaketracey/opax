import { rhythm } from '../../design/tokens';

/**
 * Person and party pages on iPad regular width: blocks in pairs, two
 * columns ruled like a broadsheet (`PadGrid`). At accessibility sizes the
 * minimum width doubles and the pairs stack.
 */
export const profileGrid = {
  columns: { regular: 2, wide: 2 },
  minItemWidth: 300,
  gap: rhythm.section,
} as const;
