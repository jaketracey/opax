import { light, partyColors, partyWashes, type Role } from './palette';

// WCAG 2.x relative luminance and contrast ratio for opaque hex colours.
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
export function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`Expected an opaque #RRGGBB colour: ${hex}`);
  const n = parseInt(match[1]!, 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

export type PairKind = 'text' | 'large-text' | 'non-text';
export const requiredRatio: Record<PairKind, number> = {
  text: 4.5,
  'large-text': 3,
  'non-text': 3,
};
export type DrawnState =
  | 'rest'
  | 'pressed'
  | 'selected'
  | 'focused'
  | 'error'
  | 'disabled'
  | 'loading';
export interface ColourPair {
  foreground: string;
  background: Role;
  kind: PairKind;
  state: DrawnState;
  /** Where the components draw this pair. */
  use: string;
}
const pair = (
  use: string,
  state: DrawnState,
  foreground: Role,
  background: Role,
  kind: PairKind = 'text',
): ColourPair => ({
  foreground: light[foreground],
  background,
  kind,
  state,
  use,
});

// Every foreground-on-surface pair the components draw, in every state they
// draw it: resting, pressed, selected, focused, error, disabled and loading.
// All states are opaque role colours (no opacity), so these are the colours
// on screen. tests/contrast.test.ts checks each one, and checks the rendered
// pressed and disabled states of the controls against this table. Add a row
// whenever a component draws a new pair.
export const componentPairs: ColourPair[] = [
  // Text roles on the surfaces screens use.
  ...(['paper', 'raised', 'sunken', 'bronzeWash'] as const).map((bg) =>
    pair('Text (ink): titles, headings, values', 'rest', 'ink', bg),
  ),
  ...(['paper', 'raised', 'sunken'] as const).map((bg) =>
    pair(
      'Text (inkSoft): metadata, fine print, as-at, chip keys',
      'rest',
      'inkSoft',
      bg,
    ),
  ),
  ...(['paper', 'raised'] as const).map((bg) =>
    pair(
      'Text (inkFaint): paper and raised only; Field placeholder',
      'rest',
      'inkFaint',
      bg,
    ),
  ),
  pair('Text on navy', 'rest', 'onNavySoft', 'navy'),
  pair('The mark on navy', 'rest', 'bronzeBright', 'navy', 'non-text'),

  // Button, primary.
  pair('Button primary label', 'rest', 'onNavy', 'navy'),
  pair(
    'Button primary fill against the page',
    'rest',
    'navy',
    'paper',
    'non-text',
  ),
  pair('Button primary label', 'pressed', 'onNavy', 'navyRaised'),
  pair('Button primary spinner', 'loading', 'onNavy', 'navy', 'non-text'),
  // Button, default: a tinted capsule with no outline.
  pair('Button default label', 'rest', 'navy', 'navyWash'),
  pair('Button default label', 'pressed', 'navy', 'sunken'),
  pair('Button default spinner', 'loading', 'navy', 'navyWash', 'non-text'),
  // Button, quiet.
  pair('Button quiet label', 'rest', 'navy', 'paper'),
  pair('Button quiet label', 'pressed', 'navy', 'sunken'),
  pair('Button quiet label', 'disabled', 'inkSoft', 'paper'),
  // Button, danger.
  pair('Button danger label', 'rest', 'danger', 'raised'),
  pair('Button danger boundary', 'rest', 'danger', 'paper', 'non-text'),
  pair('Button danger label', 'pressed', 'danger', 'sunken'),
  pair('Button danger boundary', 'pressed', 'danger', 'sunken', 'non-text'),
  // Disabled buttons share one label: inkSoft on sunken (primary and danger
  // keep a line-strong outline; the default capsule has none).
  pair('Button disabled label', 'disabled', 'inkSoft', 'sunken'),
  pair(
    'Button disabled boundary',
    'disabled',
    'lineStrong',
    'paper',
    'non-text',
  ),

  // IconButton (icons are non-text).
  pair('IconButton quiet icon', 'rest', 'navy', 'paper', 'non-text'),
  pair('IconButton default icon', 'rest', 'navy', 'raised', 'non-text'),
  pair('IconButton icon', 'pressed', 'navy', 'sunken', 'non-text'),
  pair('IconButton quiet icon', 'disabled', 'inkSoft', 'paper', 'non-text'),
  pair('IconButton default icon', 'disabled', 'inkSoft', 'sunken', 'non-text'),

  // Tag: pressed keeps the label colour and adds an outline and underline.
  pair('Tag label and hash', 'rest', 'bronzeInk', 'bronzeWash'),
  pair('Tag label and hash', 'pressed', 'bronzeInk', 'bronzeWash'),
  pair('Tag outline', 'pressed', 'bronzeInk', 'paper', 'non-text'),

  // FilterChip.
  pair('FilterChip key', 'rest', 'inkSoft', 'navyWash'),
  pair('FilterChip value and close icon', 'rest', 'ink', 'navyWash'),
  pair('FilterChip key', 'pressed', 'inkSoft', 'sunken'),
  pair('FilterChip value and close icon', 'pressed', 'ink', 'sunken'),

  // SegmentedControl.
  pair('Segment label', 'rest', 'navy', 'raised'),
  pair('Segment label', 'pressed', 'navy', 'sunken'),
  pair('Segment label', 'selected', 'onNavy', 'navy'),
  pair('Segmented boundary', 'rest', 'lineStrong', 'paper', 'non-text'),
  // ChoiceChips.
  pair('Choice chip label', 'rest', 'navy', 'navyWash'),
  pair('Choice chip label', 'pressed', 'navy', 'sunken'),
  pair('Choice chip label', 'selected', 'onNavy', 'navy'),
  pair('Choice chip label', 'pressed', 'onNavy', 'navyRaised'),

  // Field.
  pair('Field value', 'rest', 'ink', 'raised'),
  pair('Field placeholder', 'rest', 'inkFaint', 'raised'),
  pair('Field boundary', 'rest', 'lineStrong', 'paper', 'non-text'),
  pair('Field boundary (2pt)', 'focused', 'navy', 'paper', 'non-text'),
  pair('Field boundary (2pt)', 'error', 'danger', 'paper', 'non-text'),
  pair('Field error text and icon', 'error', 'danger', 'paper'),
  pair('Field value', 'disabled', 'ink', 'sunken'),
  pair('Field placeholder', 'disabled', 'inkSoft', 'sunken'),
  pair('Field boundary', 'disabled', 'lineStrong', 'paper', 'non-text'),

  // SourceLink and OpaxWebLink.
  pair(
    'SourceLink and OpaxWebLink label and icon',
    'rest',
    'bronzeInk',
    'paper',
  ),
  pair('OpaxWebLink cue', 'rest', 'inkSoft', 'paper'),
  pair(
    'SourceLink and OpaxWebLink label and icon',
    'pressed',
    'bronzeInk',
    'sunken',
  ),
  pair('OpaxWebLink cue', 'pressed', 'inkSoft', 'sunken'),

  // PersonRow: pressed is raised, so every party dot keeps 3:1.
  pair('PersonRow name', 'rest', 'ink', 'paper'),
  pair('PersonRow place, detail, chevron', 'rest', 'inkSoft', 'paper'),
  pair('PersonRow name', 'pressed', 'ink', 'raised'),
  pair('PersonRow place, detail, chevron', 'pressed', 'inkSoft', 'raised'),

  // States.
  pair('ErrorState icon', 'rest', 'danger', 'paper', 'non-text'),
  pair('OfflineBanner text and icon', 'rest', 'ink', 'paper'),

  // Category accents (UI sweep): symbols, display figures and short labels
  // in each accent ink, on paper, raised and the accent's own wash; ink and
  // inkSoft text on every wash (tinted tiles and section headers).
  ...(
    [
      ['moneyInk', 'moneyWash'],
      ['votesInk', 'votesWash'],
      ['interestsInk', 'interestsWash'],
      ['billsInk', 'billsWash'],
      ['navy', 'navyWash'],
      ['bronzeInk', 'bronzeWash'],
    ] as const
  ).flatMap(([ink, wash]) => [
    pair(`Accent ${ink}: symbols, figures, labels`, 'rest', ink, 'paper'),
    pair(`Accent ${ink}: symbols, figures, labels`, 'pressed', ink, 'sunken'),
    pair(`Accent ${ink} on raised`, 'rest', ink, 'raised'),
    pair(`Accent ${ink} symbol on its tile`, 'rest', ink, wash),
    pair(`Text (ink) on ${wash}`, 'rest', 'ink', wash),
    pair(`Text (inkSoft) on ${wash}`, 'rest', 'inkSoft', wash),
  ]),

  // Disclosure rows, LinkRow, InfoButton and ViewOriginal.
  pair('Disclosure and LinkRow label', 'rest', 'ink', 'paper'),
  pair('Disclosure and LinkRow label', 'pressed', 'ink', 'sunken'),
  pair('Disclosure value and chevron', 'rest', 'inkSoft', 'paper'),
  pair('Disclosure value and chevron', 'pressed', 'inkSoft', 'sunken'),
  pair('InfoButton symbol', 'rest', 'navy', 'paper', 'non-text'),
  pair('InfoButton symbol', 'pressed', 'navy', 'sunken', 'non-text'),
  pair('ViewOriginal label and symbol', 'rest', 'bronzeInk', 'paper'),
  pair('ViewOriginal label and symbol', 'pressed', 'bronzeInk', 'sunken'),
  pair('Caption (Updated …)', 'rest', 'inkSoft', 'paper'),

  // States: the empty note on paper; the error note on its sunken panel,
  // with Try again (Button default) inside it.
  pair('EmptyState message and symbol', 'rest', 'inkSoft', 'paper'),
  pair('ErrorState message', 'rest', 'ink', 'sunken'),
  pair(
    'Button default boundary on the error panel',
    'rest',
    'lineStrong',
    'sunken',
    'non-text',
  ),
  pair('ErrorState symbol', 'rest', 'danger', 'sunken', 'non-text'),

  // PartyLabel dots, on the row's resting and pressed surfaces.
  ...Object.entries(partyColors).flatMap(([party, hex]) =>
    (['paper', 'raised'] as const).map((background) => ({
      foreground: hex,
      background,
      kind: 'non-text' as const,
      state: background === 'paper' ? ('rest' as const) : ('pressed' as const),
      use: `PartyLabel dot (${party})`,
    })),
  ),
];

/**
 * Party chips and tinted profile headers draw ink and inkSoft text on each
 * party's wash (not a role: one per party). The dot sits on a raised ring,
 * so its pair is the PartyLabel dot on raised above.
 */
export const partyWashPairs = Object.entries(partyWashes).flatMap(
  ([party, wash]) =>
    (['ink', 'inkSoft'] as const).map((role) => ({
      use: `PartyChip ${role} on the ${party} wash`,
      foreground: light[role],
      background: wash,
    })),
);

// Pairs IOS-UX records as failing: components must never draw them.
export const forbiddenPairs: ColourPair[] = [
  pair('use inkSoft on sunken surfaces', 'rest', 'inkFaint', 'sunken'),
  pair('use inkSoft or bronzeInk on tags', 'rest', 'inkFaint', 'bronzeWash'),
  pair('bronze is for rules and chart marks', 'rest', 'bronze', 'paper'),
];

/** The pair the table lists for a drawn foreground and background, if any. */
export function listedPair(
  foreground: string,
  background: string,
  as: 'text' | 'non-text' = 'non-text',
): ColourPair | undefined {
  return componentPairs.find(
    (entry) =>
      entry.foreground.toLowerCase() === foreground.toLowerCase() &&
      light[entry.background].toLowerCase() === background.toLowerCase() &&
      // A pair listed as text also covers icons; a non-text row never covers text.
      (as === 'non-text' || entry.kind !== 'non-text'),
  );
}
