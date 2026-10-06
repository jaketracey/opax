import type { PartyStatus } from '../api/party-transforms';
import { partyColors, type PartyKey } from './palette';

// The web's party map (portal/public/app.js PARTY_MAP): the colour class and
// the short label used only in dense rows. Names stay as the data gives them.
const parties: Record<string, { key: PartyKey; short: string }> = {
  labor: { key: 'labor', short: 'ALP' },
  'australian labor party': { key: 'labor', short: 'ALP' },
  liberal: { key: 'liberal', short: 'LIB' },
  'liberal party of australia': { key: 'liberal', short: 'LIB' },
  nationals: { key: 'nationals', short: 'NAT' },
  'the nationals': { key: 'nationals', short: 'NAT' },
  'national party of australia': { key: 'nationals', short: 'NAT' },
  lnp: { key: 'lnp', short: 'LNP' },
  'liberal national party of queensland': { key: 'lnp', short: 'LNP' },
  'country liberal party': { key: 'nationals', short: 'CLP' },
  greens: { key: 'greens', short: 'GRN' },
  'australian greens': { key: 'greens', short: 'GRN' },
  'one nation': { key: 'oneNation', short: 'ONP' },
  "pauline hanson's one nation": { key: 'oneNation', short: 'ONP' },
  independent: { key: 'independent', short: 'IND' },
  'centre alliance': { key: 'other', short: 'CA' },
  "katter's australian party": { key: 'other', short: 'KAP' },
  'united australia party': { key: 'other', short: 'UAP' },
  'australian democrats': { key: 'other', short: 'AD' },
  'family first': { key: 'other', short: 'FF' },
  dlp: { key: 'other', short: 'DLP' },
  jln: { key: 'other', short: 'JLN' },
};

export interface PartyIdentity {
  /** The readable label, exactly as recorded. */
  name: string;
  /** The dense-row label (ALP, LIB, GRN); the name when there is none. */
  short: string;
  /** Dot colour, or null when the party is unknown: no dot is drawn. */
  color: string | null;
  recorded: boolean;
}

export const PARTY_NOT_RECORDED = 'Party not recorded';

export function partyIdentity(party: string | null | undefined): PartyIdentity {
  const name = party?.trim();
  if (!name)
    return {
      name: PARTY_NOT_RECORDED,
      short: PARTY_NOT_RECORDED,
      color: null,
      recorded: false,
    };
  const known = parties[name.toLocaleLowerCase('en-AU').replace(/’/g, "'")];
  return {
    name,
    short: known?.short ?? name,
    // Unmapped parties keep the neutral "other" dot; the label carries meaning.
    color: partyColors[known?.key ?? 'other'],
    recorded: true,
  };
}

/** The web's samePartyLabel: two names for one party compare equal ("Labor", "ALP"). */
export function samePartyLabel(a: string, b: string): boolean {
  return partyIdentity(a).short === partyIdentity(b).short;
}

export interface PartyContext {
  /** The party exactly as recorded, or null. */
  party: string | null | undefined;
  /**
   * "former" only when the data says the person no longer sits (an ended
   * dated seat, or a roster that says so). "unknown" means the data does not
   * date the party: it is drawn plainly, never as former and never as sitting.
   */
  status: PartyStatus;
  /** The previous party, when it differs from this one. */
  formerly?: string | null;
}

/**
 * What a party label says, in words, with its status: "Labor" (current, or
 * not dated), "Formerly Labor" (known former), "One Nation, formerly
 * Nationals". Shared by the visible label and the VoiceOver label so they
 * never disagree.
 */
export function partyText(
  { party, status, formerly }: PartyContext,
  dense = false,
): { visible: string; previous: string | null; spoken: string } {
  const identity = partyIdentity(party);
  if (!identity.recorded)
    return { visible: identity.name, previous: null, spoken: identity.name };
  const label = dense ? identity.short : identity.name;
  if (status === 'former')
    return {
      visible: `Formerly ${label}`,
      previous: null,
      spoken: `Formerly ${identity.name}`,
    };
  const before =
    formerly && !samePartyLabel(formerly, identity.name)
      ? partyIdentity(formerly)
      : null;
  return {
    visible: label,
    previous: before ? `formerly ${dense ? before.short : before.name}` : null,
    spoken: before
      ? `${identity.name}, formerly ${before.name}`
      : identity.name,
  };
}
