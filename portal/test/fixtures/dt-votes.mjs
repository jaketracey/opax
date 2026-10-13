// Local table API fixtures. No calls to Worker API routes or external services.
export const divisions = Array.from({length:64}, (_, i) => ({
  key:`fixture-${i}`, stage:i % 2 ? 'Third reading' : 'Second reading',
  date:`2026-09-${String(14 + i % 3).padStart(2,'0')}`,
  house:i % 3 ? 'senate' : 'representatives', outcome:i % 2 ? 'affirmative' : 'negative',
  ayes:20+i, noes:90-i,
}));
export const votes = Array.from({length:64}, (_, i) => ({
  title:`Recorded bill ${i+1}`, date:divisions[i].date, vote:i % 2 ? 'aye' : 'no',
  party_position:i % 4 ? (i % 2 ? 'aye' : 'no') : undefined,
  division_slug:`division-fixture-${i}`,
}));
export const hubDivisions = Array.from({length:4},(_,i)=>({
  key:`fixture-${i}`, slug:`division-fixture-${i}`, title:'Second reading', stage:'Second reading',
  date:'2026-09-16', house:i % 2 ? 'representatives' : 'senate', result:i % 2 ? 'affirmative' : 'negative',
  ayes:20+i, noes:30-i, source_url:`https://example.test/division/${i}`,
}));
