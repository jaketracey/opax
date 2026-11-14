/** Dated member observations are listings, not fresh verification or service dates. */
export function representationNote(row, formatDate = value => value) {
  const on = row.representation_as_of || row.as_of;
  if (!on) return '';
  return row.representation_observation_only
    ? `Listed as at ${formatDate(on)}, from ${row.representation_source}`
    : `Verified ${formatDate(on)}`;
}

export function representationGap(row) {
  return row.representation_exception?.message || 'No confirmed representative for this date.';
}
