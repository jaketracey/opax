import { contrastRatio } from '../../design/contrast';
import { partyDot } from '../../design/party';
import { light, partyColors } from '../../design/tokens';

// Today's colour, drawn only from the design system's own hexes (party
// colours, navy, bronze, paper, ink): a colour is darkened until white text
// on it reads at 5:1, or washed over paper for a light ground. Nothing here
// is a new hue. tests/today-tint.test.ts checks every pair Today draws.

const channels = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** `amount` of `to` over `from`, both opaque #RRGGBB. */
export function mix(from: string, to: string, amount: number): string {
  const a = channels(from);
  const b = channels(to);
  return `#${a
    .map((c, i) =>
      Math.round(c * (1 - amount) + b[i]! * amount)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;
}
/** The colour, darkened only as far as white text on it needs (5:1). */
export function deepOf(hex: string): string {
  let deep = hex;
  for (let step = 1; contrastRatio(deep, '#FFFFFF') < 5 && step <= 50; step++)
    deep = mix(hex, '#000000', step * 0.02);
  return deep;
}
/** A light ground of the colour over paper; ink and inkSoft keep AA on it. */
export const washOf = (hex: string, amount = 0.1) =>
  mix(light.paper, hex, amount);
/** White over the deep colour, softened, for secondary lines (4.5:1 or more). */
export function softOnDeep(deep: string): string {
  for (let amount = 0.3; amount > 0; amount -= 0.05) {
    const soft = mix('#FFFFFF', deep, amount);
    if (contrastRatio(soft, deep) >= 4.5) return soft;
  }
  return '#FFFFFF';
}

/** The colour as a mark (a dot, a rule) on `ground`: darkened only as far as 3:1 needs. */
export function markOn(hex: string, ground: string): string {
  let mark = hex;
  for (let step = 1; contrastRatio(mark, ground) < 3 && step <= 20; step++)
    mark = mix(hex, light.ink, step * 0.05);
  return mark;
}

export interface Accent {
  /** The identity colour: dots, bars and rules (3:1 on the wash). */
  base: string;
  /** Header ground under white text. */
  deep: string;
  /** Secondary text on the deep ground. */
  soft: string;
  /** Light ground for the card body and chips. */
  wash: string;
  /** Accent text on the wash (4.5:1). */
  ink: string;
}
export function accentOf(hex: string): Accent {
  const deep = deepOf(hex);
  const wash = washOf(hex);
  // Accent text steps toward ink until it reads at 4.5:1 on its own wash.
  let ink = deep;
  for (let step = 1; contrastRatio(ink, wash) < 4.5 && step <= 20; step++)
    ink = mix(deep, light.ink, step * 0.05);
  return { base: hex, deep, soft: softOnDeep(deep), wash, ink };
}

/** The brand accent: navy with the bronze mark. Bills and topics. */
export const brandAccent: Accent = {
  ...accentOf(light.navy),
  soft: light.onNavySoft,
};
/** Money (grants, programs): bronze, the web's money map colour. */
export const moneyAccent = accentOf(light.bronzeInk);

/**
 * A parliamentarian's accent: the recorded party's colour; the brand accent
 * when the edition names no party the design system colours.
 */
export function partyAccent(party: string | null | undefined): Accent {
  const dot = partyDot(party);
  return dot ? accentOf(dot) : brandAccent;
}

/**
 * Topic chips: one quiet hue per position, from the party palette's
 * non-party-coded neutrals and the brand, so no chip reads as a party.
 */
const topicHues = [light.navy, light.bronzeInk, partyColors.independent];
export const topicAccent = (index: number) =>
  accentOf(topicHues[index % topicHues.length]!);

export type BillTone = 'passed' | 'before' | 'draft' | 'ended' | 'unknown';
/** A bill status's tone; the status is always said in words beside it. */
export function billTone(status: string | null | undefined): BillTone {
  const s = (status ?? '').toLowerCase();
  if (/^(passed|assented|act)/.test(s)) return 'passed';
  if (/before|introduced|second|third|committee/.test(s)) return 'before';
  if (/exposure|draft|consultation/.test(s)) return 'draft';
  if (/fail|lapse|withdraw|negativ|not[ _]passed|discharg|removed/.test(s))
    return 'ended';
  return 'unknown';
}
const billHues: Record<BillTone, string> = {
  passed: partyColors.greens,
  before: light.navy,
  draft: light.bronzeInk,
  ended: light.inkSoft,
  unknown: light.inkSoft,
};
export const billAccent = (status: string | null | undefined) =>
  accentOf(billHues[billTone(status)]);
