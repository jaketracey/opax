import { File, Paths } from 'expo-file-system';

export type Slots = readonly [string, string];
export interface Copy<T> {
  slot: number;
  generation: number;
  value: T | null;
}
/** Two independent copies. Write only the older slot: File.write can tear,
 * and overwrite moves delete their destination first. No save touches the
 * newest whole copy. Legacy unnumbered documents are generation zero. */
export async function readCopies<T>(
  slots: Slots,
  decode: (raw: unknown) => T | null,
): Promise<Copy<T>> {
  const copies = await Promise.all(
    slots.map(async (name) => {
      try {
        const file = new File(Paths.document, name);
        if (!file.exists) return null;
        const raw: unknown = JSON.parse(await file.text());
        const value = decode(raw);
        if (value === null) return null;
        const n = (raw as { generation?: unknown }).generation;
        if (
          n !== undefined &&
          !(typeof n === 'number' && Number.isSafeInteger(n) && n >= 0)
        )
          return null;
        const generation =
          typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : 0;
        return { generation, value };
      } catch {
        return null;
      }
    }),
  );
  const [a, b] = copies;
  const slot = b && (!a || b.generation > a.generation) ? 1 : a ? 0 : -1;
  return {
    slot,
    generation: copies[slot]?.generation ?? 0,
    value: copies[slot]?.value ?? null,
  };
}
export function writeCopy<T>(
  slots: Slots,
  current: Pick<Copy<T>, 'slot' | 'generation'>,
  body: object,
) {
  const slot = current.slot === 0 ? 1 : 0;
  const generation = current.generation + 1;
  if (!Number.isSafeInteger(generation))
    throw new Error('Save counter exhausted');
  new File(Paths.document, slots[slot]).write(
    JSON.stringify({ ...body, generation }),
  );
  return { slot, generation };
}
/** Serializes saves, including their disk reads. A failed save rejects and
 * the next save reads the surviving copy rather than trusting memory. */
export class TwoSlotStore<T> {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private slots: Slots,
    private decode: (raw: unknown) => T | null,
    private encode: (value: T) => object,
  ) {}
  async read(): Promise<T | null> {
    return (await readCopies(this.slots, this.decode)).value;
  }
  save(value: T): Promise<void> {
    const run = this.queue.then(async () => {
      const current = await readCopies(this.slots, this.decode);
      writeCopy(this.slots, current, this.encode(value));
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}
