import { throwIfAborted } from '../../api/abort';
import { RouteOptions } from '../../navigation/preview';
import type { Href } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, type ReactNode } from 'react';
import { RefreshControl, View } from 'react-native';
import type { RecordResult } from '../../api/client';
import { ApiError } from '../../api/errors';
import { catalogs } from '../../api/runtime';
import { counted, formatDate, formatMoney } from '../../design/format';
import { Screen, SectionHeader } from '../../design/layout';
import { LinkRow, MoneyRow, ValueRow } from '../../design/rows';
import { SkeletonCrossfade } from '../../design/states';
import { SourceLine } from '../../design/source';
import { symbols } from '../../design/symbols';
import { Heading, Text } from '../../design/text';
import { rhythm } from '../../design/tokens';
import {
  agencyRoute,
  grantProgramRoute,
} from '../../navigation/routes/public-money';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { evidenceRecord } from '../leads/evidence';
import { discoveryAsOf, discoverPath, leadFor } from '../leads/model';
import { combine } from './catalog';
import { largestFor, programRecipients, type Jurisdiction } from './data';
import { stateName } from './Grants';
import { CONTRACTS_CAVEAT, GRANTS_CAVEAT } from './HubCards';
import {
  MoneyStatus,
  fy,
  moneyBar,
  moneyCitation,
  readableDates,
  recordSource,
} from './parts';
import { privateNote, unnamedRecipient, unnamedSupplier } from './privacy';
import { loadRecipientGrant } from './recipient-grant';
import {
  moneyItemHref,
  organisationHref,
  type MoneyItemKind,
  type MoneyItemParams,
} from './routes';
import { money } from './runtime';

/** One fact row: a label and the record's words. Empty values are left out. */
type Fact = { label: string; value: string; long?: boolean; href?: Href };
/** A row onward, named by its destination ("Open {organisation}"). */
type Onward = {
  key: string;
  title: string;
  detail?: string;
  href: Href;
  symbol?: (typeof symbols)[keyof typeof symbols];
};
type Original = { label: string; url: string };
type Child = {
  key: string;
  name: string;
  detail: string;
  amount: number;
  href: Href;
};

/** The page's record, rebuilt from the static exports by its params. */
export interface MoneyItemView {
  /** "Grant agreement · from 7 Aug 2026". */
  meta: string;
  name: string;
  /** The record names an individual: "Individual recipient" in the page role. */
  individual: boolean;
  amount: number;
  asOf: string;
  register: string;
  facts: Fact[];
  /** A recipient's or supplier's records: one row each, in place of Facts. */
  children: Child[];
  originals: Original[];
  onward: Onward[];
  notes: string[];
  /** The OPAX web page for Share, Copy link and Open on opax.com.au. */
  path: string | null;
}

const gone = () =>
  new ApiError('not-found', 'This record isn’t available any more.');
const short = (d: string) => (d ? formatDate(d, 'short') : '');
const facts = (rows: (Fact | false | null | undefined)[]) =>
  rows.filter((r): r is Fact => !!r && !!r.value);
/** "Queensland" for "qld"; empty (so the fact is left out) when unknown. */
const fullState = (code: string) => {
  const name = stateName(code);
  return name === code.toUpperCase() ? '' : name;
};
const GRANTCONNECT = 'https://www.grants.gov.au/';
const SEAT_NOTE =
  'The electorate is the one GrantConnect gives by delivery or recipient postcode, so it is approximate. It says nothing about who arranged the grant.';

const isJurisdiction = (j: string): j is Jurisdiction =>
  j === 'federal' || j === 'qld';

/** Rebuild the record a money row opened, or throw not-found. */
export async function loadMoneyItem(
  params: MoneyItemParams & { from?: string; org?: string },
  refresh: boolean,
  signal?: AbortSignal,
): Promise<RecordResult<MoneyItemView>> {
  const record = await readMoneyItem(params, refresh, signal);
  return params.org === 'self'
    ? {
        ...record,
        data: {
          ...record.data,
          onward: record.data.onward.filter(
            (row) => row.key !== 'organisation',
          ),
        },
      }
    : record;
}

