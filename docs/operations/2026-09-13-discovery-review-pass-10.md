# Discovery refinement — pass 10

The money answer's next step now opens the exact scoped money map, and the homepage keeps four reviewed starting questions visible.

## Reproduced problem

“Who receives the most funding from Tabcorp Holdings in Queensland in FY2020-21?” returns a calculated answer naming Labor with $12,100 in the selected Queensland data. The prominent next-step button previously rewrote its evidence URL to `/money/receipts`, losing the jurisdiction, donor and financial year. The ledger does not initialise its filters from that URL. Readers therefore landed on an unfiltered federal lifetime view, despite a button promising the money map.

The action now preserves the existing validated `/money` URL, including jurisdiction, donor, industry, party, type and year parameters. It remains relative to the current site so previews stay local. The label is “Explore this funding on the money map”. Other routes and external origins cannot become a map action. The existing follow-up about the leading donor remains available.

The homepage previously chose four random questions and placed them in a horizontally clipped desktop row. It now consistently displays two recorded-position questions and two calculated funding questions, using existing reviewed prompts. All four wrap in two columns on desktop/tablet and one on phones. The rest of the suggestion pool remains available after answers. No generation, model, corpus or graph-data behavior changed.

## Review and validation

An independent Codex review passed link scope, navigation safety, keyboard semantics and the focused change. Browser testing caught and removed a higher-specificity legacy homepage rule that prevented tablet wrapping.

- 441 portal tests passed, including six focused next-step checks.
- TypeScript passed after generating local Worker types; asset stamps and production dry run passed.
- Four real production funding questions returned calculated answers without model generation: gambling recipients, fossil-fuel recipients, gambling FY2020–21 and Queensland Tabcorp FY2020–21. Observed responses were about 0.07–0.10 seconds in this sample.
- Chromium and WebKit each passed four local browser cases: the federal year-filtered journey at 390, 768 and 1440 pixels, plus Queensland donor scope at 390 pixels. Checks used the separately captured production answer, then the real app navigation and graph. Both year controls retained 2020; Queensland retained its jurisdiction and Tabcorp focus. Question visibility, repeat-visit consistency, focus, overflow and page errors were checked.

Production deployment identifiers, live assets, browser receipts and screenshots are archived in `/Users/jake/.cache/opax/discovery-reviews/pass-10-20260913/`. This pass is complete only after that production verification.

## Limits and next passes

Receipt totals cover the published selection, not all donors or personal payments. Existing model-generated position answers were not regenerated in this presentation pass. WebKit tests are not a physical iPhone test. The next-step parser depends on the established evidence link label; a future wording change safely omits the action.

The user extended the loop by three passes, bringing the planned total to twelve. The next reviews should broaden useful question coverage and inspect remaining ledger/graph evidence transitions, using independent source and usability checks. Avoid new decorative features or repeated generation merely to exercise unchanged behavior.
