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
