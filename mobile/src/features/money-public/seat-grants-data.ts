import {
  array,
  count,
  invalid,
  nonempty,
  number,
  object,
  optional,
  text,
} from '../../api/validation';
import { decodeGrant, decodeMeta, jurisdiction, programName } from './data';

/** One static seat slice. Continuations stay within this seat's directory. */
export function decodeSeatGrants(value: unknown) {
  const d = object(value);
  const key = nonempty(d.key);
  const page = count(d.page);
  const next = d.next === null ? null : nonempty(d.next);
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) ||
    page < 1 ||
    (next !== null && next !== `${key}-${page + 1}.json`)
  )
    invalid();
  const grants = array((value) => {
    const g = object(value);
    const programId = optional(text)(g.pid) ?? '';
    return {
      ...decodeGrant(g),
      programId,
      program: programName(optional(text)(g.pr) ?? '', programId),
    };
  })(d.grants);
  const total = number(d.t),
    n = count(d.c);
  if (
    grants.length > 500 ||
    grants.length > n ||
    new Set(grants.map((g) => g.id)).size !== grants.length
  )
    invalid();
  return {
    meta: decodeMeta(d.meta),
    jur: jurisdiction(d.jur),
    key,
    name: nonempty(d.n),
    state: nonempty(d.st),
    total,
    count: n,
    page,
    next,
    grants,
  };
}
export type SeatGrantPage = ReturnType<typeof decodeSeatGrants>;
