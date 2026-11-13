/* global afterEach */
// Profiles read this session (src/features/people/profile-memo.ts) are
// memory-only session state: each test starts with none, as a launch does.
afterEach(() => {
  require('../src/features/people/profile-memo').forgetProfiles();
});
