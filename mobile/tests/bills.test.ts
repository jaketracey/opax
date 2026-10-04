import * as d from '../src/api/catalogs';
import {
  billFoldText,
  billSplits,
  billStage,
  billTimeline,
} from '../src/api/bill-transforms';
import {
  appliedFilters,
  billFilterStore,
  billRowText,
  countLine,
  withoutFilter,
} from '../src/features/bills/filters';
import { sponsorSlug } from '../src/features/bills/sponsors';
import { bills, pinned, roster, slugs } from './pinned';

const pinnedKeys = [
  'au-federal-r7534',
  'au-federal-r7549',
  'au-federal-ed-online-safety-digital-duty-of-care-2026',
  'au-federal-alrc-4437',
  'au-federal-r6850',
];
const details = pinnedKeys.map((key) =>
  d.decodeBill(pinned(`/bills/${key}.json`)),
);
const detail = (key: string) => details.find((b) => b.key === key)!;
const keys = (rows: { key: string }[] | null) => (rows ?? []).map((r) => r.key);

describe('bill list filters and sort', () => {
  test('status, chamber and year each narrow to exactly the matching bills', () => {
    const before = d.billsFor(bills, { status: 'before_parliament' }).data!;
    expect(before.length).toBe(
      bills.bills.filter((b) => b.status === 'before_parliament').length,
    );
    expect(before.every((b) => b.status === 'before_parliament')).toBe(true);
    const senate = d.billsFor(bills, { chamber: 'senate' }).data!;
    expect(senate.length).toBe(
      bills.bills.filter((b) => b.originating_house === 'senate').length,
    );
    const both = d.billsFor(bills, {
      status: 'passed',
      chamber: 'representatives',
      year: 2026,
    }).data!;
    expect(both.length).toBeGreaterThan(0);
    expect(
      both.every(
        (b) =>
          b.status === 'passed' &&
          b.originating_house === 'representatives' &&
          b.introduced?.startsWith('2026'),
      ),
    ).toBe(true);
  });

  test('facet counts are the index counts and add up to the whole list', () => {
    const facets = d.billFacetsFor(bills).data!;
    expect(facets.total).toBe(bills.bills.length);
    expect(facets.statuses.map((s) => s.value)).toEqual([
      'before_parliament',
      'exposure_draft',
      'passed',
      'lapsed',
    ]);
    expect(facets.statuses.map((s) => s.label)).toEqual([
      'Before parliament',
      'Exposure draft',
      'Passed',
      'Lapsed',
    ]);
    expect(facets.statuses.reduce((n, s) => n + s.count, 0)).toBe(facets.total);
    for (const s of facets.statuses)
      expect(d.billsFor(bills, { status: s.value }).data!.length).toBe(s.count);
    expect(facets.chambers.map((c) => c.value)).toEqual([
      'representatives',
      'senate',
    ]);
    for (const c of facets.chambers)
      expect(d.billsFor(bills, { chamber: c.value }).data!.length).toBe(
        c.count,
      );
    // Only the exposure draft has no chamber.
    expect(facets.chambers.reduce((n, c) => n + c.count, 0)).toBe(
      facets.total - bills.bills.filter((b) => !b.originating_house).length,
    );
    const years = facets.years.map((y) => y.value);
    expect(years).toEqual([...years].sort((a, b) => b - a));
    for (const y of facets.years)
      expect(d.billsFor(bills, { year: y.value }).data!.length).toBe(y.count);
    expect(d.billFacetsFor(bills).asAt).toBe(bills.generated_at);
  });

  test('most recent activity first: status date, then introduced date', () => {
    const rows = d.billsFor(bills, { sort: 'activity' }).data!;
    expect(rows.length).toBe(bills.bills.length);
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1]!,
        b = rows[i]!;
      const order = (d.billActivityDate(a) ?? '').localeCompare(
        d.billActivityDate(b) ?? '',
      );
      expect(order).toBeGreaterThanOrEqual(0);
      if (order === 0)
        expect((a.introduced ?? '') >= (b.introduced ?? '')).toBe(true);
    }
    const newest = bills.bills.reduce((best, b) =>
      (d.billActivityDate(b) ?? '') > (d.billActivityDate(best) ?? '')
        ? b
        : best,
    );
    expect(d.billActivityDate(rows[0]!)).toBe(d.billActivityDate(newest));
    // Sorting never drops or duplicates a bill, and filters still apply.
    expect(new Set(keys(rows)).size).toBe(rows.length);
    const before = d.billsFor(bills, {
      status: 'before_parliament',
      sort: 'activity',
    }).data!;
    expect(new Set(keys(before))).toEqual(
      new Set(keys(d.billsFor(bills, { status: 'before_parliament' }).data)),
    );
  });

  test('search matches every word, in any order, across title, sponsor and portfolio', () => {
    const wilkie = 'au-federal-r6850';
    for (const query of [
      'andrew wilkie',
      'Wilkie, Andrew',
      'WILKIE political donations',
      'cleaning up political donations',
      '2022 wilkie',
    ])
      expect(keys(d.billsFor(bills, { query }).data)).toContain(wilkie);
    expect(
      keys(d.billsFor(bills, { query: 'Social Services child support' }).data),
    ).toContain('au-federal-r7549');
    expect(
      keys(d.billsFor(bills, { query: 'digital duty of care' }).data),
    ).toContain('au-federal-ed-online-safety-digital-duty-of-care-2026');
    // Every result carries every word somewhere in its searchable text.
    const rows = d.billsFor(bills, { query: 'gambling levy' }).data!;
    expect(keys(rows)).toContain('au-federal-r7534');
    expect(
      rows.every((b) =>
        ['gambling', 'levy'].every((t) =>
          billFoldText(
            [b.title, b.short_title, b.portfolio].filter(Boolean).join(' '),
          ).includes(t),
        ),
      ),
    ).toBe(true);
    expect(d.billsFor(bills, { query: 'zzqx no such bill' }).data).toEqual([]);
    // Search and filters combine.
    expect(
      keys(
        d.billsFor(bills, { query: 'andrew wilkie', status: 'passed' }).data,
      ),
    ).not.toContain(wilkie);
  });

  test('the store keeps filters apart from routes and drops empty values', () => {
    billFilterStore.reset();
    billFilterStore.setFilters({ status: 'passed', chamber: '', year: 2026 });
    expect(billFilterStore.get().filters).toEqual({
      status: 'passed',
      year: 2026,
    });
    expect(appliedFilters(billFilterStore.get().filters)).toEqual([
      { key: 'status', filter: 'status', value: 'Passed' },
      { key: 'year', filter: 'year', value: '2026' },
    ]);
    expect(
      appliedFilters({
        chamber: 'representatives',
        status: 'before_parliament',
      }),
    ).toEqual([
      { key: 'status', filter: 'status', value: 'Before parliament' },
      { key: 'chamber', filter: 'chamber', value: 'House of Representatives' },
    ]);
    expect(withoutFilter({ status: 'passed', year: 2026 }, 'status')).toEqual({
      year: 2026,
    });
    billFilterStore.reset();
    expect(countLine(2989, 2989)).toBe('2,989 bills');
    expect(countLine(119, 2989)).toBe('119 of 2,989 bills');
    expect(countLine(1, 2989)).toBe('1 of 2,989 bills');
    expect(countLine(1, 1)).toBe('1 bill');
  });

  test('rows say status with its date, chamber, introduced or released, sponsor and portfolio', () => {
    const row = (key: string) =>
      billRowText(d.billsFor(bills).data!.find((b) => b.key === key)!);
    expect(row('au-federal-r6850')).toMatchObject({
      name: 'Commonwealth Electoral Amendment (Cleaning up Political Donations) Bill 2022',
      status: 'Lapsed',
      where: 'House of Representatives · Introduced 14\u00A0Feb\u00A02022',
      people: 'Andrew Wilkie · Independent',
    });
    const draft = row('au-federal-ed-online-safety-digital-duty-of-care-2026');
    expect(draft.status).toBe('Exposure draft');
    expect(draft.where).toBe('Released 8\u00A0Sep\u00A02026');
    expect(draft.people).toBe('Communications');
    expect(draft.label).toContain('Released 8 September 2026');
    const before = row('au-federal-r7549');
    expect(before.asAt).toBe('as at 17\u00A0Sep\u00A02026');
    expect(before.label).toContain(
      'Before parliament, as at 17 September 2026',
    );
    // No raw register tokens reach the reader.
    for (const b of d.billsFor(bills).data!) {
      const text = billRowText(b);
      expect(`${text.status} ${text.where}`).not.toMatch(
        /_|\brepresentatives\b|\bsenate\b/,
      );
    }
  });
});

