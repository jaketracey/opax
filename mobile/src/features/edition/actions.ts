import type { EditionView } from '../../api/selectors';
import { copy } from '../../design/copy';
import type { RowMenuAction } from '../../design/row-link';
import { openOnWeb } from '../../navigation/external';
import { copyRecordLink, shareRecord } from '../../navigation/share';
import { presentSheet } from '../../navigation/sheets';
import { EDITION_RULE } from './model';

// The published edition points to its subject's stable public record.
export const shareEdition = (edition: EditionView) =>
  shareRecord({ path: edition.path, title: edition.title });
export function editionMenu(edition: EditionView): RowMenuAction[] {
  return [
    {
      title: 'Copy link',
      symbol: 'link',
      onPress: () => void copyRecordLink(edition.path),
    },
    {
      title: 'Open on opax.com.au',
      symbol: 'arrow.up.right',
      onPress: () => void openOnWeb(edition.path, edition.title),
    },
    {
      title: copy.howChosen,
      symbol: 'info.circle',
      onPress: () =>
        presentSheet({
          kind: 'rule',
          title: copy.howChosen,
          rule: EDITION_RULE,
        }),
    },
  ];
}
