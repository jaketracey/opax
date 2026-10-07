import {
  array,
  count,
  date,
  nonempty,
  number,
  object,
  optional,
  text,
  url,
  invalid,
} from '../../api/validation';
import { publicRecipient, isOrganisation, unnamedSupplier } from './privacy';
const opt = (v: unknown) => optional(text)(v) ?? '';
const abnType = (r: Record<string, unknown>) =>
  opt(r.abn_type ?? (r.abr ? object(r.abr).etype : undefined) ?? r.entity_type);
const strings = array(nonempty);
export type Jurisdiction = 'federal' | 'qld';
export const jurisdiction = (v: unknown): Jurisdiction =>
  v === 'federal' || v === 'qld' ? v : invalid();
export function decodeMeta(v: unknown) {
  const m = object(v);
  return {
    asOf: date(m.generated ?? m.generated_at),
    source: nonempty(m.sourceShort ?? m.source),
    sourceUrl: url(m.source_url),
    licence: opt(m.licence),
    caveats: strings(m.caveats).filter(
      (c) =>
        m.jurisdiction !== 'qld' ||
        !c.startsWith('Grant totals are awarded values as published;'),
    ),
    coverage: opt(m.coverage ?? m.year_basis),
    threshold: opt(m.threshold),
  };
}
export function decodeGrantIndex(v: unknown) {
  const d = object(v),
    c = object(object(d.meta).counts);
  return {
    meta: decodeMeta(d.meta),
    jur: jurisdiction(object(d.meta).jurisdiction),
    counts: {
      programsTotal: count(c.programs_total),
      grants: count(c.grants),
      dollars: number(c.dollars),
      recipients: count(c.recipients),
      donorRecipients: count(c.donor_recipients),
      donorDollars: number(c.donor_dollars),
      donorShare: number(c.donor_share),
    },
    programs: array((v) => {
      const r = object(v);
      return {
        id: nonempty(r.id),
        key: nonempty(r.key),
        name: nonempty(r.n),
        total: number(r.t),
        count: count(r.c),
        recipients: count(r.r),
        donorTotal: number(r.dt),
      };
    })(d.programs),
    seats: array((v) => {
      const r = object(v);
      return {
        name: nonempty(r.n),
        state: nonempty(r.st),
        total: number(r.t),
        count: count(r.c),
        recipients: count(r.r),
        donorTotal: number(r.dt),
      };
    })(d.electorates),
    // No private raw name is retained in the decoded model.
    recipients: array((v) => {
      const r = object(v);
      return {
        id: nonempty(r.id),
        ...publicRecipient(nonempty(r.n), opt(r.k), abnType(r), opt(r.id)),
      };
    })(d.recipients),
  };
}
export type GrantIndex = ReturnType<typeof decodeGrantIndex>;
export function decodeProgram(v: unknown) {
  const d = object(v);
  return {
    id: nonempty(d.id),
    key: nonempty(d.key),
    jur: jurisdiction(d.jur),
    name: nonempty(d.n),
    agency: nonempty(d.ag),
    asOf: date(d.generated),
    total: number(d.t),
    count: count(d.c),
    listed: count(d.grants_listed),
    available: count(d.grants_total),
    grants: array((v) => {
      const g = object(v);
      const recipient = publicRecipient(
        nonempty(g.rn),
        opt(g.k),
        abnType(g),
        opt(g.rid),
      );
      const guid = opt(g.guid);
      return {
        id: nonempty(g.id),
        ...recipient,
        recipientId: recipient.organisation ? opt(g.rid) : '',
        title: recipient.organisation ? opt(g.n) : '',
        value: number(g.v),
        seat: opt(g.el),
        state: opt(g.elst),
        year: opt(g.fy),
        start: opt(g.s),
        selection: opt(g.sel),
        sourceUrl:
          recipient.organisation && /^[a-f0-9-]{36}$/.test(guid)
            ? `https://www.grants.gov.au/Ga/Show/${guid}`
            : null,
      };
    })(d.grants),
  };
}
export type Program = ReturnType<typeof decodeProgram>;
export function programRecipients(grants: Program['grants']) {
  const grouped = new Map<
    string,
    {
      id: string;
      name: string;
      organisation: boolean;
      recipientId: string;
      value: number;
      count: number;
    }
  >();
  for (const g of grants) {
    const id = g.organisation ? g.recipientId || g.name : 'unnamed';
    const row = grouped.get(id) ?? {
      id,
      name: g.name,
      organisation: g.organisation,
      recipientId: g.recipientId,
      value: 0,
      count: 0,
    };
    row.value += g.value;
    row.count++;
    grouped.set(id, row);
  }
  return [...grouped.values()].sort((a, b) => b.value - a.value);
}
export function decodeNotes(v: unknown) {
  const d = object(v);
  const programs = object(d.programs);
  const decodeJur = (v: unknown) =>
    Object.fromEntries(
      Object.entries(object(v)).map(([key, v]) => {
        const n = object(v);
        return [
          key,
          {
            summary: nonempty(n.summary),
            audits: array((v) => {
              const a = object(v);
              return {
                title: nonempty(a.title),
                finding: nonempty(a.finding),
                url: url(a.url ?? a.source),
              };
            })(n.audits ?? []),
            sources: array((v) => {
              const s = object(v);
              return { title: nonempty(s.title ?? s.label), url: url(s.url) };
            })(n.sources ?? []),
          },
        ];
      }),
    );
  return {
    asOf: date(d.generated),
    programs: {
      federal: decodeJur(programs.federal),
      qld: decodeJur(programs.qld),
    },
    selection: Object.fromEntries(
      Object.entries(object(d.selection)).map(([k, v]) => {
        const s = object(v);
        return [k, { short: nonempty(s.short), source: url(s.source) }];
      }),
    ),
  };
}
export function decodeLargest(v: unknown) {
  const d = object(v);
  return {
    asOf: date(d.asOf),
    latest: nonempty(d.latest),
    basis: strings(d.basis),
    months: Object.fromEntries(
      Object.entries(object(d.months)).map(([month, rows]) => {
        if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) invalid();
        return [
          month,
          array((v) => {
            const r = object(v);
            return {
              id: nonempty(r.id),
              recipientId: nonempty(r.recipientId),
              // Names are decided after joining to the grant index's source entity type.
              recipient: nonempty(r.recipient),
              value: number(r.amount),
              purpose: opt(r.purpose),
              program: opt(r.program),
              agency: opt(r.agency),
              start: date(r.start),
              selection: opt(r.selection),
              more: count(r.more),
              sourceUrl: url(r.sourceUrl),
            };
          })(rows),
        ];
      }),
    ),
  };
}
export function largestFor(
  data: ReturnType<typeof decodeLargest>,
  index: GrantIndex,
  month: string,
) {
  const entities = new Map(index.recipients.map((r) => [r.id, r]));
  return (data.months[month] ?? []).map((r) => {
    const entity = entities.get(r.recipientId);
    const recipient =
      entity ??
      publicRecipient(r.recipient, undefined, undefined, r.recipientId);
    return {
      ...r,
      recipient: recipient.name,
      organisation: recipient.organisation,
      purpose: recipient.organisation ? r.purpose : '',
      recipientId: recipient.organisation ? r.recipientId : '',
    };
  });
}
export function decodeAgencies(v: unknown) {
  const d = object(v);
  return {
    meta: decodeMeta(d.meta),
    agencies: array((v) => {
      const a = object(v);
      const id = nonempty(a.id),
        path = nonempty(a.profile_path);
      if (!/^a-[a-f0-9]{20}$/.test(id) || path !== `/agencies/${id}.json`)
        invalid();
      return {
        id,
        name: nonempty(a.name),
        total: number(a.total),
        count: count(a.count),
        suppliers: count(a.supplier_count),
        path,
      };
    })(d.agencies),
  };
}
export function decodeAgency(v: unknown) {
  const d = object(v);
  return {
    id: nonempty(d.id),
    name: nonempty(d.name),
    total: number(d.total),
    count: count(d.count),
    years: array((v) => {
      const y = object(v);
      return {
        year: count(y.year),
        total: number(y.total),
        count: count(y.count),
      };
    })(d.years),
    undated: number(object(d.undated).total),
    suppliers: array((v) => {
      const s = object(v),
        name = nonempty(s.name),
        organisation = isOrganisation(name, opt(s.entity_type), abnType(s));
      return {
        id: nonempty(s.id),
        name: organisation ? name : unnamedSupplier,
        organisation,
        total: number(s.total),
        count: count(s.count),
      };
    })(d.suppliers),
    contracts: array((v) => {
      const c = object(v),
        name = nonempty(c.supplier),
        organisation = isOrganisation(name, opt(c.entity_type), abnType(c));
      return {
        id: nonempty(c.id),
        title: organisation ? nonempty(c.title) : '',
        supplier: organisation ? name : unnamedSupplier,
        value: number(c.amount),
        start: opt(c.start_date),
        end: opt(c.end_date),
        published: opt(c.published),
        method: opt(c.procurement_method),
        url: url(c.url),
        sourceKind:
          c.link_scope === 'record'
            ? ('record' as const)
            : ('register' as const),
      };
    })(d.contracts),
  };
}
export function decodeAllocation(v: unknown) {
  const d = object(v);
  const project = (v: unknown, award = false) => {
    const p = object(v);
    const recipient = opt(p.recipient);
    const privateRecipient =
      !!recipient &&
      !isOrganisation(recipient, opt(p.entity_type), opt(p.abn_type));
    return {
      id: nonempty(p.ga_id ?? p.id),
      title: privateRecipient
        ? 'Grant project'
        : nonempty(p.activity ?? p.title),
      value: number(p.value),
      state: opt(p.delivery_state ?? p.state),
      status: award ? 'Published award' : nonempty(p.status),
      date: opt(p.publish_date),
      sourceUrl: url(p.source_url),
    };
  };
  return {
    asOf: date(d.as_of),
    invitationsAsOf: date(d.invitation_snapshot),
    sources: Object.fromEntries(
      Object.entries(object(d.sources)).map(([k, v]) => [k, url(v)]),
    ),
    projects: array((v) => project(v))(d.projects).filter(
      (p) => p.status !== 'Withdrawn',
    ),
    awards: array((v) => project(v, true))(d.awards),
    seats: array((v) => {
      const s = object(v);
      return {
        name: nonempty(s.name),
        state: nonempty(s.state),
        party: nonempty(s.party),
        margin: number(s.margin),
        status: nonempty(s.status),
        baseline: nonempty(s.baseline),
      };
    })(d.seats),
    comparison: array((v) => {
      const r = object(v);
      return {
        name: nonempty(r.name),
        actual: number(r.actual),
        expected: number(r.expected),
      };
    })(d.cpi_comparison),
    provenance: nonempty(object(d.comparison_provenance).note),
  };
}
export function decodeHistory(v: unknown) {
  const d = object(v);
  return {
    asOf: date(d.as_of),
    methodology: Object.values(object(d.methodology)).map(nonempty),
    records: array((v) => {
      const r = object(v),
        recipient = publicRecipient(
          opt(r.recipient),
          opt(r.entity_type),
          abnType(r),
        );
      return {
        id: nonempty(r.id),
        title: recipient.organisation ? nonempty(r.title) : 'Grant project',
        value: number(r.value),
        state: nonempty(r.state),
        date: date(r.publish_date),
        program: opt(r.program),
        sourceUrl: url(r.source_url),
      };
    })(d.records),
  };
}
export function decodeReport(v: unknown) {
  const d = object(v);
  if (d.slug !== 'grants-allocation') invalid();
  return {
    title: nonempty(d.title),
    blurb: nonempty(d.blurb),
    asOf: date(d.updated),
  };
}
export function decodeLocations(v: unknown) {
  const d = object(v);
  return {
    asOf: date(d.as_of),
    methodology: strings(d.methodology),
    records: array((v) => {
      const r = object(v),
        recipient = opt(r.recipient);
      const named =
        !recipient ||
        isOrganisation(recipient, opt(r.entity_type), opt(r.abn_type));
      return {
        id: nonempty(r.id),
        kind: nonempty(r.record_type),
        verified: object(r.verification).status === 'verified',
        title: named ? nonempty(r.title) : 'Grant project',
        sites: array((v) => {
          const s = object(v);
          return {
            name: nonempty(s.site_name),
            address: nonempty(s.address),
            verified: object(s.verification).status === 'verified',
            sourceUrl: url(s.location_source_url),
          };
        })(r.sites).filter((s) => s.verified && named),
      };
    })(d.records).filter((r) => r.verified),
  };
}
export function decodeConnections(v: unknown) {
  const d = object(v),
    m = object(d.meta);
  return {
    asOf: date(m.generated_at),
    note: nonempty(m.coverage_note),
    entities: array((v) => {
      const e = object(v);
      const kind = nonempty(e.kind);
      if (!['organisation', 'program', 'place', 'electorate'].includes(kind))
        invalid();
      return {
        id: nonempty(e.id),
        name: nonempty(e.name),
        kind,
        count: count(e.records),
      };
    })(d.entities),
  };
}
export function decodeEvidence(v: unknown) {
  return Object.fromEntries(
    Object.entries(object(object(v).entries)).map(([id, v]) => {
      const e = object(v);
      return [
        id,
        {
          id: nonempty(e.id),
          excerpts: array((v) => {
            const x = object(v);
            return {
              text: [
                'government_grants',
                'ext_grants',
                'ext_grant_details',
              ].includes(opt(x.source_table))
                ? 'Grant excerpt omitted to protect private recipients.'
                : nonempty(x.text),
              date: opt(x.date),
              source: nonempty(x.source_kind),
              url: optional(url)(x.source_url),
            };
          })(e.excerpts),
        },
      ];
    }),
  );
}
