import { router } from 'expo-router';
import { fromWebPath } from '../../navigation/external/paths';
import { openSource } from '../../navigation/external';

/** An opax.com.au address as the app's own path, or null for anything else. */
export function opaxPath(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname !== 'opax.com.au' &&
      parsed.hostname !== 'www.opax.com.au'
    )
      return null;
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return null;
  }
}

/** The native screen for a guide link, when the app has one. */
export function guideRoute(url: string) {
  const path = opaxPath(url);
  return path ? fromWebPath(path) : null;
}

/**
 * A guide link ("See it in OPAX", a record named in a sentence): pushed on
 * the reader's stack when the app has the screen, else opened as a source.
 */
export function openGuideLink(url: string, label: string) {
  const route = guideRoute(url);
  if (route) router.push(route);
  else void openSource(url, label);
}
