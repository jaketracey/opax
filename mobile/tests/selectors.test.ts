import { ApiError } from '../src/api/errors';
import * as d from '../src/api/catalogs';
import { bills, catalogs, index, manifest, people, pinned } from './pinned';
const members = [
  {
    name: 'Anthony Albanese',
    key: '10007',
    seat: 'Grayndler',
    portrait: '10007',
  },
  {
    name: 'Penny Wong',
    key: '10678',
    seat: 'South Australia',
    portrait: '10678',
  },
  { name: 'Madonna Jarrett', key: '11042', seat: 'Brisbane', portrait: null },
];
test.each(members)(
  'profile joins current $name with independent dates and IDs',
  (member) => {
    const person = people.people.find((p) => p.name === member.name)!;
    const interest = d.decodeInterest(pinned(`/interests/${member.key}.json`));
    const profile = d.profileFor(person.person_id, { ...catalogs, interest });
    expect(profile.personId).toBe(person.person_id);
    expect(
      profile.blocks.identity.data?.seats.some(
        (s) => s.current && s.name === member.seat,
      ),
    ).toBe(true);
    expect(profile.blocks.interests.data).toEqual(interest);
    expect(profile.blocks.interests.asAt).toBe(interest.as_at);
    expect(profile.blocks.pay.asAt).toBe(catalogs.pay!.meta.as_of);
    expect(profile.blocks.expenses.asAt).toBe(
      catalogs.expenses!.meta.generated,
    );
    expect(profile.blocks.votes.asAt).toBeNull();
    expect(profile.blocks.portrait.data?.key ?? null).toBe(member.portrait);
    expect(profile.blocks.partyReceipts.data?.caption).toBe(
      'Party disclosures, not this person’s finances.',
    );
    const pay =
      catalogs.pay!.people[catalogs.pay!.names[member.name.toLowerCase()]!];
    expect(profile.blocks.pay.data?.person).toEqual(pay);
    expect(profile.blocks.interests.sources[0]?.url).toBe(interest.source_url);
  },
);
test('voting date is unknown without _meta; source and latest division dates stay separate', () => {
  const id = people.people.find(
    (p) => p.name === 'Anthony Albanese',
  )!.person_id;
  const meta = {
    schema: 1,
    content_changed_at: '2026-09-04',
    latest_division_date: '2026-08-19',
    latest_division_date_by_jurisdiction: { federal: '2026-08-19' },
  };
  const p = d.profileFor(id, {
    ...catalogs,
    votes: { ...catalogs.votes!, meta },
  });
  expect(p.blocks.votes.asAt).toBe(meta.content_changed_at);
  expect(p.blocks.votes.data?.latestDivisionDate).toBe(
    meta.latest_division_date,
  );
  expect(p.blocks.votes.data?.for[0]?.billKey).not.toBeNull();
  expect(
    p.blocks.votes.data?.for.find((v) => v.name.includes(', Income Tax'))
      ?.billKey,
  ).toBeNull();
});
test.each(['au-federal-r7534', 'au-federal-r7549'])(
  'bill %s retains stored attribution, numbers and labelled briefs',
  (key) => {
    const raw = d.decodeBill(pinned(`/bills/${key}.json`)),
      view = d.billFor(raw, bills);
    expect(view.summary.data).toEqual(raw.summary);
    expect(view.summary.data?.attribution ?? null).toBe(
      raw.summary?.attribution ?? null,
    );
    expect(view.divisions.data?.partyBasisNote).toBe(
      bills.meta.party_basis_note,
    );
    expect(view.divisions.data?.rawRows.map((r) => r.party_splits)).toEqual(
      raw.divisions.map((r) => r.party_splits),
    );
    expect(view.divisions.data?.rawRows.map((r) => [r.ayes, r.noes])).toEqual(
      raw.divisions.map((r) => [r.ayes, r.noes]),
    );
    for (const s of view.speeches.data ?? []) {
      expect(s.briefLabel).toBe(s.brief ? 'Machine brief' : null);
      expect(s.url).toContain('/doc/');
    }
  },
);
test('Today is date-ordered, from whole real files, without mutating input', () => {
  const recent = d.decodeRecentInterests(pinned('/interests/recent.json'));
  const view = d.todayFor(bills, recent);
  expect(view.bills.data?.[0]?.key).toBe('au-federal-r7549');
  expect(view.declarations.data?.[0]?.date).toBe('2026-09-02');
  expect(view.declarations.asAt).toBe(recent.meta.generated);
  expect(view.bills.asAt).toBe(bills.generated_at);
});
test('Your MP uses observed senators and only verified chosen state seats', () => {
  const grayndler = index.electorates.find((s) => s.name === 'Grayndler')!;
  const home = d.yourMPFor(grayndler.electorate_id, index, manifest);
  expect(home.members.data?.[0]?.person.name).toBe('Anthony Albanese');
  expect(home.members.sources.length).toBeGreaterThan(0);
  expect(home.senators[0]?.sources.length).toBeGreaterThan(0);
  expect(home.senators[0]?.data).toHaveLength(12);
  expect(home.stateRosterVerified).toBe(false);
  expect(home.stateMembers).toEqual([]);
  const richmond = index.electorates.find(
    (s) => s.name === 'Richmond' && s.jurisdiction === 'vic',
  )!;
  const vic = d.yourMPFor(richmond.electorate_id, index, manifest, [
    richmond.electorate_id,
  ]);
  expect(vic.stateRosterVerified).toBe(true);
  expect(vic.stateMembers[0]?.data?.[0]?.person.name).toBe(
    'Gabrielle de Vietri',
  );
  expect(
    d.yourMPFor(richmond.electorate_id, index, manifest).stateMembers,
  ).toEqual([]);
});
test('electorate retains votes, Census vintage, related constituencies and evidence', () => {
  const path = index.electorates.find(
    (s) => s.name === 'Grayndler',
  )!.detail_url;
  const raw = d.decodeElectorate(pinned(path)),
    view = d.electorateFor(raw);
  expect(view.elections[0]?.data?.candidates).toEqual(
    raw.elections[0]?.candidates,
  );
  expect(view.census[0]?.data?.vintage).toBe('2021 Census geography');
  expect(view.census[0]?.data?.indicators).toEqual(
    raw.demographics[0]?.indicators,
  );
  expect(view.representatives.asAt).toBe('2026-09-04');
  expect(view.representatives.sources.length).toBeGreaterThan(0);
});
test('website portraits expose original credits and terms without deciding app rights', () => {
  const p = d.portraitFor(
    ['Sheena Watt'],
    catalogs.photoPeople!,
    catalogs.photoCredits!,
  )!;
  expect(p.licence).toBe('CC0');
  expect(p.display).toBe('website-file');
  expect(p.credit).toBe('Gabagool2005');
  expect(
    d.portraitFor(
      ['Anthony Albanese'],
      catalogs.photoPeople!,
      catalogs.photoCredits!,
    )?.display,
  ).toBe('website-file');
  expect(
    d.portraitFor(
      ['Madonna Jarrett'],
      catalogs.photoPeople!,
      catalogs.photoCredits!,
    ),
  ).toBeNull();
  expect(
    d.portraitFor(['Sheena Watt'], catalogs.photoPeople!, {
      ...catalogs.photoCredits!,
      [p.key]: { ...catalogs.photoCredits![p.key]!, licence: 'GFDL' },
    }),
  ).toBeNull();
});
test('Commons portraits are left out by their licence, not by their name key', () => {
  const credits = catalogs.photoCredits!;
  const left: Record<string, [name: string, licence: string]> = {
    'wd-Q6812492': ['Melinda Pavey', 'GFDL 1.2'],
    'wd-Q7803243': ['Tim Bull', 'GFDL 1.2'],
    'wd-Q1383644': ['Ian Hunter', 'Copyrighted free use'],
    'wd-Q7613391': ['Steve Minnikin', 'Copyrighted free use'],
  };
  expect(
    Object.keys(credits)
      .filter((key) => !d.commonsLicenceShown(credits[key]!.licence))
      .sort(),
  ).toEqual(Object.keys(left).sort());
  expect(
    Object.keys(credits).filter((key) =>
      d.commonsLicenceShown(credits[key]!.licence),
    ),
  ).toHaveLength(294);
  for (const [key, [name, licence]] of Object.entries(left)) {
    expect(credits[key]!.licence).toBe(licence);
    // A full-name key reaches the licence check even where the website's own
    // key is initials ("i.k. hunter") or a surname ("minnikin").
    const people = { [name.toLowerCase()]: key } as never;
    expect(d.portraitFor([name], people, credits)).toBeNull();
  }
  expect(
    d.portraitFor(['Melinda Pavey'], catalogs.photoPeople!, credits),
  ).toBeNull();
  expect(
    d.portraitFor(['Tim Bull'], catalogs.photoPeople!, credits),
  ).toBeNull();
  const evans = d.portraitFor(['Gareth Evans'], catalogs.photoPeople!, credits);
  expect(evans?.key).toBe('wd-Q381902');
  expect(evans?.licence).toBe('CC BY 1.0');
});
test.each([
  ["Deborah O'Neill", '10747'],
  ['Mehreen Faruqi', '10912'],
])('%s keeps its exact full-name portrait key', (name, key) => {
  const person = people.people.find(
    (p) => p.name === name && p.electorates.some((s) => s.current),
  )!;
  const view = d.profileFor(person.person_id, catalogs);
  expect(view.blocks.portrait.status).toBe('ready');
  expect(view.blocks.portrait.data?.key).toBe(key);
});
test('portrait apostrophe folding is only a fallback to exact keys', () => {
  expect(
    d.portraitFor(
      ["Deborah O'Neill"],
      catalogs.photoPeople!,
      catalogs.photoCredits!,
    )?.key,
  ).toBe('10747');
  expect(
    d.portraitFor(
      ['Deborah O’Neill'],
      catalogs.photoPeople!,
      catalogs.photoCredits!,
    )?.key,
  ).toBe('wd-Q5248341');
  expect(
    d.portraitFor(
      ["Danny O'Brien"],
      catalogs.photoPeople!,
      catalogs.photoCredits!,
    )?.key,
  ).toBe('wd-Q16202431');
  expect(() =>
    d.portraitFor(
      ['Deborah OʼNeill'],
      catalogs.photoPeople!,
      catalogs.photoCredits!,
    ),
  ).toThrow(/identity/);
});
test('all 113 ID-less pay records retain their authoritative name-index joins', () => {
  const rows = Object.entries(catalogs.pay!.people).filter(([, p]) => !p.pid);
  expect(rows).toHaveLength(113);
  for (const [key, record] of rows) {
    expect(
      d.nameValues(catalogs.pay!.names, [record.name.toLowerCase()]),
    ).toContain(key);
  }
});
test.each(['David Shoebridge', 'Mehreen Faruqi'])(
  '%s retains federal pay joined by name when the pay record has no ID',
  (name) => {
    const person = people.people.find(
      (p) => p.name === name && p.electorates.some((s) => s.current),
    )!;
    const view = d.profileFor(person.person_id, catalogs);
    expect(view.blocks.pay.status).toBe('ready');
    expect(view.blocks.pay.data?.person.pid).toBeFalsy();
    expect(view.blocks.pay.data?.person.name).toBe(name);
  },
);
test('a state profile cannot acquire an ID-less federal pay record merely by name', () => {
  const person = people.people.find(
    (p) => p.name === 'Chris Crewther' && p.electorates.some((s) => s.current),
  )!;
  const valid = d.profileFor(person.person_id, catalogs);
  const key = catalogs.pay!.names['chris crewther']!;
  expect(valid.blocks.pay.data?.person.pid).toBe('10879');
  const view = d.profileFor(person.person_id, {
    ...catalogs,
    pay: {
      ...catalogs.pay!,
      people: {
        ...catalogs.pay!.people,
        [key]: { ...catalogs.pay!.people[key]!, pid: null },
      },
    },
  });
  expect(view.blocks.pay.status).toBe('error');
  expect(view.blocks.pay.data).toBeNull();
});
test('ambiguity, cross-release mixing and a different person in a register fail closed', () => {
  const p = people.people.find((p) => p.name === 'Anthony Albanese')!;
  expect(() =>
    d.profileFor(p.person_id, {
      ...catalogs,
      people: { ...people, people: [p, p] },
    }),
  ).toThrow(ApiError);
  expect(() =>
    d.profileFor(p.person_id, {
      ...catalogs,
      people: {
        ...people,
        meta: { ...people.meta, release_id: '0000000000000000' },
      },
    }),
  ).toThrow(ApiError);
  const partial = d.profileFor(p.person_id, {
    ...catalogs,
    interest: d.decodeInterest(pinned('/interests/10678.json')),
  });
  expect(partial.blocks.interests.status).toBe('error');
  expect(partial.blocks.interests.data).toBeNull();
  expect(partial.blocks.identity.status).toBe('ready');
});
test('About exposes counts, coverage limitations and actual refresh time', () => {
  const corpus = d.decodeCorpus(pinned('/corpus.json')),
    view = d.coverageFor(corpus);
  expect(view.asAt).toBe(corpus.refresh.checked_at);
  expect(view.data?.expectedResources).toBe(corpus.expected_resources);
  expect(view.data?.sources).toEqual(corpus.sources);
});
test('suggestions use catalog names, seats and bill titles on device', () => {
  const view = d.suggestionsFor('Albanese', catalogs.roster, index, bills);
  expect(view.people.map((p) => p.name)).toContain('Anthony Albanese');
  expect(view.electorates.map((s) => s.name)).toContain('Grayndler');
  expect(d.suggestionsFor('x', catalogs.roster, index, bills).people).toEqual(
    [],
  );
});
test('suggestions exclude the Senator role token and surname-only rows', () => {
  expect(
    d
      .suggestionsFor('Senator', catalogs.roster, index, bills)
      .people.some((p) => p.name === 'Senator'),
  ).toBe(false);
  expect(
    d
      .suggestionsFor('Canavan', catalogs.roster, index, bills)
      .people.some((p) => p.name === 'Canavan'),
  ).toBe(false);
});

