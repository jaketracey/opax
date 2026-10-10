// Port of portal/public/donor-entity.js (isOrganisationDonor and
// withholdIndividualDonors), with the same word list, acronym rule and
// fail-closed behaviour. The app reads the money graphs and access.json
// directly, so every donor name passes this gate before a screen can draw it.
//
// Donor nodes carry no entity type and no ABN, only a label, aliases and an
// industry tag, and individuals are often tagged with a sector. So the
// industry never counts, not even unions. Organisation evidence is a
// legal-form or organisation word as a whole token in the label or an alias,
// a trailing "Co", or a label that is one acronym of 3-7 capitals. An alias is
// never an acronym (it can be a person's initials), and ABN, ACN, ARBN and TFN
// are registration words, not names. Everything else is treated as an
// individual: a bare company name fails closed.
//
// Grant recipients and suppliers keep features/money-public/privacy.ts, whose
// inputs include the source's entity type and ABN type.

const ORGANISATION_WORDS = [
  'pty',
  'ltd',
  'limited',
  'proprietary',
  'inc',
  'incorporated',
  'corporation',
  'corp',
  'company',
  'co-operative',
  'cooperative',
  'co-op',
  'association',
  'union',
  'unions',
  'federation',
  'council',
  'trust',
  'foundation',
  'institute',
  'society',
  'club',
  'clubs',
  'party',
  'committee',
  'fund',
  'holdings',
  'group',
  'partners',
  'llp',
  'bank',
  'authority',
  'chamber',
  'alliance',
  'network',
  'services',
  'enterprises',
  'industries',
  'lawyers',
  'university',
  'college',
  'guild',
  'trades\\s+hall',
];
const ORGANISATION_WORD = new RegExp(
  `(?:^|[^a-z0-9])(?:${ORGANISATION_WORDS.join('|')})(?=$|[^a-z0-9])`,
  'i',
);
// "& Co" or "Pastoral Co" as the last word; "Co" elsewhere is too often part of a name.
const TRAILING_CO = /(?:^|[^a-z0-9])co\.?\s*$/i;
// A label that is one all-capitals token of 3-7 letters, such as "CFMEU".
const ACRONYM = /^[A-Z]{3,7}$/;
const REGISTRATION_WORDS = new Set(['ABN', 'ACN', 'ARBN', 'TFN']);

export interface DonorEntityNode {
  label?: unknown;
  aliases?: unknown;
  industry?: unknown;
}

export function isOrganisationDonor(
  node: DonorEntityNode | null | undefined,
): boolean {
  if (!node || typeof node.label !== 'string' || !node.label.trim())
    return false;
  const names = [
    node.label,
    ...(Array.isArray(node.aliases) ? (node.aliases as unknown[]) : []),
  ].filter((n): n is string => typeof n === 'string');
  if (names.some((n) => ORGANISATION_WORD.test(n) || TRAILING_CO.test(n)))
    return true;
  // The label only: an alias acronym can be a person's initials.
  const label = node.label.trim();
  return ACRONYM.test(label) && !REGISTRATION_WORDS.has(label);
}

/** What a withheld donor's own screen says. Never with the name. */
export const donorNotNamed = 'This donor is not named in OPAX.';
/** Where a total is shown, withheld donors are one row with their amounts kept. */
export const individualDonorsLabel = (count: number) =>
  `Individual donors (${count.toLocaleString('en-AU')})`;
/** Where a list drops withheld donors, one line counts them. */
export const individualDonorsNote = (count: number) =>
  count === 1
    ? '1 individual donor is not named in OPAX.'
    : `${count.toLocaleString('en-AU')} individual donors are not named in OPAX.`;

interface GraphNode {
  id: string;
  label: string;
  kind: string;
  aliases?: string[] | null;
  industry?: string | null;
}
interface GraphEdge {
  source: string;
  target: string;
}
export type Withheld<N> = N & { withheld?: true };

/**
 * A money graph in which every donor failing isOrganisationDonor is renamed
 * and re-keyed (its id embeds the name) and marked `withheld`. Amounts, years
 * and industry tags are kept, so totals stay true. The anonymous id is keyed
 * by the source id: a source id carried by two nodes stays one group, and a
 * group is withheld only when none of its nodes is an organisation. Screens
 * then aggregate or drop the marked nodes; a screen that forgets still cannot
 * draw the name.
 */
export function withholdIndividualDonors<
  G extends { nodes: GraphNode[]; edges: GraphEdge[] },
>(graph: G): Omit<G, 'nodes'> & { nodes: Withheld<G['nodes'][number]>[] } {
  type N = G['nodes'][number];
  const withheld = new Map<string, boolean>();
  for (const node of graph.nodes)
    if (node.kind === 'donor')
      withheld.set(
        node.id,
        (withheld.get(node.id) ?? true) && !isOrganisationDonor(node),
      );
  const anonymous = new Map<string, number>();
  for (const [id, hidden] of withheld)
    if (hidden) anonymous.set(id, anonymous.size + 1);
  if (!anonymous.size) return graph;
  const anonymousId = (id: string) => `donor:withheld-${anonymous.get(id)}`;
  const nodes = graph.nodes.map((node: N): Withheld<N> => {
    if (node.kind !== 'donor' || !anonymous.has(node.id)) return node;
    // A profile path embeds the name too.
    const { profileUrl: _profile, ...rest } = node as N & {
      profileUrl?: unknown;
    };
    return {
      ...(rest as N),
      id: anonymousId(node.id),
      label: `Donor ${anonymous.get(node.id)} (name withheld)`,
      aliases: [],
      withheld: true,
    };
  });
  const edges = graph.edges.map((e) =>
    anonymous.has(e.source) || anonymous.has(e.target)
      ? {
          ...e,
          source: anonymous.has(e.source) ? anonymousId(e.source) : e.source,
          target: anonymous.has(e.target) ? anonymousId(e.target) : e.target,
        }
      : e,
  );
  return { ...graph, nodes, edges };
}

/**
 * A donor tie in a register (a name match against the donor returns) is drawn
 * only for an organisation; other ties are kept. As the web's
 * publicOrganisationTies.
 */
export function publicTie(tie: {
  organisation: string;
  kind?: string;
  kinds?: string[];
  donor_id?: string;
  industry?: string | null;
}) {
  const kinds = tie.kinds?.length ? tie.kinds : [tie.kind ?? ''];
  if (!kinds.includes('donor') && !tie.donor_id) return true;
  return isOrganisationDonor({ ...tie, label: tie.organisation });
}
