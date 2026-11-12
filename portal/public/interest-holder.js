/** Missing holders in older register snapshots used a literal placeholder. */
export function interestHolder(value) {
  return typeof value === 'string' && value.trim() && value.trim().toLowerCase() !== 'unspecified' ? value : null;
}
