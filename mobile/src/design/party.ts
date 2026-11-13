import type { PartyStatus } from '../api/party-transforms';
import { PARTY_RENAMES, type PartyRename } from './party-renames';
import {
  partyColors,
  partyColorsDark,
  partyWashes,
  type PartyKey,
} from './palette';

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

/** Recorded affiliations and presiding roles are not necessarily parties. */
export function isPartyLabel(party: string | null | undefined): boolean {
  const name = party
    ?.trim()
    .toLocaleLowerCase('en-AU')
    .replace(/[‐‑‒–\u2014]/g, '-');
  return (
    !!name &&
    !/^(?:ind(?:ependent)?s?\b|unaligned\b|non[ -]?aligned\b|unaffiliated\b|non[ -]?party\b|pres$|spk$|(?:party )?not recorded$)/.test(
      name,
    )
  );
}

/** Presiding codes name a role, never a party. */
export function presidingRole(
  label: string | null | undefined,
): 'Speaker' | 'President' | null {
  switch (label?.trim().toLocaleUpperCase('en-AU')) {
    case 'SPK':
      return 'Speaker';
    case 'PRES':
      return 'President';
    default:
      return null;
  }
}

const fold = (name: string) =>
  name.trim().toLocaleLowerCase('en-AU').replace(/’/g, "'");
const knownParty = (name: string) => parties[fold(name)];

// Every name, alias, slug and code of a renamed party, to its rename record.
const renameIndex = new Map<string, PartyRename>();
for (const rename of PARTY_RENAMES)
  for (const name of [
    rename.name,
    ...rename.former.flatMap((f) => [f.name, ...(f.aliases ?? [])]),
  ]) {
    renameIndex.set(fold(name), rename);
    renameIndex.set(partySlug(name), rename);
  }
for (const rename of PARTY_RENAMES) renameIndex.set(fold(rename.code), rename);

/**
 * The rename record for a party label, a slug of one of its names, or its
 * code: "Liberal Democrats", "liberal-democratic-party" and "LDP" are the
 * Libertarian Party. Null for every other party.
 */
export function partyRename(
  party: string | null | undefined,
): PartyRename | null {
  const name = party?.trim();
  return name ? (renameIndex.get(fold(name)) ?? null) : null;
}

/** The party's current name: a former name reads as its later one. */
export const currentPartyName = (party: string) =>
  partyRename(party)?.name ?? party;

/**
 * The record's own label when it carries a former name of a renamed party
 * ("Liberal Democratic Party"), for a "Recorded as" line; null otherwise.
 * The record keeps its label: this never relabels it.
 */
export function formerPartyName(
  party: string | null | undefined,
): string | null {
  const rename = partyRename(party);
  const name = party?.trim();
  return rename &&
    name &&
    rename.former.some((f) =>
      [f.name, ...(f.aliases ?? [])].some((n) => fold(n) === fold(name)),
    )
    ? name
    : null;
}

/** "Recorded as Liberal Democratic Party", or null for a current name. */
export function recordedAsLine(party: string | null | undefined) {
  const former = formerPartyName(party);
  return former ? `Recorded as ${former}` : null;
}

/**
 * One code per party, for comparing labels: the dense label (ALP, LIB), or a
 * renamed party's code for any of its names. Names stay as recorded; only
 * the comparison is shared.
 */
export const partyCode = (party: string) =>
  partyRename(party)?.code ?? partyIdentity(party).short;

export function partyIdentity(party: string | null | undefined): PartyIdentity {
  const name = party?.trim();
  if (!name)
    return {
      name: PARTY_NOT_RECORDED,
      short: PARTY_NOT_RECORDED,
      color: null,
      recorded: false,
    };
  const known = knownParty(name);
  return {
    name,
    short: known?.short ?? name,
    // Unmapped parties keep the neutral "other" dot; the label carries meaning.
    color: partyColors[known?.key ?? 'other'],
    recorded: true,
  };
}

