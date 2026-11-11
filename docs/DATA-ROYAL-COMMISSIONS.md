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
  the quote. Roles are as the document gives them.
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
(`date_quote`). One Antisemitism transcript prints "THURSDAY, AUGUST 2026" on its
cover; its date is read from the page header "13/08/2026". Titles are the publisher's,
with file-size suffixes such as "(PDF, 840KB)" removed and generic link text
("Download transcript") replaced by "Hearing transcript, <date>".

The `royal_commissions` tool's profile now carries a transcript summary (count, date
range, newest three); `view=transcripts` pages through the rest, newest first, with
`words`, `since` and `until`. Every transcript row and citation carries the label
"Hearing transcript: evidence, not findings".

### Particular care

* The ACT Board of Inquiry report: the ACT Government page states that "On 4 March 2024,
  the ACT Supreme Court handed down its judgment in Drumgold v Board of Inquiry & Ors
  (No. 3)" and that "the Court made orders including three declarations favourable to
  Mr Drumgold in relation to findings adverse to him set out in Chapters 4, 5 and 6 of
  the Final Report." The full passage is in `court_context`, exactly as the page states
  it, and OPAX presents no finding from the report without it. No findings or
  recommendations are extracted from the report yet.
* The Victorian major infrastructure royal commission is still sitting. Its transcripts
  note that non-publication orders may be made; OPAX reproduces no evidence and links
  only the commission's published copies.
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
