import { useEffect, useMemo, useRef, useState } from 'react';
import { findNodeHandle, RefreshControl, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { catalogs, portraits } from '../../api/runtime';
import type { PortraitListing } from '../../api/people-portraits';
import { leadRegisters } from '../leads/About';
import { ExplorePhotoCredits } from '../explore/PhotoCredits';
import { portraitCreditLine } from '../CachedPortrait';
import { formatCount } from '../../design/format';
import {
  Button,
  Disclosure,
  Field,
  Group,
  LinkRow,
  RowList,
  Screen,
  Section,
  SourceLine,
  Text,
} from '../../design/primitives';
import { showMenu } from '../../design/menu';
import { rhythm } from '../../design/tokens';
import { openSource } from '../../navigation/external';
import { openRecord } from '../reports/open';
import {
  code,
  collectedSourceTerms,
  datasets,
  portraitTerms,
  statement,
  type Dataset,
  type DatasetLink,
} from './datasets';

interface Loaded {
  expenses?: { source: string; url: string; licence: string };
  categories?: {
    source: string;
    url: string;
    licence: string;
    note: string;
    licenceURL: string;
    definitions: DatasetLink[];
    definitionSources: string[];
  };
  pay?: { label: string; url: string }[];
  release?: { label: string; url: string; licence?: string }[];
  registers?: [string, string][];
  collected?: { name: string; docs: number; coverage: string }[];
}

// Each read is independent: one missing export leaves the rest readable.
async function settle<T>(read: () => Promise<T>): Promise<T | undefined> {
  try {
    return await read();
  } catch {
    return undefined;
  }
}

/**
 * Sources and licences (from About and the Account sheet): every dataset
 * with its publisher, licence, attribution and originals; every portrait's
 * credit, searchable; the fonts. Record screens print none of this inline
 * (Jake, 7 Oct): their source lines lead here.
 *
 * One pattern for every licence: a dataset's row names it and its
 * publisher; opened, it says the licence, the terms in full, then one source
 * line to the originals (one opens it, several list each in a menu).
 */
export function SourcesScreen() {
  const [loaded, setLoaded] = useState<Loaded>({});
  const [refreshing, setRefreshing] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void Promise.all([
      settle(() => catalogs.expenses()),
      settle(() => catalogs.expenseCategories()),
      settle(() => catalogs.pay()),
      settle(() => catalogs.directory(retry > 0)),
      settle(() => catalogs.discovery(retry > 0)),
      settle(() => catalogs.about(retry > 0)),
    ]).then(([expenses, categories, pay, directory, discovery, about]) => {
      if (!active) return;
      setLoaded({
        expenses: expenses && {
          source: expenses.data.meta.source,
          url: expenses.data.meta.source_url,
          licence: expenses.data.meta.licence,
        },
        categories: categories && {
          source: categories.data.meta.source,
          url: categories.data.meta.source_url,
          licence: categories.data.meta.licence,
          note: categories.data.meta.licence_note,
          licenceURL: categories.data.meta.licence_url.replace(
            /^http:\/\/creativecommons\.org\//,
            'https://creativecommons.org/',
          ),
          definitionSources: [
            ...new Set(categories.data.categories.map((c) => c.source)),
          ],
          definitions: categories.data.categories.flatMap((c) =>
            c.url ? [{ label: c.source, url: c.url }] : [],
          ),
        },
        pay: pay?.data.meta.sources.map((s) => ({
          label: `${s.publisher}: ${s.title}`,
          url: s.url,
        })),
        release: directory?.manifest.data.sources.map((s) => ({
          label: s.label,
          url: s.url,
          licence: s.licence,
        })),
        registers: discovery ? leadRegisters(discovery.data) : [],
        collected: about?.data.data?.sources,
      });
      setRefreshing(false);
    });
    return () => {
      active = false;
    };
  }, [retry]);
  const all = useMemo(() => withLoaded(datasets, loaded), [loaded]);
  return (
    <Screen
      column="wide"
      testID="sources-screen"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            setRetry((v) => v + 1);
          }}
        />
      }
    >
      <Group gap={rhythm.tight}>
        {statement.map((line) => (
          <Text key={line} wordSafe variant="body">
            {line}
          </Text>
        ))}
      </Group>
      <Section title="Datasets" testID="sources-datasets">
        <RowList grid>
          {all.map((dataset) => (
            <DatasetRow key={dataset.id} dataset={dataset} />
          ))}
        </RowList>
      </Section>
      <PortraitCredits />
      <ExplorePhotoCredits />
      {loaded.collected?.length ? (
        <Section title="Collected sources" testID="sources-collected">
          <RowList>
            {loaded.collected.map((item) => (
              <Disclosure
                key={item.name}
                label={item.name}
                value={formatCount(item.docs)}
                accessibilityLabel={`${item.name}, ${formatCount(item.docs)} documents`}
              >
                <Text wordSafe variant="metadata">
                  {formatCount(item.docs)} documents · {item.coverage}
                </Text>
                <Text wordSafe variant="fine" tone="ink">
                  {collectedSourceTerms(item.name)}
                </Text>
              </Disclosure>
            ))}
          </RowList>
        </Section>
      ) : null}
      <Fonts />
      <Section title="OPAX">
        <Text wordSafe>{code.terms}</Text>
        <OriginalsLine
          links={[{ label: 'Source code and licence', url: code.url }]}
          testID="sources-code"
        />
        <RowList>
          <LinkRow
            title="Methods and source terms"
            testID="sources-methods"
            onPress={() => openRecord('/methods', 'Methods')}
          />
        </RowList>
        {/* The end of the screen, for the journeys; nothing is drawn. */}
        <View testID="sources-end" />
      </Section>
    </Screen>
  );
}

