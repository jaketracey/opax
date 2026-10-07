export type Slot = 'person' | 'topic' | 'party' | 'industry' | 'bill';
export type Part = string | { slot: Slot };
export const shapes: Record<string, { label: string; variants: Part[][] }> = {
  person: {
    label: 'a person',
    variants: [
      ['What did ', { slot: 'person' }, ' say about ', { slot: 'topic' }, '?'],
      [
        'What would ',
        { slot: 'person' },
        ' say about ',
        { slot: 'topic' },
        '?',
      ],
    ],
  },
  party: {
    label: 'a party',
    variants: [
      [
        'What have ',
        { slot: 'party' },
        ' MPs said about ',
        { slot: 'topic' },
        '?',
      ],
      ['Who funds ', { slot: 'party' }, '?'],
    ],
  },
  money: {
    label: 'money',
    variants: [
      ['Who takes the most money from ', { slot: 'industry' }, ' donors?'],
      ['Who are the biggest donors to ', { slot: 'party' }, '?'],
      [
        'Who gets more money from ',
        { slot: 'industry' },
        ' donors, Labor or Liberal?',
      ],
    ],
  },
  pay: {
    label: 'pay',
    variants: [
      ['How much is ', { slot: 'person' }, ' paid?'],
      ['Who is the highest paid ', { slot: 'party' }, ' politician?'],
      ['Who is the highest paid politician?'],
    ],
  },
  bill: {
    label: 'a bill',
    variants: [
      ['What does the ', { slot: 'bill' }, ' change?'],
      ['Who spoke for and against the ', { slot: 'bill' }, '?'],
    ],
  },
};
export const industries = [
  'gambling',
  'finance',
  'mining',
  'fossil fuels',
  'property',
  'unions',
  'media',
  'tech',
  'telecom',
  'pharmacy',
  'health',
  'alcohol',
  'hospitality',
  'defence',
  'agriculture',
  'retail',
  'lobbying',
];
export function builderQuestion(
  shape: string,
  variant: number,
  values: Partial<Record<Slot, string>>,
) {
  const parts = shapes[shape]?.variants[variant];
  if (!parts) return null;
  if (parts.some((p) => typeof p !== 'string' && !values[p.slot]?.trim()))
    return null;
  return parts
    .map((p) => (typeof p === 'string' ? p : values[p.slot]!.trim()))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
