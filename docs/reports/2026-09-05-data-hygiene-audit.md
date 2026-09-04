# Speech data hygiene audit

Audit date: 2026-09-05 (Australia/Melbourne)  
Database: `desktop:/home/jake/.cache/autoresearch/parli.db`  
Scope: `speeches` only; no database, knowledge-box, configuration, enrichment,
generation, cache, or deployment writes were made during this phase.

## Method and corpus boundary

The `sqlite3` executable requested in the runbook is not installed on `desktop`
(`command not found`). The schema and measurements were therefore read through
Python 3's standard `sqlite3` module using the URI
`file:/home/jake/.cache/autoresearch/parli.db?mode=ro`.

The live table is larger than the approximate site corpus in the brief:
**1,310,477 raw rows**, versus roughly 596,000 speech resources in the knowledge
box. The difference is expected: `arag_sync.py` applies a 1993-03-13 date floor,
a 200-character floor, junk predicates, and source/exact-text deduplication.
This audit scanned all raw rows so defects in excluded archival material remain
visible. It also kept a deterministic reservoir of exactly 2,000 rows from each
of the eight sources (16,000 total), satisfying the stratified-sample floor.

| Source | State | Raw rows | Rows sampled |
|---|---|---:|---:|
| `committee_senate` | federal | 222,965 | 2,000 |
| `nsw_hansard` | NSW | 117,748 | 2,000 |
| `openaustralia` | federal | 66,136 | 2,000 |
| `qld_hansard` | Queensland | 17,222 | 2,000 |
| `sa_hansard` | South Australia | 68,982 | 2,000 |
| `vic_hansard` | Victoria | 59,795 | 2,000 |
| `wragge_xml` | federal | 335,218 | 2,000 |
| `zenodo` | federal | 422,411 | 2,000 |

`scripts/audit_speech_hygiene.py` is the reproducible read-only full scanner.
Counts below are exact whole-table candidate counts unless labelled as a review
estimate. Candidate classes can overlap, so they must not be summed.

## Defects

