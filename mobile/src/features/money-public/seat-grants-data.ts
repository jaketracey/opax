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
  const jur = jurisdiction(d.jur);
  // The published files name the next page by its site path
  // ("/grants/federal/seats/<key>-2.json"); a bare file name is also read.
  // Either way it is kept as the file name inside this seat's directory.
  const raw = d.next === null ? null : nonempty(d.next);
  const file = `${key}-${page + 1}.json`;
  const next =
    raw === null
      ? null
      : raw === file || raw === `/grants/${jur}/seats/${file}`
        ? file
        : invalid();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) || page < 1) invalid();
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
    (next !== null && grants.length === 0) ||
    new Set(grants.map((g) => g.id)).size !== grants.length
  )
    invalid();
  return {
    meta: decodeMeta(d.meta),
    jur,
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