test('every current canonical person in the pinned release resolves through the slug API', () => {
  const current = people.people.filter((p) =>
    p.electorates.some((s) => s.current),
  );
  expect(current).toHaveLength(354);
  for (const p of current) {
    const profile = d.profileFor(p.person_id, catalogs);
    expect(profile.blocks.identity.data?.canonicalPersonId).toBe(p.person_id);
    expect(
      d.joinPerson(
        profile.slug,
        catalogs.slugs,
        catalogs.roster,
        people,
        manifest,
      ).canonicalPersonId,
    ).toBe(p.person_id);
  }
});

test('bill filters and exposure-draft consultation preserve catalog fields', () => {
  const view = d.billsFor(bills, {
    view: 'before_parliament',
    year: 2026,
    parliament: 48,
  });
  expect(view.data!.length).toBeGreaterThan(0);
  expect(
    view.data!.every(
      (b) =>
        b.status === 'before_parliament' &&
        b.introduced?.startsWith('2026') &&
        b.parliament === 48,
    ),
  ).toBe(true);
  const raw = d.decodeBill(
    pinned('/bills/au-federal-ed-online-safety-digital-duty-of-care-2026.json'),
  );
  expect(d.billFor(raw, bills).consultation.data).toEqual(raw.consultation);
  expect(d.billFor(raw, bills).related).toEqual(raw.related);
});
test('a roster-only current member never inherits another name’s former party', () => {
  const p = people.people.find((p) => p.name === 'Madonna Jarrett')!;
  const view = d.profileFor(p.person_id, {
    ...catalogs,
    roster: { ...catalogs.roster, people: [] },
  });
  expect(view.blocks.identity.data?.formerly).toBeNull();
});

