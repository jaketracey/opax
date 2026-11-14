import { router, type Href } from 'expo-router';
import { SwitchRow } from '../../design/controls';
import { InsetGroup, Screen } from '../../design/layout';
import { closeSheetThen, SettingsRow } from '../account/parts';
import { learnCopy } from './copy';
import { learnRoute } from './routes';
import {
  setExplainTerms,
  setUnderlineTerms,
  useLearnSettings,
} from './settings';

/**
 * Account › Glossary terms (`/account/terms`): the guide's two switches,
 * on their own page like Account › Ask settings. "Underline terms" (inline
 * glossary terms, on for everyone until turned off) and "Explain terms"
 * (option C's plain lines under headings, set by the welcome's answer).
 */
export default function AccountTerms() {
  const { underline, explain } = useLearnSettings();
  return (
    <Screen grouped testID="account-terms">
      <InsetGroup footer={learnCopy.switchesFooter}>
        <SwitchRow
          label={learnCopy.underline}
          value={underline}
          onValueChange={(next) => void setUnderlineTerms(next)}
          testID="account-underline-terms"
        />
        <SwitchRow
          label={learnCopy.explain}
          value={explain}
          onValueChange={(next) => void setExplainTerms(next)}
          testID="account-explain-terms"
        />
      </InsetGroup>
    </Screen>
  );
}

/** Account › Glossary terms: the row that opens the switches. */
export function AccountTermsRow() {
  return (
    <SettingsRow
      title={learnCopy.termsPage}
      tile="books.vertical"
      href={'/account/terms' as Href}
      testID="account-terms-row"
    />
  );
}

/**
 * Account › How Parliament works: the guide is pushed inside the tab beneath
 * the sheet, so the sheet closes first.
 */
export function AccountGuideRow() {
  return (
    <SettingsRow
      title={learnCopy.name}
      tile="text.book.closed"
      onPress={() => closeSheetThen(() => router.push(learnRoute))}
      testID="account-learn"
    />
  );
}
