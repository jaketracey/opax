export const PARTY_GROUPS = ['labor', 'coalition', 'crossbench'] as const;
export const MONEY_PARTY_GROUPS = ['labor', 'coalition', 'other'] as const;
export const COALITION_ORDER = [
  'Country Liberal',
  'Liberal',
  'Liberal National',
  'National',
] as const;
export type PartyGroup = (typeof PARTY_GROUPS)[number];
export type MoneyPartyGroup = (typeof MONEY_PARTY_GROUPS)[number];
export type PartyListContext = 'parliament' | 'money';

const normalise = (name: string) =>
  name
    .trim()
    .toLocaleLowerCase('en-AU')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ');
function identity(name: string): {
  group: PartyGroup;
  order: number;
  name: string;
} {
  const key = normalise(name);
  if (/^(?:alp|labor|labour|australian labo[u]?r party)(?:\b|$)/.test(key))
    return { group: 'labor', order: 0, name: key };
  if (/^(?:clp|country liberal)(?:\b|$)/.test(key))
    return { group: 'coalition', order: 0, name: key };
  if (/^(?:lnp|liberal national)(?:\b|$)/.test(key))
    return { group: 'coalition', order: 2, name: key };
  if (
    /^(?:lib|liberal|liberal party(?: of australia)?)(?:$| (?:nsw|vic|qld|sa|wa|tas|act|nt)(?: branch)?$)/.test(
      key,
    )
  )
    return { group: 'coalition', order: 1, name: key };
  if (
    /^(?:nat|nats|national|nationals|the nationals|national party(?: of australia)?)(?:$| (?:nsw|vic|qld|sa|wa|tas|act|nt)(?: branch)?$)/.test(
      key,
    )
  )
    return { group: 'coalition', order: 3, name: key };
  return {
    group: 'crossbench',
    order: /^(?:ind|independent|independents)$/.test(key)
      ? 1
      : /^(?:other|unknown|party not recorded)$/.test(key) || !key
        ? 2
        : 0,
    name: key,
  };
}
export function partyGroup(name: string): PartyGroup;
export function partyGroup(name: string, context: 'money'): MoneyPartyGroup;
export function partyGroup(
  name: string,
  context: PartyListContext,
): PartyGroup | MoneyPartyGroup;
export function partyGroup(
  name: string,
  context: PartyListContext = 'parliament',
): PartyGroup | MoneyPartyGroup {
  const group = identity(name).group;
  return context === 'money' && group === 'crossbench' ? 'other' : group;
}
export function partyGroupLabel(group: PartyGroup | MoneyPartyGroup): string {
  return {
    labor: 'Labor',
    coalition: 'the Coalition',
    crossbench: 'the crossbench',
    other: 'Other parties',
  }[group];
}
/** Group order is fixed. Coalition parties sort alphabetically by their canonical names. */
export function partyOrder(a: string, b: string): number {
  const left = identity(a),
    right = identity(b);
  return (
    PARTY_GROUPS.indexOf(left.group) - PARTY_GROUPS.indexOf(right.group) ||
    left.order - right.order ||
    left.name.localeCompare(right.name, 'en-AU')
  );
}
/** A stable copy; third-party source tables retain their own order. */
export function byPartyGroup<T>(
  rows: readonly T[],
  nameOf: (row: T) => string,
  options: { context?: PartyListContext; totalOf?: (row: T) => number } = {},
): T[] {
  return [...rows].sort((a, b) => {
    const left = identity(nameOf(a)),
      right = identity(nameOf(b));
    const group =
      PARTY_GROUPS.indexOf(left.group) - PARTY_GROUPS.indexOf(right.group);
    if (group) return group;
    // Money's Other parties is alphabetical, including parties without seats.
    if (options.context === 'money' && left.group === 'crossbench')
      return left.name.localeCompare(right.name, 'en-AU');
    if (options.totalOf && left.group === 'crossbench')
      return (
        options.totalOf(b) - options.totalOf(a) ||
        partyOrder(nameOf(a), nameOf(b))
      );
    return partyOrder(nameOf(a), nameOf(b));
  });
}
