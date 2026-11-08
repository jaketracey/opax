import type { RowMenuAction } from '../../navigation/chrome';
import { copy } from '../../design/copy';
import { openOnWeb } from '../../navigation/external';
import { copyRecordLink, shareRecord } from '../../navigation/share';

/**
 * The ⋯ menu of a money or leads page: Share, Copy link and "Open on
 * opax.com.au". This is the only place in the money and leads screens
 * that leaves for the web (tests/money-routes.test.ts): every other step
 * stays in the app until an original register record.
 */
export function moneyPageMenu(target: {
  path: string;
  title: string;
}): RowMenuAction[] {
  return [
    {
      title: copy.share,
      symbol: 'square.and.arrow.up',
      onPress: () => {
        void shareRecord(target);
      },
    },
    {
      title: copy.copyLink,
      symbol: 'link',
      onPress: () => {
        void copyRecordLink(target.path);
      },
    },
    {
      title: copy.openOnWeb,
      symbol: 'safari',
      onPress: () => {
        void openOnWeb(target.path, target.title, { preferNative: false });
      },
    },
  ];
}

/** A card's long-press menu: Share and Copy link, never the web. */
export function moneyCardMenu(target: {
  path: string;
  title: string;
}): RowMenuAction[] {
  return moneyPageMenu(target).slice(0, 2);
}
