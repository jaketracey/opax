// Recipient names are derived only at run time. Synthetic IDs exercise overrides.
export async function grantPrivacyFixture(read) {
  const index = await read('/graph/grants.federal.json');
  const names = index.recipients.filter(r => r.k === 'individual').map(r => r.n);
  const award = {id: 'fixture-public-award', rid: 'name:fixture-public', rn: 'fixture-public Council Pty Ltd', k: 'council', v: 25000, s: '2026-08-19'};
  const overrides = [{k: 'person'}, {k: 'sole trader'}, {kind: 'people'}, {abr: {etype: 'IND'}}, {abnType: 'IND'}].map((override, i) => ({...award, id: `fixture-private-award-${i}`, rid: `abn:${String(i).padStart(11, '0')}`, rn: `fixture-recipient-${i} Pty Ltd`, ...override}));
  const program = {n: 'Fixture program', ag: 'Fixture agency', grants: [award, ...overrides]};
  const programs = [program, {...program, n: names[0]}, {...program, ag: names[1]}];
  return {names, overrides, read: async path => path.startsWith('/grants/federal/programs/') ? programs[['go3141', 'go90', 'go6284'].findIndex(key => path.endsWith(key + '.json'))] : read(path)};
}
