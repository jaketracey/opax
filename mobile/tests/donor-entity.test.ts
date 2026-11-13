import { isOrganisationDonor } from '../src/privacy/donorEntity';

// Fictional names only. The cases mirror portal/test/donor-entity.test.mjs.
// The classifier is a data-quality check, never a publication gate: donors
// are named on every screen (donor-names.test.tsx).
test('a donor is an organisation only with positive evidence in its name; the industry never counts', () => {
  for (const [label, industry] of [
    ['Jane Citizen', 'media'],
    ['Ann Example', 'fossil_fuels'],
    ['Mrs Jane Citizen AO', 'finance'],
    ['Citizen, Jane', 'media'],
    ['Bareword', 'other'],
    ['Betwell', 'gambling'],
    ['Coleman Example', 'retail'],
  ])
    expect([
      label,
      isOrganisationDonor({ label, industry, aliases: [] }),
    ]).toEqual([label, false]);
  for (const [label, industry] of [
    ['Clubs Example', 'gambling'],
    ['Example Energy Ltd', 'fossil_fuels'],
    ['CFMEU', 'unions'],
    ['SDA', 'unions'],
    ["Australian Workers' Union", 'unions'],
    ['Unions Example', 'unions'],
    ['Example Trades Hall Council', 'unions'],
    ['Example Trades  Hall', 'unions'],
    ['Example Holdings Pty Ltd', 'property'],
    ['Citizen Family Trust', 'other'],
    ['Example & Smith Lawyers', 'legal'],
    ['University of Example', 'education'],
    ['Royal Example College of Surgeons', 'education'],
    ['The Example Guild of Australia', 'pharmacy'],
    ['Example Pastoral Co', 'agriculture'],
    ['Smith & Co.', 'finance'],
  ])
    expect([
      label,
      isOrganisationDonor({ label, industry, aliases: [] }),
    ]).toEqual([label, true]);
  // An alias with a legal form is evidence; a personal name tagged as a union is not.
  expect(
    isOrganisationDonor({
      label: 'Exco',
      industry: 'media',
      aliases: ['Exco Communication Pty Ltd'],
    }),
  ).toBe(true);
  expect(
    isOrganisationDonor({ label: 'Mr John Citizen', industry: 'unions' }),
  ).toBe(false);
  expect(
    isOrganisationDonor({ label: 'Citizen, John', industry: 'unions' }),
  ).toBe(false);
  // An ABN or ACN is not evidence (sole traders have them), and no industry tag is.
  for (const node of [
    { label: 'ABN 12 345 678 901', industry: 'other' },
    { label: 'ACN 123 456 789', industry: 'other' },
    {
      label: 'Alex Example',
      industry: 'other',
      aliases: ['ABN 12 345 678 901'],
    },
    { label: 'Alex Example', industry: 'unions', aliases: [] },
    { label: 'Alex Example', industry: 'unions', aliases: ['12345678901'] },
  ])
    expect([node, isOrganisationDonor(node)]).toEqual([node, false]);
  // A label of one all-capitals token, 3-7 letters, is an acronym.
  for (const label of ['CFMEU', 'SDA', 'QIC', 'EXAMPLE'])
    expect([
      label,
      isOrganisationDonor({ label, industry: 'other', aliases: [] }),
    ]).toEqual([label, true]);
  for (const label of [
    'JOHN SMITH',
    'Smith, John',
    'SMITH, JOHN',
    'J SMITH',
    'Abc',
    'ABCDEFGH',
    'A',
    'ABN',
    'ACN',
    'ARBN',
    'TFN',
  ])
    expect([label, isOrganisationDonor({ label, industry: 'unions' })]).toEqual(
      [label, false],
    );
  // Never an acronym alias: it reads as initials or a registration note.
  for (const aliases of [['ABN'], ['RP'], ['CFMEU'], ['RPX'], ['ACN', 'TFN']])
    expect([
      aliases,
      isOrganisationDonor({
        label: 'Alex Example',
        industry: 'other',
        aliases,
      }),
    ]).toEqual([aliases, false]);
  // Two capitals read as initials, unless an alias carries a legal form.
  expect(
    isOrganisationDonor({ label: 'EY', industry: 'finance', aliases: [] }),
  ).toBe(false);
  expect(
    isOrganisationDonor({
      label: 'EY',
      industry: 'finance',
      aliases: ['Example & Young Pty Ltd'],
    }),
  ).toBe(true);
  // Organisation words count only as whole tokens, and "Co" only as the last one.
  for (const label of [
    'Ingrid Bankston',
    'Trustwell',
    'Collegiate Smith',
    'Co Example',
    'Jane Lawyersmith',
    'Hallam Trades',
  ])
    expect([
      label,
      isOrganisationDonor({ label, industry: 'finance' }),
    ]).toEqual([label, false]);
  expect(isOrganisationDonor(null)).toBe(false);
  expect(isOrganisationDonor({ label: '  ', industry: 'unions' })).toBe(false);
  expect(isOrganisationDonor({ label: 42 })).toBe(false);
});
