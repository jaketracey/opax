# Loop 2 — speeches and register content

Reviewed every final loop-2 capture using the 16 contact sheets: all four people at 360, 390, 430 and 1280px, full overlapping scroll coverage, open vote/register disclosures, and Then/Now states. Capture harness now waits for outstanding data reads and fonts before measuring the page.

## Now right

- Latest speeches request a paged, newest-sorted speaker search. Existing quick facts retain their original data source and layout.
- Optional briefs use the existing read-only `fetchBriefMap` helper and its 24-rid cap. Philip Donato demonstrates both real machine briefs and passage fallbacks; federal examples currently have passages.
- Every speech is one full-row anchor, with date, debate, explicit Machine brief/Passage label and four readable serif preview lines. The caption states the retrieval-window limitation, and the all-speeches link requests newest order.
- Missing news disappears; mentions have their own serif heading. Register updates have a visible 44px “Just declared” link. Ties flow at desktop as well as phone widths.

## Findings and fixes

- Initial newest request omitted `q`, which the Worker requires. Fixed to the person's name with `page=1`, `per=8`, `sort=newest`; repeated captures show Hanson's newest sample advancing to 13 August and Donato's to November 2025.
- Unlimited passages made the entry substantially longer. Limited previews to four lines while keeping the whole row clickable.
- Final review: Briskey's empty Then era still displayed a chart legend. Removed the legend when that era has no rows; retain the useful explicit explanation and era switch.
- Interaction probe: short jump labels, especially Ties, had insufficient target width despite their 44px height. Added 44px minimum widths and tightened the gaps so the five primary links fit a narrow phone.

Remaining: expenses still use a different heading treatment; mentions need serif reading type and larger title targets. Register source links remain cramped. Loop 3 will address these page-scoped presentation issues, focus and reduced motion. Source snippets sometimes contain Hansard chair/interjection material; no source data was rewritten.

Validation: JavaScript syntax and whitespace checks passed; no Worker changes, no configuration changes, no paid asks. Final legend/target corrections are included in the loop-3 matrix.
