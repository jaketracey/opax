import {
  byPartyGroup,
  partyGroup,
  partyGroupLabel,
  partyOrder,
} from '../src/design/party-groups';
import { neutralPartyOrder } from '../src/design/party';

test.each([
  'Labor',
  'ALP',
  'Australian Labor Party',
  'Australian Labor Party (NSW Branch)',
])('%s belongs to Labor', (name) => {
  expect(partyGroup(name)).toBe('labor');
  expect(partyGroup(name, 'money')).toBe('labor');
});
test.each([
  'Liberal',
  'LIB',
  'Liberal Party of Australia',
  'Nationals',
  'National Party of Australia',
  'The Nationals',
  'LNP',
  'Liberal National Party of Queensland',
  'Country Liberal Party',
  'CLP',
])('%s belongs to the Coalition', (name) => {
  expect(partyGroup(name)).toBe('coalition');
  expect(partyGroup(name, 'money')).toBe('coalition');
});
test.each([
  'Greens',
  'One Nation',
  'Independent',
  'Other',
  'Liberal Democrats',
  'Democratic Labour Party',
  'National Socialist Party',
  'Family First',
  'United Australia Party',
  '',
])('%s uses the context-specific third group', (name) => {
  expect(partyGroup(name)).toBe('crossbench');
  expect(partyGroup(name, 'money')).toBe('other');
});
test('parliamentary order puts parties A to Z before Independent and Other', () => {
  const input = [
    'Other',
    'Independent',
    'One Nation',
    'Nationals',
    'Liberal National Party of Queensland',
    'Liberal',
    'Country Liberal Party',
    'Labor',
    'Greens',
  ];
  expect([...input].sort(partyOrder)).toEqual([
    'Labor',
    'Country Liberal Party',
    'Liberal',
    'Liberal National Party of Queensland',
    'Nationals',
    'Greens',
    'One Nation',
    'Independent',
    'Other',
  ]);
  expect(neutralPartyOrder).toBe(partyOrder);
  expect(input[0]).toBe('Other');
});
test('money says Other parties and sorts it alphabetically, including parties without seats', () => {
  expect(partyGroupLabel(partyGroup('Family First', 'money'))).toBe(
    'Other parties',
  );
  expect(partyGroupLabel(partyGroup('Greens'))).toBe('the crossbench');
  const rows = [
    { name: 'United Australia Party', total: 100 },
    { name: 'Greens', total: 20 },
    { name: 'Liberal', total: 5 },
    { name: 'Labor', total: 1 },
    { name: 'Family First', total: 8 },
  ];
  expect(
    byPartyGroup(rows, (row) => row.name, {
      context: 'money',
      totalOf: (row) => row.total,
    }).map((row) => row.name),
  ).toEqual([
    'Labor',
    'Liberal',
    'Family First',
    'Greens',
    'United Australia Party',
  ]);
  expect(
    byPartyGroup(rows, (row) => row.name, { totalOf: (row) => row.total }).map(
      (row) => row.name,
    ),
  ).toEqual([
    'Labor',
    'Liberal',
    'United Australia Party',
    'Greens',
    'Family First',
  ]);
  expect(rows[0]!.name).toBe('United Australia Party');
});
