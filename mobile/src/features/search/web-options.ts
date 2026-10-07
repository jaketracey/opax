// Pinned portal/public/index.html and app.js options; drift is tested.
export const recordTypes = [
  {
    value: 'all',
    label: 'All records',
  },
  {
    value: 'person',
    label: 'People',
  },
  {
    value: 'party',
    label: 'Political parties',
  },
  {
    value: 'donor',
    label: 'Donors',
  },
  {
    value: 'receipt',
    label: 'Political receipts',
  },
  {
    value: 'supplier',
    label: 'Suppliers',
  },
  {
    value: 'agency',
    label: 'Government agencies',
  },
  {
    value: 'contract',
    label: 'Government contracts',
  },
  {
    value: 'grant',
    label: 'Grants',
  },
  {
    value: 'interest',
    label: 'Declared interests',
  },
  {
    value: 'expense',
    label: 'Parliamentary expenses',
  },
  {
    value: 'pay',
    label: 'Parliamentary pay',
  },
  {
    value: 'access',
    label: 'Meetings and lobbying registers',
  },
  {
    value: 'campaigner',
    label: 'Campaigners and associated entities',
  },
  {
    value: 'bill',
    label: 'Bills',
  },
  {
    value: 'speech',
    label: 'Speeches and hearings',
  },
  {
    value: 'division',
    label: 'Divisions (recorded votes)',
  },
  {
    value: 'press_release',
    label: 'Government transcripts and releases',
  },
  {
    value: 'report',
    label: 'Research reports',
  },
  {
    value: 'grant_invitation',
    label: 'Grant invitations',
  },
  {
    value: 'grant_award',
    label: 'Grant award source records',
  },
  {
    value: 'election_baseline',
    label: 'Election baselines',
  },
  {
    value: 'parliamentary_profile',
    label: 'Recorded representation',
  },
  {
    value: 'research_report',
    label: 'Research source notes',
  },
] as const;
export const topics = {
  gambling: 'Gambling',
  'financial-services': 'Financial services',
  'mining-energy': 'Mining & energy',
  'climate-environment': 'Climate & environment',
  'property-construction': 'Property & construction',
  housing: 'Housing',
  health: 'Health',
  'media-communications': 'Media & communications',
  'hospitality-alcohol': 'Hospitality & alcohol',
  'defence-security': 'Defence & security',
  agriculture: 'Agriculture',
  'unions-workplace': 'Unions & workplace',
  immigration: 'Immigration',
  'indigenous-affairs': 'Indigenous affairs',
  'tax-budget': 'Tax & budget',
  education: 'Education',
  'welfare-social': 'Welfare & social services',
  'integrity-democracy': 'Integrity & democracy',
  'infrastructure-transport': 'Infrastructure & transport',
  'justice-law': 'Justice & law',
  'foreign-affairs': 'Foreign affairs',
} as const;
export const examples = [
  'Woodside',
  'Austal',
  'Qantas',
  'University of Tasmania',
  'housing',
  'renewable energy',
  'aged care',
  'childcare',
  'bulk billing',
  'student debt',
  'supermarket prices',
  'penalty rates',
  'climate change',
  'renewable energy',
  'housing affordability',
  'robodebt',
  'gambling advertising',
  'Uluru Statement',
  'submarines',
  'bushfires',
  'domestic violence',
  'public transport',
  'vaping',
  'interest rates',
  'aged pension',
  'childcare subsidy',
] as const;
export const parties = [
  'Labor',
  'Liberal',
  'Nationals',
  'LNP',
  'Greens',
  'Independent',
  'One Nation',
  'Centre Alliance',
  "Katter's Australian Party",
  'United Australia Party',
  'Australian Democrats',
  'Country Liberal Party',
  'Family First',
  'DLP',
  'JLN',
] as const;