async function readMoneyItem(
  params: MoneyItemParams & { from?: string },
  refresh: boolean,
  signal?: AbortSignal,
): Promise<RecordResult<MoneyItemView>> {
  const from = params.from ?? '';
  switch (params.kind) {
    case 'evidence': {
      if (!/^(0|[1-9]\d*)$/.test(params.i)) throw gone();
      const record = await catalogs.discovery(refresh, signal);
      const leadSignal = record.data.signals.find((s) => s.id === params.lead);
      const lead = leadSignal ? leadFor(leadSignal) : null;
      const evidence = lead?.evidence[Number(params.i)];
      const item = evidence ? evidenceRecord(evidence) : null;
      if (!lead || !evidence || !item) throw gone();
      return {
        ...record,
        data: {
          meta: item.detail,
          name: item.name,
          individual: false,
          amount: item.amount,
          asOf: discoveryAsOf(record.data),
          register: evidence.register,
          facts: facts([
            { label: 'From', value: evidence.from! },
            { label: 'To', value: evidence.to! },
            { label: 'Register', value: evidence.register },
            { label: 'Register ID', value: evidence.record ?? '' },
          ]),
          children: [],
          originals: [item.original],
          onward: [],
          notes: [],
          path: discoverPath({ id: lead.id, category: lead.category }),
        },
      };
    }
    case 'grant':
    case 'recipient': {
      if (!isJurisdiction(params.jur)) throw gone();
      if (params.kind === 'grant' && !params.program)
        return params.rid
          ? loadRecipientGrant(
              params.jur,
              params.rid,
              params.id,
              refresh,
              signal,
            )
          : Promise.reject(gone());
      const record = await money.program(
        params.jur,
        params.program!,
        refresh,
        signal,
      );
      const program = record.data;
      const programRow = (): Onward[] =>
        from === program.key || from === program.id
          ? []
          : [
              {
                key: 'program',
                title: program.name,
                detail: 'Grant program',
                symbol: symbols.money,
                href: grantProgramRoute(program.id, program.jur, program.name),
              },
            ];
      const register =
        program.jur === 'qld'
          ? 'Queensland Government Investment Portal'
          : 'GrantConnect';
      if (params.kind === 'grant') {
        const g = program.grants.find((x) => x.id === params.id);
        if (!g) throw gone();
        return {
          ...record,
          data: {
            meta: [
              'Grant agreement',
              g.start ? `from ${short(g.start)}` : fy(g.year),
            ]
              .filter(Boolean)
              .join(' · '),
            name: g.name,
            individual: !g.organisation,
            amount: g.value,
            asOf: program.asOf,
            register,
            facts: facts([
              {
                label: 'Program',
                value: program.name,
                href: grantProgramRoute(program.id, program.jur, program.name),
              },
              { label: 'Agency', value: program.agency },
              { label: 'Purpose', value: g.title, long: true },
              { label: 'Electorate', value: g.seat },
              { label: 'Selection', value: g.selection },
              { label: 'Starts', value: short(g.start) },
              { label: 'Financial year', value: fy(g.year) },
              { label: 'Register ID', value: g.id },
            ]),
            children: [],
            originals: [
              {
                label: `${moneyCitation(register).label} · ${g.id}`,
                url: g.sourceUrl ?? GRANTCONNECT,
              },
            ],
            onward: [
              ...(g.organisation && g.recipientId && from !== g.recipientId
                ? [
                    {
                      key: 'organisation',
                      title: `Open ${g.name}`,
                      href: organisationHref(
                        g.recipientId,
                        g.name,
                        program.jur,
                      ),
                    },
                  ]
                : []),
              ...programRow(),
            ],
            notes: [
              program.jur === 'federal' ? GRANTS_CAVEAT : '',
              g.seat ? SEAT_NOTE : '',
              g.organisation ? '' : privateNote,
            ].filter(Boolean),
            path: `/money/grants?jur=${program.jur}&program=${encodeURIComponent(program.id)}`,
          },
        };
      }
      const individuals = params.recipient === 'individuals';
      const grants = program.grants.filter((g) =>
        individuals
          ? !g.organisation
          : g.organisation && (g.recipientId || g.name) === params.recipient,
      );
      if (!grants.length) throw gone();
      const group = programRecipients(grants)[0]!;
      return {
        ...record,
        data: {
          meta: `Grants in this program · ${grants.length.toLocaleString('en-AU')} ${grants.length === 1 ? 'grant' : 'grants'}`,
          name: individuals ? 'Individual recipients' : group.name,
          individual: individuals,
          amount: grants.reduce((s, g) => s + g.value, 0),
          asOf: program.asOf,
          register,
          facts: [],
          children: [...grants]
            .sort((a, b) => b.value - a.value)
            .map((g) => ({
              key: g.id,
              name: g.organisation ? g.title || program.name : unnamedRecipient,
              detail: [short(g.start) || fy(g.year), g.id]
                .filter(Boolean)
                .join(' · '),
              amount: g.value,
              href: moneyItemHref(
                {
                  kind: 'grant',
                  jur: program.jur,
                  program: program.key,
                  id: g.id,
                },
                { name: g.name, from },
              ),
            })),
          originals: [
            { label: moneyCitation(register).label, url: GRANTCONNECT },
          ],
          onward: [
            ...(!individuals && group.recipientId && from !== group.recipientId
              ? [
                  {
                    key: 'organisation',
                    title: `Open ${group.name}`,
                    href: organisationHref(
                      group.recipientId,
                      group.name,
                      program.jur,
                    ),
                  },
                ]
              : []),
            ...programRow(),
          ],
          notes: [
            ...(program.jur === 'federal' ? [GRANTS_CAVEAT] : []),
            ...(individuals ? [privateNote] : []),
          ],
          path: `/money/grants?jur=${program.jur}&program=${encodeURIComponent(program.id)}`,
        },
      };
    }
    case 'largest': {
      const [largest, index] = await Promise.all([
        money.largest(refresh, signal),
        money.grants('federal', refresh, signal),
      ]);
      const r = largestFor(largest.data, index.data, params.month).find(
        (x) => x.id === params.id,
      );
      if (!r) throw gone();
      const program = index.data.programs.find((p) => p.listedAs === r.program);
      return {
        ...combine([largest, index], null),
        data: {
          meta: `Grant agreement · from ${short(r.start)}`,
          name: r.recipient,
          individual: !r.organisation,
          amount: r.value,
          asOf: largest.data.asOf,
          register: 'GrantConnect',
          facts: facts([
            {
              label: 'Program',
              value: r.program,
              href: program
                ? grantProgramRoute(program.id, 'federal', program.name)
                : undefined,
            },
            { label: 'Agency', value: r.agency },
            { label: 'Purpose', value: r.purpose, long: true },
            { label: 'Selection', value: r.selection },
            { label: 'Starts', value: short(r.start) },
            {
              label: 'Other awards that month',
              value: r.more ? r.more.toLocaleString('en-AU') : '',
            },
            { label: 'Register ID', value: r.id },
          ]),
          children: [],
          originals: [
            {
              label: `GrantConnect · ${r.id}`,
              url: r.sourceUrl || GRANTCONNECT,
            },
          ],
          onward: [
            ...(r.organisation && r.recipientId && from !== r.recipientId
              ? [
                  {
                    key: 'organisation',
                    title: `Open ${r.recipient}`,
                    href: organisationHref(r.recipientId, r.recipient),
                  },
                ]
              : []),
            ...(program
              ? [
                  {
                    key: 'program',
                    title: program.name,
                    detail: 'Grant program',
                    symbol: symbols.money,
                    href: grantProgramRoute(
                      program.id,
                      'federal',
                      program.name,
                    ),
                  },
                ]
              : []),
          ],
          notes: [
            ...largest.data.basis,
            r.organisation ? '' : privateNote,
          ].filter(Boolean),
          path: `/money/grants?jur=federal&largest=${params.month}`,
        },
      };
    }
    case 'contract':
    case 'supplier': {
      const record = await money.agency(params.agency, refresh, signal);
      const profile = record.data.profile;
      const agencyRow: Onward[] =
        from === profile.id
          ? []
          : [
              {
                key: 'agency',
                title: profile.name,
                detail: 'Government agency',
                symbol: symbols.contracts,
                href: agencyRoute(profile.id, profile.name),
              },
            ];
      if (params.kind === 'contract') {
        const c = profile.contracts.find((x) => x.id === params.id);
        if (!c) throw gone();
        const supplier = profile.suppliers.find((s) => s.id === c.supplierId);
        const organisation = c.supplier !== unnamedSupplier;
        return {
          ...record,
          data: {
            meta: [
              'Contract',
              c.start && c.end
                ? `${short(c.start)} to ${short(c.end)}`
                : short(c.start || c.published),
            ]
              .filter(Boolean)
              .join(' · '),
            name: c.supplier,
            individual: !organisation,
            amount: c.value,
            asOf: record.data.meta.asOf,
            register: 'AusTender',
            facts: facts([
              {
                label: 'Agency',
                value: profile.name,
                href: agencyRoute(profile.id, profile.name),
              },
              { label: 'Purpose', value: c.title, long: true },
              { label: 'Procurement', value: procurement(c.method) },
              { label: 'Published', value: short(c.published) },
              { label: 'Starts', value: short(c.start) },
              { label: 'Ends', value: short(c.end) },
              { label: 'Register ID', value: c.id },
            ]),
            children: [],
            originals: [
              {
                label: `AusTender register · ${c.id}`,
                url: c.url ?? 'https://www.tenders.gov.au/',
              },
            ],
            onward: [
              ...(organisation && supplier && from !== supplier.id
                ? [
                    {
                      key: 'organisation',
                      title: `Open ${supplier.name}`,
                      href: organisationHref(supplier.id, supplier.name),
                    },
                  ]
                : []),
              ...agencyRow,
            ],
            notes: [CONTRACTS_CAVEAT, organisation ? '' : privateNote].filter(
              Boolean,
            ),
            path:
              organisation && supplier
                ? `/subject/supplier/${supplier.id}`
                : null,
          },
        };
      }
      const s = profile.suppliers.find((x) => x.id === params.supplier);
      if (!s) throw gone();
      const contracts = profile.contracts.filter((c) => c.supplierId === s.id);
      return {
        ...record,
        data: {
          meta: `Contracts with this agency · ${s.count.toLocaleString('en-AU')} ${s.count === 1 ? 'contract' : 'contracts'}`,
          name: s.name,
          individual: !s.organisation,
          amount: s.total,
          asOf: record.data.meta.asOf,
          register: 'AusTender',
          facts: [],
          children: [...contracts]
            .sort((a, b) => b.value - a.value)
            .map((c) => ({
              key: c.id,
              name: c.title || c.id,
              detail: [short(c.start), c.id].filter(Boolean).join(' · '),
              amount: c.value,
              href: moneyItemHref(
                { kind: 'contract', agency: profile.id, id: c.id },
                { name: c.supplier, from },
              ),
            })),
          originals: [
            { label: 'AusTender register', url: 'https://www.tenders.gov.au/' },
          ],
          onward: [
            ...(s.organisation && from !== s.id
              ? [
                  {
                    key: 'organisation',
                    title: `Open ${s.name}`,
                    href: organisationHref(s.id, s.name),
                  },
                ]
              : []),
            ...agencyRow,
          ],
          notes: [
            CONTRACTS_CAVEAT,
            contracts.length < s.count
              ? `${contracts.length.toLocaleString('en-AU')} of the ${counted(s.count, 'contract')} ${contracts.length === 1 ? 'is' : 'are'} listed in this agency’s file.`
              : '',
            s.organisation ? '' : privateNote,
          ].filter(Boolean),
          path: s.organisation ? `/subject/supplier/${s.id}` : null,
        },
      };
    }
    case 'award':
    case 'project': {
      const [allocation, locations] = await Promise.all([
        money.allocation(refresh, signal),
        money.locations(refresh, signal).catch(() => {
          throwIfAborted(signal);
          return null;
        }),
      ]);
      const list =
        params.kind === 'award'
          ? allocation.data.awards
          : allocation.data.projects;
      const p = list.find((x) => x.id === params.id);
      if (!p) throw gone();
      const individual = p.recipient === unnamedRecipient;
      const located = individual
        ? undefined
        : locations?.data.records.find(
            (l) =>
              l.id === p.id &&
              l.kind === (params.kind === 'award' ? 'award' : 'invitation'),
          );
      return {
        ...(locations ? combine([allocation, locations], null) : allocation),
        data: {
          meta: [
            params.kind === 'award' ? 'Published award' : 'Invitation to apply',
            short(p.date),
          ]
            .filter(Boolean)
            .join(' · '),
          name: located?.title ?? p.title,
          individual: false,
          amount: p.value,
          asOf:
            params.kind === 'award'
              ? allocation.data.asOf
              : allocation.data.invitationsAsOf,
          register: params.kind === 'award' ? 'GrantConnect' : 'Department',
          facts: facts([
            { label: 'Program', value: 'Community funding' },
            { label: 'Purpose', value: p.title, long: true },
            { label: 'Recipient', value: p.recipient },
            { label: 'State', value: fullState(p.state) },
            { label: 'Area', value: p.area },
            { label: 'Published', value: short(p.date) },
            {
              label: 'Sites',
              value: (located?.sites ?? [])
                .map((s) => `${s.name}, ${s.address}`)
                .join('\n'),
              long: true,
            },
            { label: 'Register ID', value: p.id },
          ]),
          children: [],
          originals: [
            {
              label:
                params.kind === 'award'
                  ? `GrantConnect · ${p.id}`
                  : 'Departmental invitation list',
              url: p.sourceUrl,
            },
          ],
          onward: [],
          notes: [
            params.kind === 'award'
              ? GRANTS_CAVEAT
              : 'An invitation to apply is not a grant award or a payment.',
            individual ? privateNote : '',
          ].filter(Boolean),
          path: null,
        },
      };
    }
    case 'earlier': {
      const history = await money.history(refresh, signal);
      const r = history.data.records.find((x) => x.id === params.id);
      if (!r) throw gone();
      return {
        ...history,
        data: {
          meta: `Earlier grant · ${short(r.date)}`,
          name: r.title,
          individual: false,
          amount: r.value,
          asOf: history.data.asOf,
          register: 'GrantConnect',
          facts: facts([
            { label: 'Program', value: r.program },
            { label: 'Purpose', value: r.title, long: true },
            { label: 'State', value: fullState(r.state) },
            { label: 'Published', value: short(r.date) },
            { label: 'Register ID', value: r.id },
          ]),
          children: [],
          originals: [{ label: `GrantConnect · ${r.id}`, url: r.sourceUrl }],
          onward: [],
          notes: [GRANTS_CAVEAT],
          path: null,
        },
      };
    }
  }
}

