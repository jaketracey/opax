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
  RowList,
  Screen,
  Section,
  Text,
  errorMessage,
} from '../../design/primitives';
import {
  formatCount,
  formatMoney,
  moneyAccessibilityLabel,
} from '../../design/format';
import { openOnWeb } from '../../navigation/external';
import { useMoneyRecord } from './hooks';
import { MoneyRecordStatus, MoneySourceLine, moneyNotes } from './MoneyRecord';
import {
  filtersFromParams,
  moneyFocusRoute,
  moneyJurisdiction,
  moneyProfile,
  moneySource,
  moneyYears,
  moneyWindowYears,
  publicMoneyLabel,
  param,
  publicMoneySource,
  type MoneyParams,
} from './records';
import { moneyView, moneyWindowNodes } from './view';
import { rhythm } from '../../design/tokens';

/**
 * "2024 · 3,929 receipts", or "Nothing disclosed in 2024"; years alone where
 * the label already counts (a public-money hub).
 */
function period(years: string, count: number, noun: string | null) {
  return count && noun
    ? `${years} · ${formatCount(count)} ${noun}`
    : `${years.charAt(0).toUpperCase()}${years.slice(1)}`;
}

/**
 * One node of the money map: its name, one meta line, the figure it is
 * about with its years and count, the one caveat that figure needs, and one
 * source line; then where the money went and, for a donor, the public money
 * going the other way.
 */
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
      <Screen column="wide">
        <ErrorState message={errorMessage(error)} onRetry={retry} />
      </Screen>
    );
  if (!record || !view || !filters)
    return (
      <Screen column="wide">
        <LoadingState label="Loading the money record" />
      </Screen>
    );
  if (!node)
    return (
      <Screen column="wide">
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
  const contracts =
    node.flow === 'contracts' ||
    node.kind === 'agency' ||
    node.kind === 'supplier';
  const label =
    node.kind === 'party'
      ? 'Disclosed receipts'
      : node.kind === 'donor'
        ? 'Disclosed donations'
        : node.kind === 'grantor'
          ? publicMoneyLabel(node)
          : contracts
            ? 'Recorded contract commitments'
            : 'Recorded grant awards';
  const noun =
    node.kind === 'party'
      ? 'receipts'
      : node.kind === 'donor'
        ? 'donations'
        : contracts
          ? 'contracts'
          : 'grants';
  const years = moneyWindowYears(node, filters, node.kind === 'grantor');
  const headSource =
    node.kind === 'grantor'
      ? contracts
        ? contractsSource
        : grantsSource
      : moneySource(record.data);
  const showGrants = filters.grants && !!node.grants;
  const showContracts = filters.contracts && !!node.contracts;
  return (
    <Screen column="wide" testID="money-focus-sheet">
      <MoneyRecordStatus record={record} />
      <Section rule={false} title={node.label} headingTestID="money-focus-name">
        <Text wordSafe variant="metadata">
          {node.kind === 'party'
            ? 'Political party'
            : node.kind === 'grantor'
              ? 'Public money'
              : `${node.via === 'public_money' ? 'Public-money record · ' : ''}${node.industry.replace(/_/g, ' ')}`}
        </Text>
        <Group gap={rhythm.tight}>
          <BigFigure
            value={formatMoney(node.total)}
            spoken={moneyAccessibilityLabel(node.total)}
            label={label}
            detail={period(
              years,
              node.count,
              node.kind === 'grantor' ? null : noun,
            )}
            accent="money"
            testID="money-focus-amount"
          />
          <Text wordSafe variant="fine" testID="money-focus-caveat">
            {node.kind === 'grantor'
              ? contracts
                ? 'Commitments, not verified payments.'
                : 'Never summed with donations.'
              : 'Totals are a floor.'}
          </Text>
          <MoneySourceLine
            record={record}
            title="About these figures"
            citation={node.kind === 'grantor' ? headSource.label : undefined}
            returns={node.kind !== 'grantor'}
            originals={[{ label: headSource.label, url: headSource.url }]}
            notes={[
              ...moneyNotes(record.data),
              node.undated?.[1]
                ? 'Undated disclosures stay in every year window.'
                : null,
              node.kind === 'party' && filters.industry
                ? 'The party total covers all industries in these return years. The relationships below follow the industry filter.'
                : null,
              node.kind === 'grantor' &&
              node.flow === 'contracts' &&
              typeof record.data.meta.contracts_coverage === 'string'
                ? `${record.data.meta.contracts_coverage}.`
                : null,
              node.kind === 'grantor'
                ? `Public money is drawn the other way from donations and never summed with them; a donor ${node.flow === 'contracts' ? 'holding a contract' : 'receiving a grant'} is a fact, not a finding.`
                : null,
            ]}
            testID="money-source"
          />
        </Group>
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
        accent="money"
        testID="money-focus-flows"
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
      {node.kind === 'donor' && (showGrants || showContracts) ? (
        <Section
          title="Public money received"
          accent="money"
          testID="money-focus-public"
        >
          <Group gap={rhythm.tight}>
            <KeyValueList
              items={[
                ...(showGrants
                  ? [
                      {
                        label: `Recorded grant awards · ${formatCount(node.grants!.count)} grants · ${moneyWindowYears(node.grants!, filters, true)}`,
                        value: formatMoney(node.grants!.total),
                        accessibilityLabel: `Recorded grant awards, ${moneyAccessibilityLabel(node.grants!.total)}, ${formatCount(node.grants!.count)} grants, ${moneyWindowYears(node.grants!, filters, true)}`,
                        testID: 'money-focus-grants',
                      },
                    ]
                  : []),
                ...(showContracts
                  ? [
                      {
                        label: `Recorded contract commitments · ${formatCount(node.contracts!.count)} contracts · ${moneyWindowYears(node.contracts!, filters, true)}`,
                        value: formatMoney(node.contracts!.total),
                        accessibilityLabel: `Recorded contract commitments, ${moneyAccessibilityLabel(node.contracts!.total)}, ${formatCount(node.contracts!.count)} contracts, ${moneyWindowYears(node.contracts!, filters, true)}`,
                        testID: 'money-focus-contracts',
                      },
                    ]
                  : []),
              ]}
            />
            <Text wordSafe variant="fine">
              Never summed with donations
              {showContracts ? '; contracts are commitments, not payments' : ''}
              .
            </Text>
            <MoneySourceLine
              record={record}
              title="About public money"
              returns={false}
              citation={
                showGrants && showContracts
                  ? undefined
                  : (showGrants ? grantsSource : contractsSource).label
              }
              originals={[
                ...(showGrants
                  ? [{ label: grantsSource.label, url: grantsSource.url }]
                  : []),
                ...(showContracts
                  ? [
                      {
                        label: contractsSource.label,
                        url: contractsSource.url,
                      },
                    ]
                  : []),
              ]}
              notes={[
                'Public money going the other way: shown beside the donations, never summed with them.',
                showGrants ? grantsSource.citation : null,
                showContracts ? contractsSource.citation : null,
                showContracts
                  ? 'Recorded contract commitments, not verified payments.'
                  : null,
              ]}
              testID="money-public-source"
            />
          </Group>
        </Section>
      ) : null}
      {node.kind === 'grantor' ? null : (
        <RowList>
          {profile.native ? (
            <LinkRow
              title={node.kind === 'party' ? 'Party page' : 'Person profile'}
              onPress={() => router.push(profile.native!)}
              testID="money-native-profile"
            />
          ) : (
            <LinkRow
              title="Open on opax.com.au"
              external
              accessibilityHint="Opens on opax.com.au"
              onPress={() => void openOnWeb(profile.path, node.label)}
              testID="money-web-profile"
            />
          )}
        </RowList>
      )}
    </Screen>
  );
}
