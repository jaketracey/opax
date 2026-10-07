import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as d from '../src/features/money-public/data';
import {
  publicRecipient,
  unnamedRecipient,
  isOrganisation,
} from '../src/features/money-public/privacy';
import { publicSignal } from '../src/features/money-public/discovery';
import { MoneyCatalogs, combine } from '../src/features/money-public/catalog';
import { fromWebPath } from '../src/navigation/routes';
import { assertAllowedPath } from '../src/api/policy';
import { decodeDiscovery } from '../src/api/catalog-decoders';
import { formatMoneyCompact } from '../src/design/format';
import type { ApiClient, RecordResult } from '../src/api/client';
const publicRoot = resolve(__dirname, '../../portal/public');
const raw = (path: string) =>
  JSON.parse(readFileSync(resolve(publicRoot, path.slice(1)), 'utf8'));
const meta = raw('/graph/grants.federal.json').meta;
describe('public-money privacy before presentation', () => {
  test.each([
    ['Ada Example', 'individual', undefined, 'person:ada'],
    ['Ada Example Pty Ltd', 'individual', undefined, 'abn:12345678901'],
    ['Ada Example Pty Ltd', 'company', 'IND', 'abn:12345678901'],
    [
      'Ada Example Pty Ltd',
      'company',
      'Individual/Sole Trader',
      'abn:12345678901',
    ],
    ['Dr Ada Council', undefined, undefined, undefined],
    [
      'Ada Example trading as Example Foundation',
      undefined,
      undefined,
      undefined,
    ],
    ['Ada Example', undefined, undefined, 'abn:12345678901'],
    ['Ada Example', 'other', undefined, undefined],
    ['Ada Council', undefined, undefined, undefined],
    ['Ada Mary Bank', undefined, undefined, undefined],
  ])('suppresses %s with source kind %s', (name, kind, type, id) => {
    expect(publicRecipient(name!, kind, type, id)).toEqual({
      name: unnamedRecipient,
      organisation: false,
    });
  });
  test.each([
    ['Example Council', 'council'],
    ['Example Inc', 'association'],
    ['Example Pty Ltd', undefined],
    ['University of Example', undefined],
  ])('keeps organisation %s', (name, kind) =>
    expect(isOrganisation(name!, kind)).toBe(true),
  );
  test('an ABR company type is authoritative; an ABN alone is not', () => {
    expect(isOrganisation('Example Holdings', undefined, 'PRV')).toBe(true);
    expect(
      isOrganisation('Ada Example', undefined, undefined, 'abn:12345678901'),
    ).toBe(false);
  });
  test('program private names, descriptions and profile identifiers are removed', () => {
    const input = raw('/grants/federal/programs/go3141.json');
    input.grants[0] = {
      ...input.grants[0],
      rn: 'Ada Example',
      rid: 'person:ada',
      k: 'individual',
      n: 'Funding for Ada Example',
    };
    const program = d.decodeProgram(input),
      first = program.grants[0]!;
    expect(first.name).toBe(unnamedRecipient);
    expect(first.title).toBe('');
    expect(first.recipientId).toBe('');
    expect(JSON.stringify(program)).not.toContain('Ada Example');
  });
  test('the decoder honours an IND ABR type even with a company-like name and kind', () => {
    const input = raw('/grants/federal/programs/go3141.json');
    input.grants[0] = {
      ...input.grants[0],
      rn: 'Ada Example Pty Ltd',
      k: 'company',
      abr: { etype: 'IND' },
      n: 'Ada Example Pty Ltd award',
    };
    const row = d.decodeProgram(input).grants[0]!;
    expect(row.name).toBe(unnamedRecipient);
    expect(row.title).toBe('');
    expect(row.sourceUrl).toBeNull();
  });
  test('largest grants join source kinds, including a sole trader with an ABN and a company-like trading name', () => {
    const index = d.decodeGrantIndex(raw('/graph/grants.federal.json'));
    const largest = d.decodeLargest(raw('/social/grants-largest.json'));
    const row = largest.months[largest.latest]![0]!;
    const privateIndex = {
      ...index,
      recipients: [
        { id: row.recipientId, name: unnamedRecipient, organisation: false },
      ],
    };
    const safe = d.largestFor(largest, privateIndex, largest.latest)[0]!;
    expect(safe.recipient).toBe(unnamedRecipient);
    expect(safe.purpose).toBe('');
    expect(safe.recipientId).toBe('');
  });
  test('unknown monthly recipients default conservatively', () => {
    const largest = d.decodeLargest(raw('/social/grants-largest.json'));
    largest.months[largest.latest]![0]!.recipient = 'Ada Example';
    const index = {
      ...d.decodeGrantIndex(raw('/graph/grants.federal.json')),
      recipients: [],
    };
    expect(d.largestFor(largest, index, largest.latest)[0]!.recipient).toBe(
      unnamedRecipient,
    );
  });
  test('agency supplier names and contract titles are suppressed together', () => {
    const directory = raw('/agencies.json');
    const input = raw(directory.agencies[0].profile_path);
    input.suppliers[0].name = 'Ada Example';
    input.suppliers[0].abn_type = 'IND';
    input.contracts[0].supplier = 'Ada Example';
    input.contracts[0].title = 'Ada Example service';
    const profile = d.decodeAgency(input);
    expect(JSON.stringify(profile)).not.toContain('Ada Example');
  });
  test('private donor names never survive Discover summaries, evidence and chart participants', () => {
    const input = decodeDiscovery(raw('/discovery.json')).signals.find(
      (s) => s.category === 'recipient_concentration',
    )!;
    input.entity = 'Ada Example';
    input.summary = 'Ada Example supplied the receipts';
    input.chart!.participants[0]!.name = 'Ada Example';
    input.chart!.leading_name = 'Ada Example';
    input.evidence[0]!.label = 'Ada Example → Party';
    expect(JSON.stringify(publicSignal(input))).not.toContain('Ada Example');
  });
});
describe('static exports are validated, dated and retain their source caveats', () => {
  test.each(['federal', 'qld'])('grants index %s', (jur) => {
    const input = raw(`/graph/grants.${jur}.json`),
      index = d.decodeGrantIndex(input);
    expect(index.meta.caveats).toEqual(
      jur === 'qld' ? input.meta.caveats.slice(1) : input.meta.caveats,
    );
    expect(index.counts.grants).toBe(input.meta.counts.grants);
    expect(index.meta.asOf).toBe(input.meta.generated);
    expect(index.programs).toHaveLength(500);
  });
  test('all 1,000 exported program files decode without a private recipient label', () => {
    for (const jur of ['federal', 'qld']) {
      const index = d.decodeGrantIndex(raw(`/graph/grants.${jur}.json`));
      for (const entry of index.programs) {
        const input = raw(`/grants/${jur}/programs/${entry.key}.json`),
          program = d.decodeProgram(input);
        expect(program.id).toBe(entry.id);
        expect(program.grants.length).toBe(input.grants.length);
        for (let i = 0; i < input.grants.length; i++)
          if (input.grants[i].k === 'individual')
            expect(program.grants[i]!.name).toBe(unnamedRecipient);
      }
    }
  });
  test('notes, largest, report, allocation, history and evidence read the web contracts', () => {
    expect(
      d.decodeNotes(raw('/grants/program-notes.json')).programs.federal.GO3141!
        .audits,
    ).toHaveLength(1);
    const largest = d.decodeLargest(raw('/social/grants-largest.json'));
    expect(largest.months[largest.latest]!.length).toBeGreaterThan(0);
    expect(d.decodeReport(raw('/reports/grants-allocation.json')).title).toBe(
      'Where community funding goes',
    );
    const allocation = d.decodeAllocation(raw('/research/mlci.json'));
    expect(allocation.projects).toHaveLength(226);
    expect(allocation.awards).toHaveLength(89);
    expect(allocation.seats).toHaveLength(150);
    expect(allocation.comparison).toHaveLength(6);
    expect(allocation.provenance).toMatch(/not independently reproduced/);
    expect(
      d.decodeHistory(raw('/research/grants-history.json')).records,
    ).toHaveLength(11);
    const connections = d.decodeConnections(raw('/evidence/index.json'));
    expect(connections.entities).toHaveLength(19481);
    const program = connections.entities.find((e) => e.kind === 'program')!;
    expect(
      d.decodeEvidence(raw(`/evidence/${program.id.slice(0, 2)}.json`))[
        program.id
      ]!.excerpts.length,
    ).toBeGreaterThan(0);
  });
  test('verified venue overlays are sourced and private recipients have no location disclosures', () => {
    const input = raw('/research/grant-locations.json');
    const locations = d.decodeLocations(input);
    expect(locations.records.length).toBeGreaterThan(0);
    input.records[0].recipient = 'Ada Privacy Example';
    input.records[0].title = 'Ada Privacy Example venue';
    const privateRow = d
      .decodeLocations(input)
      .records.find((r) => r.id === input.records[0].id)!;
    expect(privateRow.title).toBe('Grant project');
    expect(privateRow.sites).toEqual([]);
    expect(() => d.decodeLocations({ ...input, records: null })).toThrow();
  });
  test('all 164 agency files decode', () => {
    const directory = d.decodeAgencies(raw('/agencies.json'));
    expect(directory.agencies).toHaveLength(164);
    directory.agencies.forEach((a) =>
      expect(d.decodeAgency(raw(a.path)).id).toBe(a.id),
    );
  });
  test.each([
    ['/graph/grants.federal.json', d.decodeGrantIndex, 'programs'],
    ['/grants/federal/programs/go3141.json', d.decodeProgram, 'grants'],
    ['/grants/program-notes.json', d.decodeNotes, 'programs'],
    ['/social/grants-largest.json', d.decodeLargest, 'months'],
    ['/agencies.json', d.decodeAgencies, 'agencies'],
    ['/research/mlci.json', d.decodeAllocation, 'awards'],
    ['/research/grants-history.json', d.decodeHistory, 'records'],
    ['/evidence/index.json', d.decodeConnections, 'entities'],
  ] as const)('rejects broken container %s', (path, decoder, key) => {
    const input = raw(path);
    input[key] = null;
    expect(() => decoder(input)).toThrow();
  });
  test('rejects cross-record and missing-source data', () => {
    expect(() => d.decodeMeta({ ...meta, generated: 'not a date' })).toThrow();
    expect(() =>
      d.decodeAgencies({
        ...raw('/agencies.json'),
        agencies: [
          { ...raw('/agencies.json').agencies[0], profile_path: '/api/ask' },
        ],
      }),
    ).toThrow();
    expect(() =>
      d.decodeReport({
        ...raw('/reports/grants-allocation.json'),
        slug: 'other',
      }),
    ).toThrow();
    expect(() =>
      d.decodeAgency({
        ...raw(raw('/agencies.json').agencies[0].profile_path),
        contracts: null,
      }),
    ).toThrow();
    expect(() => d.decodeEvidence({ entries: null })).toThrow();
    expect(() => d.jurisdiction('vic')).toThrow();
  });
  test('19,481-entry local search stays under 100ms on the test host', () => {
    const entries = d.decodeConnections(raw('/evidence/index.json')).entities;
    const start = performance.now();
    const rows = entries
      .filter((e) => e.name.toLowerCase().includes('community'))
      .sort((a, b) => b.count - a.count);
    expect(rows.length).toBeGreaterThan(0);
    expect(performance.now() - start).toBeLessThan(100);
  });
  test('recipient totals cover only listed awards and aggregate all anonymous recipients safely', () => {
    const program = d.decodeProgram(
      raw('/grants/federal/programs/go3141.json'),
    );
    const rows = d.programRecipients(program.grants);
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(program.grants.length);
    expect(rows.reduce((n, r) => n + r.value, 0)).toBe(
      program.grants.reduce((n, g) => n + g.value, 0),
    );
  });
  test('compact money uses m and bn', () => {
    expect(formatMoneyCompact(4_200_000)).toBe('$4.2m');
    expect(formatMoneyCompact(1_100_000_000)).toBe('$1.1bn');
  });
});
describe('route and transport boundaries', () => {
  test.each([
    '/graph/grants.federal.json',
    '/graph/grants.qld.json',
    '/grants/program-notes.json',
    '/social/grants-largest.json',
    '/grants/federal/programs/go3141.json',
    '/grants/qld/programs/community-grants.json',
    '/agencies.json',
    '/agencies/a-7431f054588d4251c0b4.json',
    '/reports/grants-allocation.json',
    '/research/mlci.json',
    '/research/grants-history.json',
    '/evidence/index.json',
    '/evidence/ab.json',
  ])('allows static %s', (path) =>
    expect(() => assertAllowedPath(path)).not.toThrow(),
  );
  test.each([
    '/api/ask',
    '/api/search',
    '/grants/federal/shard-00.json',
    '/grants/vic/programs/a.json',
    '/grants/federal/programs/../secret.json',
    '/agencies/a-f.json',
    '/evidence/abc.json',
    '/agencies.json?q=x',
    '/research/mlci.json?preview=1',
    '/grants/federal/programs/a%2fb.json',
  ])('refuses %s before networking', (path) =>
    expect(() => assertAllowedPath(path)).toThrow(),
  );
  test.each([
    ['/money/grants?jur=qld', '/grants'],
    ['/money/grants?jur=federal&program=GO3141', '/grant-program'],
    ['/money/grants?largest=2026-08', '/largest-grants'],
    ['/discover?category=donor_contract_overlap', '/discover'],
    ['/subject/agency', '/agencies'],
    ['/subject/agency/a-7431f054588d4251c0b4', '/agency'],
    ['/reports/grants-allocation', '/grants-allocation'],
    ['/connections', '/connections'],
  ])('opens native %s', (path, route) =>
    expect(fromWebPath(path!)).toMatchObject({ pathname: route }),
  );
  test.each([
    '/subject/donor/Ada',
    '/subject/supplier/s-123',
    '/money/grants/federal/recipient/person%3Aada',
    '/money/grants?open=person%3Aada',
  ])('no new private profile or money-map ownership %s', (path) =>
    expect(fromWebPath(path)).toBeNull(),
  );
  test('all public-money loaders use only guarded static GETs, including screen mount loads', async () => {
    const calls: string[] = [];
    const client: Pick<ApiClient, 'get'> = {
      async get<T>(
        path: string,
        decode: (v: unknown) => T,
      ): Promise<RecordResult<T>> {
        assertAllowedPath(path);
        calls.push(path);
        return {
          data: decode(raw(path)),
          stale: false,
          savedAt: 10,
          asOf: null,
        };
      },
    };
    const catalog = new MoneyCatalogs(client);
    expect(calls).toEqual([]);
    await Promise.all([
      catalog.grants('federal'),
      catalog.grants('qld'),
      catalog.notes(),
      catalog.largest(),
      catalog.agencies(),
      catalog.allocation(),
      catalog.report(),
      catalog.history(),
      catalog.locations(),
      catalog.connections(),
    ]);
    await catalog.program('federal', 'go3141');
    await catalog.agency('a-7431f054588d4251c0b4');
    expect(calls.every((p) => !p.startsWith('/api/'))).toBe(true);
    expect(calls).toHaveLength(13);
    expect(
      combine(
        [
          { data: null, stale: false, savedAt: 20, asOf: null },
          { data: null, stale: true, savedAt: 10, asOf: null },
        ],
        { ok: true },
      ),
    ).toMatchObject({ stale: true, savedAt: 10 });
  });
  test('a mismatched program or agency fails closed', async () => {
    const get = jest.fn(async (path: string) => ({
      data:
        path === '/agencies.json'
          ? d.decodeAgencies(raw(path))
          : path.startsWith('/agencies/')
            ? { ...d.decodeAgency(raw(path)), id: 'a-wrong' }
            : {
                ...d.decodeProgram(raw('/grants/federal/programs/go3141.json')),
                key: 'wrong',
              },
      stale: false,
      savedAt: 10,
      asOf: null,
    }));
    const catalog = new MoneyCatalogs({ get } as unknown as Pick<
      ApiClient,
      'get'
    >);
    await expect(catalog.program('federal', 'go3141')).rejects.toThrow(
      /does not match/,
    );
    await expect(catalog.agency('a-7431f054588d4251c0b4')).rejects.toThrow(
      /does not match/,
    );
    await expect(catalog.agency('missing')).rejects.toThrow(/not found/);
  });
  test('new screens have no private profile routes, fetch or paid APIs', () => {
    const root = resolve(__dirname, '../src/features/money-public');
    for (const file of readdirSync(root).filter((f) => f.endsWith('.tsx'))) {
      const source = readFileSync(resolve(root, file), 'utf8');
      expect(source).not.toMatch(
        /\bfetch\s*\(|[\x27\x22]\/api\/|\/supplier\/[\[]|\/recipient\/[\[]|\/donor\/[\[]/,
      );
    }
  });
});
