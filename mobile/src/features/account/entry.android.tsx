import { Screen } from '../../design/primitives';
import { AccountLinks } from './AccountLinks';

/**
 * Android About. Account sign-in and voice are absent until their native
 * port, so the sheet is the one list of rows.
 */
export default function AndroidAboutScreen() {
  return (
    <Screen testID="account-sheet">
      <AccountLinks first testID="account-links" />
    </Screen>
  );
}
