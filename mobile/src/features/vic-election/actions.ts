import type { RowMenuLeaf } from '../../design/row-link';
import { openOnWeb } from '../../navigation/external';
import { copyRecordLink, shareRecord } from '../../navigation/share';
import { vicCopy as c } from './copy';

/** Shared actions take canonical paths; the API publishes an absolute URL. */
export function electionMenu(title: string, webURL: string): RowMenuLeaf[] {
  const path = new URL(webURL).pathname;
  return [
    {
      title: c.share,
      symbol: 'square.and.arrow.up',
      onPress: () => void shareRecord({ title, path }),
    },
    {
      title: c.copyLink,
      symbol: 'link',
      onPress: () => void copyRecordLink(path),
    },
    {
      title: c.openWeb,
      symbol: 'arrow.up.right',
      onPress: () => void openOnWeb(path, title, { preferNative: false }),
    },
  ];
}