/** "Open tender" from AusTender's `open`. */
function procurement(method: string) {
  const m = method.trim().toLowerCase();
  if (!m) return '';
  if (m === 'open') return 'Open tender';
  if (m === 'limited') return 'Limited tender';
  if (m === 'prequalified') return 'Prequalified tender';
  return method.charAt(0).toUpperCase() + method.slice(1);
}

/** The route's params as one record kind, or null when they don't add up. */
export function itemParams(
  p: Record<string, string | undefined>,
): (MoneyItemParams & { from?: string; org?: string }) | null {
  const from = {
    ...(p.from ? { from: p.from } : {}),
    ...(p.org === 'self' ? { org: 'self' } : {}),
  };
  const kind = p.kind as MoneyItemKind | undefined;
  switch (kind) {
    case 'evidence':
      return p.lead && p.i && /^(0|[1-9]\d*)$/.test(p.i)
        ? { kind, lead: p.lead, i: p.i, ...from }
        : null;
    case 'grant':
      return p.jur && (p.program || p.rid) && (p.id || p.award)
        ? {
            kind,
            jur: p.jur,
            ...(p.program ? { program: p.program } : { rid: p.rid }),
            id: (p.id || p.award)!,
            ...from,
          }
        : null;
    case 'recipient':
      return p.jur && p.program && p.recipient
        ? {
            kind,
            jur: p.jur,
            program: p.program,
            recipient: p.recipient,
            ...from,
          }
        : null;
    case 'largest':
      return p.month && p.id
        ? { kind, month: p.month, id: p.id, ...from }
        : null;
    case 'contract':
      return p.agency && p.id
        ? { kind, agency: p.agency, id: p.id, ...from }
        : null;
    case 'supplier':
      return p.agency && p.supplier
        ? { kind, agency: p.agency, supplier: p.supplier, ...from }
        : null;
    case 'award':
    case 'project':
    case 'earlier':
      return p.id ? { kind, id: p.id, ...from } : null;
    default:
      return null;
  }
}

