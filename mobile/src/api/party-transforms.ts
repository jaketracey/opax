// samePartyLabel and PARTY_MAP labels ported from portal/public/app.js.
import { moneyName } from './transforms';
import type { Roster, SeatObservation } from './catalog-decoders';
const partyLabels: Record<string, string> = {
  labor: 'ALP',
  liberal: 'LIB',
  nationals: 'NAT',
  lnp: 'LNP',
  'country liberal party': 'CLP',
  greens: 'GRN',
  'one nation': 'ONP',
  independent: 'IND',
  'centre alliance': 'CA',
  "katter's australian party": 'KAP',
  'united australia party': 'UAP',
  'australian democrats': 'AD',
  'family first': 'FF',
  dlp: 'DLP',
  jln: 'JLN',
};
export function samePartyLabel(a: string, b: string) {
  const label = (party: string) =>
    Object.hasOwn(partyLabels, String(party).toLowerCase())
      ? partyLabels[String(party).toLowerCase()]
      : String(party);
  return label(a) === label(b);
}
/**
 * Whether a person's party is their affiliation today, a former one, or one
 * the data does not date. Unknown is common: the roster's `current` flag comes
 * only from the federal APH list, and the dated seat release covers federal
 * House history plus current senators and Victorian members. Only "former"
 * may be drawn as "Formerly X"; unknown is drawn plainly, as the web does.
 */
export type PartyStatus = 'current' | 'former' | 'unknown';
// `seats` are all of the person's dated observations, current and ended.
export function partyStatusFor(
  seats: SeatObservation[],
  row?: Roster['people'][number],
): PartyStatus {
  if (
    seats.some((s) => s.current) ||
    (row?.current === true && !!row.party_now)
  )
    return 'current';
  if (row?.current === false) return 'former';
  // An ended seat proves a former member only where the dated release speaks
  // for every jurisdiction the roster records: an ended federal seat says
  // nothing about a state seat (Janelle Saffin's Page seat ended in 2013; the
  // roster also records her for Lismore, which no dated release covers).
  const dated = new Set(seats.map((s) => s.jurisdiction));
  const recorded = [
    ...(row?.states ?? []),
    ...(row?.representation ?? []).map((r) => r.jurisdiction),
  ];
  return seats.length && recorded.every((j) => dated.has(j))
    ? 'former'
    : 'unknown';
}
// Both the directory and full profile use dated seats first. Historical roster
// affiliations remain visible, but are never labelled as a current party.
export function personPartyFor(
  seats: SeatObservation[],
  row?: Roster['people'][number],
  affiliationRow?: Roster['people'][number],
) {
  const current = seats.filter((s) => s.current);
  return {
    party: current[0]?.party ?? row?.party_now ?? row?.party ?? null,
    partyStatus: partyStatusFor(seats, row),
    rosterParty: row?.party ?? null,
    // Former affiliations need a distinct, named roster party_now observation;
    // a different seat label alone does not establish a party change.
    formerly:
      affiliationRow?.party_now &&
      affiliationRow.party &&
      !samePartyLabel(affiliationRow.party_now, affiliationRow.party)
        ? affiliationRow.party
        : null,
  };
}
// Link-only projection of graph/money.json at the fixture sourceCommit.
// No figures: profiles need only the register's party labels/aliases. Tests
// compare this tiny projection with the complete pinned source on every run.
export const receiptParties = {
  generated: '2026-09-21',
  parties: [
    {
      label: 'Labor',
      aliases: [],
    },
    {
      label: 'Liberal',
      aliases: [],
    },
    {
      label: 'LNP',
      aliases: [],
    },
    {
      label: 'United Australia Party',
      aliases: [],
    },
    {
      label: 'Greens',
      aliases: [],
    },
    {
      label: 'Nationals',
      aliases: [],
    },
    {
      label: 'Family First',
      aliases: [],
    },
    {
      label: 'One Nation',
      aliases: [],
    },
    {
      label: "Katter's Australian Party",
      aliases: [],
    },
    {
      label: 'Country Liberal Party',
      aliases: [],
    },
    {
      label: 'Centre Alliance',
      aliases: [],
    },
  ],
} as const;
export function partyReceiptsFor(party: string | null) {
  const nn = moneyName(party ?? '');
  const nodes = receiptParties.parties;
  const node =
    nodes.find((n) => moneyName(n.label) === nn) ||
    nodes.find((n) => n.aliases.some((a: string) => moneyName(a) === nn)) ||
    (nn
      ? nodes.find(
          (n) =>
            moneyName(n.label).startsWith(nn) ||
            nn.startsWith(moneyName(n.label)),
        )
      : undefined);
  return {
    url:
      node && party ? `/subject/party/${encodeURIComponent(party)}` : '/money',
    caption: 'Party disclosures, not this person’s finances.',
    party: node?.label ?? null,
  };
}
