import { FollowingBlock } from '../today/FollowingBlock';

/**
 * Today's Following block (journeys/follow.md 3.3 and 13), kept under its
 * old name for the screens and tests that import it: the changed follows
 * as rows with their change line, or one collapsed `bell` row. The block
 * itself lives with Today (`features/today/FollowingBlock.tsx`).
 */
export function FollowingSection({
  refresh,
  onRetry,
}: {
  /** Changes on a pull to refresh, which revalidates the catalogs. */
  refresh: number;
  /** Today's pull to refresh (the block's own line says the rest). */
  refreshing?: boolean;
  onRetry: () => void;
}) {
  return <FollowingBlock attempt={refresh} onRetry={onRetry} />;
}