/**
 * The money item page (specs/money.md 1.4): the record a money row opened,
 * rebuilt from its params. Meta, title, amount, Facts (or the recipient's or
 * supplier's records), Originals, "Open {organisation}" rows, Notes and the
 * SourceLine.
 */
export default function MoneyItem() {
  const raw = useLocalSearchParams<Record<string, string>>();
  return <MoneyItemRecord key={JSON.stringify(itemParams(raw))} raw={raw} />;
}

function MoneyItemRecord({ raw }: { raw: Record<string, string> }) {
  const params = itemParams(raw);
  const key = JSON.stringify(params);
  const load = useCallback(
    (refresh: boolean, _publish: unknown, signal?: AbortSignal) => {
      const p = JSON.parse(key) as ReturnType<typeof itemParams>;
      return p ? loadMoneyItem(p, refresh, signal) : Promise.reject(gone());
    },
    [key],
  );
  const status = useCatalogRecord(load);
  const item = status.record?.data;
  const name = item?.name ?? raw.name ?? '';
  const titleRef = useRef<View>(null);
  const scrollTitle = useTitleOnScroll(titleRef, name);
  const saved = recordSource(status.record);
  return (
    <>
      <RouteOptions
        stableItems
        options={{
          title: name,
          ...(item?.path ? moneyBar({ name, path: item.path }) : {}),
        }}
      />
      <Screen
        onScroll={scrollTitle.onScroll}
        testID="money-item"
        refreshControl={
          <RefreshControl
            refreshing={status.refreshing}
            onRefresh={status.refresh}
          />
        }
      >
        <SkeletonCrossfade
          loading={!status.record && !status.error}
          ready={!!item}
          cached={!!status.record?.stale}
          cachedAt={status.record?.savedAt}
          sectioned
          skeleton={
            <MoneyStatus
              status={status}
              name="This record"
              rows={5}
              testID="money-item"
            />
          }
        >
          <MoneyStatus
            status={status}
            name="This record"
            rows={5}
            notFound={{ title: 'This record isn’t available any more' }}
            testID="money-item"
          />
          {item ? (
            <>
              <View
                ref={titleRef}
                collapsable={false}
                onLayout={scrollTitle.onTitleLayout}
                style={{ gap: rhythm.line }}
              >
                <Text wordSafe variant="secondary" testID="money-item-meta">
                  {item.meta}
                </Text>
                <Heading
                  level={1}
                  kind={item.individual ? 'page' : 'record'}
                  testID="money-item-title"
                >
                  {item.name}
                </Heading>
                <Text
                  wordSafe
                  variant="figure"
                  tabular
                  testID="money-item-amount"
                >
                  {formatMoney(item.amount)}
                </Text>
              </View>
              {item.children.length ? (
                <View testID="money-item-records">
                  {item.children.map((c, i) => (
                    <MoneyRow
                      key={c.key}
                      name={c.name}
                      detail={c.detail}
                      amount={c.amount}
                      href={c.href}
                      testID={`money-item-record-${i}`}
                    />
                  ))}
                </View>
              ) : item.facts.length ? (
                <View>
                  <Text wordSafe variant="groupHeader">
                    {`As at ${formatDate(item.asOf, 'long')}`}
                  </Text>
                  {item.facts.map((f) =>
                    f.long ? (
                      <LongFact key={f.label} fact={f} />
                    ) : (
                      <ValueRow
                        key={f.label}
                        label={f.label}
                        value={f.value}
                        href={f.href}
                        testID={`money-item-fact-${slug(f.label)}`}
                      />
                    ),
                  )}
                </View>
              ) : null}
              {item.originals.length ? (
                <Section title="Originals">
                  {item.originals.map((o, i) => (
                    <LinkRow
                      key={o.label}
                      title={o.label}
                      external={{ url: o.url, label: o.label }}
                      testID={`money-item-original-${i}`}
                    />
                  ))}
                </Section>
              ) : null}
              {item.onward.length ? (
                <View>
                  {item.onward.map((o) => (
                    <LinkRow
                      key={o.key}
                      title={o.title}
                      detail={o.detail}
                      symbol={o.symbol}
                      href={o.href}
                      testID={`money-item-open-${o.key}`}
                    />
                  ))}
                </View>
              ) : null}
              {item.notes.length ? (
                <Section title="Notes">
                  {item.notes.map((n) => (
                    <Text key={n} wordSafe variant="body">
                      {readableDates(n)}
                    </Text>
                  ))}
                </Section>
              ) : null}
              <SourceLine
                asOf={item.asOf}
                citation={[moneyCitation(item.register)]}
                savedAt={saved.savedAt}
                state={saved.state}
                originals={item.originals}
                notes={saved.stateNotes}
                testID="money-item-source"
              />
            </>
          ) : null}
        </SkeletonCrossfade>
      </Screen>
    </>
  );
}

const slug = (label: string) => label.toLowerCase().replace(/\s+/g, '-');

function LongFact({ fact }: { fact: Fact }) {
  return (
    <View
      style={{ gap: rhythm.line, paddingVertical: rhythm.tight }}
      testID={`money-item-fact-${slug(fact.label)}`}
    >
      <Text wordSafe variant="secondary">
        {fact.label}
      </Text>
      <Text wordSafe variant="recordText">
        {fact.value}
      </Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: rhythm.tight }}>
      <SectionHeader title={title} />
      {children}
    </View>
  );
}
