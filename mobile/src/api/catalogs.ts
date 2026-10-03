import type { ApiClient, RecordResult } from './client';
import { ApiError } from './errors';
import {
  joinPerson,
  personSlugForResult,
  type PersonProfile,
} from './person-identity';
import type { CatalogKind } from './policy';
import * as decode from './catalog-decoders';
import type { Manifest } from './catalog-decoders';
import { billKey, interestKey, personId, nameKey, type PersonId } from './ids';
import {
  profileFor,
  recentBillsFor,
  recentDeclarationsFor,
  yourMPFor,
  electorateFor,
  suggestionsFor,
  billFor,
  billsFor,
  coverageFor,
  type Block,
  type ProfileCatalogs,
} from './selectors';
export * from './catalog-decoders';
export * from './ids';
export * from './selectors';

interface SuggestionSources {
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
    savedAt: Math.min(...records.map((r) => r.savedAt)),
  };
}
export class Catalogs {
  private suggestionData?: Promise<SuggestionSources>;
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
        return {
          ...select(record.data),
          stale: record.stale,
          savedAt: record.savedAt,
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
    const [bills, declarations] = await Promise.all([
      load(
        this.client.get('/bills/index.json', decode.decodeBillIndex, refresh),
        (data) => recentBillsFor(data, limit),
      ),
      load(
        this.client.get(
          '/interests/recent.json',
          decode.decodeRecentInterests,
          refresh,
        ),
        (data) => recentDeclarationsFor(data, limit),
      ),
    ]);
    return { bills, declarations };
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
        const [manifest, roster, bills] = await Promise.all([
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
        ]);
        const electorates = await this.client.get(
          manifest.data.index_url,
          decode.decodeElectorateIndex,
          refresh,
        );
        if (electorates.data.meta.release_id !== manifest.data.release_id)
          throw new ApiError(
            'invalid-data',
            'The seat release does not match its manifest.',
          );
        return {
          roster: roster.data,
          electorates: electorates.data,
          bills: bills.data,
          provenance: {
            people: cached(
              {
                data: null,
                status: 'ready',
                asAt: roster.asOf,
                sources: [
                  {
                    label: 'OPAX parliamentary roster',
                    url: '/subject/person',
                  },
                ],
                stale: false,
                savedAt: null,
              },
              [roster],
            ),
            electorates: cached(
              {
                data: null,
                status: 'ready',
                asAt: electorates.asOf ?? manifest.asOf,
                sources: [
                  {
                    label: 'OPAX electorate release',
                    url: '/subject/electorate',
                  },
                ],
                stale: false,
                savedAt: null,
              },
              [manifest, electorates],
            ),
            bills: cached(
              {
                data: null,
                status: 'ready',
                asAt: bills.asOf,
                sources: [
                  {
                    label: 'ParlInfo bill records',
                    url: 'https://parlinfo.aph.gov.au/',
                  },
                ],
                stale: false,
                savedAt: null,
              },
              [bills],
            ),
          },
        };
      })();
      this.suggestionData = pending;
      void pending.catch(() => {
        if (this.suggestionData === pending) this.suggestionData = undefined;
      });
    }
    return this.suggestionData;
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
  async profileFor(id: PersonId) {
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
    const interest = initial.interestKey
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
          .map((row) => ({
            ...row,
            personSlug: personSlugForResult(
              row,
              slugs.data,
              bridge?.[0].data,
              people?.data,
            ),
          })),
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