/** The datasets with what the loaded exports say about themselves. */
function withLoaded(base: Dataset[], loaded: Loaded): Dataset[] {
  return base
    .map((dataset) => {
      if (dataset.id === 'ipea') {
        const terms = [...dataset.terms];
        const links = [...dataset.links];
        if (loaded.expenses) {
          terms.push(`${loaded.expenses.source}, ${loaded.expenses.licence}.`);
          links.push({ label: 'Quarterly reports', url: loaded.expenses.url });
        }
        if (loaded.categories) {
          terms.push(
            loaded.categories.note,
            ...loaded.categories.definitionSources,
          );
          links.push(...loaded.categories.definitions);
          links.push(
            { label: 'Category notes', url: loaded.categories.url },
            { label: 'Category licence', url: loaded.categories.licenceURL },
          );
        }
        return { ...dataset, terms, links };
      }
      if (dataset.id === 'pay' && loaded.pay?.length)
        return {
          ...dataset,
          links: [...dataset.links, ...loaded.pay],
        };
      return dataset;
    })
    .concat(
      loaded.registers?.length
        ? [
            {
              id: 'lead-registers',
              name: 'Registers behind the leads',
              publisher: loaded.registers.map(([label]) => label).join('; '),
              terms: [
                'Each lead’s example records open the register that holds them. Source data keeps its own licence; check the original record before reuse.',
              ],
              links: loaded.registers.map(([label, url]) => ({ label, url })),
            },
          ]
        : [],
      loaded.release?.length
        ? [
            {
              id: 'release',
              name: 'Members and electorates',
              publisher: 'OPAX electorate release',
              terms: loaded.release.map((s) =>
                s.licence ? `${s.label}: ${s.licence}.` : `${s.label}.`,
              ),
              links: loaded.release
                .filter((s) => s.url.startsWith('https://'))
                .map((s) => ({ label: s.label, url: s.url })),
            },
          ]
        : [],
    );
}

function DatasetRow({ dataset }: { dataset: Dataset }) {
  return (
    <Disclosure
      label={dataset.name}
      detail={dataset.publisher}
      testID={`sources-dataset-${dataset.id}`}
    >
      {/* Only a verified licence is named; the terms say the rest. */}
      {dataset.licence ? (
        <Text
          wordSafe
          variant="strong"
          testID={`sources-dataset-${dataset.id}-licence`}
        >
          {`Licence: ${dataset.licence}`}
        </Text>
      ) : null}
      {dataset.terms.map((term, index) => (
        <Text key={index} wordSafe variant="body">
          {term}
        </Text>
      ))}
      <OriginalsLine
        links={dataset.links}
        testID={`sources-dataset-${dataset.id}-originals`}
      />
    </Disclosure>
  );
}

/**
 * The originals behind a licence, as one source line: the one original by
 * name ("Copyright and disclaimer"), or "GrantConnect and 1 more", which
 * lists each in a menu. Each opens in the in-app browser.
 */
function OriginalsLine({
  links,
  label,
  testID,
}: {
  links: readonly DatasetLink[];
  /** Names a pair of originals ("Photo source and licence"). */
  label?: string;
  testID?: string;
}) {
  const anchor = useRef<View>(null);
  const unique = links.filter(
    (link, index) =>
      link.url.startsWith('https://') &&
      links.findIndex((other) => other.url === link.url) === index,
  );
  const [first] = unique;
  if (!first) return null;
  const open = (link: DatasetLink) => void openSource(link.url, link.label);
  const several = unique.length > 1;
  return (
    <View ref={anchor} collapsable={false} style={styles.line}>
      <SourceLine
        label={
          label ??
          (several
            ? `${first.label} and ${unique.length - 1} more`
            : first.label)
        }
        accessibilityLabel={
          several
            ? `Original records: ${unique.map((link) => link.label).join(', ')}`
            : `View original: ${first.label}`
        }
        onPress={() =>
          several
            ? showMenu(
                'Original records',
                unique.map((link) => ({
                  title: link.label,
                  onPress: () => open(link),
                })),
                findNodeHandle(anchor.current) ?? undefined,
              )
            : open(first)
        }
        testID={testID}
      />
    </View>
  );
}

