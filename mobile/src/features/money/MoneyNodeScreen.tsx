import { useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BigFigure,
  EmptyState,
  ErrorState,
  Group,
  KeyValueList,
  LoadingState,
  LinkRow,
  OpaxWebLink,
  RowList,
  Screen,
  Section,
  ViewOriginal,
  Text,
  errorMessage,
} from '../../design/primitives';
import {
  formatCount,
  formatMoney,
  moneyAccessibilityLabel,
} from '../../design/format';
import { useMoneyRecord } from './hooks';
import { MoneyAttribution, MoneyRecordStatus, moneyNotes } from './MoneyRecord';
import {
  filtersFromParams,
  moneyFocusRoute,
  moneyJurisdiction,
  moneyProfile,
  moneyYears,
  moneyWindowYears,
  publicMoneyLabel,
  param,
  publicMoneySource,
  type MoneyParams,
} from './records';
import { moneyView, moneyWindowNodes } from './view';
import { moneySource } from './records';
import { rhythm } from '../../design/tokens';

export default function MoneyNodeScreen() {
  const params = useLocalSearchParams<MoneyParams>();
  const jurisdiction = moneyJurisdiction(params.jurisdiction);
  const { record, error, retry } = useMoneyRecord(jurisdiction);
  const router = useRouter();
  const filters = useMemo(
    () => (record ? filtersFromParams(record.data, params) : null),
    [record, params],
  );
  const view = useMemo(
    () =>
      record && filters
        ? {
            ...moneyView(record.data, filters),
            nodes: moneyWindowNodes(record.data, filters),
          }
        : null,
    [record, filters],
  );
  const node = view?.nodes.find((n) => n.id === param(params.node));
  if (error)
    return (
      <Screen>
        <ErrorState message={errorMessage(error)} onRetry={retry} />
      </Screen>
    );
  if (!record || !view || !filters)
    return (
      <Screen>
        <LoadingState label="Loading the money record" />
      </Screen>
    );
  if (!node)
    return (
      <Screen>
        <EmptyState message="This node has no recorded flow in the selected view." />
      </Screen>
    );
  const profile = moneyProfile(node);
  const flows = view.edges
    .filter((e) =>
      node.kind === 'donor' || node.kind === 'grantor'
        ? e.source === node.id
        : node.kind === 'party'
          ? e.target === node.id
          : e.source === node.id || e.target === node.id,
    )
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);
  const grantsSource = publicMoneySource(record.data, 'grants');
  const contractsSource = publicMoneySource(record.data, 'contracts');
  const label =
    node.kind === 'party'
      ? 'Disclosed receipts'
      : node.kind === 'donor'
        ? 'Disclosed donations'
        : node.kind === 'grantor'
          ? publicMoneyLabel(node)
          : node.flow === 'contracts' ||
              node.kind === 'agency' ||
              node.kind === 'supplier'
            ? 'Recorded contract commitments'
            : 'Recorded grant awards';
  return (
    <Screen testID="money-focus-sheet">
      <Section
        rule={false}
        title={node.label}
        headingTestID="money-focus-name"
        icon={node.kind === 'party' ? 'building.columns' : 'banknote'}
        accent="money"
        info={{
          title: 'About these figures',
          notes: [
            ...moneyNotes(record.data),
            node.undated?.[1]
              ? 'Undated disclosures stay in every year window.'
              : null,
            node.kind === 'party' && filters.industry
              ? 'The party total covers all industries in these return years. The relationships below follow the industry filter.'
              : null,
            filters.inflation
              ? 'Adjusted to 2025–26 dollars with the ABS Consumer Price Index (all groups, Australia, financial-year average). Nominal figures are on the returns.'
              : null,
            node.kind === 'grantor' &&
            node.flow === 'contracts' &&
            typeof record.data.meta.contracts_coverage === 'string'
              ? `${record.data.meta.contracts_coverage}.`
              : null,
            node.kind === 'grantor'
              ? `Public money is drawn the other way from donations and never summed with them; a donor ${node.flow === 'contracts' ? 'holding a contract' : 'receiving a grant'} is a fact, not a finding.`
              : null,
          ],
          testID: 'money-focus-info',
        }}
      >
        <MoneyRecordStatus record={record} />
        <Text wordSafe variant="metadata">
          {node.kind === 'party'
            ? 'Political party'
            : node.kind === 'grantor'
              ? 'Public money'
              : `${node.via === 'public_money' ? 'Public-money record · ' : ''}${node.industry.replace(/_/g, ' ')}`}
        </Text>
        <BigFigure
          value={formatMoney(node.total)}
          spoken={moneyAccessibilityLabel(node.total)}
          label={label}
          accent="money"
          testID="money-focus-amount"
        />
        <KeyValueList
          items={[
            {
              label: 'Return years',
              value: moneyWindowYears(node, filters, node.kind === 'grantor'),
              testID: 'money-focus-years',
            },
            {
              label:
                node.kind === 'party'
                  ? 'Receipts'
                  : node.kind === 'donor'
                    ? 'Donations'
                    : node.flow === 'contracts' ||
                        node.kind === 'agency' ||
                        node.kind === 'supplier'
                      ? 'Contracts'
                      : 'Grants',
              value: formatCount(node.count),
            },
          ]}
        />
        <Text wordSafe variant="fine">
          {node.kind === 'grantor'
            ? node.flow === 'contracts'
              ? 'Commitments, not verified payments.'
              : 'Never summed with donations.'
            : 'Totals are a floor.'}
        </Text>
        <MoneyAttribution record={record} />
        <ViewOriginal
          sources={[
            node.kind === 'grantor'
              ? node.flow === 'contracts'
                ? contractsSource
                : grantsSource
              : moneySource(record.data),
          ]}
          testID="money-source"
        />
      </Section>
      <Section
        title={
          node.kind === 'party'
            ? 'Top donors shown on the map'
            : node.kind === 'donor'
              ? 'Where it went'
              : node.flow === 'contracts'
                ? 'Largest contractors among the donors on this map'
                : 'Largest recipients among the donors on this map'
        }
        icon="arrow.triangle.branch"
        accent="money"
      >
        <RowList>
          {flows.map((edge) => {
            const other = view.nodes.find(
              (n) =>
                n.id === (edge.source === node.id ? edge.target : edge.source),
            );
            return other ? (
              <LinkRow
                key={`${edge.source}:${edge.target}:${edge.flow ?? 'donations'}`}
                title={other.label}
                value={formatMoney(edge.total)}
                detail={moneyYears(edge.firstYear, edge.lastYear)}
                onPress={() =>
                  router.replace(
                    moneyFocusRoute(other.id, jurisdiction, filters),
                  )
                }
              />
            ) : null;
          })}
        </RowList>
      </Section>
      {node.kind === 'donor' &&
      ((filters.grants && node.grants) ||
        (filters.contracts && node.contracts)) ? (
        <Section
          title="Public money received"
          icon="banknote"
          accent="money"
          info={{
            title: 'About public money',
            notes: [
              'Public money going the other way: shown beside the donations, never summed with them.',
              'Recorded contract commitments, not verified payments.',
            ],
            testID: 'money-public-info',
          }}
        >
          {filters.grants && node.grants ? (
            <Group gap={rhythm.tight}>
              <BigFigure
                value={formatMoney(node.grants.total)}
                spoken={moneyAccessibilityLabel(node.grants.total)}
                label={`Recorded grant awards · ${formatCount(node.grants.count)} grants`}
                detail={moneyWindowYears(node.grants, filters, true)}
                accent="money"
              />
              <ViewOriginal sources={[grantsSource]} />
            </Group>
          ) : null}
          {filters.contracts && node.contracts ? (
            <Group gap={rhythm.tight}>
              <BigFigure
                value={formatMoney(node.contracts.total)}
                spoken={moneyAccessibilityLabel(node.contracts.total)}
                label={`Recorded contract commitments · ${formatCount(node.contracts.count)} contracts`}
                detail={moneyWindowYears(node.contracts, filters, true)}
                accent="money"
              />
              <Text wordSafe variant="fine">
                Commitments, not verified payments.
              </Text>
              <ViewOriginal sources={[contractsSource]} />
            </Group>
          ) : null}
        </Section>
      ) : null}
      <RowList>
        {profile.native ? (
          <LinkRow
            title="View person profile"
            icon="person.crop.circle"
            onPress={() => router.push(profile.native!)}
            testID="money-native-profile"
          />
        ) : (
          <OpaxWebLink
            label="View profile"
            path={profile.path}
            testID="money-web-profile"
          />
        )}
      </RowList>
    </Screen>
  );
}
