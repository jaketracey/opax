import { copy } from '../design/copy';
import { openOnWeb } from './external';

/**
 * "Open on opax.com.au" for a page that turned out not to be in the app: an
 * unknown person, electorate, bill, record or topic. A universal link is
 * claimed by its pattern (/subject/person/*), before the app knows whether
 * it holds that id, so the not-found page offers the address the reader
 * asked for on the website. It opens in the browser, never back in the app.
 */
export const webFallback = (path: string, label: string, testID: string) => ({
  label: copy.openOnWeb,
  onPress: () => void openOnWeb(path, label, { preferNative: false }),
  testID,
});