| Defect | What it looks like | Sources and measured count | Real example | Repair disposition |
|---|---|---|---|---|
| Empty / near-empty text | Empty or fewer than 20 non-padding characters | **0** empty; **0** near-empty | None present | No repair needed |
| Under 200 characters | Short headings, procedural fragments, acknowledgements | **320,344**: committee 130,414; zenodo 116,816; SA 29,003; wragge 16,644; Victoria 7,900; OpenAustralia 7,862; NSW 6,427; Queensland 5,278 | `speech_id=1`, `business start`, 84 characters | Selection issue. Preserve rows; existing KB floor excludes them |
| Heading-only candidate | Short, sentence-poor or all-caps fragment | **20,051** review candidates, dominated by committee (16,297) | `speech_id=772068`: `SUPERANNUATION LEGISLATION ... BILL 2006` followed by a procedural line | Do not invent body text; preserve/exclude by existing selection rules |
| Motion stub | `Motion ... agreed to: That ...`, short `That ...` records | **7,613** candidates: zenodo 5,291; committee 893; NSW 873; SA 236; OpenAustralia 117; Queensland 94; Victoria 64; wragge 45 | `speech_id=39` | Preserve rows; short examples already excluded. No text deletion |
| Division roll | `Division: Question put ... AYES ... NOES ...` | **144**, all Queensland | `speech_id=834878` | Preserve rows; existing P7 excludes short standalone rolls. Long debate-plus-roll records are not deleted |
| Leading speaker banner | `Mr NAME (Seat) (time):`, `The Hon. NAME [time]:`, `Hon. NAME:` | **100,287 broad candidates**; NSW accounts for 75,077. The broad federal tail includes false positives such as `Mr X asked ...:` and is not a safe removal count | `speech_id=422863`: `Mr GARETH WARD ( Kiama ) ( 10:21 :25 ): I move ...` | Strip only at offset zero and only when the banner name matches the row's normalized `speaker_name` |
| Broken-spacing timestamp banner | `( 22:2 5 :05 ):` or `(14: 40):` inside a matching banner | **36,739**: NSW 36,732; zenodo 7 | `speech_id=1286344`: `Mr PHILIP DONATO ( Orange ) ( 22:2 5 :05 ): Few issues ...` | Same conservative speaker-match rule; timestamp spacing is irrelevant once the matched banner is removed |
| Bracket timestamp | `[10:21].-` / `[09:03]` at the start | **1** raw archival hit | `speech_id=748545` | Strip only a leading bracketed time token; this example predates KB scope |
| Topic duplicated at start | Topic is repeated as an initial heading/prefix | **7,943** prefix candidates, including 7,236 NSW; only **18** are exact first-line repeats. Ordinary openings such as topic `Documents` + `Documents are tabled ...` are false positives | `speech_id=860465`: topic and sole first line both `Alan and Jenny Tunks ...` | Strip only a structurally separate first line or an exact all-caps topic header; stop using the current broad prefix rule |
| ALL-CAPS first header | Uppercase bill/debate heading before body | **17**, all OpenAustralia | `speech_id=772068` | Strip only when the normalized heading equals all or a delimited component of `topic` |
| Numeric HTML entity | `&#8212;`, `&#x2019;` | **104,324**: committee 101,404; SA 2,919; wragge 1 | `speech_id=423182`: `process them&#8212;or ...` | Decode numeric entities with `html.unescape` (existing sync rule; persist it in `text_clean`) |
| Mojibake / replacement characters | `Ã©`, `â€™`, or `�` | **9**, all archival `wragge_xml` | `speech_id=467131`: `m *� to 45,068` | Repair reversible UTF-8-as-Latin-1 sequences only; retain irrecoverable `�` and report it |
| NUL / C0 control characters | Embedded `\x10` joins a timestamp/source banner to body | **5**, all OpenAustralia | `speech_id=775784`: `\x1011:15 amStephen Conroy ... |Hansard source` | Remove C0 controls; retain surrounding text |
| Whitespace runs | Three-plus spaces/NBSPs or three-plus newlines | **9,871**: zenodo 5,140; OpenAustralia 3,269; Victoria 1,286; wragge 176 | `speech_id=124371` contains a long NBSP run in a division table | Normalize horizontal runs and cap blank-line runs; preserve paragraph boundaries |
| Mid-sentence line breaks | Lowercase/punctuation followed by newline then lowercase | **36,450**: wragge 22,558; zenodo 11,207; OpenAustralia 2,628; committee 57 | `speech_id=3` (Zenodo) | Join only lowercase-to-lowercase soft wraps with a space; retain heading/list/paragraph breaks |
| Line-end PDF hyphenation | `year-\nolds`, `post-\nrecovery`, `out-\nof` | **113**: wragge 57; zenodo 55; OpenAustralia 1 | `speech_id=638`: `under 16-year- \nolds` | Remove surrounding line whitespace but retain the hyphen (`year-olds`) |
| Internal OCR word split | `govern \n ment`, `Par liament`, `notwith-stand-ing` | **431** known-pattern candidates: wragge 317; zenodo 100; NSW 14 | `speech_id=47`: `govern \n ment's` | Repair a small audited dictionary only; no general whitespace deletion |
| Missing-space concatenation | `ofSenator`, `forHealth`, `theVotes` | **52,139** case-sensitive candidates: OpenAustralia 47,162; wragge 3,819; zenodo 1,008; NSW 135; committee 6; Victoria 5; SA 4 | `speech_id=797742`: `behalf ofSenator Barnett`; `speech_id=422796`: `theVotes and Proceedings` | No general automatic split: proper names and source tables make the boundary ambiguous. Record as residual; fix only audited lexical phrases |
| Page/Hansard footer | Standalone `Page 12` / `Hansard Page 12` | **0 confirmed**. A broad scan yielded 153 candidates, but contextual review found embedded tables and legitimate mentions, not footers | `speech_id=785866` has `Page`/`89` as table cells, not a footer | No generic deletion; only an exact standalone same-line footer rule if a real example appears later |
| Raw interjection markup | `<interjection>`, `[Interjection]`, `(inaudible)`, `Honourable members interjecting` | **553**: wragge 325; committee 73; Victoria 70; zenodo 39; NSW 32; OpenAustralia 14 | `speech_id=35550`: `Honourable members interjecting—Mr Costello interjecting—` | Preserve exchange content and normalize explicit markup to `[Interjection: ...]`; never drop it |
| Speaker parenthetical/title residue | `Beazley, Kim (Jr), MP`, electorate/region/role in parentheses | **18,478**: zenodo 16,875; Victoria 1,457; wragge 100; NSW 44; SA 2 | `speech_id=66` | Store/use the existing normalized speaker form; preserve raw source attribution separately |
| Party-field junk | Office strings, presiding roles, `UNKNOWN`, or historical multi-party biographies rather than one party | **48,835** values outside the current canonical map: wragge 33,079; OpenAustralia 15,124; zenodo 632 | `speech_id=13836`, party `UNKNOWN`; OpenAustralia has `Shadow Minister for ...` values in `party` | Map recognized aliases to canonical values; store no canonical party for roles/unknown/composite histories; retain raw value separately |
| Missing or malformed date | Non-ISO, impossible, empty, or NULL | **0** | None present | No repair needed |
| Topic repeats first line | First line equals topic after case/punctuation normalization | **18**, all NSW | `speech_id=860465` | Remove only the duplicated heading, leaving the body; if it is the entire text, preserve the row unchanged |
| Exact duplicate text | Same complete text under multiple `speech_id`s | **49,388 groups / 84,077 rows beyond the first** | `speech_id=6` belongs to a 237-row same-source duplicate group | Never delete or renumber; existing sync-side dedupe remains the KB selection control |
| Cross-source exact duplicate text | Same complete text appears in two sources | **65 groups / 66 rows beyond the first** | `speech_id=229` (`zenodo`) = `speech_id=641776` (`wragge_xml`): `Order! It being 10.30 p.m. ...` | Never delete; existing source-priority sync selection remains authoritative |

