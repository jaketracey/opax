import { ReadSession } from './read-session';
import { throwIfAborted } from './abort';
import { samePartyLabel } from '../design/party';
import { decodePartyFile } from '../features/directories/party-file';
import { publicDiscovery } from '../features/money-public/discovery';
import {
  decodeRecentDivisions,
  type RecentDivisions,
} from '../features/today/votes';
import {
  decodeSittingDays,
  sittingDaysPath,
  type SittingDays,
} from '../features/today/sitting';
import type { Manifest } from './catalog-decoders';
import * as decode from './catalog-decoders';
import {
  memberSearchResults,
  memberSearchRows,
  memberSlugFor,
  memberSuggestionRoster,
} from './catalog-search';
import type { ApiClient, RecordResult } from './client';
import { ApiError } from './errors';
import { billKey, interestKey, personId, type PersonId } from './ids';
import {
  partyDivisions,
  partyLabels,
  partyMembers,
  partyMoney,
  partyPastMembers,
  recentPartyBills,
  resolveParty,
  type PartyPastMember,
} from './party-page';
import {
  joinPerson,
  personSlugForId,
  personSlugForResult,
  type PersonProfile,
} from './person-identity';
import { editionPath, type CatalogKind } from './policy';
import {
  billFor,
  billsFor,
  coverageFor,
  declarationProfilesFor,
  editionFor,
  electorateFor,
  profileFor,
  recentBillsFor,
  recentDeclarationsFor,
  rosterProfileFor,
  suggestionProvenanceFor,
  suggestionsFor,
  yourMPFor,
  type Block,
  type EditionView,
  type ProfileCatalogs,
  type RecentBillsKind,
} from './selectors';
import { isPartialCatalog, type Decoder } from './validation';
export * from './catalog-decoders';
export * from './ids';
export * from './person-identity';
export * from './selectors';

