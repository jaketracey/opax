# Additive report transcripts

The available `search-reports-contract.md` describes schema 1 without the
transcripts summary or page envelope. The transcript rows below use the existing
`data/commission-transcripts` registry fields. The envelope is an integration
assumption, isolated in `decodeReportTranscripts`, and needs confirmation when
the upstream report API adds this field.

Both top-level `transcripts` on `/api/report/<slug>` and the response from
`/api/report/<slug>/transcripts?offset=<n>` currently expect:

```ts
{
  count: number; // Total rows, a non-negative safe integer
  first_date: string | null; // ISO date, null only for no rows
  last_date: string | null;
  items: {
    id: string;
    hearing_date: string;
    title?: string;
    case?: string; // At least title or case is required
    pages?: number;
    url: string; // Publisher original
    page_url?: string;
    publisher_redacted?: boolean;
    notes?: string[]; // Publisher notes, including publication restrictions
    orders?: string[]; // Publisher order URLs
  }[];
  next_offset: number | null;
}
```

The initial offset is zero. A non-null `next_offset` must equal the offset plus
the rows received and remain below `count`; a null offset ends at `count`.
Paging retains the original count and date range, refuses duplicate IDs, uses
the existing public API client and makes no automatic retries. An absent field
makes no request. A 404 while paging removes the section and its contents link.
Malformed evidence is never rendered. No transcript text or witness fields are
projected.

The additive fixture in `tests/fixtures/reports/transcripts.json` makes this
assumption reviewable; its row metadata comes from the IBAC registry sample,
with a publication-order note supplied for the component test.
