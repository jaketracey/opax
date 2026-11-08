// Party codes the exports carry ("ALP", "JLN") as the party's name, so a
// PartyLabel draws a dot and a name, never a bare code (pass 5 P2-14, P2-17).
// One table for bill sponsors (Today and Bills) and topic counts.
const partyCodes: Record<string, string> = {
  ALP: 'Labor',
  LIB: 'Liberal',
  LP: 'Liberal',
  NAT: 'Nationals',
  NATS: 'Nationals',
  LNP: 'Liberal National Party of Queensland',
  CLP: 'Country Liberal Party',
  GRN: 'Greens',
  AG: 'Greens',
  ONP: 'One Nation',
  PHON: 'One Nation',
  IND: 'Independent',
  CA: 'Centre Alliance',
  KAP: "Katter's Australian Party",
  UAP: 'United Australia Party',
  AD: 'Australian Democrats',
  FF: 'Family First',
  JLN: 'Jacqui Lambie Network',
};

/** "JLN" as "Jacqui Lambie Network"; a recorded name stays as written. */
export function partyFromCode(party: string): string;
export function partyFromCode(party: string | null | undefined): string | null;
export function partyFromCode(party: string | null | undefined) {
  const name = party?.trim();
  if (!name) return null;
  return partyCodes[name.toUpperCase()] ?? name;
}

export type PartyBloc = 'labor' | 'coalition' | 'crossbench';
const LABOR = new Set(['labor', 'australian labor party', 'alp']);
const COALITION = new Set([
  'liberal',
  'liberal party',
  'liberal party of australia',
  'lib',
  'lp',
  'nationals',
  'the nationals',
  'national',
  'national party',
  'nat',
  'nats',
  'liberal national party of queensland',
  'liberal national party',
  'lnp',
  'country liberal party',
  'clp',
]);
/**
 * The three groups a vote's party rows sit in, in this fixed order: Labor;
 * the Coalition (Liberal, Nationals, LNP, CLP); the crossbench (every other
 * party and independents). One table, tested.
 */
export function partyBloc(party: string | null | undefined): PartyBloc {
  const name = (partyFromCode(party) ?? '').trim().toLocaleLowerCase('en-AU');
  const code = String(party ?? '')
    .trim()
    .toLocaleLowerCase('en-AU');
  if (LABOR.has(name) || LABOR.has(code)) return 'labor';
  if (COALITION.has(name) || COALITION.has(code)) return 'coalition';
  return 'crossbench';
}
export const blocNames: Record<PartyBloc, string> = {
  labor: 'Labor',
  coalition: 'The Coalition',
  crossbench: 'The crossbench',
};
export const blocOrder: readonly PartyBloc[] = [
  'labor',
  'coalition',
  'crossbench',
];
