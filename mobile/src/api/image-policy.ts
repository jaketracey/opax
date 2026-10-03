import Constants from 'expo-constants';
import { assertPortraitPath } from './portrait-policy';
// Web portraits are /photos/<catalog-id>.webp. No OG, arbitrary assets,
// absolute URLs, query strings or external hosts can enter the native Image API.
export function remoteImageURI(path: string): string {
  assertPortraitPath(path);
  const extra = Constants.expoConfig?.extra;
  if (!extra || typeof extra.apiOrigin !== 'string')
    throw new Error('Missing image origin');
  const origin = new URL(extra.apiOrigin);
  const loopback =
    origin.protocol === 'http:' &&
    ['127.0.0.1', 'localhost'].includes(origin.hostname);
  if (
    extra.variant === 'e2e'
      ? !loopback || origin.hostname !== '127.0.0.1'
      : extra.variant === 'production'
        ? origin.protocol !== 'https:'
        : !(origin.protocol === 'https:' || loopback)
  )
    throw new Error('Image origin does not match the build variant');
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw new Error('Invalid image origin');
  return new URL(path, origin).toString();
}
