import Constants from 'expo-constants';
import { portraitDirectory, yearPictureDirectory } from './portrait-disk-store';
import { portraitKeyPattern } from './portrait-policy';
import { yearPictureKeyPattern } from './year-picture-policy';
/** Native Image reads only reviewed WebP files in this origin's local caches. */
export function localImageURI(value: string): string {
  const origin = Constants.expoConfig?.extra?.apiOrigin;
  if (typeof origin !== 'string')
    throw new Error('Missing portrait cache origin');
  for (const [directory, pattern] of [
    [portraitDirectory(origin), portraitKeyPattern],
    [yearPictureDirectory(origin), yearPictureKeyPattern],
  ] as const) {
    const root = directory.uri.replace(/\/$/, '') + '/';
    const filename = value.startsWith(root) ? value.slice(root.length) : '';
    if (
      root.startsWith('file://') &&
      filename.endsWith('.webp') &&
      pattern.test(filename.slice(0, -5))
    )
      return value;
  }
  throw new Error('Image must be a local cached WebP');
}
