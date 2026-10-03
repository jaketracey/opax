import { joinPerson, profileFor } from '../src/api/catalogs';
import { chamberName, jurisdictionName } from '../src/design/parliament';
import { partyText } from '../src/design/party';
import { personPartyFor } from '../src/api/party-transforms';
import { roster, manifest, people, catalogs } from './pinned';

describe('chamber and jurisdiction names cover the pinned data', () => {
  const chambers = new Set<string>();
  const pairs = new Set<string>();
  const jurisdictions = new Set<string>();
  for (const person of roster.people) {
    for (const id of (person as { chambers?: string[] }).chambers ?? [])
      chambers.add(id);
    for (const id of (person as { states?: string[] }).states ?? [])
      jurisdictions.add(id);
    for (const seat of person.representation ?? []) {
      pairs.add(`${seat.jurisdiction}|${seat.chamber}`);
      jurisdictions.add(seat.jurisdiction);
    }
  }
  for (const person of people.people)
    for (const seat of person.electorates) {
      pairs.add(`${seat.jurisdiction}|${seat.chamber}`);
      jurisdictions.add(seat.jurisdiction);
    }
  for (const pair of pairs) chambers.add(pair.split('|')[1]!);

  test('the pinned data has the chambers the review found', () => {
    for (const id of ['representatives', 'senate', 'vic_la', 'vic_lc'])
      expect(chambers).toContain(id);
  });
  test.each([...chambers].sort())(
    'chamber %s has a reader-facing name',
    (id) => {
      const name = chamberName(id);
      expect(name).toBeTruthy();
      expect(name).not.toMatch(/_|^[a-z]/);
    },
  );
  test.each([...pairs].sort())('seat %s names its chamber', (pair) => {
    const [jurisdiction, chamber] = pair.split('|');
    expect(chamberName(chamber, jurisdiction)).toBeTruthy();
  });
  test.each([...jurisdictions].sort())(
    'jurisdiction %s has a reader-facing name',
    (id) => {
      expect(jurisdictionName(id)).toBeTruthy();
    },
  );
  test('names', () => {
    expect(chamberName('representatives', 'federal')).toBe(
      'House of Representatives',
    );
    expect(chamberName('senate', 'federal')).toBe('Senate');
    expect(chamberName('vic_la', 'vic')).toBe('Victorian Legislative Assembly');
    expect(chamberName('vic_lc', 'vic')).toBe('Victorian Legislative Council');
    expect(chamberName('nsw_la')).toBe('New South Wales Legislative Assembly');
    expect(chamberName('sa_ha')).toBe('South Australian House of Assembly');
    expect(chamberName('assembly', 'qld')).toBe(
      'Queensland Legislative Assembly',
    );
    expect(jurisdictionName('federal')).toBe('Federal');
    expect(jurisdictionName('vic')).toBe('Victoria');
  });
  test('unknown IDs are said in words by callers, never printed', () => {
    expect(chamberName('xyz_zz')).toBeNull();
    expect(chamberName('federal_la')).toBeNull();
    expect(chamberName(null)).toBeNull();
    expect(jurisdictionName('mars')).toBeNull();
  });
});

describe('party status from the real adapter', () => {
  const profile = (slug: string, name: string) =>
    joinPerson(
      slug,
      { generated: '2026-10-03', slugs: { [slug]: name } },
      roster,
      people,
      manifest,
    );
  const label = (slug: string, name: string) => {
    const p = profile(slug, name);
    return partyText({
      party: p.party,
      current: p.partyCurrent,
      formerly: p.formerly,
    });
  };
  test('a former affiliation needs the named roster observation', () => {
    const person = people.people.find((p) => p.name === 'Matthew Canavan')!;
    const row = roster.people.find((r) => r.name === person.name)!;
    expect(row.party_now).toBeTruthy();
    expect(
      personPartyFor(
        person.electorates.filter((s) => s.current),
        row,
      ).formerly,
    ).toBeNull();
  });
  test('the full profile selector uses the same party status as the directory', () => {
    for (const [slug, name] of [
      ['anthony-albanese', 'Anthony Albanese'],
      ['barnaby-joyce', 'Barnaby Joyce'],
      ['linda-burney', 'Linda Burney'],
    ]) {
      const directory = profile(slug!, name!);
      expect(directory.canonicalPersonId).toBeDefined();
      const identity = profileFor(directory.canonicalPersonId!, catalogs).blocks
        .identity.data;
      expect(identity).toMatchObject({
        party: directory.party,
        partyCurrent: directory.partyCurrent,
        rosterParty: directory.rosterParty,
        formerly: directory.formerly,
      });
    }
  });
  test('Julia Gillard, no longer sitting, reads "Formerly Labor"', () => {
    const p = profile('julia-gillard', 'Julia Gillard');
    expect(p.seats).toHaveLength(0);
    expect(p.partyCurrent).toBe(false);
    expect(label('julia-gillard', 'Julia Gillard')).toEqual({
      visible: 'Formerly Labor',
      previous: null,
      spoken: 'Formerly Labor',
    });
  });
  test('Linda Burney, no longer sitting, reads "Formerly Labor"', () => {
    expect(profile('linda-burney', 'Linda Burney').partyCurrent).toBe(false);
    expect(label('linda-burney', 'Linda Burney').visible).toBe(
      'Formerly Labor',
    );
  });
  test('Anthony Albanese, sitting, reads "Labor"', () => {
    expect(profile('anthony-albanese', 'Anthony Albanese').partyCurrent).toBe(
      true,
    );
    expect(label('anthony-albanese', 'Anthony Albanese')).toEqual({
      visible: 'Labor',
      previous: null,
      spoken: 'Labor',
    });
  });
  test('Barnaby Joyce reads "One Nation", formerly Nationals', () => {
    expect(label('barnaby-joyce', 'Barnaby Joyce')).toEqual({
      visible: 'One Nation',
      previous: 'formerly Nationals',
      spoken: 'One Nation, formerly Nationals',
    });
  });
  test('no pinned roster profile shows a historical party as current', () => {
    for (const row of roster.people) {
      if (!row.party && !row.party_now) continue;
      let p;
      try {
        p = profile('probe', row.name);
      } catch {
        continue; // identity needing review is refused upstream
      }
      if (p.partyCurrent)
        expect(
          p.seats.some((seat) => seat.party) ||
            (row.current === true && !!row.party_now),
        ).toBe(true);
      else
        expect(label('probe', row.name).visible).toMatch(
          /^Formerly |^Party not recorded$/,
        );
    }
  });
});
