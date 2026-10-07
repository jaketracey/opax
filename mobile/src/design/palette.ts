// Hex role palettes. Components never read these directly: they use `colors`
// from tokens.ts, which resolves each role for the current appearance and
// Increase Contrast. A dark palette is added here, then wired in tokens.ts.
export const light = {
  paper: '#FAF9F6',
  raised: '#FFFFFF',
  sunken: '#F1EFE8',
  ink: '#23271F',
  inkSoft: '#575C52',
  // Tertiary text, on paper and raised only (4.56 and 4.80:1). Fails on
  // sunken (4.17:1) and on the bronze wash (3.80:1): use inkSoft there.
  inkFaint: '#6F7468',
  navy: '#142A43',
  navyRaised: '#1D3A5C',
  onNavy: '#FFFFFF',
  onNavySoft: '#B7C6D9',
  // Rules and chart marks only (3.91:1): never text.
  bronze: '#A0761B',
  // Record links, tag labels and highlights.
  bronzeInk: '#8A5A12',
  // rgba(160,118,27,0.16) over paper, flattened for native views.
  bronzeWash: '#ECE4D3',
  // Bronze legible on navy: the mark.
  bronzeBright: '#D9A84A',
  danger: '#A4262C',
  // Decorative rules: major sections / rows and subheadings.
  dividerDefault: '#B8B4A8',
  dividerSubtle: '#DFDCD2',
  // Surface outlines (cards, chips) and control boundaries (3.33:1).
  line: '#DFDCD2',
  lineStrong: '#8D897B',
  // Category accents (UI sweep, Oct 2026): an ink for symbols, figures and
  // short labels (AA text on paper, raised and its own wash) and a wash for
  // tinted tiles and headers (ink and inkSoft stay AA on it). Never rainbow:
  // one accent per block, on top of paper, ink, navy and bronze.
  moneyInk: '#2B6447',
  moneyWash: '#E5EAE5',
  votesInk: '#3A4C96',
  votesWash: '#E7E8EC',
  interestsInk: '#7B3A63',
  interestsWash: '#EDE6E7',
  billsInk: '#1F5F6B',
  billsWash: '#E4EAE8',
  // People and places use navy on its own wash.
  navyWash: '#E4E6E7',
} as const;

export type Role = keyof typeof light;
export type Palette = Record<Role, string>;

// Increase Contrast: each text token steps to the next stronger one and the
// subtle divider takes the default divider colour (IOS-UX section 5).
export const lightHighContrast: Partial<Palette> = {
  inkFaint: light.inkSoft,
  inkSoft: light.ink,
  dividerSubtle: light.dividerDefault,
};

// Party identity: a dot with a readable label, never colour alone.
export const partyColors = {
  labor: '#B02E33',
  liberal: '#1D4F91',
  nationals: '#8F6E00',
  lnp: '#4A90D9',
  greens: '#2E7D32',
  oneNation: '#BF5B15',
  independent: '#3E5B77',
  other: '#7C6690',
} as const;
export type PartyKey = keyof typeof partyColors;

// Party tints: each party colour at 12% over paper, for party chips and
// profile headers. Ink (11.9:1 or more) and inkSoft (5.4:1 or more) stay AA
// on every wash; the dot sits on a raised ring, so it keeps its 3:1.
export const partyWashes: Record<PartyKey, string> = {
  labor: '#F1E1DF',
  liberal: '#DFE5EA',
  nationals: '#EDE8D8',
  lnp: '#E5ECF3',
  greens: '#E2EADE',
  oneNation: '#F3E6DB',
  independent: '#E3E6E7',
  other: '#EBE7EA',
};
