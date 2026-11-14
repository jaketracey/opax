import { learnName } from '../newcomer/learn/copy';
import { learnRoute } from '../newcomer/learn/routes';
import { newcomerOption } from '../newcomer/option';
import { router, type Href } from 'expo-router';
import { View } from 'react-native';
import { isProduction } from '../../design/environment';
import { InsetGroup } from '../../design/primitives';
import { symbols } from '../../design/symbols';
import { rhythm } from '../../design/tokens';
import { openCorrection, openOnWeb } from '../../navigation/external';
import { replayWelcome } from '../welcome/replay';
import { SettingsRow, closeSheetThen, linksCopy } from './parts';

/**
 * Groups 4 to 6 of the Account sheet (2.2): about OPAX, privacy, support and
 * corrections, then the welcome. Every row has a tile and no second line.
 * The design workbench and Community join in development and e2e builds.
 */
export function AccountLinks({
  community,
  testID,
}: {
  /** Community's home; absent where the build leaves it out. */
  community?: Href | null;
  testID?: string;
}) {
  return (
    <View testID={testID} style={{ gap: rhythm.section }}>
      <InsetGroup>
        {community ? (
          <SettingsRow
            title={linksCopy.community}
            tile="person.3"
            href={community}
            testID="account-community"
          />
        ) : null}
        <SettingsRow
          title={linksCopy.ask}
          tile="text.bubble"
          href="/account/ask"
          testID="account-ask"
        />
        <SettingsRow
          title={linksCopy.about}
          tile={symbols.about}
          href="/account/about"
          testID="account-about"
        />
        <SettingsRow
          title={linksCopy.sources}
          tile={symbols.methods}
          href="/account/sources"
          testID="account-sources"
        />
        <SettingsRow
          title={linksCopy.methods}
          tile={symbols.verified}
          href="/account/methods"
          testID="account-methods"
        />
        <SettingsRow
          title={linksCopy.coverage}
          tile="chart.bar.doc.horizontal"
          href="/account/coverage"
          testID="account-coverage"
        />
      </InsetGroup>
      <InsetGroup footer={linksCopy.correctionFooter}>
        <SettingsRow
          title={linksCopy.privacy}
          tile={symbols.privacy}
          external
          accessibilityHint={linksCopy.opensOnWeb}
          onPress={() => void openOnWeb('/privacy', linksCopy.privacy)}
          testID="account-privacy"
        />
        <SettingsRow
          title={linksCopy.support}
          tile={symbols.help}
          external
          accessibilityHint={linksCopy.opensOnWeb}
          onPress={() => void openOnWeb('/support', linksCopy.support)}
          testID="account-support"
        />
        <SettingsRow
          title={linksCopy.correction}
          tile={symbols.email}
          external
          onPress={() => void openCorrection()}
          testID="account-correction"
        />
      </InsetGroup>
      <InsetGroup>
        {newcomerOption() ? (
          // Newcomer design pass (prototype): the guide, from Account.
          <SettingsRow
            title={learnName()}
            tile={symbols.help}
            onPress={() => closeSheetThen(() => router.push(learnRoute))}
            testID="account-learn"
          />
        ) : null}
        <SettingsRow
          title={linksCopy.replayWelcome}
          tile={symbols.welcome}
          // The welcome is full screen above the tabs: the sheet goes first.
          onPress={() => closeSheetThen(replayWelcome)}
          testID="account-replay-tour"
        />
        {isProduction ? null : (
          // Development and e2e only, whatever the voice switch says; the
          // workbench route is not in release bundles.
          <SettingsRow
            title={linksCopy.workbench}
            tile={symbols.tools}
            href={'/workbench' as Href}
            testID="account-workbench"
          />
        )}
      </InsetGroup>
    </View>
  );
}
