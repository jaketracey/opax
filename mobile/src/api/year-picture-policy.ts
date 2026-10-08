import { ApiError } from './errors';

// The web's unchanged static event photographs, never generated/OG images.
export const yearPicturePathPattern =
  /^\/years\/pictures\/\d{4}\/[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/;
export const yearPictureKeyPattern = /^\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const yearPictureMaxBytes = 512 * 1024;
export function isYearPicturePath(path: string) {
  return yearPicturePathPattern.test(path);
}
export function yearPictureKey(path: string) {
  if (!isYearPicturePath(path)) throw new Error('Invalid year photograph path');
  return path.slice('/years/pictures/'.length).replace('/', '-').slice(0, -5);
}
export function yearPicturePath(key: string) {
  if (!yearPictureKeyPattern.test(key))
    throw new Error('Invalid year photograph key');
  return `/years/pictures/${key.slice(0, 4)}/${key.slice(5)}.webp`;
}
export function assertYearPictureBytes(bytes: Uint8Array): void {
  const text = (a: number, b: number) =>
    String.fromCharCode(...bytes.slice(a, b));
  const uint = (at: number, n: number) =>
    bytes.slice(at, at + n).reduce((v, b, i) => v + b * 2 ** (8 * i), 0);
  if (
    bytes.length < 30 ||
    bytes.length > yearPictureMaxBytes ||
    text(0, 4) !== 'RIFF' ||
    text(8, 12) !== 'WEBP' ||
    uint(4, 4) + 8 !== bytes.length
  )
    throw new ApiError('invalid-data', 'Invalid year photograph bytes.');
  const kind = text(12, 16);
  const dimensions =
    kind === 'VP8 '
      ? [uint(26, 2) & 0x3fff, uint(28, 2) & 0x3fff]
      : kind === 'VP8X' && !(bytes[20]! & 2)
        ? [1 + uint(24, 3), 1 + uint(27, 3)]
        : kind === 'VP8L' && bytes[20] === 0x2f
          ? [1 + (uint(21, 4) & 0x3fff), 1 + ((uint(21, 4) >>> 14) & 0x3fff)]
          : [];
  if (dimensions.length !== 2 || dimensions.some((v) => v < 1 || v > 2048))
    throw new ApiError(
      'invalid-data',
      'Year photograph dimensions are invalid.',
    );
}
