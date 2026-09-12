# Discovery review pass 13 — matching receipts from an answer

## Reproduced problem

A production link to `/money/receipts?jur=qld&type=receipts&focus=donor%3Atabcorp&party=party%3ALabor&from=2020&to=2020` ignored every selection except jurisdiction. It displayed 375 flows and $37,980,134, instead of the intended Tabcorp-to-Labor selection of $12,100 across two records in return year 2020. Calculated answers offered the graph as their next step, but no direct matching receipt list.

The person profile action also said “Money map from Labor” even though its destination is the party profile. That handoff needed to name the party-level record clearly.

## Change and design

Calculated single-ranking answers now offer “See matching receipts” before the existing map and speech actions, in both Ask and conversation. The link carries every supported source selection intact and stays on the current application origin. Graph-only conditions never produce a broader list link.

The receipt list accepts exact donor and party IDs, industry, jurisdiction and return years. A removable donor filter names the exact organisation; the existing controls display the other selections. List, table, total and CSV use the same filtered rows. Unknown, duplicate or unsupported parameters display a correction with no figures or export. Retries preserve scope, while an explicit jurisdiction switch discards the old exact donor. A late first load cannot restore the old jurisdiction's route selection.

Person profiles explicitly label party receipts and explain that these are party disclosures, not that person's finances. Existing destinations are retained.

The design retains Opax's Merriweather headings and Public Sans controls, navy #142A43, ink #23271F, bronze #8A5A12, paper #FAF9F6 and white surfaces. The new action belongs with the answer's existing next steps; the selected donor belongs beside the receipt totals. No new panel, typography scale or decorative animation is introduced. Controls wrap on phones, preserve keyboard focus and provide a 44px removal target.

## Verification

- 453 portal tests passed, plus types, asset stamps and production deployment dry run.
- Eight local actual-request Chromium/WebKit cases at 320, 390, 768 and 1440px verified the direct $12,100 selection, CSV, reload, exact donor removal, Ask-to-receipts navigation, filters and no overflow. The federal FY2020–21 Labor gambling selection independently totals $457,673.
- Twelve additional local UI checks used live read-only profile data for Anthony Albanese and David Pocock in Chromium/WebKit at 390, 768 and 1440px. Destinations, accessible descriptions and wrapping passed; mobile screenshots were inspected.
- Independent Codex review passed raw graph arithmetic and CSV, malformed/duplicate links, initial-load switching, failed load and retry, donor removal, touch targets and profile wording. Eight independent browser scenarios and 15 focused tests passed.
- Both ledger lazy-import versions advance together for returning visitors. Original graphs and money calculations are unchanged. No paid application generation or enrichment calls were made.

Evidence and final production release receipt: `/Users/jake/.cache/opax/discovery-reviews/pass-13-20260913`.

## Limits and following passes

The receipt data is a published selection and includes more than gifts. Annual keys retain financial-year-start and polling-year conventions. Exact donor selection is not corporate group resolution. Filter edits do not rewrite the initial URL: reloading that link reapplies its original selection. WebKit checks are not a physical iPhone test. Named-person generation quality was not remeasured in this handoff pass.

Two additional review passes remain after production verification. Prioritise the mobile route from a finding to its receipts, including filter visibility and URL state, then new named-person question/follow-up cases checked against original speaking turns.
