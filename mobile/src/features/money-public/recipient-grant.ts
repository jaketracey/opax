import type { RecordResult } from '../../api/client';
import { ApiError } from '../../api/errors';
import { decoderPerKey } from '../../api/decoder-memo';
import { apiClient } from '../../api/runtime';
import {
  array,
  count,
  nonempty,
  number,
  object,
  text,
} from '../../api/validation';
import { formatDate } from '../../design/format';
import type { MoneyItemView } from './MoneyItem';
import { combine } from './catalog';
import { privateNote, publicRecipient } from './privacy';
import { organisationHref } from './routes';

/**
 * The recipient index's decoder, one function for every read: overlapping
 * reads of the index share a request only when they pass the same decoder.
 */
const decodeGrantIndex = (raw: unknown) => {
  const data = object(raw),
    meta = object(data.meta);
  return {
    asOf: nonempty(meta.generated),
    recipients: array((value) => {
      const row = object(value);
      return { id: nonempty(row.id), shard: count(row.sh) };
    })(data.recipients),
  };
};

/**
 * One award's decoder, the same function each time for the same recipient
 * and award (they are what it looks for in the shard), so two reads of one
 * award at once share the shard's request. The key is the pair as JSON, which
 * no id can be mistaken for: joined with a newline, an award id that held
 * one was cut short and opened another award.
 */
const awardDecoder = decoderPerKey((key: string) => {
  const [rid, award] = JSON.parse(key) as [string, string];
  return (raw: unknown) => {
    const entry = Object.values(object(raw))
      .map(object)
      .find((row) => row.id === rid);
    if (!entry)
      throw new ApiError('not-found', 'This record isn’t available any more.');
    const identity = publicRecipient(
      nonempty(entry.n),
      typeof entry.k === 'string' ? entry.k : '',
      typeof entry.abr === 'object' && entry.abr
        ? String(object(entry.abr).etype ?? '')
        : '',
      rid,
    );
    const grant = array(object)(entry.grants).find((row) => row.id === award);
    if (!grant)
      throw new ApiError('not-found', 'This record isn’t available any more.');
    const value = number(grant.v),
      id = nonempty(grant.id);
    const start = typeof grant.s === 'string' ? grant.s : '';
    const guid =
      typeof grant.guid === 'string' && /^[a-f0-9-]{36}$/i.test(grant.guid)
        ? grant.guid
        : null;
    const field = (key: string) =>
      typeof grant[key] === 'string' ? text(grant[key]) : '';
    return {
      identity,
      value,
      id,
      start,
      guid,
      purpose: identity.organisation ? field('n') : '',
      program: field('pr'),
      agency: field('ag'),
      year: field('fy'),
      seat: field('el'),
    };
  };
});

/** One existing recipient award, reached without a program key. */
export async function loadRecipientGrant(
  jur: 'federal' | 'qld',
  rid: string,
  award: string,
  refresh: boolean,
  signal?: AbortSignal,
): Promise<RecordResult<MoneyItemView>> {
  const index = await apiClient.get(
    `/graph/grants.${jur}.json`,
    decodeGrantIndex,
    refresh,
    { signal },
  );
  const recipient = index.data.recipients.find((row) => row.id === rid);
  if (!recipient)
    throw new ApiError('not-found', 'This record isn’t available any more.');
  const record = await apiClient.get(
    `/grants/${jur}/shard-${String(recipient.shard).padStart(2, '0')}.json`,
    awardDecoder(JSON.stringify([rid, award])),
    refresh,
    { signal },
  );
  const grant = record.data;
  return {
    ...combine([index, record], null),
    data: {
      meta: [
        'Grant agreement',
        grant.start ? `from ${formatDate(grant.start, 'short')}` : grant.year,
      ]
        .filter(Boolean)
        .join(' · '),
      name: grant.identity.name,
      individual: !grant.identity.organisation,
      amount: grant.value,
      asOf: index.data.asOf,
      register:
        jur === 'qld'
          ? 'Queensland Government Investment Portal'
          : 'GrantConnect',
      facts: [
        { label: 'Program', value: grant.program },
        { label: 'Agency', value: grant.agency },
        { label: 'Purpose', value: grant.purpose, long: true },
        { label: 'Electorate', value: grant.seat },
        { label: 'Financial year', value: grant.year },
        { label: 'Register ID', value: grant.id },
      ].filter((row) => !!row.value),
      children: [],
      originals:
        grant.identity.organisation && grant.guid
          ? [
              {
                label: `GrantConnect · ${grant.id}`,
                url: `https://www.grants.gov.au/Ga/Show/${grant.guid}`,
              },
            ]
          : [],
      onward: grant.identity.organisation
        ? [
            {
              key: 'organisation',
              title: `Open ${grant.identity.name}`,
              href: organisationHref(rid, grant.identity.name, jur),
            },
          ]
        : [],
      notes: [
        'Values are the latest published award value, not payments made.',
        ...(!grant.identity.organisation ? [privateNote] : []),
      ],
      path: grant.identity.organisation
        ? `/money/grants/${jur}/recipient/${encodeURIComponent(rid)}?award=${encodeURIComponent(grant.id)}`
        : null,
    },
  };
}