test.each(['Annabelle Cleeland', 'Jacqui Lambie'])(
  '%s has no false formerly party without a distinct party_now',
  (name) => {
    const p = people.people.find(
      (p) => p.name === name && p.electorates.some((s) => s.current),
    )!;
    expect(
      d.profileFor(p.person_id, catalogs).blocks.identity.data?.formerly,
    ).toBeNull();
  },
);
test('formerly uses the roster matched by name and the web party_now rule', () => {
  const p = people.people.find((p) => p.name === 'Matthew Canavan')!;
  expect(
    d.profileFor(p.person_id, catalogs).blocks.identity.data?.formerly,
  ).toBe('LNP');
  const row = catalogs.roster.people.find((r) => r.name === p.name)!;
  expect(
    d.profileFor(p.person_id, {
      ...catalogs,
      roster: { ...catalogs.roster, people: [{ ...row, party_now: 'LNP' }] },
    }).blocks.identity.data?.formerly,
  ).toBeNull();
});
test.each([
  ["Danny O'Brien", 14],
  ["Michael O'Brien", 15],
  ["Lily D'Ambrosio", 15],
  ["Kim O'Keeffe", 15],
] as const)(
  '%s retains its votes and portrait across apostrophe spellings',
  (name, total) => {
    const p = people.people.find(
      (p) => p.name === name && p.electorates.some((s) => s.current),
    )!;
    const view = d.profileFor(p.person_id, catalogs);
    expect(view.blocks.votes.data?.total).toBe(total);
    const rosterName = catalogs.roster.people.find(
      (r) => d.nameKey(r.name) === d.nameKey(name),
    )!.name;
    const portrait = d.portraitFor(
      [rosterName],
      catalogs.photoPeople!,
      catalogs.photoCredits!,
    );
    expect(view.blocks.portrait.data).toEqual(portrait);
    if (name === "Danny O'Brien") expect(portrait?.key).toBe('wd-Q16202431');
    for (const n of [name, rosterName]) {
      expect(d.nameKey(n)).toBe(d.nameKey(name));
      expect(
        d.portraitFor([n], catalogs.photoPeople!, catalogs.photoCredits!),
      ).toEqual(portrait);
    }
  },
);
test.each([
  ['Tony Pasin', '10784', 'Antony Pasin'],
  ['Pat Conaghan', '10922', 'Patrick Conaghan'],
  ['Alison Byrnes', 'n-alison-brynes', 'Alison Brynes'],
  ['Bob Katter', '10352', 'Robert Katter'],
  ['Rebekha Sharkie', '10874', 'Rebeka Sharkie'],
  ['Jim Chalmers', '10809', 'James Chalmers'],
])(
  '%s accepts the register’s formal name through its authoritative index key',
  (name, key, registerName) => {
    const p = people.people.find(
      (p) => p.name === name && p.electorates.some((s) => s.current),
    )!;
    const interest = d.decodeInterest(pinned(`/interests/${key}.json`));
    const view = d.profileFor(p.person_id, { ...catalogs, interest });
    expect(view.interestKey).toBe(key);
    expect(view.blocks.interests.status).toBe('ready');
    expect(view.blocks.interests.data?.name).toBe(registerName);
  },
);
test.each([
  ['Jo Briskey', '11029', 8],
  ['Renee Coffey', '11034', 3],
] as const)(
  '%s includes every register organisation, including lobbyists and FITS',
  (name, key, count) => {
    const p = people.people.find(
      (p) => p.name === name && p.electorates.some((s) => s.current),
    )!;
    const interest = d.decodeInterest(pinned(`/interests/${key}.json`));
    const view = d.profileFor(p.person_id, { ...catalogs, interest });
    expect(view.blocks.ties.status).toBe('ready');
    expect(view.blocks.ties.data).toHaveLength(count);
    expect(view.blocks.ties.asAt).toBe(interest.as_at);
    expect(view.blocks.ties.data?.flatMap((r) => r.ties)).toEqual(
      interest.ties,
    );
    if (name === 'Jo Briskey')
      expect(
        view.blocks.ties.data?.some(
          (r) =>
            /banksia strategic partners/i.test(r.organisation) &&
            r.kinds.includes('lobbyist'),
        ),
      ).toBe(true);
  },
);
test.each([
  ['Chris Crewther', '10879', 584227],
  ['Darren Cheeseman', '10117', 854360],
] as const)(
  '%s retains federal pay on its current state profile using pay.pid',
  (name, pid, total) => {
    const p = people.people.find(
      (p) => p.name === name && p.electorates.some((s) => s.current),
    )!;
    const view = d.profileFor(p.person_id, catalogs);
    expect(view.blocks.identity.data?.legacyPersonId).toBe(pid);
    expect(view.blocks.pay.status).toBe('ready');
    expect(view.blocks.pay.data?.person.pid).toBe(pid);
    expect(view.blocks.pay.data?.person.total).toBe(total);
    expect(view.blocks.pay.sources).toHaveLength(
      catalogs.pay!.meta.sources.length,
    );
  },
);
test('state vote samples cite the published data honestly instead of an OPAX profile as Hansard', () => {
  const p = people.people.find((p) => p.name === "Danny O'Brien")!;
  const sources = d.profileFor(p.person_id, catalogs).blocks.votes.sources;
  expect(sources).toEqual([
    { label: 'OPAX published VIC Hansard division sample', url: '/votes.json' },
  ]);
});
test.each(['au-federal-alrc-4437', 'au-federal-r6850'])(
  '%s uses normalized sponsor, portfolio and party in details and list rows',
  (key) => {
    const bill = d.decodeBill(pinned(`/bills/${key}.json`));
    const view = d.billFor(bill, bills).identity.data!;
    const list = d.billsFor(bills).data!.find((b) => b.key === key)!;
    expect(view.sponsor).toBe(list.sponsor);
    expect(view.portfolio).toBe(list.portfolio);
    expect(view.sponsorParty).toBe(list.sponsor_party);
    if (key.includes('alrc')) {
      expect(view.sponsor).toBeTruthy();
      expect(view.portfolio).toBeNull();
    } else expect(view.sponsor).toBe('Andrew Wilkie');
  },
);
test('bill search covers short titles, sponsor, portfolio, status and year; drafts are Released', () => {
  const key = 'au-federal-r6850';
  const bill = bills.bills.find((b) => b.key === key)!;
  expect(
    d.billsFor(bills, { query: 'WILKIE' }).data!.some((b) => b.key === key),
  ).toBe(true);
  for (const query of [
    bill.short_title,
    bill.portfolio,
    bill.status,
    bill.introduced?.slice(0, 4),
  ].filter((v): v is string => !!v))
    expect(d.billsFor(bills, { query }).data!.some((b) => b.key === key)).toBe(
      true,
    );
  const draft = d.decodeBill(
    pinned('/bills/au-federal-ed-online-safety-digital-duty-of-care-2026.json'),
  );
  const view = d.billFor(draft, bills);
  expect(view.identity.data?.introducedLabel).toBe('Released');
  expect(view.identity.sources.some((s) => s.label === 'Exposure draft')).toBe(
    true,
  );
  expect(
    d.billsFor(bills).data!.find((b) => b.key === draft.key)?.introducedLabel,
  ).toBe('Released');
  expect(
    d
      .recentBillsFor(bills, bills.bills.length)
      .data!.find((b) => b.key === draft.key)?.introducedLabel,
  ).toBe('Released');
});

test('folded name indexes preserve source order, aliases and ambiguity across snapshot changes', () => {
  const index = { 'O’Neill': 'a', Other: 'x', "O'Neill": 'b', Albanese: 'c' };
  expect(d.nameValues(index, ['Albanese', "O'Neill", "O'Neill"])).toEqual([
    'a',
    'b',
    'c',
  ]);
  expect(d.nameValues(index, ['O’Neill'])).toEqual(['a', 'b']);
  expect(d.nameValues({ ...index, 'O.Neill': 'd' }, ["O'Neill"])).toEqual([
    'a',
    'b',
    'd',
  ]);
});
