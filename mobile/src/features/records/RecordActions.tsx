import type { NativeStackHeaderItem } from 'expo-router';
import { router } from 'expo-router';
import { Alert, Platform } from 'react-native';
import { isRecordSlug } from '../../api/record-policy';
import { catalogs } from '../../api/runtime';
import { copy as words } from '../../design/copy';
import { webOrigin } from '../../design/environment';
import { haptic } from '../../design/haptics';
import { showMenu, type MenuAction } from '../../design/menu';
import {
  menuLeaves,
  type RowMenuAction,
  type RowMenuLeaf,
} from '../../design/row-link';
import { pageMenu } from '../../navigation/chrome';
import { canonicalUrl, openOnWeb } from '../../navigation/external';
import { trackShare } from '../../navigation/share';
import { citeRoute } from '../../navigation/routes';
import { copyText } from './actions';
import { citationsFor } from './citations';
import {
  citeStyles,
  rememberCiteStyle,
  stylesFor,
  type CiteStyleId,
} from './citeStyle';
import { records } from './runtime';

/** The record a menu acts on: its slug, its cleaned title, and its kind. */
export interface RecordTarget {
  slug: string;
  title: string;
  /** The record's kind when known; otherwise read from the slug. */
  kind?: string;
}

/** The citation's date of access: today, on the reader's calendar. */
export function accessedToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The corpus version for BibTeX and RIS. A slow or failed read never holds
 * a copy back for long: after two seconds the citation is made without it.
 */
export function corpusVersion(): Promise<string> {
  return Promise.race([
    catalogs
      .corpus()
      .then((record) => record.data.version || 'unversioned')
      .catch(() => 'unversioned'),
    new Promise<string>((resolve) =>
      setTimeout(() => resolve('unversioned'), 2000),
    ),
  ]);
}

/**
 * Builds a citation when its menu item is pressed and copies it. The record
 * comes from the session (no request when the reader has it); the formats
 * are the web's (`citations.ts`), unchanged.
 */
export async function citeNow(
  target: RecordTarget,
  style: CiteStyleId | 'source',
): Promise<boolean> {
  try {
    const [record, version] = await Promise.all([
      records.document(target.slug),
      corpusVersion(),
    ]);
    const citation = citationsFor(record.data, {
      origin: webOrigin,
      corpusVersion: version,
      accessed: accessedToday(),
    }).find((entry) => entry.id === style);
    if (!citation) return false;
    const label =
      citeStyles.find((entry) => entry.id === style)?.label ?? 'source';
    const copied = await copyText(citation.text, `Copied ${label} citation`);
    if (copied) {
      haptic('success');
      if (style !== 'source') rememberCiteStyle(style);
    }
    return copied;
  } catch {
    Alert.alert('Copy', 'This text could not be copied.');
    return false;
  }
}

/** The Cite items: one Copy per style, then Citation formats… */
export function citeItems(target: RecordTarget): RowMenuLeaf[] {
  const record = {
    slug: target.slug,
    title: target.title,
    labels: target.kind ? { kind: target.kind } : undefined,
  };
  const styles = stylesFor(record);
  return [
    ...(styles.length
      ? styles.map((style) => ({
          title: `Copy ${style.label}`,
          symbol: 'doc.on.doc' as const,
          onPress: () => void citeNow(target, style.id),
        }))
      : [
          {
            title: 'Copy citation',
            symbol: 'doc.on.doc' as const,
            onPress: () => void citeNow(target, 'source'),
          },
        ]),
    {
      title: 'Citation formats…',
      symbol: 'list.bullet.rectangle' as const,
      onPress: () => router.push(citeRoute(target.slug)),
    },
  ];
}

/**
 * A record's secondary actions, in one place (records.md 2.2): Cite as an
 * inline section (`displayInline`, so a citation is two taps from the
 * page), Copy link and Open on opax.com.au. Share is the reading
 * toolbar's, or the pane bar's. Opening the menu calls no API.
 */
export function recordActions(
  target: RecordTarget,
  _options: { embedded?: boolean } = {},
): RowMenuAction[] {
  if (!isRecordSlug(target.slug)) return [];
  const path = `/doc/${target.slug}`;
  return [
    {
      title: 'Cite',
      symbol: 'quote.opening',
      inline: true,
      items: citeItems(target),
    },
    {
      title: words.copyLink,
      symbol: 'link',
      onPress: () => {
        void copyText(canonicalUrl(path), 'Copied link').then((copied) => {
          if (!copied) return;
          haptic('success');
          trackShare('copy_link', path);
        });
      },
    },
    {
      title: words.openOnWeb,
      symbol: 'arrow.up.right.square',
      onPress: () =>
        void openOnWeb(path, target.title, { preferNative: false }),
    },
  ];
}

/**
 * The reader's bar: one ⋯ without a title line, nothing else. Android's
 * header sheet has no inline sections, so its rows are the menu's leaves,
 * alongside the toolbar's actions (`extra`) (records.md section 1).
 */
export function recordBarItems(
  target: RecordTarget,
  extra: RowMenuLeaf[] = [],
): () => NativeStackHeaderItem[] {
  const items = recordActions(target);
  const rows: RowMenuAction[] =
    Platform.OS === 'android' ? [...menuLeaves(items), ...extra] : items;
  return () => [pageMenu({ name: 'this record', items: rows })];
}

/**
 * A pane bar's menu (iPad split, records.md 2.3 and 4.3): the pane has no
 * navigation bar to hold a native menu, so its ⋯ and Version open a sheet.
 */
export function showPaneMenu(title: string, actions: readonly MenuAction[]) {
  if (Platform.OS !== 'ios') showMenu(title, actions);
}
