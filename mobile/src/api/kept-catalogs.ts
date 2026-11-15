import type { Pay, Votes } from './catalog-decoders';

/**
 * The votes and pay catalogs last read this session, kept in memory only.
 * A profile's placeholder reads them to draw what the page will: the line
 * under the name ("Prime Minister") and the figures the person has.
 */
const kept: { votes?: Votes; pay?: Pay } = {};

/** A catalog as it is read or decoded from the device; other paths pass. */
export function keepCatalog(path: string, data: unknown) {
  if (path === '/votes.json') kept.votes = data as Votes;
  else if (path === '/pay.json') kept.pay = data as Pay;
}
/** What has been read this session: never a read. */
export function keptCatalogs(): Readonly<typeof kept> {
  return kept;
}
/** A new session (tests start each case with none). */
export function forgetCatalogs() {
  delete kept.votes;
  delete kept.pay;
}
