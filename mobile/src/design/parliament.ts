// Reader-facing names for the catalog's jurisdiction and chamber IDs: the one
// mapping every screen uses, so a raw ID ("vic_la", "federal") never reaches
// the reader. Wording follows portal/public/profile-jurisdictions.js, with the
// parliament named in each state chamber so a chamber stands on its own.

const jurisdictions: Record<string, { name: string; adjective: string }> = {
  federal: { name: 'Federal', adjective: 'Federal' },
  nsw: { name: 'New South Wales', adjective: 'New South Wales' },
  vic: { name: 'Victoria', adjective: 'Victorian' },
  qld: { name: 'Queensland', adjective: 'Queensland' },
  sa: { name: 'South Australia', adjective: 'South Australian' },
  wa: { name: 'Western Australia', adjective: 'Western Australian' },
  tas: { name: 'Tasmania', adjective: 'Tasmanian' },
  act: { name: 'Australian Capital Territory', adjective: 'ACT' },
  nt: { name: 'Northern Territory', adjective: 'Northern Territory' },
};

// Chamber IDs as the catalogs write them: federal houses by name, state houses
// as <jurisdiction>_<house>.
const federalChambers: Record<string, string> = {
  representatives: 'House of Representatives',
  senate: 'Senate',
  senate_committee: 'Senate committees',
};
const houses: Record<string, string> = {
  la: 'Legislative Assembly',
  lc: 'Legislative Council',
  ha: 'House of Assembly',
};

/** "Victoria", "Federal"; null for an ID this release does not know. */
export function jurisdictionName(id: string | null | undefined): string | null {
  return (id && jurisdictions[id.toLowerCase()]?.name) || null;
}

/**
 * "House of Representatives", "Senate", "Victorian Legislative Assembly",
 * "South Australian House of Assembly"; null for an unknown ID, which callers
 * must say in words ("Chamber not recorded") rather than print.
 */
export function chamberName(
  chamber: string | null | undefined,
  jurisdiction?: string | null,
): string | null {
  if (!chamber) return null;
  const id = chamber.toLowerCase();
  if (federalChambers[id]) return federalChambers[id];
  const match = /^([a-z]+)_(la|lc|ha)$/.exec(id);
  const state = match ? jurisdictions[match[1]!] : undefined;
  if (match && state && match[1] !== 'federal')
    return `${state.adjective} ${houses[match[2]!]}`;
  // Generic house names carry their parliament in the jurisdiction.
  const generic = { assembly: 'la', council: 'lc' }[id];
  const parent = jurisdiction
    ? jurisdictions[jurisdiction.toLowerCase()]
    : undefined;
  if (generic && parent && jurisdiction !== 'federal')
    return `${parent.adjective} ${houses[generic]}`;
  return null;
}

export const CHAMBER_NOT_RECORDED = 'Chamber not recorded';
