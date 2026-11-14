import { router } from 'expo-router';
import { SwitchRow } from '../../design/controls';
import { InsetGroup } from '../../design/primitives';
import { closeSheetThen, SettingsRow } from '../account/parts';
import { learnCopy } from './copy';
import { learnRoute } from './routes';
import {
  setExplainTerms,
  setUnderlineTerms,
  useLearnSettings,
} from './settings';

/**
 * Account › the guide's two switches: "Underline terms" (inline glossary
 * terms, on for everyone until turned off) and "Explain terms" (option C's
 * plain lines under headings, set by the welcome's answer).
 */
export function AccountTermSwitches() {
  const { underline, explain } = useLearnSettings();
  return (
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
