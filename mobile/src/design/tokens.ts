// Role-based palette: add a dark palette through the same interface after approval.
export const light = {
  paper: '#FAF9F6',
  raised: '#FFFFFF',
  sunken: '#F1EFE8',
  ink: '#23271F',
  inkSoft: '#575C52',
  navy: '#142A43',
  bronze: '#A0761B',
  bronzeInk: '#8A5A12',
  bronzeWash: '#ECE4D3',
  dividerDefault: '#B8B4A8',
  dividerSubtle: '#DFDCD2',
  line: '#DFDCD2',
  lineStrong: '#8D897B',
  danger: '#A4262C',
  partyLabor: '#B02E33',
  partyLiberal: '#1D4F91',
  partyNationals: '#8F6E00',
  partyLnp: '#4A90D9',
  partyGreens: '#2E7D32',
  partyOneNation: '#BF5B15',
  partyIndependent: '#3E5B77',
  partyOther: '#7C6690',
};
export type Palette = { [K in keyof typeof light]: string };
export const colors: Palette = light;
export const spacing = { s1: 4, s2: 6, s3: 8, s4: 16, s5: 26, s6: 32, s7: 52 };
export const radius = 4;
export const minimumTarget = 44;
export const fonts = { serif: 'Merriweather', sans: 'PublicSans' };
export const textStyles = {
  title: {
    fontFamily: fonts.serif,
    fontSize: 34,
    dynamicTypeRamp: 'largeTitle',
  },
  heading: { fontFamily: fonts.serif, fontSize: 22, dynamicTypeRamp: 'title2' },
  subheading: {
    fontFamily: fonts.serif,
    fontSize: 18,
    dynamicTypeRamp: 'title3',
  },
  record: { fontFamily: fonts.serif, fontSize: 17, dynamicTypeRamp: 'body' },
  body: { fontFamily: fonts.sans, fontSize: 17, dynamicTypeRamp: 'body' },
  lede: { fontFamily: fonts.sans, fontSize: 16, dynamicTypeRamp: 'callout' },
  metadata: {
    fontFamily: fonts.sans,
    fontSize: 15,
    dynamicTypeRamp: 'subheadline',
  },
  fine: { fontFamily: fonts.sans, fontSize: 13, dynamicTypeRamp: 'footnote' },
  tag: { fontFamily: fonts.sans, fontSize: 13, dynamicTypeRamp: 'footnote' },
} as const;