/**
 * The dot beside a label: a party's colour, or the Independent grey (the
 * web's party-ind chip). Independent is a label, never a link; other
 * affiliations and presiding roles get no dot.
 */
export function partyDot(
  party: string | null | undefined,
  appearance: 'light' | 'dark' | null = 'light',
): string | null {
  const identity = partyIdentity(party);
  return isPartyLabel(party) || knownParty(identity.name)?.key === 'independent'
    ? appearance === 'dark'
      ? partyColorsDark[knownParty(identity.name)?.key ?? 'other']
      : identity.color
    : null;
}

/** The party's tint for chips and headers; the neutral "other" wash otherwise. */
export function partyWash(party: string | null | undefined): string {
  const name = party?.trim();
  return partyWashes[(name && knownParty(name)?.key) || 'other'];
}

/**
 * The web's samePartyLabel: two names for one party compare equal ("Labor",
 * "ALP"; "Liberal Democratic Party", "Libertarian Party").
 */
export function samePartyLabel(a: string, b: string): boolean {
  return partyCode(a) === partyCode(b);
}

export interface PartyContext {
  /** The party exactly as recorded, or null. */
  party: string | null | undefined;
  /**
   * "former" only when the data says the person no longer sits (an ended
   * dated seat, or a roster that says so). "unknown" means the data does not
   * date the party: never said as former, never as sitting. The label itself
   * draws every status the same; rows say "Former member" (`formerMember`).
   */
  status: PartyStatus;
  /** The previous party, when it differs from this one. */
  formerly?: string | null;
}

/**
 * What a party label says, in words: the party they sit (or last sat) for,
 * "Labor", and "One Nation, formerly Nationals" only for a recorded change of
 * party. Whether they still sit is never the label's to say (TestFlight build
 * 32: "Formerly should be reserved for people who left one party to join
 * another"); rows say it with their years or a quiet "Former member" line
 * (`formerMember`). Shared by the visible and VoiceOver labels so they never
 * disagree.
 */
export function partyText(
  { party, formerly }: PartyContext,
  dense = false,
): { visible: string; previous: string | null; spoken: string } {
  const identity = partyIdentity(party);
  if (!identity.recorded)
    return { visible: identity.name, previous: null, spoken: identity.name };
  const label = dense ? identity.short : identity.name;
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

/**
 * Slugs are derived only from recorded labels; this adds no party aliases.
 * (A renamed party's former slugs resolve through `partyRename`.)
 */
export function partySlug(name: string) {
  // A declaration, not a const: the rename index above runs at load.
  return name
    .trim()
    .toLocaleLowerCase('en-AU')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * One recorded label for the input, or null: an exact label, a derived slug,
 * or one party identity among the labels. Never a prefix match, and never a
 * non-party label (Independent, presiding roles). A renamed party resolves to
 * its current name from any of its names or their slugs, when the labels
 * record it under any of them.
 */
export function resolveParty(input: string, labels: string[]): string | null {
  if (!isPartyLabel(input)) return null;
  labels = labels.filter(isPartyLabel);
  const renamed = partyRename(input);
  if (renamed)
    return labels.some((label) => partyRename(label) === renamed)
      ? renamed.name
      : null;
  const exactName = labels.find((label) => label === input);
  const slugMatches = labels.filter((label) => partySlug(label) === input);
  const candidates = exactName
    ? [exactName]
    : slugMatches.length
      ? slugMatches
      : [input];
  const matches = labels.filter((label) =>
    candidates.some((candidate) => samePartyLabel(label, candidate)),
  );
  const identities = new Set(matches.map(partyCode));
  if (identities.size !== 1) return null;
  return currentPartyName(matches[0]!);
}

/**
 * The quiet status line for someone the data dates as no longer sitting.
 * Only a known former member gets it: "unknown" (an undated party, often a
 * sitting state MP the roster does not date) says nothing either way.
 */
export const formerMember = (status: PartyStatus | undefined) =>
  status === 'former' ? 'Former member' : null;

/** The shared neutral order for OPAX's own party lists. */
export { partyOrder as neutralPartyOrder } from './party-groups';
