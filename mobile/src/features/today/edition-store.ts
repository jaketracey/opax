import type { Block, EditionView } from '../../api/catalogs';
import { TwoSlotStore } from '../../storage/two-slot';
import type { CachedEdition } from './order';

/**
 * What the last edition read answered, kept on the device so the next cold
 * launch decides Today's order from disk before any request (today.md 5.2):
 * the edition's date, or "missing" for an authoritative 404. Nothing else
 * of the edition is kept here (the catalog cache keeps the record).
 */
interface EditionFile {
  version: 1;
  edition: { date: string } | 'missing';
}
const DAY = /^\d{4}-\d{2}-\d{2}/;
const store = new TwoSlotStore<EditionFile>(
  ['opax-today-edition-v1.json', 'opax-today-edition-v1.b.json'],
  (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const { version, edition } = raw as Record<string, unknown>;
    if (version !== 1) return null;
    if (edition === 'missing') return { version: 1, edition: 'missing' };
    const date = (edition as { date?: unknown } | null)?.date;
    return typeof date === 'string' && DAY.test(date)
      ? { version: 1, edition: { date: date.slice(0, 10) } }
      : null;
  },
  (value) => value,
);

/** The edition the disk held at launch: null on a first install. */
export async function readCachedEdition(): Promise<CachedEdition> {
  const file = await store.read().catch(() => null);
  return file?.edition ?? null;
}

/** Keeps what an edition read answered; a failed read changes nothing. */
export async function rememberEdition(
  block: Block<EditionView> | null,
): Promise<void> {
  if (!block) return;
  const edition =
    block.status === 'missing'
      ? ('missing' as const)
      : block.status === 'ready' && block.data
        ? { date: block.data.date.slice(0, 10) }
        : null;
  if (!edition) return;
  await store.save({ version: 1, edition }).catch(() => undefined);
}
