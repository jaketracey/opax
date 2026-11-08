// The bill text's Contents sheet hands a choice back to the reader that
// opened it (records.md 4.2). The choice never travels as a route param:
// the sheet publishes it here, closes itself, and the reader for the same
// bill and version scrolls once the sheet has gone. Each tap carries a new
// nonce, so choosing the same section twice scrolls both times.

export interface ContentsChoice {
  section: string;
  nonce: number;
}
type Listener = (choice: ContentsChoice) => void;
const listeners = new Map<string, Set<Listener>>();
let nonce = 0;
const channel = (key: string, version: string) => `${key}:${version}`;

/** The sheet's tap: every reader of this bill and version hears it. */
export function publishContents(
  key: string,
  version: string,
  section: string,
): ContentsChoice {
  nonce += 1;
  const choice = { section, nonce };
  listeners.get(channel(key, version))?.forEach((listener) => listener(choice));
  return choice;
}

/** A mounted reader listens for its own bill and version only. */
export function subscribeContents(
  key: string,
  version: string,
  listener: Listener,
): () => void {
  const id = channel(key, version);
  const set = listeners.get(id) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(id, set);
  return () => {
    set.delete(listener);
    if (!set.size) listeners.delete(id);
  };
}
