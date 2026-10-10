import type { ApiClient, RecordResult } from './client';
import { decodePartyFile } from '../features/directories/party-file';
import {
  partyLabels,
  resolveParty,
  partyMembers,
  partyMoney,
  recentPartyBills,
  partyDivisions,
} from './party-page';
import { samePartyLabel } from '../design/party';
import { ApiError } from './errors';
import {
  memberSearchResults,
  memberSearchRows,
  memberSlugFor,
  memberSuggestionRoster,
} from './catalog-search';
import {
  joinPerson,
  personSlugForId,
  personSlugForResult,
  type PersonProfile,
} from './person-identity';
import { editionPath, type CatalogKind } from './policy';
import * as decode from './catalog-decoders';
import { isPartialCatalog, type Decoder } from './validation';
import type { Manifest } from './catalog-decoders';
import { billKey, interestKey, personId, type PersonId } from './ids';
import {
  declarationProfilesFor,
  profileFor,
  rosterProfileFor,
  recentBillsFor,
  recentDeclarationsFor,
  suggestionProvenanceFor,
  yourMPFor,
  electorateFor,
  suggestionsFor,
  billFor,
  billsFor,
  coverageFor,
  editionFor,
  type Block,
  type EditionView,
  type ProfileCatalogs,
} from './selectors';
export * from './catalog-decoders';
export * from './ids';
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
  private suggestionData?: Promise<SuggestionSources>;
  private suggestionIdentityRetry: 'unused' | 'available' | 'used' = 'unused';
  constructor(private client: Pick<ApiClient, 'get'>) {}
  async partyPage(
    input: string,
    refresh = false,
    publish?: (record: PartyPageRecord) => void,
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
        return failedPartyBlock(e);
      }
    };
    // Optional reads start after publishing the core; each settles independently.
    const readMoney = () =>
      read(
        this.client.get('/graph/money.json', decode.decodeMoney, refresh),
        'AEC disclosure returns, CC BY 4.0',
      );
    const readEntities = () =>
      read(
        this.client.get(
          '/graph/aec-extras.json',
          decode.decodeAecExtras,
          refresh,
        ),
        'AEC Transparency Register, CC BY 4.0',
      );
    const readVotes = () =>
      read(
        (async () => {
          const index = await this.bills(refresh);
          const files: RecordResult<decode.BillDetail>[] = [];
          const candidates = recentPartyBills(index.data);
          let failed = 0;
          for (let i = 0; i < candidates.length && files.length < 32; i += 8) {
            const batch = await Promise.allSettled(
              candidates.slice(i, i + 8).map((b) => this.bill(b.key, refresh)),
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
        this.roster(refresh),
        this.slugs(refresh),
        this.manifest(refresh),
      ]);
      const people = await this.people(manifest.data, refresh);
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
          this.partyFile('qld', refresh),
          this.partyFile('vic', refresh),
        ]);
        label = resolveParty(input, stateParties.flatMap((result) =>
          result.status === 'fulfilled'
            ? result.value.data.parties.map((party) => party.label)
            : [],
        ));
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
      ].some((b) => b.stale),
    });
    progress?.(result());
    // Give React a turn to commit the title and Members before optional decode work.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await Promise.all([
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
          progress?.(result());
        })
        .catch((error: unknown) => {
          view = { ...view, receipts: failedPartyBlock(error) };
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
          progress?.(result());
        })
        .catch((error: unknown) => {
          view = { ...view, associated: failedPartyBlock(error) };
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
          progress?.(result());
        })
        .catch((error: unknown) => {
          view = { ...view, divisions: failedPartyBlock(error) };
          progress?.(result());
        }),
    ]);
    return result();
  }

  roster(refresh = false) {
    return this.client.get(
      '/parliamentarians.json',
      decode.decodeRoster,
      refresh,
    );
  }
  partyFile(jurisdiction: 'federal' | 'qld' | 'vic', refresh = false) {
    return this.client.get(
      jurisdiction === 'federal' ? '/graph/money.json' : `/graph/money.${jurisdiction}.json`,
      decodePartyFile,
      refresh,
    );
  }
  slugs(refresh = false) {
    return this.client.get('/api/person-slugs', decode.decodeSlugs, refresh);
  }
  manifest(refresh = false) {
    return this.client.get(
      '/electorates/manifest.json',
      decode.decodeManifest,
      refresh,
    );
  }
  people(manifest: Manifest, refresh = false) {
    return this.client.get(manifest.people_url, decode.decodePeople, refresh);
  }
  electorates(manifest: Manifest, refresh = false) {
    return this.client.get(
      manifest.index_url,
      decode.decodeElectorateIndex,
      refresh,
    );
  }
  electorate(path: string) {
    return this.client.get(path, decode.decodeElectorate);
  }
  bills(refresh = false) {
    return this.client.get(
      '/bills/index.json',
      decode.decodeBillIndex,
      refresh,
    );
  }
  bill(key: string, refresh = false) {
    return this.client.get(
      `/bills/${billKey(key)}.json`,
      decode.decodeBill,
      refresh,
    );
  }
  votes() {
    return this.client.get('/votes.json', decode.decodeVotes);
  }
  interestIndex() {
    return this.client.get('/interests/index.json', decode.decodeInterestIndex);
  }
  interests(key: string) {
    return this.client.get(
      `/interests/${interestKey(key)}.json`,
      decode.decodeInterest,
    );
  }
  recentInterests() {
    return this.client.get(
      '/interests/recent.json',
      decode.decodeRecentInterests,
    );
  }
  pay() {
    return this.client.get('/pay.json', decode.decodePay);
  }
  expenses() {
    return this.client.get('/expenses.json', decode.decodeExpenses);
  }
  expenseCategories() {
    return this.client.get(
      '/expense-categories.json',
      decode.decodeExpenseCategories,
    );
  }
  photoPeople(refresh = false) {
    return this.client.get(
      '/photos/people.json',
      decode.decodePhotoPeople,
      refresh,
    );
  }
  photoCredits(refresh = false) {
    return this.client.get(
      '/photos/credits.json',
      decode.decodePhotoCredits,
      refresh,
    );
  }
  corpus() {
    return this.client.get('/corpus.json', decode.decodeCorpus);
  }
  /** Leads (P1): the static discovery export, decoded whole. */
  discovery(refresh = false) {
    return this.client.get('/discovery.json', decode.decodeDiscovery, refresh);
  }
  /**
   * The declared-interests feed behind Today's recent declarations: every
   * row of /interests/recent.json, newest first, with Today's party join
   * and the profile slug of each member the register's ID bridge resolves.
   * Portraits load per row (CachedPortrait). Joins are optional: without
   * them a row keeps its text and source, and shows no party or profile link.
   */
  async declarations(refresh = false) {
    const record = await this.client.get(
      '/interests/recent.json',
      decode.decodeRecentInterests,
      refresh,
    );
    const optional = <T>(path: string, decoder: Decoder<T>) =>
      this.client.get(path, decoder, refresh).catch(() => null);
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
  async about(refresh = false) {
    const result = await this.client.get(
      '/corpus.json',
      decode.decodeCorpus,
      refresh,
    );
    return { ...result, data: cached(coverageFor(result.data), [result]) };
  }
  async billFor(key: string, refresh = false) {
    const [bill, index] = await Promise.all([
      this.bill(key, refresh),
      this.bills(refresh),
    ]);
    const view = billFor(bill.data, index.data);
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
    view.divisions = cached(view.divisions, [bill, index]);
    return {
      ...bill,
      ...recordFlags([bill, index]),
      stale: bill.stale || index.stale,
      savedAt: Math.min(bill.savedAt, index.savedAt),
      data: view,
    };
  }
  async billsFor(filter: Parameters<typeof billsFor>[1] = {}) {
    const result = await this.bills();
    return { ...result, data: cached(billsFor(result.data, filter), [result]) };
  }
  async today(limit = 6, refresh = false) {
    const load = async <T, V>(
      pending: Promise<RecordResult<T>>,
      select: (data: T) => Block<V>,
    ): Promise<Block<V>> => {
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
    };
    const optional = async <T>(path: string, decoder: Decoder<T>) =>
      this.client.get(path, decoder, refresh).catch(() => null);
    const metadata = optional('/parliamentarians.json', decode.decodeRoster);
    const [bills, declarations] = await Promise.all([
      load(
        this.client.get('/bills/index.json', decode.decodeBillIndex, refresh),
        (data) => recentBillsFor(data, limit),
      ),
      (async () => {
        const pending = this.client.get(
          '/interests/recent.json',
          decode.decodeRecentInterests,
          refresh,
        );
        // Attach the load handler immediately, including when optional metadata is slow.
        return load(
          pending.then(async (record) => {
            const roster = await metadata;
            return {
              ...record,
              data: {
                interests: record.data,
                roster,
              },
            };
          }),
          ({ interests, roster }) =>
            cached(
              recentDeclarationsFor(interests, limit, {
                roster: roster?.data,
              }),
              roster ? [roster] : [],
            ),
        );
      })(),
    ]);
    return { bills, declarations };
  }
  /**
   * W13: the newest posted daily edition, through the catalog cache like every
   * other read, so a saved copy stays readable offline and is marked stale.
   * A 404 is authoritative absence: it is saved in the edition's place (with
   * its own time and max-age), so the block is `missing` and the card absent,
   * now, after a relaunch and offline. Nothing is composed when a read fails.
   */
  async todayEdition(refresh = false): Promise<Block<EditionView>> {
    const empty = { sources: [], asAt: null, stale: false, savedAt: null };
    try {
      const record = await this.client.get(
        editionPath,
        decode.decodeEditionRead,
        refresh,
        { absence: true },
      );
      if ('absent' in record.data)
        return { ...empty, data: null, status: 'missing' };
      return {
        ...editionFor(record.data),
        ...recordFlags([record]),
        stale: record.stale,
        savedAt: record.savedAt,
      };
    } catch (e) {
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
    needs: { people?: boolean; bills?: boolean; electorates?: boolean; parties?: boolean },
    refresh = false,
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
        const record = await this.client.get(path, decoder, refresh);
        records.push(record);
        if (record.partial || isPartialCatalog(record.data)) {
          errors.push(
            new ApiError(
              'invalid-data',
              'Some rows in this export could not be read.',
            ),
          );
          return null;
        }
        return record.data;
      } catch (e) {
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
    const money = await read(needs.parties, "/graph/money.json", decode.decodeMoney);
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
  async directory(refresh = false) {
    const [manifest, roster, slugs] = await Promise.all([
      this.manifest(refresh),
      this.roster(refresh),
      this.slugs(refresh),
    ]);
    const [people, electorates] = await Promise.all([
      this.people(manifest.data, refresh),
      this.electorates(manifest.data, refresh),
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
  async yourMP(id: string, chosenStateSeats: string[] = []) {
    const directory = await this.directory();
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
  async electorateFor(path: string) {
    const result = await this.electorate(path);
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
  suggestionSources(refresh = false): Promise<SuggestionSources> {
    if (!this.suggestionData || refresh) {
      const pending = (async () => {
        const [manifest, roster, bills, slugs] = await Promise.all([
          this.client.get(
            '/electorates/manifest.json',
            decode.decodeManifest,
            refresh,
          ),
          this.client
            .get('/parliamentarians.json', decode.decodeRoster, refresh)
            .catch(() => null),
          this.client.get('/bills/index.json', decode.decodeBillIndex, refresh),
          this.client
            .get('/api/person-slugs', decode.decodeSlugs, refresh)
            .catch(() => null),
        ]);
        const [electorates, people] = await Promise.all([
          this.client.get(
            manifest.data.index_url,
            decode.decodeElectorateIndex,
            refresh,
          ),
          this.client
            .get(manifest.data.people_url, decode.decodePeople, refresh)
            .then((record) =>
              record.data.meta.release_id === manifest.data.release_id
                ? record
                : null,
            )
            .catch(() => null),
        ]);
        if (electorates.data.meta.release_id !== manifest.data.release_id)
          throw new ApiError(
            'invalid-data',
            'The seat release does not match its manifest.',
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
                ...(roster && slugs && people ? [slugs, people, manifest] : []),
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
      this.suggestionData = pending;
      void pending.then(
        (sources) => {
          if (
            this.suggestionData === pending &&
            this.suggestionIdentityRetry !== 'used'
          )
            this.suggestionIdentityRetry =
              sources.slugs && sources.people && sources.roster.people.length
                ? 'unused'
                : 'available';
        },
        () => {
          if (this.suggestionData === pending) this.suggestionData = undefined;
        },
      );
    }
    return this.suggestionData;
  }
  /** One automatic identity recovery per session, triggered by a later focus. */
  suggestionSourcesOnFocus(): Promise<SuggestionSources> {
    if (this.suggestionIdentityRetry === 'available') {
      this.suggestionIdentityRetry = 'used';
      return this.suggestionSources(true);
    }
    return this.suggestionSources();
  }
  async suggestions(query: string) {
    const sources = await this.suggestionSources();
    return suggestionsFor(
      query,
      sources.roster,
      sources.electorates,
      sources.bills,
    );
  }
  async profileFor(id: PersonId, options: { includeInterests?: boolean } = {}) {
    personId(id);
    return this.assembleProfile((data) => profileFor(id, data), options);
  }
  /** A former member outside the dated release, by their roster identity. */
  async rosterProfileFor(
    identity: PersonProfile,
    options: { includeInterests?: boolean } = {},
  ) {
    return this.assembleProfile(
      (data) => rosterProfileFor(identity, data),
      options,
    );
  }
  private async assembleProfile<
    P extends ReturnType<typeof profileFor> | ReturnType<typeof rosterProfileFor>,
  >(
    compute: (data: ProfileCatalogs) => P,
    options: { includeInterests?: boolean },
  ): Promise<P> {
    const directory = await this.directory();
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
      load('votes', this.votes()),
      load('bills', this.bills()),
      load('interestIndex', this.interestIndex()),
      load('pay', this.pay()),
      load('expenses', this.expenses()),
      load('expenseCategories', this.expenseCategories()),
      load('photoPeople', this.photoPeople()),
      load('photoCredits', this.photoCredits()),
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
        ? await load('interests', this.interests(initial.interestKey))
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
  async search(query: string, kind: CatalogKind = 'person', page = 1) {
    const params = new URLSearchParams({
      q: query,
      kind,
      // The API exposes one bounded 200-row relevance window. Fetch that
      // window for people, then filter and paginate the verified set locally.
      page: kind === 'person' ? '1' : String(page),
      per: kind === 'person' ? '200' : '20',
    });
    const [result, slugs] = await Promise.all([
      this.client.get(`/api/search-all?${params}`, decode.decodeSearch),
      this.slugs(),
    ]);
    const bridge =
      kind === 'interest'
        ? await Promise.all([this.interestIndex(), this.manifest()])
        : undefined;
    const people = bridge ? await this.people(bridge[1].data) : undefined;
    if (people && people.data.meta.release_id !== bridge![1].data.release_id)
      throw new ApiError(
        'invalid-data',
        'The person release does not match its manifest.',
      );
    const membership =
      kind === 'person' ||
      result.data.results.some((row) =>
        ['person', 'interest', 'pay', 'expense'].includes(row.kind),
      )
        ? await Promise.all([this.roster(), bridge?.[1] ?? this.manifest()])
            .then(async ([roster, manifest]) => ({
              roster,
              manifest,
              people: people ?? (await this.people(manifest.data)),
            }))
            .catch(() => null)
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
  async person(slug: string): Promise<RecordResult<PersonProfile>> {
    const directory = await this.directory();
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
export * from './person-identity';
