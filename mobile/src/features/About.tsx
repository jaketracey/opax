import { phoneCopy } from '../design/phone-copy';
import { useEffect, useState } from 'react';
import { Platform, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { catalogs } from '../api/runtime';
import {
  Button,
  Disclosure,
  Group,
  Heading,
  KeyValueList,
  LinkRow,
  OpaxWebLink,
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
import { CatalogState, isOffline } from './CatalogState';
import { deceasedPersonsNotice } from '../onboarding/pages';

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
      testID="about-screen"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      <Group gap={rhythm.heading}>
        <Heading level={1} testID="about-name">
          Open Parliamentary Accountability Exchange
        </Heading>
        <Text variant="lede">
          The Open Parliamentary Accountability Exchange brings together
          Australian parliamentary speeches, votes, political funding and public
          disclosures, with links to the records behind them.
        </Text>
        <Text variant="metadata" testID="about-independence">
          OPAX is independent and non-partisan. It is not a government app and
          is not affiliated with any parliament, government or political party.
        </Text>
      </Group>
      <Section title="Cultural notice" icon="info.circle" accent="people">
        <Text testID="about-deceased-notice">{deceasedPersonsNotice}</Text>
      </Section>
      <Section
        title="Coverage"
        icon="chart.bar.doc.horizontal"
        accent="people"
        testID="about-coverage"
        info={{
          title: 'About the coverage',
          notes: [
            'Snapshot counts describe collected records. They are not live search totals.',
          ],
          testID: 'about-coverage-info',
        }}
      >
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
            links={false}
          >
            {(coverage) => (
              <Group>
                <StatRow
                  accent="people"
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
                <KeyValueList
                  items={[
                    {
                      label: 'Snapshot version',
                      value: formatDate(coverage.version),
                    },
                    ...(record?.data.asAt
                      ? [
                          {
                            label: 'Coverage checked',
                            value: new Date(record.data.asAt).toLocaleString(
                              'en-AU',
                              {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                                timeZoneName: 'short',
                              },
                            ),
                            testID: 'about-checked-at',
                          },
                        ]
                      : []),
                  ]}
                />
                <RowList>
                  <Disclosure
                    label="Coverage details and limitations"
                    testID="about-coverage-details"
                  >
                    {() => (
                      <Group>
                        <Heading level={3}>Record counts</Heading>
                        <KeyValueList
                          items={Object.entries(coverage.resources).map(
                            ([name, count]) => ({
                              label: name.replaceAll('_', ' '),
                              value: formatCount(count),
                            }),
                          )}
                        />
                        <Heading level={3}>Structured source counts</Heading>
                        <KeyValueList
                          items={Object.entries(coverage.structuredSources).map(
                            ([name, count]) => ({
                              label: name.replaceAll('_', ' '),
                              value: formatCount(count),
                            }),
                          )}
                        />
                        <Heading level={3}>Inclusion</Heading>
                        <Text>{coverage.inclusion}</Text>
                        <Heading level={3}>Source limitations</Heading>
                        {coverage.limitations.map((item) => (
                          <Text key={item}>{item}</Text>
                        ))}
                      </Group>
                    )}
                  </Disclosure>
                </RowList>
              </Group>
            )}
          </CatalogState>
        ) : null}
        <Button
          label="Refresh coverage"
          variant="quiet"
          size="compact"
          icon="arrow.clockwise"
          onPress={refresh}
          loading={refreshing}
          testID="about-refresh"
        />
      </Section>
      <Section
        title="Sources and licences"
        icon="books.vertical"
        accent="leads"
        testID="about-sources"
      >
        <Text wordSafe>
          Every dataset, its publisher and licence, the portrait credits and the
          fonts, in one place.
        </Text>
        <RowList>
          <LinkRow
            title="Sources and licences"
            icon="checkmark.seal"
            accent="leads"
            onPress={() => router.push('/account/sources')}
            testID="about-sources-open"
          />
          <OpaxWebLink
            label="Methods and source terms"
            path="/methods"
            testID="about-methods"
          />
        </RowList>
      </Section>
      <Section
        title="Machine-written text"
        icon="text.badge.star"
        accent="bills"
      >
        <Text>
          Stored machine briefs are labelled “Machine brief”. Bill summaries
          carry their attribution: “Written by a model from the explanatory
          memorandum; not the record”. Check the linked original record.
          Patterns are leads, not findings.
        </Text>
      </Section>
      <Section
        title="Corrections and contact"
        icon="envelope"
        accent="people"
        testID="about-contact"
      >
        <Text>
          Report a correction or contact OPAX through the support page.
        </Text>
        <OpaxWebLink
          label="Corrections and contact"
          path="/support"
          testID="about-support"
        />
      </Section>
      <Section title="Privacy" icon="hand.raised" accent="people">
        <Text>
          {phoneCopy(
            'Public reading needs no account and sends no account or device identifier. Requests reach OPAX’s servers with this iPhone’s IP address, used for rate limits and security. Request URLs, including submitted searches, may be kept in server logs for 7 days. Cloudflare traffic and security analytics may keep IP addresses, paths and queries for up to 31 days.',
          )}
        </Text>
        <Text>
          Search queries and results stay in memory during this app session and
          are not saved on this phone. Other public catalogs are saved on this
          phone for offline reading.
        </Text>
        {Platform.OS === 'android' ? null : (
          <Text>
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
        <OpaxWebLink
          label="Privacy policy"
          path="/privacy"
          testID="about-privacy"
        />
      </Section>
    </Screen>
  );
}
