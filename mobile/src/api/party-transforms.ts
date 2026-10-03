// samePartyLabel and PARTY_MAP labels ported from portal/public/app.js.
import { moneyName } from './transforms';
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
