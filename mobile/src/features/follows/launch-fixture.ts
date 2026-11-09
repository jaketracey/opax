import { Settings } from 'react-native';
import { isE2E } from '../../design/environment';
import type { Follow } from './store';
// Fifty identities from the pinned roster. This module is replaced in release builds.
const people = [
  { id: '10001', title: 'Tony Abbott' },
  { id: '10313', title: 'John Howard' },
  { id: '10007', title: 'Anthony Albanese' },
  { id: '10257', title: 'Julia Gillard' },
  { id: '10468', title: 'Scott Morrison' },
  { id: '10552', title: 'Kevin Rudd' },
  { id: '10149', title: 'Peter Costello' },
  { id: '10643', title: 'Malcolm Turnbull' },
  { id: '10306', title: 'Joe Hockey' },
  { id: '11010', title: 'Shoebridge' },
  { id: '10617', title: 'Wayne Swan' },
  { id: '10060', title: 'Chris Bowen' },
  { id: '10553', title: 'Philip Ruddock' },
  { id: '10580', title: 'Bill Shorten' },
  { id: '10081', title: 'Tony Burke' },
  { id: '10473', title: 'John Murphy' },
  { id: '10524', title: 'Christopher Pyne' },
  { id: '10035', title: 'Kim Beazley' },
  { id: '10179', title: 'Alexander Downer' },
  { id: '10011', title: 'John Anderson' },
  { id: '10632', title: 'Kelvin Thomson' },
  { id: '10641', title: 'Warren Truss' },
  { id: '10218', title: 'Martin Ferguson' },
  { id: '10158', title: 'Simon Crean' },
  { id: '10047', title: 'Julie Bishop' },
  { id: '10014', title: 'Kevin Andrews' },
  { id: '10431', title: 'Robert McClelland' },
  { id: '10230', title: 'Joel Fitzgibbon' },
  { id: '10188', title: 'Peter Dutton' },
  { id: '10590', title: 'Peter Slipper' },
  { id: '10409', title: 'Jenny Macklin' },
  { id: '10743', title: 'Michael McCormack' },
  { id: '10275', title: 'Jill Hall' },
  { id: '10813', title: 'Pat Conroy' },
  { id: '10790', title: 'Henderson' },
  { id: '10513', title: 'Tanya Plibersek' },
  { id: '10781', title: 'Ruston' },
  { id: '10827', title: 'Canavan' },
  { id: '10512', title: 'Graham Perrett' },
  { id: '10436', title: 'Peter McGauran' },
  { id: '10551', title: 'Nicola Roxon' },
  { id: '10599', title: 'Warren Snowdon' },
  { id: '10758', title: 'McKenzie' },
  { id: '10741', title: 'Josh Frydenberg' },
  { id: '10319', title: 'Greg Hunt' },
  { id: '10483', title: 'Brendan Nelson' },
  { id: '10350', title: 'Barnaby Joyce' },
  { id: '10352', title: 'Bob Katter' },
  { id: '10165', title: 'Michael Danby' },
  { id: '10951', title: 'McDonald' },
];
export function seededFollows(): Follow[] | null {
  if (!isE2E) return null;
  try {
    if (String(Settings.get('OPAXSeedFollows')) !== '50') return null;
  } catch {
    return null;
  }
  return people.map((person) => ({
    ...person,
    kind: 'person',
    followedAt: 1791072000000,
    seen: null,
    seenAt: null,
  }));
}
