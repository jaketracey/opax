import {
  array,
  number,
  invalid,
  date,
  nonempty,
  object,
  optional,
  shape,
  uniqueRows,
} from '../../api/validation';
// Project only party totals. Private donor nodes and edges never enter a directory.
const party = shape({
  label: nonempty,
  total: (v: unknown) => {
    const n = number(v);
    return n >= 0 ? n : invalid();
  },
});
const meta = shape({
  generated: date,
  source: nonempty,
  sourceShort: optional(nonempty),
  licence: optional(nonempty),
});
export function decodePartyFile(value: unknown) {
  const v = object(value);
  const nodes = array(object)(v.nodes);
  return {
    meta: meta(v.meta),
    parties: uniqueRows(
      party,
      (p) => p.label,
      'party',
    )(nodes.filter((n) => n.kind === 'party')),
  };
}
export type PartyFile = ReturnType<typeof decodePartyFile>;
