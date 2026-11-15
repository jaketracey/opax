import type { Pay, Votes } from './catalog-decoders';

/**
 * The votes and pay catalogs last read this session, kept in memory only.
 * A profile's placeholder reads them to draw what the page will: the line
 * under the name ("Prime Minister") and the figures the person has.
 */
const kept: { votes?: Votes; pay?: Pay } = {};
const listeners = new Set<() => void>();

/** A catalog as it is read or decoded from the device; other paths pass. */
export function keepCatalog(path: string, data: unknown) {
  if (path === '/votes.json') kept.votes = data as Votes;
  else if (path === '/pay.json') kept.pay = data as Pay;
  else return;
  for (const listener of [...listeners]) listener();
}
/** Hear each catalog as it is kept (a profile's placeholder waits on pay). */
export function subscribeKept(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** The pay catalog if it has been read this session. */
export const keptPay = () => kept.pay;
/** The votes catalog if it has been read this session. */
export const keptVotes = () => kept.votes;
/** What has been read this session: never a read. */
export function keptCatalogs(): Readonly<typeof kept> {
  return kept;
}
/** A new session (tests start each case with none). */
export function forgetCatalogs() {
  delete kept.votes;
  delete kept.pay;
}
