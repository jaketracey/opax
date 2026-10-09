// The sponsor resolver against every cause scripts/audit-sponsor-links.ts
// classifies, on the pinned roster (8f1305e3) and its current shape.
import * as d from '../src/api/catalogs';
import {
  namesAgree,
  sponsorKey,
  sponsorRows,
  sponsorSlug,
} from '../src/features/bills/sponsors';
import { bills, index, manifest, people, pinned, roster, slugs } from './pinned';

const id = (pid: string) => d.rosterId(pid);
const directory = { roster, slugs, people, manifest, electorates: index };
const one = (name: string) => [{ name, suffix: '' }];
// origin/main since the roster re-verify: Mehreen Faruqi's own row holds 10912.
const current = {
  ...roster,
  people: roster.people.map((row) =>
    row.name === 'Mehreen Faruqi' ? { ...row, pid: id('10912') } : row,
  ),
};

describe('sponsor names as matching keys', () => {
  test.each([
    ['KATTER, Bob, Jnr, MP', 'bob katter'],
    ['Bob Jnr Katter', 'bob katter'],
    ['Senator Mehreen Faruqi', 'mehreen faruqi'],
    ['the Hon. Tony Abbott MP', 'tony abbott'],
    ['Dr Sophie Scamps', 'sophie scamps'],
    ['Brendan O’Connor', 'brendan oconnor'],
    ["Brendan O'Connor", 'brendan oconnor'],
    ['Sarah Hanson-Young', 'sarah hanson young'],
    ['  ANDREW   WILKIE ', 'andrew wilkie'],
    ['Zoë Daniel', 'zoe daniel'],
    ['A.J. Stoker', 'aj stoker'],
  ])('%s', (name, key) => expect(sponsorKey(name)).toBe(key));

  test.each([
    ['Chris Back', 'Christopher Back', true],
    ['Andrew Damien Wilkie', 'Andrew Wilkie', true],
    ['A Wilkie', 'Andrew Wilkie', true],
    ['Bob Jnr Katter', 'Bob Katter', true],
    ['Andrew Wilkie', 'Andrew Wilkie', true],
    ['Tony Abbott', 'Andrew Wilkie', false],
    ['Rex Patrick', 'Patrick Conaghan', false],
    ['Wilkie', 'Andrew Wilkie', false],
    ['Jo Smith', 'Sam Smith', false],
  ])('%s agrees with %s: %s', (a, b, agreed) =>
    expect(namesAgree(a, b)).toBe(agreed),
  );
});

