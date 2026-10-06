import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  Button,
  Divider,
  EmptyState,
  ErrorState,
  Group,
  Heading,
  LoadingState,
  SegmentedControl,
  SourceLink,
  Text,
  errorMessage,
} from '../../design/primitives';
import { formatCount, formatMoney } from '../../design/format';
import { samePartyLabel } from '../../design/party';
import { colors, layout, spacing } from '../../design/tokens';
import { RecordRow } from '../RecordRow';
import type { MoneyJurisdiction, MoneyNode } from './data';
import { useMoneyRecord, useMoneyScreenReader } from './hooks';
import { MoneyControls } from './MoneyControls';
import { MoneyAttribution, MoneyRecordStatus } from './MoneyRecord';
import { NativeMoneyMap, type NativeMoneyMapHandle } from './NativeMoneyMap';
import { MoneyTestHooks } from './money-probe';
import {
  filtersFromParams,
  moneyFocusRoute,
  moneyJurisdiction,
  moneySource,
  moneyYears,
  moneyWindowYears,
  publicMoneyLabel,
  param,
  type MoneyParams,
} from './records';
import {
  moneyView,
  moneyWindowNodes,
  donationRanks,
  rankedDonors,
  type MoneyFilters,
} from './view';

export default function MoneyScreen() {
  const params = useLocalSearchParams<MoneyParams>();
  const [jurisdiction, setJurisdiction] = useState<MoneyJurisdiction>(() =>
    moneyJurisdiction(params.jurisdiction),
  );
  const reader = useMoneyScreenReader();
  const [choice, setChoice] = useState<{
    reader: boolean | null;
    mode: 'list' | '3d';
  } | null>(null);
  const mode =
    choice && choice.reader === reader
      ? choice.mode
      : reader === false
        ? '3d'
        : 'list';
  const consumedFocusRef = useRef(false);
  return (
    <MoneyCatalogScreen
      key={jurisdiction}
      jurisdiction={jurisdiction}
      onJurisdiction={setJurisdiction}
      params={params}
      mode={mode}
      onMode={(value) => setChoice({ reader, mode: value })}
      consumedFocusRef={consumedFocusRef}
    />
  );
}
function MoneyCatalogScreen({
  jurisdiction,
  onJurisdiction,
  params,
  mode,
  onMode,
  consumedFocusRef,
}: {
  jurisdiction: MoneyJurisdiction;
  onJurisdiction: (value: MoneyJurisdiction) => void;
  params: MoneyParams;
  mode: 'list' | '3d';
  onMode: (value: 'list' | '3d') => void;
  consumedFocusRef: RefObject<boolean>;
}) {
  const { record, error, retry } = useMoneyRecord(jurisdiction);
  const [changedFilters, setFilters] = useState<MoneyFilters | null>(null);
  const filters = useMemo(
    () =>
      changedFilters ??
      (record ? filtersFromParams(record.data, params) : null),
    [changedFilters, record, params],
  );
  const [controlsOpen, setControlsOpen] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const map = useRef<NativeMoneyMapHandle | null>(null);
  const [plateVisible, setPlateVisible] = useState(true);
  const plate = useRef({ top: 0, bottom: 700 }),
    scroll = useRef(0);
  const { height } = useWindowDimensions();
  const router = useRouter();
  const view = useMemo(
    () => (record && filters ? moneyView(record.data, filters) : null),
    [record, filters],
  );
  const donors = useMemo(() => (view ? rankedDonors(view) : []), [view]);
  const ranks = useMemo(() => donationRanks(donors), [donors]);
  const otherRecords = useMemo(
    () =>
      record && filters
        ? moneyWindowNodes(record.data, filters).filter(
            (n) => n.kind === 'party' || n.kind === 'grantor',
          )
        : [],
    [record, filters],
  );
  const [glFallback, setGLFallback] = useState(false);
  const select = useCallback(
    (id: string) => {
      if (filters) router.push(moneyFocusRoute(id, jurisdiction, filters));
    },
    [router, filters, jurisdiction],
  );
  useEffect(() => {
    const rawFocus = param(params.focus);
    const requested = rawFocus?.startsWith('party:')
      ? record?.data.nodes.find(
          (n) =>
            n.kind === 'party' && samePartyLabel(n.label, rawFocus.slice(6)),
        )?.id
      : rawFocus;
    if (
      requested &&
      !consumedFocusRef.current &&
      view?.nodes.some((n) => n.id === requested)
    ) {
      consumedFocusRef.current = true;
      select(requested);
    }
  }, [params.focus, record, view, select, consumedFocusRef]);
  const source = record ? moneySource(record.data) : null;
  const parties = useMemo(() => {
    const result = new Map<string, string[]>();
    if (record && filters) {
      const receipts = moneyView(record.data, {
        ...filters,
        donations: true,
        grants: false,
        contracts: false,
      });
      const nodes = new Map(receipts.nodes.map((n) => [n.id, n]));
      for (const edge of receipts.edges) {
        const party = nodes.get(edge.target);
        if (party?.kind === 'party') {
          const names = result.get(edge.source) ?? [];
          if (!names.includes(party.label)) names.push(party.label);
          result.set(edge.source, names);
        }
      }
    }
    return result;
  }, [record, filters]);
  const renderDonor = ({ item, index }: { item: MoneyNode; index: number }) => (
    <Group gap={spacing.s3} style={styles.donor}>
      <RecordRow
        title={
          ranks.has(item.id)
            ? `${formatCount(ranks.get(item.id)!)}. ${item.label}`
            : item.label
        }
        testID={`money-donor-${index}`}
        detail={`${formatMoney(item.total)} disclosed donations · ${moneyWindowYears(item, filters!)}`}
        onPress={() => select(item.id)}
      />
      {item.via === 'public_money' ? (
        <Text wordSafe variant="fine">
          On the map for the public money it holds, not for the size of its
          donations.
        </Text>
      ) : null}
      <Text wordSafe variant="metadata" testID={`money-donor-parties-${index}`}>
        {parties.get(item.id)?.join(', ') ??
          'No disclosed party flow in these years'}
      </Text>
      {source ? (
        <SourceLink
          citation={source.label}
          url={source.url}
          kind="register"
          testID={`money-donor-source-${index}`}
        />
      ) : null}
    </Group>
  );
  return (
    <GestureHandlerRootView style={styles.screen}>
      <FlatList
        testID="money-screen"
        data={mode === 'list' ? donors : []}
        keyExtractor={(item) => item.id}
        renderItem={renderDonor}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
        removeClippedSubviews={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        onScroll={(event) => {
          scroll.current = event.nativeEvent.contentOffset.y;
          const shown =
            scroll.current < plate.current.bottom &&
            scroll.current + height > plate.current.top;
          setPlateVisible((previous) =>
            previous === shown ? previous : shown,
          );
        }}
        scrollEventThrottle={100}
        ItemSeparatorComponent={Divider}
        ListHeaderComponent={
          <Group style={styles.header}>
            <Text wordSafe>Political donations &amp; public money map</Text>
            <SegmentedControl
              value={mode}
              segments={[
                { value: '3d', label: '3D map', testID: 'money-mode-3d' },
                {
                  value: 'list',
                  label: 'List view',
                  testID: 'money-mode-list',
                },
              ]}
              onChange={(next) => {
                if (next === '3d') setGLFallback(false);
                onMode(next);
              }}
              testID="money-view-toggle"
            />
            {glFallback ? (
              <Text wordSafe testID="money-gl-fallback">
                The 3D view is unavailable. You can explore the same records in
                the list.
              </Text>
            ) : null}
            {error ? (
              <ErrorState
                message={errorMessage(error)}
                onRetry={retry}
                testID="money-error"
              />
            ) : !record || !view || !filters ? (
              <LoadingState label="Loading the money map" />
            ) : (
              <>
                <MoneyRecordStatus record={record} />
                <Text wordSafe variant="metadata" testID="money-view-summary">
                  {formatCount(view.nodes.length)} nodes ·{' '}
                  {formatCount(view.edges.length)} recorded flows ·{' '}
                  {moneyYears(filters.from, filters.to)}
                  {filters.industry ? ` · ${filters.industry}` : ''}
                </Text>
                {mode === '3d' ? (
                  <View
                    onLayout={(event) => {
                      plate.current = {
                        top: event.nativeEvent.layout.y,
                        bottom:
                          event.nativeEvent.layout.y +
                          event.nativeEvent.layout.height,
                      };
                      setPlateVisible(
                        scroll.current < plate.current.bottom &&
                          scroll.current + height > plate.current.top,
                      );
                    }}
                  >
                    {view.nodes.length ? (
                      <NativeMoneyMap
                        ref={map}
                        graph={record.data}
                        view={view}
                        active={plateVisible}
                        onSelect={select}
                        onUnavailable={() => {
                          setGLFallback(true);
                          onMode('list');
                        }}
                      />
                    ) : (
                      <EmptyState
                        message="No recorded flows match these filters."
                        testID="money-empty"
                      />
                    )}
                  </View>
                ) : null}
                <Button
                  label="Filters and years"
                  expanded={controlsOpen}
                  onPress={() => setControlsOpen((value) => !value)}
                  testID="money-filters"
                />
                {controlsOpen ? (
                  <MoneyControls
                    graph={record.data}
                    filters={filters}
                    onChange={setFilters}
                    jurisdiction={jurisdiction}
                    onJurisdiction={onJurisdiction}
                  />
                ) : null}
                <MoneyTestHooks
                  graph={view}
                  onYear={(year) =>
                    setFilters({ ...filters, from: year, to: year })
                  }
                  onFocus={(id) => {
                    if (mode === '3d' && map.current) map.current.focus(id);
                    else select(id);
                  }}
                />
                {mode === 'list' ? (
                  <>
                    <Heading level={2}>Parties and public money</Heading>
                    <Button
                      label={`${recordsOpen ? 'Hide' : 'Show'} parties and public money`}
                      expanded={recordsOpen}
                      onPress={() => setRecordsOpen((value) => !value)}
                      testID="money-list-records-toggle"
                    />
                    {recordsOpen
                      ? otherRecords.map((node) => (
                          <RecordRow
                            key={node.id}
                            title={node.label}
                            detail={`${formatMoney(node.total)} · ${node.kind === 'grantor' ? publicMoneyLabel(node) : 'Disclosed receipts'} · ${moneyWindowYears(node, filters, node.kind === 'grantor')}`}
                            testID={`money-list-record-${node.id}`}
                            onPress={() => select(node.id)}
                          />
                        ))
                      : null}
                    <Heading level={2}>Ranked donors</Heading>
                    <Text wordSafe variant="fine">
                      Disclosed donations, largest first. Public grants and
                      contracts are recorded separately in each donor’s record.
                    </Text>
                    {!donors.length ? (
                      <EmptyState
                        message="No donors have a recorded flow in this view."
                        testID="money-list-empty"
                      />
                    ) : null}
                  </>
                ) : null}
              </>
            )}
          </Group>
        }
        ListFooterComponent={
          record ? (
            <Group style={styles.footer}>
              <MoneyAttribution record={record} />
              <Text wordSafe variant="fine" testID="money-end">
                End of money map
              </Text>
            </Group>
          ) : null
        }
      />
    </GestureHandlerRootView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s7,
  },
  header: { marginBottom: spacing.s4 },
  footer: { marginTop: spacing.s6 },
  donor: { paddingVertical: spacing.s3 },
});