describe('bill splits', () => {
  test('a split with small parties folds them onto one line, in full', () => {
    const division = detail('au-federal-r7534').divisions[0]!;
    const synthetic = {
      ...division,
      party_splits: {
        Labor: { ayes: 0, noes: 21 },
        Greens: { ayes: 9, noes: 0 },
        Liberal: { ayes: 0, noes: 3 },
        Nationals: { ayes: 0, noes: 3 },
        'One Nation': { ayes: 0, noes: 3 },
        JLN: { ayes: 1, noes: 0 },
        Independent: { ayes: 1, noes: 0 },
      },
      party_coverage: { dated: 30, earliest: 1 },
      ayes: 12,
      noes: 31,
      paired: 2,
    };
    const splits = billSplits(synthetic);
    expect(splits.drawn.map((s) => s.label)).toEqual([
      'Labor',
      'Greens',
      'Liberal',
      'Nationals',
      'One Nation',
    ]);
    expect(splits.folded.map((s) => s.label)).toEqual(['Independent', 'JLN']);
    expect(splits.notes).toEqual([
      '2 not placed with a party',
      '1 of 31 inferred, not observed on the day',
      '2 paired',
    ]);
    expect(splits.max).toBe(21);
  });
});

describe('bill detail selectors', () => {
  test('the summary keeps its stored attribution and machine label', () => {
    const view = d.billFor(detail('au-federal-r7534'), bills);
    expect(view.summary.data?.attribution).toBe(
      'Written by a model from the explanatory memorandum; not the record',
    );
    expect(view.summary.sources.map((s) => s.label)).toEqual([
      'Explanatory memorandum',
    ]);
    expect(view.speeches.data?.[0]).toMatchObject({
      speaker: 'Tony Burke',
      briefLabel: 'Machine brief',
      url: '/doc/speech-1205524',
    });
    const draft = d.billFor(
      detail('au-federal-ed-online-safety-digital-duty-of-care-2026'),
      bills,
    );
    expect(draft.summary.data?.attribution).toBe(
      'Written by a model from the exposure draft text; not the record',
    );
    expect(draft.identity.data).toMatchObject({
      statusLabel: 'Exposure draft',
      introducedLabel: 'Released',
      house: null,
    });
  });

  test('divisions collapse duplicates and carry the web outcome words, heads and splits', () => {
    const bill = detail('au-federal-r7534');
    const view = d.billFor(bill, bills).divisions.data!;
    expect(view.rows.length + view.collapsed).toBe(bill.divisions.length);
    expect(view.rows.length).toBeLessThan(bill.divisions.length);
    expect(new Set(view.rows.map((r) => r.outcomeLabel))).toEqual(
      new Set(['Agreed to', 'Negatived']),
    );
    for (const row of view.rows) {
      expect(row.stageLabel).toBe(billStage(row.stage));
      expect(row.splits.recorded).toBe(true);
      // Every vote a party split names is within the division's own totals.
      const named = [...row.splits.drawn, ...row.splits.folded].reduce(
        (n, s) => n + s.ayes + s.noes,
        0,
      );
      expect(named).toBeLessThanOrEqual(row.ayes + row.noes);
      expect(row.note).not.toMatch(/\]\(|https?:/);
    }
    // A placeholder question names the row by its stage and date instead.
    const placeholder = view.rows.find((r) =>
      /truncated/i.test(bill.divisions.find((x) => x.key === r.key)!.question),
    );
    if (placeholder) expect(placeholder.head).toBe('');
    expect(view.partyBasisNote).toBe(bills.meta.party_basis_note);
  });

  test('a one-day bill shows one date; a longer passage shows its spans', () => {
    const oneDay = billTimeline(detail('au-federal-r7549').key_dates);
    expect(oneDay.oneDay).toBe(true);
    expect(oneDay.entries).toEqual([
      {
        from: '2026-09-17',
        to: null,
        stages: [
          { stage: 'Introduced', house: 'representatives', days: 1 },
          { stage: 'Second reading', house: 'representatives', days: 1 },
        ],
      },
    ]);
    const passage = billTimeline(detail('au-federal-r7534').key_dates);
    expect(passage.oneDay).toBe(false);
    expect(passage.entries.map((e) => [e.from, e.to])).toEqual([
      ['2026-08-17', null],
      ['2026-08-17', '2026-08-18'],
      ['2026-08-18', null],
      ['2026-08-19', null],
      ['2026-08-26', null],
    ]);
    expect(passage.entries[1]!.stages).toEqual([
      { stage: 'Second reading', house: 'representatives', days: 2 },
    ]);
    // Three same-day second-reading rows are one stage on one day.
    expect(passage.entries[3]!.stages.map((s) => [s.stage, s.days])).toEqual([
      ['Introduced', 1],
      ['Second reading', 1],
      ['Committee', 1],
      ['Third reading', 1],
      ['Passed', 1],
    ]);
    expect(passage.folded).toBe(passage.dates - passage.runs);
    expect(passage.dates).toBe(12);
    const draft = billTimeline(
      detail('au-federal-ed-online-safety-digital-duty-of-care-2026').key_dates,
    );
    expect(draft.entries).toEqual([
      {
        from: '2026-09-08',
        to: null,
        stages: [{ stage: 'Exposure draft released', house: null, days: 1 }],
      },
    ]);
    expect(billTimeline([]).entries).toEqual([]);
  });
});

