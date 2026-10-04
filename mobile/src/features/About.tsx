import { useEffect, useState } from 'react';
import { RefreshControl } from 'react-native';
import Constants from 'expo-constants';
import { catalogs } from '../api/runtime';
import {
  Button,
  Group,
  Heading,
  KeyValueList,
  OpaxWebLink,
  Screen,
  Section,
  SourceLink,
  Text,
  errorMessage,
  ErrorState,
  OfflineBanner,
} from '../design/primitives';
import { formatCount, formatDate } from '../design/format';
import { CatalogState, isOffline } from './CatalogState';

// Source terms summarised from portal/public/index.html, “Licences and reuse”.
// Coverage files do not publish licence fields; never infer an open licence.
function licenceFor(name: string) {
  if (/recorded divisions/i.test(name))
    return 'Hansard: parliamentary copyright, CC BY-NC-ND terms. They Vote For You compiled division data: Open Database Licence.';
  if (
    /Hansard|Parliament|committee hearings|Legislative Assembly/i.test(name) &&
    !/representation/i.test(name)
  )
    return 'Parliamentary copyright. Hansard is reproduced under CC BY-NC-ND terms; check the original source before reuse.';
  if (/AEC donations|GrantConnect award/i.test(name))
    return 'Creative Commons Attribution. The version and reuse conditions are those on the original record.';
  return 'See the original source terms. This coverage snapshot does not publish a verified licence for this source.';
}
export default function About() {
  const [record, setRecord] = useState<Awaited<
    ReturnType<typeof catalogs.about>
  > | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  const [refreshing, setRefreshing] = useState(true);
  const [coverageDetails, setCoverageDetails] = useState(false);
  const [sourceDetails, setSourceDetails] = useState(false);
  const [font, setFont] = useState<string | null>(null);
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
  const raw: unknown = Constants.expoConfig?.extra?.fontAcknowledgements;
  const fonts = Array.isArray(raw)
    ? raw.filter(
        (f): f is { name: string; notice: string } =>
          typeof f?.name === 'string' && typeof f?.notice === 'string',
      )
    : [];
  return (
    <Screen
      testID="about-screen"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      <Group>
        <Heading level={1} testID="about-name">
          Open Parliamentary Accountability Exchange
        </Heading>
        <Text>
          The Open Parliamentary Accountability Exchange brings together
          Australian parliamentary speeches, votes, political funding and public
          disclosures, with links to the records behind them.
        </Text>
        <Text testID="about-independence">
          OPAX is independent and non-partisan. It is not a government app and
          is not affiliated with any parliament, government or political party.
        </Text>
      </Group>
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
            links={false}
          >
            {(coverage) => (
              <Group>
                <KeyValueList
                  items={[
                    {
                      label: 'Expected resources',
                      value: formatCount(coverage.expectedResources),
                      testID: 'about-resources',
                    },
                    {
                      label: 'Collected speeches',
                      value: formatCount(coverage.collectedSpeeches),
                      testID: 'about-speeches',
                    },
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
                <Text variant="fine">
                  Snapshot counts describe collected records. They are not live
                  search totals.
                </Text>
                <Button
                  label={`${coverageDetails ? 'Hide' : 'Read'} coverage details and limitations`}
                  onPress={() => setCoverageDetails(!coverageDetails)}
                  testID="about-coverage-details"
                />
                {coverageDetails ? (
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
                ) : null}
              </Group>
            )}
          </CatalogState>
        ) : null}
        <Button
          label="Refresh coverage"
          onPress={refresh}
          loading={refreshing}
          testID="about-refresh"
        />
      </Section>
      <Section title="Sources and licences" testID="about-sources">
        <Text>
          Source data retains its own copyright and licence. Check the licence
          on the original record before reuse.
        </Text>
        <SourceLink
          citation="Parliament of Australia"
          url="https://www.aph.gov.au/Help/Disclaimer_Privacy_Copyright"
          kind="register"
          testID="about-source-aph"
        />
        <Text>
          House and Senate registers of interests carry CC BY-NC-ND terms. OPAX
          presents extracted facts with links to the source. Queensland
          interests have no verified licence in the source review.
        </Text>
        <SourceLink
          citation="They Vote For You"
          url="https://theyvoteforyou.org.au/"
          kind="register"
          testID="about-source-tvfy"
        />
        <Text>
          Compiled division data: Open Data Commons Open Database Licence. The
          underlying Hansard retains parliamentary copyright.
        </Text>
        <SourceLink
          citation="AEC Transparency Register"
          url="https://transparency.aec.gov.au/"
          kind="register"
        />
        <Text>
          AEC returns and GrantConnect awards carry Creative Commons Attribution
          terms. Versions vary by source.
        </Text>
        <SourceLink
          citation="Independent Parliamentary Expenses Authority"
          url="https://www.ipea.gov.au/"
          kind="register"
        />
        <Text>IPEA expenditure reports on data.gov.au: CC BY 3.0 AU.</Text>
        <SourceLink
          citation="Remuneration Tribunal"
          url="https://www.remtribunal.gov.au/"
          kind="register"
        />
        <Text>
          Pay records describe entitlements set by instrument, not payslips.
          Expenses are reported expenditure. Refer to each record for its source
          and reuse terms.
        </Text>
        <Button
          label={`${sourceDetails ? 'Hide' : 'Read'} collected source coverage`}
          onPress={() => setSourceDetails(!sourceDetails)}
          testID="about-source-details"
        />
        {sourceDetails
          ? record?.data.data?.sources.map((item) => (
              <Group key={item.name}>
                <Heading level={3}>{item.name}</Heading>
                <Text>
                  {formatCount(item.docs)} documents · {item.coverage}
                </Text>
                <Text variant="fine">{licenceFor(item.name)}</Text>
              </Group>
            ))
          : null}
        <Text>
          Sources without public reuse rights are excluded from the public site.
          This app does not grant a new licence over source data.
        </Text>
        <OpaxWebLink
          label="Methods and source terms"
          path="/methods"
          testID="about-methods"
        />
        <Text>OPAX code: AGPL-3.0.</Text>
        <SourceLink
          citation="OPAX source code and licence"
          url="https://github.com/jaketracey/opax"
          kind="record"
          testID="about-code"
        />
      </Section>
      <Section title="Machine-written text">
        <Text>
          Stored machine briefs are labelled “Machine brief”. Bill summaries
          carry their attribution: “Written by a model from the explanatory
          memorandum; not the record”. Check the linked original record.
          Patterns are leads, not findings.
        </Text>
      </Section>
      <Section title="Corrections and contact" testID="about-contact">
        <Text>
          A corrections and contact address will be added here when it is
          confirmed.
        </Text>
      </Section>
      <Section title="Privacy">
        <Text>
          Public reading needs no account and sends no account or device
          identifier. Requests reach OPAX’s servers with this iPhone’s IP
          address, which rate limiters read. IP log retention is not yet
          confirmed. Submitted searches are sent only to OPAX’s servers. Search
          queries and their results stay in memory during this app session and
          are not saved on this phone. Other public catalogs are saved on this
          phone for offline reading. Voice uses an email address, member ID,
          audio and words.
        </Text>
        <OpaxWebLink
          label="Privacy policy"
          path="/community?view=privacy"
          testID="about-privacy"
        />
      </Section>
      <Section title="Acknowledgements and font licences" testID="about-fonts">
        {fonts.map((item) => (
          <Group key={item.name}>
            <Button
              label={`${font === item.name ? 'Hide' : 'Read'} ${item.name === 'PublicSans' ? 'Public Sans' : item.name} font notice`}
              onPress={() => setFont(font === item.name ? null : item.name)}
              testID={`about-font-${item.name}`}
            />
            {font === item.name ? (
              <Group>
                {item.notice
                  .split(/\n\s*\n/u)
                  .filter((paragraph) => paragraph.trim())
                  .map((paragraph, index) => (
                    <Text
                      key={index}
                      testID={
                        index === 0 ? `about-notice-${item.name}` : undefined
                      }
                    >
                      {paragraph}
                    </Text>
                  ))}
              </Group>
            ) : null}
          </Group>
        ))}
        {!fonts.length ? (
          <Text>The build’s font acknowledgements could not be read.</Text>
        ) : null}
      </Section>
    </Screen>
  );
}
