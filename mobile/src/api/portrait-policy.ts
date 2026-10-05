// Reviewed unchanged 200×200 website WebP files; no JPEG, OG or other assets.
export const portraitKeyPattern = /^(?:[1-9]\d{0,9}|wd-Q[1-9]\d{0,11})$/;
export function isPortraitPath(path: string): boolean {
  const match = /^\/photos\/([^/]+)\.webp$/.exec(path);
  return !!match && portraitKeyPattern.test(match[1]!);
}
export function assertPortraitPath(path: string): void {
  if (!isPortraitPath(path))
    throw new Error('Image is outside the portrait allow-list');
}
export const portraitMaxBytes = 64 * 1024;
export const portraitMetadataLimits: Record<string, number> = {
  '/photos/people.json': 64 * 1024,
  '/photos/credits.json': 256 * 1024,
};
// Check the original container and its 200×200 frame before caching any bytes.
export function assertPortraitBytes(bytes: Uint8Array): void {
  const text = (a: number, b: number) =>
    String.fromCharCode(...bytes.slice(a, b));
  const uint = (at: number, n: number) =>
    bytes.slice(at, at + n).reduce((v, b, i) => v + b * 2 ** (8 * i), 0);
  if (
    bytes.length < 30 ||
    bytes.length > portraitMaxBytes ||
    text(0, 4) !== 'RIFF' ||
    text(8, 12) !== 'WEBP' ||
    uint(4, 4) + 8 !== bytes.length
  )
    throw new Error('Invalid portrait bytes');
  const kind = text(12, 16);
  const dimensions =
    kind === 'VP8 '
      ? [uint(26, 2) & 0x3fff, uint(28, 2) & 0x3fff]
      : kind === 'VP8X'
        ? [1 + uint(24, 3), 1 + uint(27, 3)]
        : kind === 'VP8L' && bytes[20] === 0x2f
          ? [1 + (uint(21, 4) & 0x3fff), 1 + ((uint(21, 4) >>> 14) & 0x3fff)]
          : [];
  if (dimensions[0] !== 200 || dimensions[1] !== 200)
    throw new Error('Portrait must be the website 200×200 file');
}
