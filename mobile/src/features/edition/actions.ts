import { router } from 'expo-router';
import type { EditionView } from '../../api/selectors';
import type { RowMenuAction } from '../../design/row-link';
import { openOnWeb } from '../../navigation/external';
import { copyRecordLink, shareRecord } from '../../navigation/share';
import { ruleRoute } from '../../navigation/routes/sheets';

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
      title: 'How this is chosen',
      symbol: 'info.circle',
      onPress: () => router.push(ruleRoute({ block: 'edition' })),
    },
  ];
}
