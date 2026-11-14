import { router } from 'expo-router';
import { webOrigin } from '../../design/environment';
import { openSource } from '../../navigation/external';
import { fromWebPath } from '../../navigation/external/paths';

/**
 * The guide's links are OPAX site paths ("/bill/au-federal-r7548"): the
 * generator drops the origin, which belongs in build config.
 */
export function opaxPath(url: string): string | null {
  return url.startsWith('/') && !url.startsWith('//') ? url : null;
}

/** The native screen for a guide link, when the app has one. */
export function guideRoute(url: string) {
  const path = opaxPath(url);
  return path ? fromWebPath(path) : null;
}

/**
 * A guide link ("See it in OPAX", a record named in a sentence): pushed on
 * the reader's stack when the app has the screen, else opened as a source
 * on the app's own web origin.
 */
export function openGuideLink(url: string, label: string) {
  const route = guideRoute(url);
  if (route) return router.push(route);
  const path = opaxPath(url);
  void openSource(path ? new URL(path, webOrigin).toString() : url, label);
}