describe('sponsor links', () => {
  test('a roster parliamentarian sponsor resolves to their profile', () => {
    const bill = detail('au-federal-r6850');
    const view = d.billFor(bill, bills).identity.data!;
    expect(view.sponsorMembers).toEqual([
      { name: 'Andrew Wilkie', suffix: '' },
    ]);
    expect(
      sponsorSlug('Andrew Wilkie', roster, slugs, view.sponsorPersonId),
    ).toBe('andrew-wilkie');
    expect(sponsorSlug('Andrew Wilkie', roster, slugs)).toBe('andrew-wilkie');
    // Name and ID agreeing on one person is what links.
    expect(sponsorSlug('Tony Abbott', roster, slugs, d.rosterId('10001'))).toBe(
      'tony-abbott',
    );
  });

  test('a name two roster people share stays plain text', () => {
    // A fictional pair added to the pinned roster: two IDs, one name.
    const twin = (pid: string) => ({
      name: 'Sam Example',
      pid: d.rosterId(pid),
      party: null,
    });
    const shared = {
      ...roster,
      people: [...roster.people, twin('99990001'), twin('99990002')],
    };
    const withSlug = d.decodeSlugs({
      ...slugs,
      slugs: { ...slugs.slugs, 'sam-example': 'Sam Example' },
    });
    expect(sponsorSlug('Sam Example', shared, withSlug)).toBeNull();
    expect(
      sponsorSlug('Sam Example', shared, withSlug, d.rosterId('99990001')),
    ).toBeNull();
    // One of them alone would link.
    const single = { ...roster, people: [...roster.people, twin('99990001')] };
    expect(
      sponsorSlug('Sam Example', single, withSlug, d.rosterId('99990001')),
    ).toBe('sam-example');
  });

  test('names that are not a single roster parliamentarian stay plain text', () => {
    const katter = d.billFor(detail('au-federal-alrc-4437'), bills).identity
      .data!;
    expect(katter.sponsorMembers.length).toBe(1);
    expect(
      sponsorSlug(katter.sponsorMembers[0]!.name, roster, slugs, null),
    ).toBeNull();
    expect(sponsorSlug('Wilkie', roster, slugs)).toBeNull();
    expect(sponsorSlug('Not A Parliamentarian', roster, slugs)).toBeNull();
    // A roster ID that names someone else never links: not to this name's
    // profile and not to the ID's person (the reviewer's probe, 10001 being
    // Tony Abbott's roster ID).
    const abbott = roster.people.find((p) => p.pid === '10001')!;
    expect(abbott.name).toBe('Tony Abbott');
    expect(
      sponsorSlug('Andrew Wilkie', roster, slugs, d.rosterId('10001')),
    ).toBeNull();
    for (const other of roster.people.filter(
      (p) => p.pid && p.name.includes(' ') && p.name !== 'Andrew Wilkie',
    ))
      expect(
        sponsorSlug('Andrew Wilkie', roster, slugs, d.rosterId(other.pid!)),
      ).toBeNull();
  });
});
