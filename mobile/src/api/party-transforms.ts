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
// Both the directory and full profile use dated seats first. Historical roster
// affiliations remain visible, but are never labelled as a current party.
export function personPartyFor(
  seats: SeatObservation[],
  row?: Roster['people'][number],
  affiliationRow?: Roster['people'][number],
) {
  const party = seats[0]?.party ?? row?.party_now ?? row?.party ?? null;
  const partyCurrent =
    seats[0]?.party != null || (row?.current === true && !!row.party_now);
  const rosterParty = row?.party ?? null;
  return {
    party,
    partyCurrent,
    rosterParty,
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
