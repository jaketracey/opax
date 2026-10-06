import Constants from 'expo-constants';
import { portraitDirectory } from './portrait-disk-store';
import { portraitKeyPattern } from './portrait-policy';
/** Native Image may read only an unchanged portrait in this origin's local cache. */
export function localImageURI(value: string): string {
  const origin = Constants.expoConfig?.extra?.apiOrigin;
  if (typeof origin !== 'string')
    throw new Error('Missing portrait cache origin');
  const root = portraitDirectory(origin).uri.replace(/\/$/, '') + '/';
  const filename = value.startsWith(root) ? value.slice(root.length) : '';
  if (
    !root.startsWith('file://') ||
    !filename.endsWith('.webp') ||
    !portraitKeyPattern.test(filename.slice(0, -5))
  )
    throw new Error('Image must be a local cached portrait');
  return value;
}
