import { phoneCopy } from '../design/phone-copy';
import { useEffect, useState } from 'react';
import { Platform, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { catalogs } from '../api/runtime';
import {
  Disclosure,
  Group,
  KeyValueList,
  LinkRow,
  RowList,
  Screen,
  Section,
  StatRow,
  Text,
  errorMessage,
  ErrorState,
  OfflineBanner,
} from '../design/primitives';
import { formatCount, formatDate } from '../design/format';
import { rhythm } from '../design/tokens';
import { openOnWeb } from '../navigation/external';
import { CatalogState, isOffline } from './CatalogState';

import { openRecord } from './reports/open';
import { deceasedPersonsNotice } from '../onboarding/pages';

/**
 * About OPAX (IOS-UX 4.9): prose under the sheet's one title, so no heading
 * repeats it and no section carries an accent mark. Each section has one
 * heading level; coverage ends on its one source line, the details behind
 * disclosures. Datasets, licences, credits and fonts are on Sources and
 * licences, one row away. Pull to refresh reads coverage again.
 */
export default function About() {
  const [record, setRecord] = useState<Awaited<
    ReturnType<typeof catalogs.about>
  > | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    let active = true;
    void catalogs
      .about(retry > 0)
      .then((data) => {
        if (active) {
          setRecord(data);
          setError(null);
        }
      })
      .catch((e) => {
        if (active) setError(e);
      })
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  const refresh = () => {
    setRefreshing(true);
    setRetry((value) => value + 1);
  };
  return (
    <Screen
      column="wide"
      testID="about-screen"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      <Group gap={rhythm.heading}>
        <Text wordSafe variant="body" testID="about-name">
          The Open Parliamentary Accountability Exchange brings together
          Australian parliamentary speeches, votes, political funding and public
          disclosures, with links to the records behind them.
        </Text>
        <Text wordSafe variant="metadata" testID="about-independence">
          OPAX is independent and non-partisan. It is not a government app and
          is not affiliated with any parliament, government or political party.
        </Text>
      </Group>
      <Section title="Cultural notice">
        <Text wordSafe testID="about-deceased-notice">
          {deceasedPersonsNotice}
        </Text>
      </Section>
      <Section title="Coverage" testID="about-coverage">
        {error ? (
          <Group>
            {isOffline(error) && !record ? (
              <OfflineBanner cached={false} />
            ) : null}
            <ErrorState message={errorMessage(error)} onRetry={refresh} />
          </Group>
        ) : null}
        {record || !error ? (
          <CatalogState
            block={record?.data ?? null}
            empty="Coverage is not available in this snapshot."
            onRetry={refresh}
            refreshing={refreshing}
            testID="about-coverage"
          >
            {(coverage) => (
              <Group>
                <StatRow
                  stats={[
                    {
                      label: 'Collected speeches',
                      value: formatCount(coverage.collectedSpeeches),
                      testID: 'about-speeches',
                    },
                    {
                      label: 'Expected resources',
                      value: formatCount(coverage.expectedResources),
                      testID: 'about-resources',
                    },
                  ]}
                />
                {/* The one caveat drawn: these numbers are not search totals. */}
                <Text wordSafe variant="fine" testID="about-snapshot">
                  {[
                    formatDate(coverage.version)
                      ? `Snapshot of ${formatDate(coverage.version)}.`
                      : null,
                    'Counts describe collected records, not live search totals.',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                </Text>
                <RowList>
                  <Disclosure
                    label="Record counts"
                    testID="about-coverage-details"
                  >
                    {() => (
                      <KeyValueList
                        items={Object.entries(coverage.resources).map(
                          ([name, count]) => ({
                            label: name.replaceAll('_', ' '),
                            value: formatCount(count),
                          }),
                        )}
                      />
                    )}
                  </Disclosure>
                  <Disclosure
                    label="Structured sources"
                    testID="about-coverage-structured"
                  >
                    {() => (
                      <KeyValueList
                        items={Object.entries(coverage.structuredSources).map(
                          ([name, count]) => ({
                            label: name.replaceAll('_', ' '),
                            value: formatCount(count),
                          }),
                        )}
                      />
                    )}
                  </Disclosure>
                  <Disclosure
                    label="Inclusion and limitations"
                    testID="about-coverage-limits"
                  >
                    {() => (
                      <Group gap={rhythm.tight}>
                        <Text wordSafe>{coverage.inclusion}</Text>
                        {coverage.limitations.map((item) => (
                          <Text wordSafe key={item}>
                            {item}
                          </Text>
                        ))}
                      </Group>
                    )}
                  </Disclosure>
                </RowList>
              </Group>
            )}
          </CatalogState>
        ) : null}
      </Section>
      <Section title="Read the record">
        <RowList>
          <LinkRow
            title="Reports"
            onPress={() => openRecord('/reports', 'Reports')}
            testID="about-reports"
          />
          <LinkRow
            title="Topics A–Z"
            onPress={() => openRecord('/subject/topic', 'Topics A–Z')}
            testID="about-topics"
          />
        </RowList>
      </Section>
      <Section title="Sources and methods" testID="about-sources">
        <RowList>
          <LinkRow
            title="Sources and licences"
            detail="Datasets, portrait credits and fonts"
            onPress={() => router.push('/account/sources')}
            testID="about-sources-open"
          />
          <LinkRow
            title="Sources & coverage"
            onPress={() => openRecord('/stats', 'Sources & coverage')}
            testID="about-stats"
          />
          <LinkRow
            title="Methods and source terms"
            onPress={() => openRecord('/methods', 'Methods')}
            testID="about-methods"
          />
        </RowList>
      </Section>
      <Section title="Machine-written text">
        <Text wordSafe>
          Stored machine briefs are labelled “Machine-written”. Bill summaries
          carry their attribution: “Written by a model from the explanatory
          memorandum; not the record”. Check the linked original record.
          Patterns are leads, not findings.
        </Text>
      </Section>
      <Section title="Corrections and contact" testID="about-contact">
        <Text wordSafe>
          Report a correction or contact OPAX through the support page.
        </Text>
        <WebRow title="OPAX support" path="/support" testID="about-support" />
      </Section>
      <Section title="Privacy">
        <Text wordSafe>
          {phoneCopy(
            'Public reading needs no account and sends no account or device identifier. Requests reach OPAX’s servers with this iPhone’s IP address, used for rate limits and security. Request URLs, including submitted searches, may be kept in server logs for 7 days. Cloudflare traffic and security analytics may keep IP addresses, paths and queries for up to 31 days.',
          )}
        </Text>
        <Text wordSafe>
          Search queries and results stay in memory during this app session and
          are not saved on this phone. Other public catalogs are saved on this
          phone for offline reading.
        </Text>
        {Platform.OS === 'android' ? null : (
          <Text wordSafe>
            Voice sends your audio and the conversation’s words to ElevenLabs
            and the language model it runs. OPAX keeps your email address and
            member ID until account deletion, and call times, seconds used and
            the provider’s conversation reference. OPAX keeps no audio or
            transcript. The reference is removed a day after the call is
            recorded as closed; account deletion keeps usage without a link to
            you. ElevenLabs was set to keep no audio and delete transcripts
            after a day when checked on 9 September 2026. Deleted account data
            stays in database recovery history for up to 30 days.
          </Text>
        )}
        <WebRow title="Privacy policy" path="/privacy" testID="about-privacy" />
      </Section>
    </Screen>
  );
}

/** A page on opax.com.au, as one row in Safari's symbol. */
function WebRow({
  title,
  path,
  testID,
}: {
  title: string;
  path: string;
  testID: string;
}) {
  return (
    <RowList>
      <LinkRow
        title={title}
        external
        accessibilityHint="Opens on opax.com.au"
        testID={testID}
        onPress={() => void openOnWeb(path, title)}
      />
    </RowList>
  );
}
