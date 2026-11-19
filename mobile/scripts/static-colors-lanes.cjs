// Files where opax/static-colors only warns: the dark mode screen lanes'
// own files (audit of 19 Nov 2026, section 3), which each lane converts with
// scripts/codemod-use-colors.ts. A lane deletes its block here once its
// files are converted; the rule is then an error for them, as it already is
// for the shared design, navigation, launch and route layout files.
module.exports = [
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
  // Lane D: Ask, Talk, Search, reports, sheets, Account.
  'src/features/Search.tsx',
  'src/features/account/**',
  'src/features/ask/**',
  'src/features/community/**',
  'src/features/methods/**',
  'src/features/quick-search/**',
  'src/features/reports/**',
  'src/features/search/**',
  'src/features/sheets/**',
  'src/features/sources/**',
  'src/features/talk/**',
  'src/test-screens/**',
  'src/workbench/**',
];
