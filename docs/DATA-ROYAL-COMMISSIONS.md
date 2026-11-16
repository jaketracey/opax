# Royal commissions and public inquiries

OPAX records royal commissions, and comparable boards and commissions of inquiry, from
their official reports: when each was established, who sat on it, when it reported,
its numbered recommendations in its own words, government responses and implementation
reports, and the official implementation status where a government publishes one.
The data is static JSON at `/royal-commissions/`. Ask and the MCP read it through the
`royal_commissions` tool.

## What a record holds

* `inquiry_type`: `royal_commission`, `commission_of_inquiry` or `board_of_inquiry`,
  as each body is constituted. Boards and commissions of inquiry are listed beside
  royal commissions as comparable public inquiries, never relabelled as royal
  commissions.
* `established` and `commissioners`: each carries a quote from an official document
  and the page it is on. The build checks every quote is verbatim on that page, that a
  commissioner's name is in the quote and that an establishment date is the date in
  the quote. Roles are as the document gives them. A commission listed by its documents
  only (`use: documents_only`, below) carries no quote: the build checks that the name,
  or the date in words, is printed on the cited page and keeps the page reference and
  link only.
* `reports`: interim, final and progress reports, with the PDF files, their SHA-256,
  and a date with its basis: `tabled_vic` (tabled in the Parliament of Victoria),
  `stated` (dated on the document itself, checked verbatim on the cited page),
  `published` or `updated`. Commonwealth reports tabled in Victoria carry the date on
  their letter of transmittal where OPAX could read it.
* `recommendations`: the report's own numbered recommendations, cut at its own
  headings, each with the PDF and page it was read from. A run is kept only when the
  count matches the count the registry records from the report, labels are unique,
  the sequence is complete and every line is verbatim on its page. Otherwise the
  report is `not_extracted` and nothing is guessed.
* `status`: only where a government publishes an official status for that
  recommendation, in the government's words, with the page it came from. Today that
  is the Victorian Government's Family Violence recommendations tracker (227 of 227).
  Elsewhere the status is `null`: unknown, not unimplemented.
* `responses`: government responses and implementation reports, listed as documents.
  OPAX does not grade acceptance or implementation.
* `transcripts`: hearing transcripts of a commission that is still sitting. They are
  evidence given to the commission, not its findings. OPAX lists them as documents
  with their date and hearing block, links the commission's own hearing page and
  extracts nothing from them, so no allegation or testimony appears as a finding.
* `court_context`: where a court has ruled on parts of a report, the ruling exactly
  as the cited official page states it, tied to the report it applies to. The tool
  returns it with that report and with any recommendation drawn from it.
* `acquisition` on every document: `fetched by OPAXBot`, or `manual publisher download
  supplied by the OPAX maintainer, 11 Nov 2026` (see below), with the publisher's
  reuse notice in `rights`.

## Sources

