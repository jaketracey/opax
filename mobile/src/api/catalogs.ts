import type { ApiClient, RecordResult } from './client';
import { ApiError } from './errors';
import {
  joinPerson,
  personSlugForResult,
  type PersonProfile,
} from './person-identity';
import { editionPath, type CatalogKind } from './policy';
import * as decode from './catalog-decoders';
import type { Decoder } from './validation';
import type { Manifest } from './catalog-decoders';
import { billKey, interestKey, personId, nameKey, type PersonId } from './ids';
import {
  declarationProfilesFor,
  profileFor,
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
function cached<T>(
  block: Block<T>,
  records: RecordResult<unknown>[],
): Block<T> {
  return {
    ...block,
    stale: records.some((r) => r.stale),
    savedAt: records.length
      ? Math.min(...records.map((r) => r.savedAt))
      : block.savedAt,
  };
}
export class Catalogs {
  private suggestionData?: Promise<SuggestionSources>;
  private suggestionIdentityRetry: 'unused' | 'available' | 'used' = 'unused';
  constructor(private client: Pick<ApiClient, 'get'>) {}
  roster() {
    return this.client.get('/parliamentarians.json', decode.decodeRoster);
  }
  slugs() {
    return this.client.get('/api/person-slugs', decode.decodeSlugs);
  }
  manifest() {
    return this.client.get('/electorates/manifest.json', decode.decodeManifest);
  }
  people(manifest: Manifest) {
    return this.client.get(manifest.people_url, decode.decodePeople);
  }
  electorates(manifest: Manifest) {
    return this.client.get(manifest.index_url, decode.decodeElectorateIndex);
  }
  electorate(path: string) {
    return this.client.get(path, decode.decodeElectorate);
  }
  bills() {
    return this.client.get('/bills/index.json', decode.decodeBillIndex);
  }
  bill(key: string) {
    return this.client.get(`/bills/${billKey(key)}.json`, decode.decodeBill);
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
  photoPeople() {
    return this.client.get('/photos/people.json', decode.decodePhotoPeople);
  }
  photoCredits() {
    return this.client.get('/photos/credits.json', decode.decodePhotoCredits);
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
   * row of /interests/recent.json, newest first, with Today's party and
   * portrait joins and the profile slug of each member the register's ID
   * bridge resolves. Joins are optional: without them a row keeps its text
   * and source, and shows no party, portrait or profile link.
   */
  async declarations(refresh = false) {
    const record = await this.client.get(
      '/interests/recent.json',
      decode.decodeRecentInterests,
      refresh,
    );
    const optional = <T>(path: string, decoder: Decoder<T>) =>
      this.client.get(path, decoder, refresh).catch(() => null);
    const [roster, photoPeople, photoCredits, slugs, interestIndex, manifest] =
      await Promise.all([
        optional('/parliamentarians.json', decode.decodeRoster),
        optional('/photos/people.json', decode.decodePhotoPeople),
        optional('/photos/credits.json', decode.decodePhotoCredits),
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
      photoPeople: photoPeople?.data,
      photoCredits: photoCredits?.data,
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
      ...[
        roster,
        photoPeople,
        photoCredits,
        slugs,
        interestIndex,
        manifest,
        people,
      ].filter((r) => r !== null),
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
  async billFor(key: string) {
    const [bill, index] = await Promise.all([this.bill(key), this.bills()]);
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
    }
    view.divisions = cached(view.divisions, [bill, index]);
    return {
      ...bill,
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
    const metadata = Promise.all([
      optional('/parliamentarians.json', decode.decodeRoster),
      optional('/photos/people.json', decode.decodePhotoPeople),
      optional('/photos/credits.json', decode.decodePhotoCredits),
    ]);
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
            const [roster, photoPeople, photoCredits] = await metadata;
            return {
              ...record,
              data: {
                interests: record.data,
                roster,
                photoPeople,
                photoCredits,
              },
            };
          }),
          ({ interests, roster, photoPeople, photoCredits }) =>
            cached(
              recentDeclarationsFor(interests, limit, {
                roster: roster?.data,
                photoPeople: photoPeople?.data,
                photoCredits: photoCredits?.data,
              }),
              [roster, photoPeople, photoCredits].filter((r) => r !== null),
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
  async directory() {
    const [manifest, roster, slugs] = await Promise.all([
      this.manifest(),
      this.roster(),
      this.slugs(),
    ]);
    const [people, electorates] = await Promise.all([
      this.people(manifest.data),
      this.electorates(manifest.data),
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
          this.client.get(
            '/parliamentarians.json',
            decode.decodeRoster,
            refresh,
          ),
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
          people: roster.asOf,
          electorates: electorates.asOf ?? manifest.asOf,
          bills: bills.asOf,
        });
        return {
          roster: roster.data,
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
                  slugs && people
                    ? [
                        ...provenance.people.sources,
                        ...provenance.electorates.sources,
                      ]
                    : provenance.people.sources,
              },
              [roster, ...(slugs && people ? [slugs, people, manifest] : [])],
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
              sources.slugs && sources.people ? 'unused' : 'available';
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
    const initial = profileFor(id, data);
    const interest =
      options.includeInterests !== false && initial.interestKey
        ? await load('interests', this.interests(initial.interestKey))
        : undefined;
    const profile = profileFor(id, { ...data, interest });
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
      block.stale = cached.some((r) => r.stale);
      block.savedAt = cached.length
        ? Math.min(...cached.map((r) => r.savedAt))
        : null;
    }
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
      page: String(page),
      per: '20',
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
    const records = [
      result,
      slugs,
      ...(bridge ?? []),
      ...(people ? [people] : []),
    ];
    return {
      ...result,
      stale: records.some((r) => r.stale),
      savedAt: Math.min(...records.map((r) => r.savedAt)),
      data: {
        ...result.data,
        results: result.data.results
          .filter((row) => !row.href.startsWith('/ask'))
          .map((row) => {
            const personSlug = personSlugForResult(
              row,
              slugs.data,
              bridge?.[0].data,
              people?.data,
            );
            return {
              ...row,
              personSlug,
              // The verified slug bridge also resolves formal register names.
              profileName: personSlug
                ? slugs.data.slugs[personSlug]
                : undefined,
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
      const id = personId(slug);
      const person = people.data.people.find((p) => p.person_id === id);
      const names = new Set(
        [person?.name, ...(person?.aliases ?? [])]
          .filter(Boolean)
          .map((name) => nameKey(name!)),
      );
      const resolved = Object.keys(slugs.data.slugs).filter((key) => {
        if (!names.has(nameKey(slugs.data.slugs[key]!))) return false;
        try {
          return (
            joinPerson(key, slugs.data, roster.data, people.data, manifest.data)
              .canonicalPersonId === id
          );
        } catch {
          return false;
        }
      });
      if (!resolved.length)
        throw new ApiError(
          'not-found',
          'This person is not in the public directory.',
        );
      slug =
        resolved.find((key) => slugs.data.slugs[key] === person?.name) ??
        resolved[0]!;
    }
    return {
      data: joinPerson(
        slug,
        slugs.data,
        roster.data,
        people.data,
        manifest.data,
      ),
      stale: Object.values(directory).some((r) => r.stale),
      savedAt: Math.min(...Object.values(directory).map((r) => r.savedAt)),
      asOf: people.asOf ?? manifest.asOf,
    };
  }
}
export * from './person-identity';