describe('sponsor resolver, one row per cause', () => {
  test.each<[string, string, string | null, string | null, typeof roster?]>([
    // The reported bug: on the pin, the full-name row has no pid and the
    // surname stub "Faruqi" (a committee print) holds 10912.
    ['stub holds the pid (pin)', 'Mehreen Faruqi', '10912', 'mehreen-faruqi'],
    ['current shape', 'Mehreen Faruqi', '10912', 'mehreen-faruqi', current],
    ['no pid, one full-name row', 'Mehreen Faruqi', null, 'mehreen-faruqi'],
    // Surname-only stubs never link on a name, with or without the pid.
    ['surname stub', 'Faruqi', null, null],
    ['surname stub with its pid', 'Faruqi', '10912', null],
    ['hyphenated stub', 'Hanson-Young', '10711', null],
    // Titles, honorifics and generations.
    ['portfolio print', 'KATTER, Bob, Jnr, MP', null, 'bob-katter'],
    ['Jnr in the given names', 'Bob Jnr Katter', '10352', 'bob-katter'],
    ['senator title', 'Senator Mehreen Faruqi', '10912', 'mehreen-faruqi'],
    ['the Hon … MP', 'the Hon. Tony Abbott MP', '10001', 'tony-abbott'],
    // Hyphenated and compound surnames.
    ['hyphenated', 'Sarah Hanson-Young', '10711', 'sarah-hanson-young'],
    ['hyphen as a space', 'Sarah Hanson Young', '10711', 'sarah-hanson-young'],
    ['hyphen as a space, no pid', 'Sarah Hanson Young', null, 'sarah-hanson-young'],
    // Middle names, initials and short forms need the pid.
    ['short first name', 'Chris Back', '10722', 'christopher-back'],
    ['short first name, no pid', 'Chris Back', null, null],
    ['middle name', 'Andrew Damien Wilkie', '10727', 'andrew-wilkie'],
    ['middle name, no pid', 'Andrew Damien Wilkie', null, null],
    ['initial', 'A Wilkie', '10727', 'andrew-wilkie'],
    // Curly and straight twins (pin: straight has 10496, curly has none).
    ['curly twin with the pid', 'Brendan O’Connor', '10496', 'brendan-oconnor'],
    ['straight twin with the pid', "Brendan O'Connor", '10496', 'brendan-oconnor'],
    ['twins with no pid', 'Brendan O’Connor', null, null],
    // Diacritics, case and spacing.
    ['upper case', 'ANDREW WILKIE', '10727', 'andrew-wilkie'],
    ['doubled spaces', 'Andrew  Wilkie', null, 'andrew-wilkie'],
    ['a stray accent', 'Andréw Wilkie', '10727', 'andrew-wilkie'],
    // A pid that names someone else never links (the reviewer's probe).
    ["another member's pid", 'Andrew Wilkie', '10001', null],
    ['pid on a namesake row', 'Rex Patrick', '10903', null],
    // Not in the roster, and not a person.
    ['former senator with no profile', 'David Leyonhjelm', '10832', null],
    ['no pid, not in the roster', 'Zhenya Wang', null, null],
    ['an office', 'Minister for Finance', null, null],
  ])('%s: %s', (_cause, name, pid, slug, onRoster = roster) =>
    expect(
      sponsorSlug(name, onRoster, slugs, pid ? id(pid) : null),
    ).toBe(slug),
  );

  test('two roster people with one name stay plain text, pid or not', () => {
    const twin = (pid: string) => ({
      name: 'Sam Example',
      pid: id(pid),
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
      sponsorSlug('Sam Example', shared, withSlug, id('99990001')),
    ).toBeNull();
    // A pid-less namesake does not contradict the bill's pid; the link goes
    // to the pid's row, whose page is the one slug for that name.
    const namesake = {
      ...roster,
      people: [...roster.people, twin('99990001'), { name: 'Sam Example', party: null }],
    };
    expect(
      sponsorSlug('Sam Example', namesake, withSlug, id('99990001')),
    ).toBe('sam-example');
    expect(sponsorSlug('Sam Example', namesake, withSlug)).toBeNull();
  });

  test('a stub vouches only for its own recorded full name', () => {
    // "Faruqi" holds 10912 for "Mehreen Faruqi"; it says nothing about anyone
    // else of that surname, so another printed name with 10912 stays plain.
    const other = {
      ...roster,
      people: [...roster.people, { name: 'Ali Faruqi', party: null }],
    };
    const withSlug = d.decodeSlugs({
      ...slugs,
      slugs: { ...slugs.slugs, 'ali-faruqi': 'Ali Faruqi' },
    });
    expect(sponsorSlug('Ali Faruqi', other, withSlug, id('10912'))).toBeNull();
  });
});

describe('Faruqi on a pinned bill', () => {
  const faruqi = d.billFor(
    d.decodeBill(pinned('/bills/au-federal-s1479.json')),
    bills,
  ).identity.data!;

  test('the pinned bill names her with her pid', () => {
    expect(faruqi.sponsorMembers).toEqual(one('Mehreen Faruqi'));
    expect(faruqi.sponsorPersonId).toBe('10912');
  });

  test.each([
    ['pin', directory],
    ['current shape', { ...directory, roster: current }],
  ])('her row links to her profile (%s)', (_shape, onDirectory) => {
    const [row] = sponsorRows(
      faruqi.sponsorMembers,
      faruqi.sponsorParty,
      faruqi.sponsorPersonId,
      onDirectory,
    );
    expect(row!.slug).toBe('mehreen-faruqi');
    expect(row!.name).toBe('Mehreen Faruqi');
    expect(row!.place).toMatch(/^Senator for New South Wales/);
  });

  test('an unread register print reads as the profile name once linked', () => {
    const [row] = sponsorRows(one('KATTER, Bob, Jnr, MP'), null, null, directory);
    expect(row).toMatchObject({ slug: 'bob-katter', name: 'Bob Katter' });
  });

  test('a joined profile without the bill’s pid is refused', () => {
    // Bill says 10912 but the page is Andrew Wilkie's: never linked, even if
    // the roster is edited to vouch for the name.
    const forged = {
      ...roster,
      people: roster.people.map((row) =>
        row.name === 'Andrew Wilkie' ? { ...row, pid: id('10912') } : row,
      ),
    };
    const [row] = sponsorRows(one('Andrew Wilkie'), null, id('10912'), {
      ...directory,
      roster: forged,
    });
    expect(row!.slug).toBeNull();
  });
});