All automated requests use the single OPAXBot identity through `parli.ingest.http`,
paced at least 2 seconds apart (longer where a host's robots file sets a crawl delay),
with each host's robots policy checked (RFC 9309) and a 1,200-request ceiling for a run.

* Parliament of Victoria tabled documents database (`www.parliament.vic.gov.au`).
  Victorian royal commissions table their reports there, and so do the Commonwealth
  royal commissions Victoria joined by its own letters patent. The Parliament gives
  the tabled PDF and the tabled dates.
* `www.vic.gov.au`: the Family Violence recommendations tracker and Victorian
  Government response pages (HTML only; the site's robots policy disallows its PDFs).
* `treasury.gov.au`: the Financial Services Royal Commission final report and the
  Government's response.
* `www.act.gov.au`: the ACT Government's Board of Inquiry page, read for its court
  annotations.

### Manual supplement, 11 November 2026

The OPAX maintainer downloaded nine publisher PDFs in a browser from the publishers'
own sites, for hosts that refuse OPAXBot, and supplied byte-identical copies with a
manifest. They are recorded as `manual publisher download supplied by the OPAX
maintainer, 11 Nov 2026`, distinct from OPAXBot fetches, and cited to the publisher's
URL. Source access settings are unchanged: the refusing hosts stay gapped for
automated fetching, and the refresh never fetches them by any other route.

| Commission | Document (type as supplied) | Publisher URL | SHA-256 (first 16) | Use |
| --- | --- | --- | --- | --- |
| Robodebt Scheme (Cth) | full final report | royalcommission.gov.au | `9837ca00ecf70226` | 56 numbered recommendations |
| Institutional Responses to Child Sexual Abuse (Cth) | final report recommendations | royalcommission.gov.au | `8a3f627e17fa02f7` | 189 final report recommendations |
| Defence and Veteran Suicide (Cth) | final report volume 1, executive summary and recommendations | royalcommission.gov.au | `5efee4f27059ed24` | 122 recommendations |
| 2009 Victorian Bushfires (Vic) | final report summary | ffm.vic.gov.au | `a58888e40660967c` | 67 recommendations |
| Perth Casino (WA) | final report | wa.gov.au | `321e3003e3fd1df8` | listed; reproduction reserved |
| Forensic DNA Testing in Queensland (commission of inquiry) | final report | health.qld.gov.au | `848610463c0724ac` | listed |
| ACT Board of Inquiry into the Criminal Justice System | final report | act.gov.au | `5b65a5abef0a8ee9` | listed, with court context |
| Integrity of Major Public and Civil Infrastructure Construction Projects (Vic) | public hearing transcripts, 9 and 10 November 2026 | rcimcp.vic.gov.au | `ea13842bcae34ebe`, `152303f88aeb6cf2` | documents only |

The copies live in `<cache>/manual/<sha256>.pdf` and are never committed. The build
checks each file against its recorded SHA-256. The weekly refresh runs where these
files are absent: it carries each such commission's last built record forward
unchanged, from the previous snapshot or the published export in git, and says so in
its log.

Reuse notices, as each document states them: the Robodebt and Defence and Veteran
Suicide reports are CC BY 4.0 except the Coat of Arms; the Perth Casino report and the
ACT Board of Inquiry report reserve reproduction except as the Copyright Act permits,
so OPAX lists and links them and does not reproduce their text; the child sexual abuse
recommendations, Bushfires summary, Queensland report and the transcripts carry no
notice in the document, and OPAX quotes recommendations with attribution and links the
publisher's copy.

### Hearing transcripts intake, 12 November 2026

The OPAX maintainer supplied 216 more publisher hearing transcripts with a manifest
(hash, size, page count and publisher URL for each). Every file was checked against
the manifest before loading; none differed. They are manual documents
(`source: manual`, `kind: hearing_transcript`), never fetched by the refresh, and each
keeps the acquisition and rights notes recorded for it in the intake.

| Inquiry | Transcripts | Reuse, as the publisher states it |
| --- | --- | --- |
| Royal Commission on Antisemitism and Social Cohesion (Cth) | 53 | CC BY 4.0 for Commonwealth material |
| Royal Commission into the Robodebt Scheme (Cth) | 47 | CC BY 4.0 for Commonwealth material |
| Special Commission of Inquiry into Healthcare Funding (NSW) | 71 | CC BY 4.0 (NSW Premier's Department site notice) |
| Child Safety Commission of Inquiry (Qld) | 10 | Epiq transcript; review before republication |
| Commission of Inquiry into Forensic DNA Testing in Queensland | 4 | Epiq transcript; review before republication |
| Perth Casino Royal Commission (WA) | 10 | written consent required for reproduction |
| Royal Commission into Domestic, Family and Sexual Violence (SA) | 10 | review before republication |
| Tasmanian Commission of Inquiry (child sexual abuse in institutional settings) | 6 | non-commercial terms and publication orders |
| Scientific Inquiry into Hydraulic Fracturing in the Northern Territory | 5 | hearing excerpts; review before republication |

Each transcript's date is the one printed on it, checked verbatim on page 1
(`date_quote`). A documents-only commission holds no `date_quote`: the build checks that
the date is printed on page 1 and records the page (`date_cite`). One Antisemitism transcript prints "THURSDAY, AUGUST 2026" on its
cover; its date is read from the page header "13/08/2026". Titles are the publisher's,
with file-size suffixes such as "(PDF, 840KB)" removed and generic link text
("Download transcript") replaced by "Hearing transcript, <date>".

The `royal_commissions` tool's profile now carries a transcript summary (count, date
range, newest three); `view=transcripts` pages through the rest, newest first, with
`words` and `offset`. Every transcript row and citation carries the label
"Hearing transcript: evidence, not findings". The count line opens the way the integrity
tool's does: "OPAX lists 47 hearing transcripts from the Royal Commission into the
Robodebt Scheme, dated 27 September 2022 to 10 March 2023"; the pointer to
`view=transcripts` is a tool note, not part of the line. When every source an Ask answer
cites is a hearing transcript, and the answer does not already carry the label, it ends
with "These are from hearing transcripts: evidence, not findings."

### Transcript text for the CC BY commissions, 12 November 2026

The Antisemitism and Social Cohesion and Robodebt royal commissions (Commonwealth
material) and the NSW Healthcare Funding inquiry (NSW Premier's Department) license their
own material under CC BY 4.0, so OPAX publishes and searches the text of their 171
transcripts. `scripts/build_transcript_fulltext.py` reads the verified manual PDFs and
writes `portal/public/transcripts/`:

- `index.json`: the transcripts, the attribution and copyright page for each commission,
  the tokeniser's stopwords and the terms too common to post;
- `terms/<nn>.json`: term to transcripts, sharded by FNV-1a of the term;
- `<commission>/<key>.json`: one transcript, with each PDF page's own transcript page
  number (for example "P-4899" or "6189"), its text, and term to pages.

Text is the publisher's text layer with the margin line numbers, running headers and
footers removed; the words are not changed and redactions are the publisher's. The Epiq
word-index pages at the back of the NSW transcripts (2,071 pages) are dropped.

Where the publisher's own transcript records a non-publication or suppression order, a
direction not to publish, or a witness giving evidence under a pseudonym, the transcript
is marked `quote_policy: "no_quotes"`. Its file carries the pages and the term index but no
text, and the tool points to the hearing and page with the order notice instead of a
quotation. The test is deliberately broad: any such mention anywhere in the transcript
counts. "De-identified" and "anonymity" alone do not, as they describe data.

| Inquiry | Transcripts | Quotable | Pointed to by page only |
| --- | --- | --- | --- |
| Antisemitism and Social Cohesion | 53 | 16 | 37 |
| Robodebt | 47 | 29 | 18 |
| NSW Healthcare Funding | 71 | 62 | 9 |

`royal_commissions` view=transcripts matches `words` against the text of these
transcripts as well as the title and date. Each matching transcript carries up to two
pages with a verbatim excerpt (280 characters at most) or, for a no-quote transcript, the
page only; every citation links the publisher's PDF at that page and ends with the label
and the CC BY attribution. Every other commission's transcripts stay listed with a link to
the publisher.

An excerpt stays inside one speaker's turn. The turn's label ("MS EXAMPLE:") is taken out
of the quoted words, and no excerpt names its speaker: a wrong name is worse than none.
Counts and dates in the tool's text use words ("27 September 2022 to 10 March 2023"). In
Ask, an answer whose facts are only transcript listing rows is given in the tool's own
lines rather than rewritten.

#### Speaker role, date and page in Ask, 16 November 2026

"Hearing transcript" here means royal commission, integrity-body and inquiry hearings. It
does not cover Hansard or committee and estimates Hansard.

A quoted passage carries `speaker_role` only where the page it is on makes the role
certain: `commissioner`, `counsel assisting`, `witness`, `counsel for a party`, or
`question` (a question was put; who asked it is not printed). The citation reads "hearing
turn (counsel assisting)". Roles are built in `portal/src/tools/transcript-roles.ts`, only
on the turns `pageTurns` (`portal/src/tools/transcript-text.ts`) reads from a page, and
only the role leaves that file: a heading's text, and so anyone's name, never does.

- A turn under a heading has a role when the heading is a role word ("THE COMMISSIONER",
  "THE WITNESS") or when the cover page's list of appearances gives the whole heading a
  role ("Senior Counsel Assisting", "for the Commonwealth"). A name after "for" on the
  cover is a party someone appears for. A heading with a digit or a quote mark, or in
  title case other than a bare role word, gives no role ("Dr Surname: at the time you
  were ..." is counsel addressing a witness). A surname that a "<" line also prints may be
  a witness of the same name and takes no role from the cover. No "<" line is read for a
  name, so a witness who speaks under their own name has no role.
- "HEADING: Q." is that heading's question. A bare "Q." is a question with no asker; the
  last headed "Q." is not carried to it. An "A." is a witness's answer, never which
  witness, and only in a transcript printed as questions and answers.
- Text at the top of a page that runs on from the page before, and text after a "<" line,
  have no role. Nothing is carried across a page break.
- Two turns running under the same heading have no role: one may be the publisher's slip.

The publisher's own slips cannot be seen by any parser: a transcript sometimes prints a
witness's answer under counsel's heading (one Robodebt page of 30 January 2023 does), and
the role is then wrong. The audit counts the two forms a page does show: two turns running
under one heading (left without a role), and a one-to-three-word reply ("Yes.",
"Correct.") under a counsel heading straight after a question (counted only, since counsel
answering the Commissioner looks the same).

`portal/scripts/transcript-parser-audit.mjs` counts all of this over the published text
(run from `portal/`, no network). 16 November 2026:

| Commission | Transcripts | Pages | Confident turns (a role) | Uncertain turns (no role) | Page-top continuations (no role) | Excerpts, one a page, with a role | "<" lines: examination / other | Possible label slips (no role given) | Replies under a counsel heading (counted only) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cth-antisemitism | 16 | 1,288 | 5,742 (41.8%) | 7,507 (54.7%) | 475 (3.5%) | 454 of 1,280 (35.5%) | 2 / 193 | 0 | 38 |
| cth-robodebt | 29 | 3,138 | 22,136 (50.0%) | 21,464 (48.5%) | 688 (1.6%) | 1,656 of 3,116 (53.1%) | 94 / 252 | 95 | 200 |
| nsw-healthcare-funding | 62 | 6,230 | 45,306 (79.3%) | 7,573 (13.3%) | 4,250 (7.4%) | 3,913 of 6,204 (63.1%) | 174 / 189 | 93 | 183 |

Every quotable page carries the transcript's own page number. A passage with no role is
quoted with "the transcript records", the date and the page. In Robodebt and Antisemitism
that is mostly witnesses, who speak under their own names.

Each citation ends with the commission's record id ("Commission record: cth-robodebt."),
and one predicate, `writerMayWord` in `portal/src/transcript-answer.ts`, decides by that
id whether a model may word a source's passages. The three indexed commissions are listed
as wordable. A source that is not listed, and a passage with no record id, is quote-only:
its passages are never in the writer's prompt, a sentence that cites one is left out, and
with nothing else found they are quoted by code with role, date and page. Nothing here
decides how any other commission's transcripts would be used.

For a transcript whose source allows the writer to word it, Ask hands the writer each
passage as typed facts (speaker role, commission, hearing date, page, and never the
speaker's name) under one fixed rule (`TRANSCRIPT_ATTRIBUTION_RULE`): attribute every
statement to the role of who said it and where, give the role only and never a person's
name, never state evidence, an allegation or a question as fact, do not characterise
credibility, draw no conclusion the commission has not published as a finding, and carry
nothing said at a hearing in a sentence with no fact id. A passage with no role is quoted
only, introduced by "the transcript records" with the date and page; a `question` is
written as a question that was put, with no asker. The source card is
built from the typed facts ("Royal Commission into the Robodebt Scheme, hearing
transcript, 10 March 2023, page P-4899: A witness."), so its date, page and role do not
depend on the answer's wording. The writer marks each sentence that uses a transcript
passage as attributed; an unmarked one gets one repair pass and is then left out, that
sentence only. With no model, the passages are quoted in the same form. The research loop
is told in fixed words (`TRANSCRIPT_POINT_RULE`) never to word hearing evidence in a
point, and for any transcript a point that cites or quotes a passage is dropped and the
passage is read from its record instead. `portal/test/transcript-attribution.test.mjs`
pins all of this without a model call; the words a live model writes under the two rules
are not pinned by any test.

### Particular care

* The ACT Board of Inquiry report: the ACT Government page states that "On 4 March 2024,
  the ACT Supreme Court handed down its judgment in Drumgold v Board of Inquiry & Ors
  (No. 3)" and that "the Court made orders including three declarations favourable to
  Mr Drumgold in relation to findings adverse to him set out in Chapters 4, 5 and 6 of
  the Final Report." The full passage is in `court_context`, exactly as the page states
  it, and OPAX presents no finding from the report without it. No findings or
  recommendations are extracted from the report yet.
* The Victorian major infrastructure royal commission is still sitting and the commission
  has said it may make non-publication orders. OPAX reproduces no evidence and links only
  the commission's published copies. Its registry entry has `use: documents_only`: the
  record holds no quotation from the transcripts, only each transcript's title, date,
  publisher links, page count, hash and rights note, the commissioner's name with its
  page reference, and notes in OPAX's own words with page references. The build holds
  (exit 3) if such an entry carries a quote, a date line, an extraction rule or a note
  with quotation marks (double, single or typographic), reads its PDFs without caching
  their text, and drops any extract, at any depth, from a record it carries forward. The
  export takes `use` from the registry and stops if a snapshot disagrees, so a snapshot
  built before the entry was marked cannot be published. `tests/test_rc_no_extracts.py` and
  `portal/test/rc-no-extracts.test.mjs` pin the extracts once held by hash, whole and in runs of five words.
* Robodebt: the report refers to 57 recommendations; 56 are numbered. The unnumbered
  one, in the closing observations, is noted on the record and not loaded as numbered.
* The Antisemitism interim report's recommendations 8 to 12 say they are contained in
  the confidential interim report; their text is loaded exactly as published.

## Loader and export

* `parli/ingest/royal_commissions.py fetch|build|refresh`, with the registry
  `parli/ingest/royal_commissions.json` (commissions, documents, extraction rules and
  quoted facts). Raw pages and PDFs go to `~/.cache/autoresearch/royal-commissions/`
  (outside git; override with `OPAX_ROYAL_COMMISSIONS_CACHE`). `build` reads PDF text
  locally with PyMuPDF and writes `snapshot.json`; it holds (exit 3) on any failed
  check and refuses to shrink the snapshot without `--allow-shrink`.
* `parli/ingest/pdf_recommendations.py`: the shared numbered-recommendation extractor
  (also used by the IBAC adapter).
* `scripts/export_royal_commissions.py` writes `portal/public/royal-commissions/`:
  `index.json` (commissions with counts, caveats and gaps), `commission-<id>.json`
  (one commission in full) and `manifest.json` (counts and file hashes). It holds when
  a record lacks a citation or acquisition, or recommendations fall more than 10%.
* Weekly refresh: the `royal_commissions` and `x_royal_commissions` steps in
  `scripts/weekly_refresh.sh` (both STALE_OK). The `royal-commissions` data group is
  checked by `scripts/vm/validate_data.py`.

## Coverage, 12 November 2026

23 bodies: 17 royal commissions, 5 commissions of inquiry, 1 board of inquiry.
1,295 numbered recommendations from 12 of them; 227 carry a government-published status.
218 hearing transcripts from 10 of them.

| Jurisdiction | Bodies | Recommendations | Transcripts |
| --- | --- | --- | --- |
| Commonwealth | 8 | 683 | 100 |
| Victoria | 7 | 612 | 2 |
| New South Wales | 1 | 0 | 71 |
| Queensland | 2 | 0 | 14 |
| Western Australia | 1 | 0 | 10 |
| South Australia | 1 | 0 | 10 |
| Tasmania | 1 | 0 | 6 |
| ACT | 1 | 0 | 0 |
| Northern Territory | 1 | 0 | 5 |

## Gaps

* Commonwealth royal commission sites (royalcommission.gov.au and the per-commission
  hosts), the Attorney-General's Department and other Commonwealth department hosts
  reset or tarpit OPAXBot; pmc.gov.au answers with a bot challenge. Commonwealth
  reports load only where the Parliament of Victoria, the Treasury or the manual
  supplement serves them. Remaining Commonwealth royal commission volumes and releases
  are open: <https://www.royalcommission.gov.au/reports>.
* NSW Parliament answers OPAXBot with HTTP 403. The NSW healthcare funding Special
  Commission of Inquiry is loaded by its transcripts only; its report is open:
  <https://www.health.nsw.gov.au/Reports/Pages/special-commission-inquiry-funding.aspx>.
* South Australia's Royal Commission into Domestic, Family and Sexual Violence is
  loaded by its transcripts only; its report and implementation plan are open:
  <https://dhs.sa.gov.au/how-we-help/domestic-family-and-sexual-violence/royal-commission-into-domestic-family-and-sexual-violence>.
* Tasmania's Commission of Inquiry into child sexual abuse in institutional settings is
  loaded by its transcripts only; its full volumes are open: <https://www.commissionofinquiry.tas.gov.au/report>.
* The Victorian royal commission sites (rcfv.com.au, royalcommission.vic.gov.au) reset
  OPAXBot; Victorian reports come from the Parliament's tabled copies.
* Not yet extracted: Financial Services final report, Trade Union volumes, Child
  Sexual Abuse interim report and earlier-report recommendations, Yoorrook's first two
  interim reports and final report, Perth Casino, Queensland Forensic DNA and ACT Board
  of Inquiry recommendations.
* Only the Family Violence tracker publishes a per-recommendation status OPAX reads.
