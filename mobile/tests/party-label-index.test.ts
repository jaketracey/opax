// Reviewer label-resolution differential across catalog spellings and aliases.
import { decodeAecExtras, decodeMoney } from '../src/api/catalogs';
import { partyLabels, resolveParty } from '../src/api/party-page';
import { partySlug } from '../src/design/party';
import { decodeBillIndex, decodeBill } from '../src/api/catalog-decoders';
import { people, pinned, roster } from './pinned';

const money = decodeMoney(pinned('/graph/money.json'));
const extras = decodeAecExtras(pinned('/graph/aec-extras.json'));
const billIndex = decodeBillIndex(pinned('/bills/index.json'));
const all = partyLabels(roster, people, money);
const billParties = new Set<string>();
for (const b of billIndex.bills ?? []) {
  try {
    const detail = decodeBill(pinned(`/bills/${b.key}.json`)) as unknown as {
      divisions?: { parties?: Record<string, unknown> }[];
    };
    for (const d of detail.divisions ?? [])
      for (const p of Object.keys(d.parties ?? {})) billParties.add(p);
  } catch {
    /* not pinned */
  }
}
const inputs = [
  ...new Set([
    ...all,
    ...all.map(partySlug),
    ...all.map((l) => l.toLowerCase()),
    ...Object.keys(extras.parties),
    ...Object.keys(extras.parties).map(partySlug),
    ...billParties,
    ...[...billParties].map(partySlug),
    'ALP',
    'LNP',
    'Greens',
    'Nationals',
    'Liberal',
    'Liberal National Party',
    'Liberal National Party of Queensland',
    'Country Liberal Party',
    'One Nation',
    "Pauline Hanson's One Nation",
    'Teal',
    'Independent',
  ]),
];
test('label resolution: new (roster-first) equals old (money-inclusive)', () => {
  const diffs: unknown[] = [];
  for (const input of inputs) {
    const before = resolveParty(input, all);
    const after =
      resolveParty(input, partyLabels(roster, people)) ??
      resolveParty(input, all);
    if (before !== after) diffs.push({ input, before, after });
  }
  expect(diffs).toEqual([]);
});
