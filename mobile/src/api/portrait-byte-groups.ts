// Reviewed byte-identical website files at the fixture's pinned source commit.
// Different keys do not prove different faces. Keep these groups together when
// checking ownership; an unrelated owner makes every candidate in a group blank.
export const portraitByteGroups = [
  {
    keys: ['10080', '10081'],
    sha256: 'b089126130e5d1033a5796295da6cb4fd0f52efc3998cf455730af9dedf6813a',
  },
  {
    keys: ['10402', '10725'],
    sha256: '9efa911732a1c331ba68611514a7582d377e3096f2153265d1ac0752f3bb4f05',
  },
  {
    keys: ['10565', '10752'],
    sha256: 'a1eb2edec390c17c6a261abd9c9a2d574c0c0ebeebccdf8d87bdadb18ed9f208',
  },
] as const;
export function portraitFaceKey(key: string): string {
  return (
    portraitByteGroups.find((group) =>
      (group.keys as readonly string[]).includes(key),
    )?.keys[0] ?? key
  );
}
