# Discovery review pass 19 — organisation names are not jurisdictions

## Reproduced weakness

“Who gets more funding from The Federal Group, Labor or Liberal in Tasmania in 2025–26?” returned no calculated answer. The jurisdiction selector treated Federal in the exact donor name as a second requested jurisdiction. Selecting Tasmania explicitly worked, but its canonical question and subsequent follow-ups failed for the same reason.

Independent sums of the selected Tasmanian receipt edges are Labor $5,920 across one record and Liberal $4,222 across one record, a difference of $1,698. The graph has no matching record for this donor before FY2025–26. A missing earlier year must remain an evidence gap, not a zero or a winner.

Independent readback of the ingested TEC records confirmed ha25-0118 (Labor, $5,920, 7 July 2025) and ha25-0066 (Liberal, $4,222, 3 July 2025). Both are tagged tas_tec, FY2025–26 and gift. Their primary TEC report URL is preserved; a fresh direct request returned 403, so this source check verifies the stored disclosure rows and unchanged graph, not a newly downloaded TEC original.

## Change

Ask and voice receipt tools share the graph selection step. An ordinary unambiguous question or an explicit jurisdiction control still reads one graph. When region words conflict, the selector checks only the supported jurisdictions actually mentioned. It masks complete, unambiguous donor-name occurrences using that graph's existing labels and aliases, then requires the remaining jurisdiction words to identify the same graph. Multiple surviving interpretations are rejected. No organisation name is hardcoded, graphs are not merged, and amounts never determine the jurisdiction.

Separate mentions of federal, Tasmania or an unsupported jurisdiction remain scope constraints. Unknown or ambiguous organisation names cannot remove them. Existing single-region/default routing is unchanged; this bounded repair does not infer a donor's jurisdiction when the question omits it.

## Verification and limits

Regression tests cover the Tasmanian comparison, both exact recipient links and amounts, canonical history, missing-year recovery, all-year reset, a single recipient ranking, explicit controls, genuine conflicting regions, shared aliases, bounded graph reads and both voice receipt tools. The complete suite, type/stamp check and production dry-run results are archived with independent source, code and browser reviews in `/Users/jake/.cache/opax/discovery-reviews/pass-19-20260913/`.

Browser verification uses actual deterministic Ask responses in Chromium and WebKit at 390, 768 and 1440 pixels. It checks the comparison, date follow-ups, source destinations and readable layouts. This does not validate newly generated politician-position answers or replace a physical iPhone test. No paid external model calls, receipt data changes or model/cache configuration changes are required.

Independent challenge also checks geographic words in other published donor labels and aliases, including Queensland Nickel, Unions NSW and Tasmanian union records. Separate geography and unsupported scope remain visible after matching the donor; a donor-only fallback cannot invent federal scope when no jurisdiction words remain. Final release identifiers and production checks are recorded in the evidence archive.

A separate routing audit found that “And all years?” after a dated named-politician question retains the earlier year filter or replaces the topic with “all years”. This is recorded for pass 20, not changed in this pass. Source enrichment remains independently monitored; five further venue candidates stay in review and the summary-worker stop marker remains intact.