const PAGE = 40;
function PortraitCredits() {
  const [list, setList] = useState<PortraitListing[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  useEffect(() => {
    let active = true;
    if (!portraits) return;
    portraits
      .list()
      .then((rows) => {
        if (active) setList(rows);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const needle = query.trim().toLocaleLowerCase('en-AU');
  const matches = (list ?? []).filter(
    (row) =>
      !needle ||
      row.name.toLocaleLowerCase('en-AU').includes(needle) ||
      row.info.credit.toLocaleLowerCase('en-AU').includes(needle),
  );
  return (
    <Section title="Portraits" testID="sources-portraits">
      <Text wordSafe>{portraitTerms.official.terms}</Text>
      <OriginalsLine
        links={portraitTerms.official.links}
        label="Licence and copyright"
        testID="sources-portraits-originals"
      />
      <Text wordSafe>{portraitTerms.commons}</Text>
      {failed ? (
        <Text wordSafe variant="metadata">
          Portrait credits could not be loaded. Pull to refresh.
        </Text>
      ) : !list ? (
        <Text wordSafe variant="metadata">
          Loading portrait credits
        </Text>
      ) : (
        <Group gap={rhythm.tight}>
          <Field
            label="Find a portrait credit"
            placeholder="Name or photographer"
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setShown(PAGE);
            }}
            autoCorrect={false}
            clearButtonMode="while-editing"
            returnKeyType="search"
            testID="sources-portrait-search"
          />
          <Text wordSafe variant="metadata" testID="sources-portrait-count">
            {needle
              ? `${formatCount(matches.length)} of ${formatCount(list.length)} portraits`
              : `${formatCount(list.length)} portraits`}
          </Text>
          <RowList>
            {matches.slice(0, shown).map((row) => (
              <PortraitCredit key={row.info.key} row={row} />
            ))}
          </RowList>
          {matches.length > shown ? (
            <Button
              variant="quiet"
              label={`Show more (${formatCount(matches.length - shown)} more)`}
              onPress={() => setShown((n) => n + PAGE)}
              testID="sources-portrait-more"
            />
          ) : null}
        </Group>
      )}
    </Section>
  );
}

function PortraitCredit({ row }: { row: PortraitListing }) {
  const official = /^\d+$/.test(row.info.key);
  return (
    <View style={styles.credit} testID={`sources-portrait-${row.slug}`}>
      <Text wordSafe variant="strong">
        {row.name}
      </Text>
      <Text wordSafe variant="metadata">
        {portraitCreditLine(row.info)}
      </Text>
      {row.info.attribution ? (
        <Text wordSafe variant="fine">
          {row.info.attribution}
        </Text>
      ) : null}
      {official ? null : (
        <OriginalsLine
          links={[
            { label: 'Photo source', url: row.info.sourceURL },
            { label: 'Licence', url: row.info.licenceURL },
          ]}
          label="Photo source and licence"
        />
      )}
    </View>
  );
}

function Fonts() {
  const raw: unknown = Constants.expoConfig?.extra?.fontAcknowledgements;
  const fonts = Array.isArray(raw)
    ? raw.filter(
        (f): f is { name: string; notice: string } =>
          typeof f?.name === 'string' && typeof f?.notice === 'string',
      )
    : [];
  return (
    <Section title="Fonts" testID="sources-fonts">
      {fonts.length ? (
        <RowList>
          {fonts.map((item) => (
            <Disclosure
              key={item.name}
              label={item.name === 'PublicSans' ? 'Public Sans' : item.name}
              testID={`sources-font-${item.name}`}
            >
              {item.notice
                .split(/\n\s*\n/u)
                .filter((paragraph) => paragraph.trim())
                .map((paragraph, index) => (
                  <Text
                    wordSafe
                    key={index}
                    variant="fine"
                    tone="ink"
                    testID={
                      index === 0 ? `sources-notice-${item.name}` : undefined
                    }
                  >
                    {paragraph}
                  </Text>
                ))}
            </Disclosure>
          ))}
        </RowList>
      ) : (
        <Text wordSafe>
          The build’s font acknowledgements could not be read.
        </Text>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  // The line hugs its words; at accessibility sizes it takes the column.
  line: { alignSelf: 'stretch' },
  credit: { gap: rhythm.line },
});
