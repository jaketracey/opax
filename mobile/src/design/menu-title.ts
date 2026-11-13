import { Platform } from 'react-native';
import { WORD_JOINER } from './record-title';

// A domain: dot-separated labels ending in letters ("opax.com.au").
const DOMAIN = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi;

/**
 * A native menu item's title with every domain kept whole. UIKit's menus
 * hyphenate a long last word, and split "Open on opax.com.au" as
 * "opax.-com.au" (build 61, bug 6). The menu takes a plain string, so the
 * domain is bound with U+2060 WORD JOINER between each of its characters:
 * joiners only around the dots still let the hyphenator break after one.
 * The joiners are invisible and, as Unicode format characters, do not split
 * the word for VoiceOver. Other platforms keep the title as it is.
 */
export function menuTitle(title: string): string {
  if (Platform.OS !== 'ios') return title;
  return title.replace(DOMAIN, (domain) => [...domain].join(WORD_JOINER));
}

/** The title as drawn, without its joiners: for comparing and for tests. */
export const plainMenuTitle = (title: string) =>
  title.replaceAll(WORD_JOINER, '');
