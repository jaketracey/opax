/**
 * One decoder per key. Overlapping reads of one address share a request
 * only when they pass the same decoder function (ApiClient.get), so a
 * decoder that closes over a key (a year, a record's id) must be the same
 * function each time that key is asked for. A decoder built inline on every
 * call never shares.
 *
 * The map is bounded: the oldest key goes first. A key that has gone gets a
 * new function next time, which only costs that one read its sharing.
 */
export function decoderPerKey<Key, Value>(
  make: (key: Key) => (raw: unknown) => Value,
  limit = 64,
): (key: Key) => (raw: unknown) => Value {
  const made = new Map<Key, (raw: unknown) => Value>();
  return (key) => {
    const known = made.get(key);
    if (known) return known;
    const decoder = make(key);
    made.set(key, decoder);
    if (made.size > limit) made.delete(made.keys().next().value as Key);
    return decoder;
  };
}
