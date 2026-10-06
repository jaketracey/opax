import { useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Button,
  EmptyState,
  ErrorState,
  Group,
  Heading,
  KeyValueList,
  LoadingState,
  MoneyFigure,
  OpaxWebLink,
  RowList,
  Screen,
  Section,
  SourceLink,
  Text,
  errorMessage,
} from '../../design/primitives';
import { formatCount, formatMoney } from '../../design/format';
import { RecordRow } from '../RecordRow';
import { useMoneyRecord } from './hooks';
import { MoneyAttribution, MoneyRecordStatus } from './MoneyRecord';
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
      <MoneyRecordStatus record={record} />
      <Heading testID="money-focus-name">{node.label}</Heading>
      <Text wordSafe>
        {node.kind === 'party'
          ? 'Political party'
          : node.kind === 'grantor'
            ? 'Public money'
            : node.industry.replace(/_/g, ' ')}
      </Text>
      <MoneyFigure
        amount={node.total}
        label={label}
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
      {node.undated?.[1] ? (
        <Text wordSafe variant="fine">
          Undated disclosures stay in every year window.
        </Text>
      ) : null}
      {node.kind === 'party' && filters.industry ? (
        <Text wordSafe variant="fine">
          The party total covers all industries in these return years. The
          relationships below follow the industry filter.
        </Text>
      ) : null}
      {filters.inflation ? (
        <Text wordSafe variant="fine">
          Adjusted to 2025–26 dollars with the ABS Consumer Price Index (all
          groups, Australia, financial-year average). Nominal figures are on the
          returns.
        </Text>
      ) : null}
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
      >
        <RowList>
          {flows.map((edge) => {
            const other = view.nodes.find(
              (n) =>
                n.id === (edge.source === node.id ? edge.target : edge.source),
            );
            return other ? (
              <RecordRow
                key={`${edge.source}:${edge.target}:${edge.flow ?? 'donations'}`}
                title={other.label}
                detail={`${formatMoney(edge.total)} · ${moneyYears(edge.firstYear, edge.lastYear)}`}
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
        <Section title="Public money received">
          {filters.grants && node.grants ? (
            <Group>
              <MoneyFigure
                amount={node.grants.total}
                label={`Recorded grant awards · ${formatCount(node.grants.count)} grants`}
              />
              <Text wordSafe>
                {moneyWindowYears(node.grants, filters, true)}
              </Text>
              {record.data.meta.grants_source ? (
                <Text wordSafe variant="fine">
                  {record.data.meta.grants_source}
                </Text>
              ) : null}
              <SourceLink
                citation={grantsSource.label}
                url={grantsSource.url}
                kind="register"
              />
            </Group>
          ) : null}
          {filters.contracts && node.contracts ? (
            <Group>
              <MoneyFigure
                amount={node.contracts.total}
                label={`Recorded contract commitments · ${formatCount(node.contracts.count)} contracts`}
              />
              <Text wordSafe>
                {moneyWindowYears(node.contracts, filters, true)}
              </Text>
              <Text wordSafe variant="fine">
                Recorded contract commitments, not verified payments.
              </Text>
              {record.data.meta.contracts_source ? (
                <Text wordSafe variant="fine">
                  {record.data.meta.contracts_source}
                </Text>
              ) : null}
              <SourceLink
                citation={contractsSource.label}
                url={contractsSource.url}
                kind="register"
              />
            </Group>
          ) : null}
          <Text wordSafe variant="fine">
            Public money going the other way: shown beside the donations, never
            summed with them.
          </Text>
        </Section>
      ) : null}
      {node.via === 'public_money' ? (
        <Text wordSafe variant="fine">
          On the map for the public money it holds, not for the size of its
          donations.
        </Text>
      ) : null}
      {node.kind === 'grantor' ? (
        <Group>
          <Text wordSafe variant="fine">
            {node.flow === 'contracts'
              ? contractsSource.citation
              : grantsSource.citation}
          </Text>
          {node.flow === 'contracts' &&
          typeof record.data.meta.contracts_coverage === 'string' ? (
            <Text wordSafe variant="fine">
              {record.data.meta.contracts_coverage}.
            </Text>
          ) : null}
          <SourceLink
            citation={
              node.flow === 'contracts'
                ? contractsSource.label
                : grantsSource.label
            }
            url={
              node.flow === 'contracts' ? contractsSource.url : grantsSource.url
            }
            kind="register"
          />
          <Text wordSafe variant="fine">
            Public money is drawn the other way from donations and never summed
            with them; a donor{' '}
            {node.flow === 'contracts'
              ? 'holding a contract'
              : 'receiving a grant'}{' '}
            is a fact, not a finding.
          </Text>
        </Group>
      ) : null}
      <MoneyAttribution record={record} />
      {profile.native ? (
        <Button
          label="View person profile"
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
    </Screen>
  );
}
