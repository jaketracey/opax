// Files where opax/static-colors only warns: the dark mode screen lanes'
// own files (audit of 19 Nov 2026, section 3), which each lane converts with
// scripts/codemod-use-colors.ts. A lane deletes its block here once its
// files are converted; the rule is then an error for them, as it already is
// for the shared design, navigation, launch and route layout files.
module.exports = [
  // Lane A: Today, edition, Explore, Learn, Welcome.
  'src/features/About.tsx',
  'src/features/Today.tsx',
  'src/features/about/**',
  'src/features/edition/**',
  'src/features/explore/**',
  'src/features/learn/**',
  'src/features/newcomer/**',
  'src/features/today/**',
  'src/features/welcome/**',
  // Lane B: People and Parliament.
  'src/features/Electorate.tsx',
  'src/features/Party.tsx',
  'src/features/Person.tsx',
  'src/features/YourMP.tsx',
  'src/features/bills/**',
  'src/features/declarations/**',
  'src/features/directories/**',
  'src/features/electorate-map/**',
  'src/features/follows/**',
  'src/features/leads/**',
  'src/features/people/**',
  'src/features/records/**',
  'src/features/seat/**',
  'src/features/vic-election/**',
  'src/features/your-mp/**',
  // Lane C: Money.
  'src/features/money/**',
  'src/features/money-public/**',
];