interface SuggestionSources {
  manifest: decode.Manifest;
  slugs?: decode.Slugs;
  people?: decode.PeopleCatalog;
  roster: decode.Roster;
  electorates: decode.ElectorateIndex;
  bills: decode.BillIndex;
  provenance: {
    people: Block<null>;
    electorates: Block<null>;
    bills: Block<null>;
  };
}
function recordFlags(
  records: {
    partial?: boolean;
    staleReason?: RecordResult<unknown>['staleReason'];
  }[],
) {
  const reason = records.some((r) => r.staleReason === 'unreadable')
    ? ('unreadable' as const)
    : records.find((r) => r.staleReason)?.staleReason;
  return {
    ...(records.some((r) => r.partial) ? { partial: true } : {}),
    ...(reason ? { staleReason: reason } : {}),
  };
}
function cached<T>(
  block: Block<T>,
  records: RecordResult<unknown>[],
): Block<T> {
  return {
    ...block,
    ...recordFlags(records),
    stale: records.some((r) => r.stale),
    savedAt: records.length
      ? Math.min(...records.map((r) => r.savedAt))
      : block.savedAt,
  };
}
export interface PartyPageRecord {
  data: {
    label: string;
    rosterAsAt: string | null;
    members: Block<ReturnType<typeof partyMembers>>;
    /** Past members from voting records and roster party service. */
    past?: Block<PartyPastMember[]>;
    receipts: Block<NonNullable<ReturnType<typeof partyMoney>>>;
    associated: Block<{
      rows: NonNullable<
        decode.AecExtras['parties'][string]['associated_entities']
      >;
      total: number;
      notes: decode.AecExtras['meta']['notes'];
    }>;
    divisions: Block<{
      rows: ReturnType<typeof partyDivisions>;
      scanned: number;
      failed: number;
      basisNote: decode.BillIndex['meta']['party_basis_note'];
    }>;
    moneyMeta: decode.Money['meta'] | null;
  } | null;
  stale: boolean;
}
/** A bill read before any index: no party note yet. */
const noBillIndex: decode.BillIndex = {
  generated_at: '',
  count: 0,
  meta: { party_basis_note: '', party_basis: '', party_coverage: {} },
  bills: [],
};
const loadingPartyBlock = <T>(): Block<T> => ({
  status: 'loading',
  data: null,
  asAt: null,
  sources: [],
  stale: false,
  savedAt: null,
});
const failedPartyBlock = (error: unknown): Block<never> => ({
  ...loadingPartyBlock<never>(),
  status: 'error',
  error:
    error instanceof ApiError
      ? error
      : new ApiError('invalid-data', 'This catalog could not be read.'),
});
export class Catalogs {
  private suggestionReads = new ReadSession<SuggestionSources>();
  private suggestionGeneration = 0;
  private suggestionLoadedAt?: number;
  /** The last bills index read this session, for the bill page's party note. */
  private billIndex?: RecordResult<decode.BillIndex>;
  private suggestionIdentityRetry: 'unused' | 'available' | 'used' = 'unused';
  constructor(private client: Pick<ApiClient, 'get'>) {}
  async partyPage(
    input: string,
    refresh = false,
    publish?: (record: PartyPageRecord) => void,
    signal?: AbortSignal,
    /** Screen-only scheduling; background readers keep the ordinary yield. */
    afterCore?: () => Promise<void>,
  ): Promise<PartyPageRecord> {
    // Keep the complete shown record until a refresh replaces it atomically.
    const progress = refresh ? undefined : publish;
    const read = async <T>(
      pending: Promise<RecordResult<T>>,
      source: string,
    ): Promise<Block<T>> => {
      try {
        const r = await pending;
        return {
          data: r.data,
          ...recordFlags([r]),
          status: 'ready',
          asAt: null,
          sources: [{ label: source, url: '' }],
          stale: r.stale,
          savedAt: r.savedAt,
        };
      } catch (e) {
        throwIfAborted(signal);
        return failedPartyBlock(e);
      }
    };
    // Optional reads start after publishing the core; each settles independently.
    const readMoney = () =>
      read(
        this.client.get('/graph/money.json', decode.decodeMoney, refresh, {
          signal,
        }),
        'AEC disclosure returns, CC BY 4.0',
      );
    const readEntities = () =>
      read(
        this.client.get(
          '/graph/aec-extras.json',
          decode.decodeAecExtras,
          refresh,
          { signal },
        ),
        'AEC Transparency Register, CC BY 4.0',
      );
    const readVotes = () =>
      read(
        (async () => {
          const index = await this.bills(refresh, signal);
          const files: RecordResult<decode.BillDetail>[] = [];
          const candidates = recentPartyBills(index.data);
          let failed = 0;
          for (let i = 0; i < candidates.length && files.length < 32; i += 8) {
            const batch = await Promise.allSettled(
              candidates
                .slice(i, i + 8)
                .map((b) => this.bill(b.key, refresh, signal)),
            );
            for (const r of batch) {
              if (r.status === 'fulfilled') {
                if (files.length < 32) files.push(r.value);
              } else failed++;
            }
          }
          if (candidates.length && !files.length)
            throw new ApiError(
              'http',
              'Bill division records could not be loaded.',
            );
          return {
            ...recordFlags([index, ...files]),
            data: {
              index: index.data,
              files: files.map((f) => f.data),
              failed,
            },
            stale: index.stale || files.some((f) => f.stale),
            savedAt: Math.min(index.savedAt, ...files.map((f) => f.savedAt)),
            etag: null,
            asOf: index.data.generated_at,
          };
        })(),
        'They Vote For You, ODbL; ParlInfo bill records',
      );
    const corePending = (async () => {
      const [roster, slugs, manifest] = await Promise.all([
        this.roster(refresh, signal),
        this.slugs(refresh, signal),
        this.manifest(refresh, signal),
      ]);
      const people = await this.people(manifest.data, refresh, signal);
      // Membership counts and money ranks require a complete cohort.
      if (
        [roster, slugs, manifest, people].some(
          (r) => r.partial || isPartialCatalog(r.data),
        )
      )
        throw new ApiError(
          'invalid-data',
          'Some membership rows could not be read.',
        );
      return { roster, slugs, manifest, people };
    })();
    const coreRead = read(
      corePending.then((data) => ({
        data,
        ...recordFlags([data.roster, data.slugs, data.manifest, data.people]),
        stale: [data.roster, data.slugs, data.manifest, data.people].some(
          (r) => r.stale,
        ),
        savedAt: Math.min(
          data.roster.savedAt,
          data.slugs.savedAt,
          data.manifest.savedAt,
          data.people.savedAt,
        ),
        asOf: data.people.data.meta.generated,
      })),
      'OPAX parliamentary roster and dated seats',
    );
    const core = await coreRead;
    let money: Block<decode.Money> | undefined;
    let label = core.data
      ? resolveParty(
          input,
          partyLabels(core.data.roster.data, core.data.people.data),
        )
      : null;
    // Money-only parties (and an unavailable roster) retain the existing fallback.
    if (!label) {
      money = await readMoney();
      const labels = core.data
        ? partyLabels(
            core.data.roster.data,
            core.data.people.data,
            money.data ?? undefined,
          )
        : (money.data?.nodes
            .filter((n) => n.kind === 'party')
            .flatMap((n) => [n.label, ...(n.aliases ?? [])]) ?? []);
      label = resolveParty(input, labels);
      if (!label) {
        const stateParties = await Promise.allSettled([
          this.partyFile('qld', refresh, signal),
          this.partyFile('vic', refresh, signal),
        ]);
        label = resolveParty(
          input,
          stateParties.flatMap((result) =>
            result.status === 'fulfilled'
              ? result.value.data.parties.map((party) => party.label)
              : [],
          ),
        );
      }
      if (!label) {
        if (core.status === 'error' || money.status === 'error')
          throw core.error ?? money.error;
        return { data: null, stale: false };
      }
    }
    const membership = core.data
      ? partyMembers(
          label,
          core.data.roster.data,
          core.data.people.data,
          core.data.slugs.data,
          core.data.manifest.data,
        )
      : null;
    const members: Block<ReturnType<typeof partyMembers>> = {
      ...core,
      data: membership,
      asAt: core.data?.people.data.meta.generated ?? null,
      sources: membership
        ? [
            { label: 'OPAX parliamentary roster', url: '/subject/person' },
            ...membership.sources.map((s) => ({
              label: [s.label, s.licence].filter(Boolean).join(', '),
              url: s.url,
              licence: s.licence,
            })),
          ]
        : [],
    };
    let view: NonNullable<PartyPageRecord['data']> = {
      label,
      rosterAsAt: core.data?.roster.data.meta.generated ?? null,
      members,
      past: loadingPartyBlock<PartyPastMember[]>(),
      receipts: loadingPartyBlock(),
      associated: loadingPartyBlock(),
      divisions: loadingPartyBlock(),
      moneyMeta: null,
    };
    const result = (): PartyPageRecord => ({
      data: view,
      stale: [
        view.members,
        view.receipts,
        view.associated,
        view.divisions,
        ...(view.past ? [view.past] : []),
      ].some((b) => b.stale),
    });
    throwIfAborted(signal);
    progress?.(result());
    // The screen can wait for native frames, not only a JS timer turn.
    await (afterCore?.() ??
      new Promise<void>((resolve) => setTimeout(resolve, 0)));
    throwIfAborted(signal);
    // Past affiliations can be absent from a person's voting-party label.
    const readPast = async () => {
      const block = await read(
        this.votes(signal, refresh),
        'They Vote For You, ODbL',
      );
      const past = partyPastMembers(
        label,
        block.data ?? { records: {}, names: {}, meta: null },
        core.data?.slugs.data ?? { generated: '', slugs: {} },
        membership?.current ?? [],
        core.data?.roster.data,
        core.data?.people.data,
      );
      view = {
        ...view,
        past: {
          ...block,
          status: !block.data && past.length ? 'ready' : block.status,
          data: block.data || past.length ? past : null,
          stale: block.stale || core.stale,
          partial:
            block.partial || core.partial || (!block.data && past.length > 0),
          asAt:
            [
              core.data?.roster.data.meta.generated,
              block.data?.meta?.content_changed_at,
            ]
              .filter((date): date is string => !!date)
              .sort()[0] ?? null,
          sources: [
            ...members.sources,
            ...block.sources,
            ...[
              ...new Set(
                past.flatMap(
                  (p) =>
                    p.periods?.flatMap((a) =>
                      a.source_url ? [a.source_url] : [],
                    ) ?? [],
                ),
              ),
            ].map((url) => ({ label: 'Recorded party service', url })),
          ],
        },
      };
      throwIfAborted(signal);
      progress?.(result());
    };
    await Promise.all([
      readPast(),
      (money ? Promise.resolve(money) : readMoney())
        .then((block) => {
          view = {
            ...view,
            receipts: {
              ...block,
              data: block.data ? partyMoney(label, block.data) : null,
              asAt: block.data?.meta.generated ?? null,
            },
            moneyMeta: block.data?.meta ?? null,
          };
          throwIfAborted(signal);
          progress?.(result());
        })
        .catch((error: unknown) => {
          throwIfAborted(signal);
          view = { ...view, receipts: failedPartyBlock(error) };
          throwIfAborted(signal);
          progress?.(result());
        }),
      readEntities()
        .then((block) => {
          const association = block.data
            ? Object.entries(block.data.parties).find(([party]) =>
                samePartyLabel(party, label),
              )?.[1]
            : null;
          view = {
            ...view,
            associated: {
              ...block,
              data: block.data
                ? {
                    rows: association?.associated_entities?.slice(0, 6) ?? [],
                    total: association?.associated_entities_total ?? 0,
                    notes: block.data.meta.notes,
                  }
                : null,
              asAt: block.data?.meta.generated ?? null,
            },
          };
          throwIfAborted(signal);
          progress?.(result());
        })
        .catch((error: unknown) => {
          throwIfAborted(signal);
          view = { ...view, associated: failedPartyBlock(error) };
          throwIfAborted(signal);
          progress?.(result());
        }),
      readVotes()
        .then((block) => {
          view = {
            ...view,
            divisions: {
              ...block,
              data: block.data
                ? {
                    rows: partyDivisions(label, block.data.files),
                    scanned: block.data.files.length,
                    failed: block.data.failed,
                    basisNote: block.data.index.meta.party_basis_note,
                  }
                : null,
              asAt: block.data?.index.generated_at ?? null,
            },
          };
          throwIfAborted(signal);
          progress?.(result());
        })
        .catch((error: unknown) => {
          throwIfAborted(signal);
          view = { ...view, divisions: failedPartyBlock(error) };
          throwIfAborted(signal);
          progress?.(result());
        }),
    ]);
    return result();
  }