## Knowledge-box parity sample

`scripts/audit_kb_speech_text.py` selected database rows across the eligible date
and length window and made only lightweight
`GET /slug/{slug}/text/body` calls. It stopped after exactly 200 existing
resources; it never listed resources and never fetched a whole resource.

Result: **200/200 KB body fields exactly matched the SHA-256 of the current
database-to-sync mapping; 0 differed; 0 API errors.** The compared set contained
36 NSW, 14 OpenAustralia, 38 Queensland, 38 South Australia, 38 Victoria, and
36 Zenodo rows. Candidate misses (404s) were 2 NSW, 24 OpenAustralia, and 2
Zenodo, consistent with sync exclusions. `wragge_xml` is deliberately excluded
by the migration rules. The sampled pre-2025 range contained no Senate committee
resources.

The important conclusion is that the KB is not independently corrupt or stale:
it faithfully contains what the current mapper produced, including source
formatting defects. Repair therefore belongs in the shared normalization path,
followed by partial text-field patches for existing speech resources.

## Safety conclusions for implementation

1. Text repair must be idempotent and preserve the original `text` column.
2. Banner removal must receive `speaker_name` and require a normalized name
   match; the current `clean_speech_text(text, source, topic)` signature cannot
   meet that requirement.
3. Topic-prefix removal must become narrower; the existing NSW prefix test can
   delete genuine openings such as `Documents are tabled ...`.
4. `POST /resources` is create-only in the current sync. Its `409` handling
   silently skips existing rows. Repair must use a dedicated partial
   `PATCH /slug/{slug}` payload containing only `texts.body` (and continuation
   fields when relevant), preserving labels, origin, `extra`, and machine fields.
5. Short/procedural/duplicate rows remain records in SQLite. Selection controls,
   not deletion, keep them out of search.
6. No safe general rule exists for arbitrary OpenAustralia word concatenation,
   irrecoverable replacement characters, or unverified footer candidates. Those
   residuals must be reported rather than guessed away.