  roster(refresh = false, signal?: AbortSignal) {
    return this.client.get(
      '/parliamentarians.json',
      decode.decodeRoster,
      refresh,
      { signal },
    );
  }
  partyFile(
    jurisdiction: 'federal' | 'qld' | 'vic',
    refresh = false,
    signal?: AbortSignal,
  ) {
    return this.client.get(
      jurisdiction === 'federal'
        ? '/graph/money.json'
        : `/graph/money.${jurisdiction}.json`,
      decodePartyFile,
      refresh,
      { signal },
    );
  }
  slugs(refresh = false, signal?: AbortSignal) {
    return this.client.get('/api/person-slugs', decode.decodeSlugs, refresh, {
      signal,
    });
  }
  manifest(refresh = false, signal?: AbortSignal) {
    return this.client.get(
      '/electorates/manifest.json',
      decode.decodeManifest,
      refresh,
      { signal },
    );
  }
  people(manifest: Manifest, refresh = false, signal?: AbortSignal) {
    return this.client.get(manifest.people_url, decode.decodePeople, refresh, {
      signal,
    });
  }
  electorates(manifest: Manifest, refresh = false, signal?: AbortSignal) {
    return this.client.get(
      manifest.index_url,
      decode.decodeElectorateIndex,
      refresh,
      { signal },
    );
  }
  electorate(path: string, signal?: AbortSignal) {
    return this.client.get(path, decode.decodeElectorate, false, { signal });
  }
  bills(refresh = false, signal?: AbortSignal) {
    return this.client
      .get('/bills/index.json', decode.decodeBillIndex, refresh, { signal })
      .then((index) => {
        throwIfAborted(signal);
        this.billIndex = index;
        return index;
      });
  }
  /**
   * The bill's row from the index already in memory, or null: never a
   * network read. The bill page draws its header from it while the bill's
   * own file loads (specs/bills.md 4.3).
   */
  billIndexRow(key: string): decode.Bill | null {
    return this.billIndex?.data.bills.find((row) => row.key === key) ?? null;
  }
  bill(key: string, refresh = false, signal?: AbortSignal) {
    return this.client.get(
      `/bills/${billKey(key)}.json`,
      decode.decodeBill,
      refresh,
      { signal },
    );
  }
  votes(signal?: AbortSignal, refresh = false) {
    return this.client.get('/votes.json', decode.decodeVotes, refresh, {
      signal,
    });
  }
  interestIndex(signal?: AbortSignal) {
    return this.client.get(
      '/interests/index.json',
      decode.decodeInterestIndex,
      false,
      { signal },
    );
  }
  interests(key: string, signal?: AbortSignal) {
    return this.client.get(
      `/interests/${interestKey(key)}.json`,
      decode.decodeInterest,
      false,
      { signal },
    );
  }
  recentInterests(signal?: AbortSignal) {
    return this.client.get(
      '/interests/recent.json',
      decode.decodeRecentInterests,
      false,
      { signal },
    );
  }
  pay(signal?: AbortSignal) {
    return this.client.get('/pay.json', decode.decodePay, false, { signal });
  }
  expenses(signal?: AbortSignal) {
    return this.client.get('/expenses.json', decode.decodeExpenses, false, {
      signal,
    });
  }
  expenseCategories(signal?: AbortSignal) {
    return this.client.get(
      '/expense-categories.json',
      decode.decodeExpenseCategories,
      false,
      { signal },
    );
  }
  photoPeople(refresh = false, signal?: AbortSignal) {
    return this.client.get(
      '/photos/people.json',
      decode.decodePhotoPeople,
      refresh,
      { signal },
    );
  }
  photoCredits(refresh = false, signal?: AbortSignal) {
    return this.client.get(
      '/photos/credits.json',
      decode.decodePhotoCredits,
      refresh,
      { signal },
    );
  }
  corpus(signal?: AbortSignal) {
    return this.client.get('/corpus.json', decode.decodeCorpus, false, {
      signal,
    });
  }
  /** Leads (P1): the static discovery export, decoded whole. */
  discovery(refresh = false, signal?: AbortSignal) {
    return this.client.get(
      '/discovery.json',
      (v) => publicDiscovery(decode.decodeDiscovery(v)),
      refresh,
      { signal },
    );
  }
  /**
   * The declared-interests feed behind Today's recent declarations: every
   * row of /interests/recent.json, newest first, with Today's party join
   * and the profile slug of each member the register's ID bridge resolves.
   * Portraits load per row (CachedPortrait). Joins are optional: without
   * them a row keeps its text and source, and shows no party or profile link.
   */
  async declarations(refresh = false, signal?: AbortSignal) {
    const record = await this.client.get(
      '/interests/recent.json',
      decode.decodeRecentInterests,
      refresh,
      { signal },
    );
    const optional = <T>(path: string, decoder: Decoder<T>) =>
      this.client.get(path, decoder, refresh, { signal }).catch(() => {
        throwIfAborted(signal);
        return null;
      });
    const [roster, slugs, interestIndex, manifest] = await Promise.all([
      optional('/parliamentarians.json', decode.decodeRoster),
      optional('/api/person-slugs', decode.decodeSlugs),
      optional('/interests/index.json', decode.decodeInterestIndex),
      optional('/electorates/manifest.json', decode.decodeManifest),
    ]);
    const people = manifest
      ? await optional(manifest.data.people_url, decode.decodePeople).then(
          (r) =>
            r && r.data.meta.release_id === manifest.data.release_id ? r : null,
        )
      : null;
    const interests = record.data;
    const view = recentDeclarationsFor(interests, interests.items.length, {
      roster: roster?.data,
    });
    const profiles =
      roster && slugs && interestIndex && manifest && people
        ? declarationProfilesFor(
            interests.items.map((item) => item.name),
            {
              roster: roster.data,
              slugs: slugs.data,
              interestIndex: interestIndex.data,
              manifest: manifest.data,
              people: people.data,
            },
          )
        : {};
    const records = [
      record,
      ...[roster, slugs, interestIndex, manifest, people].filter(
        (r) => r !== null,
      ),
    ];
    return {
      ...cached(
        {
          ...view,
          data: (view.data ?? []).map((item) => ({
            ...item,
            profileSlug: profiles[item.name] ?? null,
          })),
        },
        records,
      ),
      // The export's own coverage: the newest `rows` of `available`.
      meta: interests.meta,
    };
  }
  async about(refresh = false, signal?: AbortSignal) {
    const result = await this.client.get(
      '/corpus.json',
      decode.decodeCorpus,
      refresh,
      { signal },
    );
    return { ...result, data: cached(coverageFor(result.data), [result]) };
  }
  async billFor(key: string, refresh = false, signal?: AbortSignal) {
    // The page needs only the bill's own file. The index adds the party
    // note under the votes: use the copy already in memory, and start
    // reading it for next time without waiting.
    const bill = await this.bill(key, refresh, signal);
    const index = this.billIndex;
    if (!index || refresh)
      void this.bills(refresh, signal).catch(() => {
        throwIfAborted(signal);
        return undefined;
      });
    const view = billFor(bill.data, index?.data ?? noBillIndex);
    for (const block of [
      view.identity,
      view.summary,
      view.keyDates,
      view.divisions,
      view.speeches,
      view.acts,
      view.consultation,
    ]) {
      block.stale = bill.stale;
      block.savedAt = bill.savedAt;
      Object.assign(block, recordFlags([bill]));
    }
    view.divisions = cached(view.divisions, index ? [bill, index] : [bill]);
    return { ...bill, ...recordFlags([bill]), data: view };
  }
  async billsFor(
    filter: Parameters<typeof billsFor>[1] = {},
    signal?: AbortSignal,
  ) {
    const result = await this.bills(undefined, signal);
    return { ...result, data: cached(billsFor(result.data, filter), [result]) };
  }
  /** One Today feed in a Block, never rejecting: a failed read is an error. */
  private async todayBlock<T, V>(
    pending: Promise<RecordResult<T>>,
    select: (data: T) => Block<V>,
    signal?: AbortSignal,
  ): Promise<Block<V>> {
    try {
      const record = await pending;
      const selected = select(record.data);
      return {
        ...selected,
        ...recordFlags([selected, record]),
        stale: record.stale || selected.stale,
        savedAt:
          selected.savedAt === null
            ? record.savedAt
            : Math.min(record.savedAt, selected.savedAt),
      };
    } catch (e) {
      throwIfAborted(signal);
      return {
        data: null,
        status: 'error',
        error:
          e instanceof ApiError
            ? e
            : new ApiError('invalid-data', 'This catalog could not be read.'),
        sources: [],
        asAt: null,
        stale: false,
        savedAt: null,
      };
    }
  }
  /**
   * Today's Bills block: the newest introduced (`new`) or passed (`passed`)
   * bills from the bills index alone, so the block never waits for the
   * declarations or the roster.
   */
  todayBills(
    limit = 3,
    kind: RecentBillsKind = 'new',
    refresh = false,
    signal?: AbortSignal,
  ) {
    return this.todayBlock(
      this.bills(refresh, signal),
      (data) => recentBillsFor(data, limit, kind),
      signal,
    );
  }
  /**
   * Today's Just declared block from the recent-declarations file alone:
   * names, words and dates draw at once. Parties and places join in a second
   * pass (`todayDeclarationsJoined`), when the roster answers.
   */
  todayDeclarations(limit = 3, refresh = false, signal?: AbortSignal) {
    return this.todayBlock(
      this.client.get(
        '/interests/recent.json',
        decode.decodeRecentInterests,
        refresh,
        { signal },
      ),
      (interests) => recentDeclarationsFor(interests, limit),
      signal,
    );
  }
  /**
   * The same entries with the roster joined (party and chamber), for the
   * second pass. A failed roster read leaves the entries as the first pass
   * drew them.
   */
  async todayDeclarationsJoined(
    limit = 3,
    refresh = false,
    metadata?: Promise<RecordResult<decode.Roster> | null>,
    signal?: AbortSignal,
  ) {
    const rosterPending =
      metadata ??
      this.roster(refresh, signal).catch(() => {
        throwIfAborted(signal);
        return null;
      });
    const pending = this.client.get(
      '/interests/recent.json',
      decode.decodeRecentInterests,
      refresh,
      { signal },
    );
    // Attach the load handler immediately, including when the roster is slow.
    return this.todayBlock(
      pending.then(async (record) => {
        const roster = await rosterPending;
        return { ...record, data: { interests: record.data, roster } };
      }),
      ({ interests, roster }) =>
        cached(
          recentDeclarationsFor(interests, limit, { roster: roster?.data }),
          roster ? [roster] : [],
        ),
      signal,
    );
  }
  /**
   * Just declared on Today, second pass: the newest entries with the roster
   * joined and each member's profile slug, so the member's row opens their
   * profile. The same reads as the feed (all cached for Today's other
   * blocks but the interest index), cut to `limit` rows.
   */
  async todayDeclarationsProfiled(
    limit = 3,
    refresh = false,
    signal?: AbortSignal,
  ) {
    const feed = await this.declarations(refresh, signal);
    return { ...feed, data: feed.data ? feed.data.slice(0, limit) : null };
  }
  /**
   * How parliament voted: `/divisions/recent.json` (data lane D1). A file
   * that is not there yet (404), or was never saved on an offline device,
   * is `missing`: the block is absent, never empty. Any other failure is an
   * error the block states.
   */
  async recentDivisions(
    refresh = false,
    signal?: AbortSignal,
  ): Promise<Block<RecentDivisions> | { status: 'missing' }> {
    try {
      const record = await this.client.get(
        '/divisions/recent.json',
        decodeRecentDivisions,
        refresh,
        { signal },
      );
      return {
        data: record.data,
        status: 'ready',
        sources: [
          {
            label: 'They Vote For You',
            url: 'https://theyvoteforyou.org.au/divisions',
          },
        ],
        asAt: record.data.generated_at,
        ...recordFlags([record]),
        stale: record.stale,
        savedAt: record.savedAt,
      };
    } catch (e) {
      throwIfAborted(signal);
      if (
        e instanceof ApiError &&
        (e.code === 'not-found' || e.code === 'offline')
      )
        return { status: 'missing' };
      return {
        data: null,
        status: 'error',
        error:
          e instanceof ApiError
            ? e
            : new ApiError('invalid-data', 'This catalog could not be read.'),
        sources: [],
        asAt: null,
        stale: false,
        savedAt: null,
      };
    }
  }
  /**
   * The federal sitting calendar behind the line under Today's date
   * (`/parliament/sitting-days.json`). Saved like every catalog, so the last
   * copy that passed the decoder answers offline (marked stale). A file
   * that is not there (404), was never saved, or fails the strict decoder
   * with nothing good saved is null: no line, never an error on Today.
   */
  async sittingDays(
    refresh = false,
    signal?: AbortSignal,
  ): Promise<RecordResult<SittingDays> | null> {
    try {
      return await this.client.get(
        sittingDaysPath,
        decodeSittingDays,
        refresh,
        { signal },
      );
    } catch {
      throwIfAborted(signal);
      return null;
    }
  }
  /**
   * W13: the newest posted daily edition, through the catalog cache like every
   * other read, so a saved copy stays readable offline and is marked stale.
   * A 404 is authoritative absence: it is saved in the edition's place (with
   * its own time and max-age), so the block is `missing` and the card absent,
   * now, after a relaunch and offline. Nothing is composed when a read fails.
   */
  async todayEdition(
    refresh: boolean | 'background' = false,
    signal?: AbortSignal,
  ): Promise<Block<EditionView>> {
    const empty = { sources: [], asAt: null, stale: false, savedAt: null };
    try {
      const record = await this.client.get(
        editionPath,
        decode.decodeEditionRead,
        refresh === true,
        { signal, absence: true, background: refresh === 'background' },
      );
      if ('absent' in record.data)
        return {
          ...empty,
          data: null,
          status: 'missing',
          stale: record.stale,
          savedAt: record.stale ? record.savedAt : null,
        };
      return {
        ...editionFor(record.data),
        ...recordFlags([record]),
        stale: record.stale,
        savedAt: record.savedAt,
      };
    } catch (e) {
      throwIfAborted(signal);
      return {
        ...empty,
        data: null,
        status: 'error',
        error:
          e instanceof ApiError
            ? e
            : new ApiError(
                'invalid-data',
                'The daily edition could not be read.',
              ),
      };
    }
  }
  /**
   * Local follows (src/features/follows): the shared catalogs their change
   * markers read. Nothing is read per followed record, so following many
   * items never crowds the bounded cache. `refresh` revalidates each file,
   * as a pull to refresh does. Each file fails on its own: a missing one
   * leaves its markers unchecked instead of failing the others.
   */
  async followSources(
    needs: {
      people?: boolean;
      bills?: boolean;
      electorates?: boolean;
      parties?: boolean;
    },
    refresh = false,
    signal?: AbortSignal,
  ) {
    const records: RecordResult<unknown>[] = [];
    const errors: ApiError[] = [];
    const read = async <T>(
      wanted: boolean | undefined,
      path: string,
      decoder: Decoder<T>,
    ): Promise<T | null> => {
      if (!wanted) return null;
      try {
        const record = await this.client.get(path, decoder, refresh, {
          signal,
        });
        records.push(record);
        if (record.partial || isPartialCatalog(record.data)) {
          errors.push(
            new ApiError('invalid-data', 'Some records could not be read.'),
          );
          return null;
        }
        return record.data;
      } catch (e) {
        throwIfAborted(signal);
        errors.push(
          e instanceof ApiError
            ? e
            : new ApiError('invalid-data', 'This catalog could not be read.'),
        );
        return null;
      }
    };
    const seats = needs.people || needs.electorates;
    const [
      manifest,
      roster,
      slugs,
      bills,
      votes,
      interestIndex,
      pay,
      expenses,
    ] = await Promise.all([
      read(seats, '/electorates/manifest.json', decode.decodeManifest),
      read(needs.people, '/parliamentarians.json', decode.decodeRoster),
      read(needs.people, '/api/person-slugs', decode.decodeSlugs),
      read(needs.bills, '/bills/index.json', decode.decodeBillIndex),
      read(needs.people, '/votes.json', decode.decodeVotes),
      read(needs.people, '/interests/index.json', decode.decodeInterestIndex),
      read(needs.people, '/pay.json', decode.decodePay),
      read(needs.people, '/expenses.json', decode.decodeExpenses),
    ]);
    const [people, electorates] = await Promise.all([
      read(
        needs.people && !!manifest,
        manifest?.people_url ?? '',
        decode.decodePeople,
      ),
      read(
        seats && !!manifest,
        manifest?.index_url ?? '',
        decode.decodeElectorateIndex,
      ),
    ]);
    const money = await read(
      needs.parties,
      '/graph/money.json',
      decode.decodeMoney,
    );
    // Seats and people from two different releases never answer who sits where.
    const sameRelease = (release: string | undefined) =>
      release !== undefined && release === manifest?.release_id;
    if (
      (people && !sameRelease(people.meta.release_id)) ||
      (electorates && !sameRelease(electorates.meta.release_id))
    )
      errors.push(
        new ApiError(
          'invalid-data',
          'The electorate release is incomplete. Try again.',
        ),
      );
    return {
      manifest,
      roster,
      slugs,
      people: people && sameRelease(people.meta.release_id) ? people : null,
      electorates:
        electorates && sameRelease(electorates.meta.release_id)
          ? electorates
          : null,
      bills,
      votes,
      interestIndex,
      pay,
      expenses,
      money,
      ...recordFlags(records),
      stale: records.some((r) => r.stale),
      savedAt: records.length
        ? Math.min(...records.map((r) => r.savedAt))
        : null,
      error: errors[0] ?? null,
    };
  }
  async directory(refresh = false, signal?: AbortSignal) {
    const [manifest, roster, slugs] = await Promise.all([
      this.manifest(refresh, signal),
      this.roster(refresh, signal),
      this.slugs(refresh, signal),
    ]);
    const [people, electorates] = await Promise.all([
      this.people(manifest.data, refresh, signal),
      this.electorates(manifest.data, refresh, signal),
    ]);
    if (
      people.data.meta.release_id !== manifest.data.release_id ||
      electorates.data.meta.release_id !== manifest.data.release_id
    )
      throw new ApiError(
        'invalid-data',
        'The electorate release is incomplete. Try again.',
      );
    return { manifest, roster, slugs, people, electorates };
  }
  async yourMP(
    id: string,
    chosenStateSeats: string[] = [],
    signal?: AbortSignal,
  ) {
    const directory = await this.directory(undefined, signal);
    const view = yourMPFor(
      id,
      directory.electorates.data,
      directory.manifest.data,
      chosenStateSeats,
    );
    const records = [directory.electorates, directory.manifest];
    view.seat = cached(view.seat, records);
    view.members = cached(view.members, records);
    view.senators = view.senators.map((block) => cached(block, records));
    view.stateMembers = view.stateMembers.map((block) =>
      cached(block, records),
    );
    return view;
  }
  async electorateFor(path: string, signal?: AbortSignal) {
    const result = await this.electorate(path, signal);
    const view = electorateFor(result.data);
    for (const block of [
      view.identity,
      view.representatives,
      ...view.elections,
      ...view.census,
    ]) {
      block.stale = result.stale;
      block.savedAt = result.savedAt;
      Object.assign(block, recordFlags([result]));
    }
    return { ...result, data: view };
  }
  suggestionSources(
    refresh = false,
    signal?: AbortSignal,
  ): Promise<SuggestionSources> {
    const now = Date.now();
    const expired =
      this.suggestionLoadedAt !== undefined &&
      (now < this.suggestionLoadedAt ||
        now - this.suggestionLoadedAt >= 86400000);
    if (expired) this.suggestionIdentityRetry = 'unused';
    if (refresh || expired) this.suggestionLoadedAt = undefined;
    return this.suggestionReads.read(
      'sources',
      async (signal) => {
        const generation = ++this.suggestionGeneration;
        this.suggestionLoadedAt = undefined;
        const sources = await (async () => {
          const [manifest, roster, bills, slugs] = await Promise.all([
            this.client.get(
              '/electorates/manifest.json',
              decode.decodeManifest,
              refresh,
              { signal },
            ),
            this.client
              .get('/parliamentarians.json', decode.decodeRoster, refresh, {
                signal,
              })
              .catch(() => {
                throwIfAborted(signal);
                return null;
              }),
            this.bills(refresh, signal),
            this.client
              .get('/api/person-slugs', decode.decodeSlugs, refresh, { signal })
              .catch(() => {
                throwIfAborted(signal);
                return null;
              }),
          ]);
          const [electorates, people] = await Promise.all([
            this.client.get(
              manifest.data.index_url,
              decode.decodeElectorateIndex,
              refresh,
              { signal },
            ),
            this.client
              .get(manifest.data.people_url, decode.decodePeople, refresh, {
                signal,
              })
              .then((record) =>
                record.data.meta.release_id === manifest.data.release_id
                  ? record
                  : null,
              )
              .catch(() => {
                throwIfAborted(signal);
                return null;
              }),
          ]);
          if (electorates.data.meta.release_id !== manifest.data.release_id)
            throw new ApiError(
              'invalid-data',
              'The electorate records are out of step. Try again shortly.',
            );
          const provenance = suggestionProvenanceFor({
            people: roster?.asOf ?? null,
            electorates: electorates.asOf ?? manifest.asOf,
            bills: bills.asOf,
          });
          return {
            roster: memberSuggestionRoster(
              roster?.data ?? {
                meta: { generated: '' },
                people: [],
              },
              {
                roster: roster?.data,
                manifest: manifest.data,
                slugs: slugs?.data,
                people: people?.data,
              },
            ),
            manifest: manifest.data,
            slugs: slugs?.data,
            people: people?.data,
            electorates: electorates.data,
            bills: bills.data,
            provenance: {
              people: cached(
                {
                  ...provenance.people,
                  sources:
                    roster && slugs && people
                      ? [
                          ...provenance.people.sources,
                          ...provenance.electorates.sources,
                        ]
                      : provenance.people.sources,
                },
                [
                  ...(roster ? [roster] : []),
                  ...(roster && slugs && people
                    ? [slugs, people, manifest]
                    : []),
                ],
              ),
              electorates: cached(provenance.electorates, [
                manifest,
                electorates,
              ]),
              bills: cached(provenance.bills, [bills]),
            },
          };
        })();
        throwIfAborted(signal);
        if (generation === this.suggestionGeneration) {
          this.suggestionLoadedAt = Date.now();
          if (this.suggestionIdentityRetry !== 'used')
            this.suggestionIdentityRetry =
              sources.slugs && sources.people && sources.roster.people.length
                ? 'unused'
                : 'available';
        }
        return sources;
      },
      { fresh: refresh || expired, signal },
    );
  }
  /** One automatic identity recovery per session, triggered by a later focus. */
  suggestionSourcesOnFocus(signal?: AbortSignal): Promise<SuggestionSources> {
    if (this.suggestionIdentityRetry === 'available') {
      this.suggestionIdentityRetry = 'used';
      return this.suggestionSources(true, signal);
    }
    return this.suggestionSources(undefined, signal);
  }
  async suggestions(query: string, signal?: AbortSignal) {
    const sources = await this.suggestionSources(undefined, signal);
    return suggestionsFor(
      query,
      sources.roster,
      sources.electorates,
      sources.bills,
    );
  }
  async profileFor(
    id: PersonId,
    options: { includeInterests?: boolean } = {},
    signal?: AbortSignal,
  ) {
    personId(id);
    return this.assembleProfile(
      (data) => profileFor(id, data),
      options,
      signal,
    );
  }
  /** A former member outside the dated release, by their roster identity. */
  async rosterProfileFor(
    identity: PersonProfile,
    options: { includeInterests?: boolean } = {},
    signal?: AbortSignal,
  ) {
    return this.assembleProfile(
      (data) => rosterProfileFor(identity, data),
      options,
      signal,
    );
  }
  private async assembleProfile<
    P extends
      | ReturnType<typeof profileFor>
      | ReturnType<typeof rosterProfileFor>,
  >(
    compute: (data: ProfileCatalogs) => P,
    options: { includeInterests?: boolean },
    signal?: AbortSignal,
  ): Promise<P> {
    const directory = await this.directory(undefined, signal);
    const records = new Map<string, RecordResult<unknown>>(),
      errors: Record<string, ApiError> = {};
    const load = async <T>(
      key: string,
      pending: Promise<RecordResult<T>>,
    ): Promise<T | undefined> => {
      try {
        const result = await pending;
        records.set(key, result);
        return result.data;
      } catch (e) {
        throwIfAborted(signal);
        errors[key] =
          e instanceof ApiError
            ? e
            : new ApiError('invalid-data', 'This catalog could not be read.');
        return undefined;
      }
    };
    const [
      votes,
      bills,
      interestIndex,
      pay,
      expenses,
      expenseCategories,
      photoPeople,
      photoCredits,
    ] = await Promise.all([
      load('votes', this.votes(signal)),
      load('bills', this.bills(undefined, signal)),
      load('interestIndex', this.interestIndex(signal)),
      load('pay', this.pay(signal)),
      load('expenses', this.expenses(signal)),
      load('expenseCategories', this.expenseCategories(signal)),
      load('photoPeople', this.photoPeople(undefined, signal)),
      load('photoCredits', this.photoCredits(undefined, signal)),
    ]);
    const data: ProfileCatalogs = {
      manifest: directory.manifest.data,
      roster: directory.roster.data,
      slugs: directory.slugs.data,
      people: directory.people.data,
      votes,
      bills,
      interestIndex,
      pay,
      expenses,
      expenseCategories,
      photoPeople,
      photoCredits,
    };
    const initial = compute(data);
    const interest =
      options.includeInterests !== false && initial.interestKey
        ? await load('interests', this.interests(initial.interestKey, signal))
        : undefined;
    const profile = compute({ ...data, interest });
    for (const [key, block] of Object.entries(profile.blocks)) {
      const dependencies: Record<string, string[]> = {
        identity: [],
        votes: ['votes'],
        interests: ['interestIndex', 'interests'],
        ties: ['interestIndex', 'interests'],
        pay: ['pay'],
        expenses: ['expenses', 'expenseCategories'],
        portrait: ['photoPeople', 'photoCredits'],
        partyReceipts: [],
      };
      const keys = dependencies[key] ?? [];
      const failure = keys.map((k) => errors[k]).find(Boolean);
      if (failure) {
        block.status = 'error';
        block.error = failure;
        block.data = null;
      }
      const cached = keys
        .map((k) => records.get(k))
        .filter((r): r is RecordResult<unknown> => r !== undefined);
      Object.assign(block, recordFlags(cached));
      block.stale = cached.some((r) => r.stale);
      block.savedAt = cached.length
        ? Math.min(...cached.map((r) => r.savedAt))
        : null;
    }
    Object.assign(
      profile.blocks.identity,
      recordFlags(Object.values(directory)),
    );
    profile.blocks.identity.stale = Object.values(directory).some(
      (r) => r.stale,
    );
    profile.blocks.identity.savedAt = Math.min(
      ...Object.values(directory).map((r) => r.savedAt),
    );
    return profile;
  }
  async search(
    query: string,
    kind: CatalogKind = 'person',
    page = 1,
    signal?: AbortSignal,
  ) {
    const params = new URLSearchParams({
      q: query,
      kind,
      // The API exposes one bounded 200-row relevance window. Fetch that
      // window for people, then filter and paginate the verified set locally.
      page: kind === 'person' ? '1' : String(page),
      per: kind === 'person' ? '200' : '20',
    });
    const [result, slugs] = await Promise.all([
      this.client.get(`/api/search-all?${params}`, decode.decodeSearch, false, {
        signal,
      }),
      this.slugs(undefined, signal),
    ]);
    const bridge =
      kind === 'interest'
        ? await Promise.all([
            this.interestIndex(signal),
            this.manifest(undefined, signal),
          ])
        : undefined;
    const people = bridge
      ? await this.people(bridge[1].data, undefined, signal)
      : undefined;
    if (people && people.data.meta.release_id !== bridge![1].data.release_id)
      throw new ApiError(
        'invalid-data',
        'The people records are out of step. Try again shortly.',
      );
    const membership =
      kind === 'person' ||
      result.data.results.some((row) =>
        ['person', 'interest', 'pay', 'expense'].includes(row.kind),
      )
        ? await Promise.all([
            this.roster(undefined, signal),
            bridge?.[1] ?? this.manifest(undefined, signal),
          ])
            .then(async ([roster, manifest]) => ({
              roster,
              manifest,
              people:
                people ?? (await this.people(manifest.data, undefined, signal)),
            }))
            .catch(() => {
              throwIfAborted(signal);
              return null;
            })
        : null;
    const memberCatalogs = {
      roster: membership?.roster.data,
      manifest: membership?.manifest.data,
      people: membership?.people.data,
      slugs: slugs.data,
    };
    const records = [
      result,
      slugs,
      ...(bridge ?? []),
      ...(people ? [people] : []),
      ...(membership ? Object.values(membership) : []),
    ];
    const readableRows = result.data.results.filter(
      (row) => !row.href.startsWith('/ask'),
    );
    const rows =
      kind === 'person'
        ? memberSearchResults(readableRows, memberCatalogs, query)
        : memberSearchRows(readableRows, memberCatalogs);
    const total = kind === 'person' ? rows.length : result.data.total;
    const currentPage =
      kind === 'person'
        ? Math.min(Math.max(1, page), Math.max(1, Math.ceil(total / 20)))
        : result.data.page;
    const pageRows =
      kind === 'person'
        ? rows.slice((currentPage - 1) * 20, currentPage * 20)
        : rows;
    // A verified surname keeps its original display route, so the portrait
    // index can refuse a face for that short label. Navigation still resolves
    // that route to the same canonical native identity.
    const surnameNames = new Set(
      kind === 'person' && memberCatalogs.roster
        ? memberSuggestionRoster(memberCatalogs.roster, memberCatalogs)
            .people.filter(
              (person) => person.full && !/\s/.test(person.name.trim()),
            )
            .map((person) => person.name)
        : [],
    );
    return {
      ...result,
      ...recordFlags(records),
      stale: records.some((r) => r.stale),
      savedAt: Math.min(...records.map((r) => r.savedAt)),
      data: {
        ...result.data,
        total,
        page: currentPage,
        per_page: kind === 'person' ? 20 : result.data.per_page,
        results: pageRows.map((row) => {
          const candidate = personSlugForResult(
            row,
            slugs.data,
            bridge?.[0].data,
            people?.data,
          );
          // Keep every non-person record, but only offer a native member link.
          const nativeSlug =
            row.kind === 'person'
              ? memberSlugFor(row, memberCatalogs)
              : candidate &&
                memberSlugFor(
                  {
                    ...row,
                    kind: 'person',
                    title: slugs.data.slugs[candidate]!,
                    href: `/subject/person/${candidate}`,
                  },
                  memberCatalogs,
                );
          const personSlug =
            row.kind === 'person' &&
            nativeSlug &&
            candidate &&
            surnameNames.has(row.title) &&
            slugs.data.slugs[candidate] === row.title
              ? candidate
              : nativeSlug;
          return {
            ...row,
            personSlug,
            // The verified slug bridge also resolves formal register names.
            profileName: nativeSlug ? slugs.data.slugs[nativeSlug] : undefined,
          };
        }),
      },
    };
  }
  async person(
    slug: string,
    signal?: AbortSignal,
  ): Promise<RecordResult<PersonProfile>> {
    const directory = await this.directory(undefined, signal);
    const { slugs, roster, manifest, people } = directory;
    // Identifier-only handoff to the profile lane. Keep the existing slug route
    // working while allowing callers to carry the canonical person ID.
    if (slug.startsWith('person_')) {
      slug = personSlugForId(
        personId(slug),
        slugs.data,
        roster.data,
        people.data,
        manifest.data,
      );
    }
    return {
      data: joinPerson(
        slug,
        slugs.data,
        roster.data,
        people.data,
        manifest.data,
      ),
      ...recordFlags(Object.values(directory)),
      stale: Object.values(directory).some((r) => r.stale),
      savedAt: Math.min(...Object.values(directory).map((r) => r.savedAt)),
      asOf: people.asOf ?? manifest.asOf,
    };
  }
}
