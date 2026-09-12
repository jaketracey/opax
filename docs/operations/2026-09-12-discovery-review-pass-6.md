# Discovery review — pass 6, 12 September 2026

Long questions in Ask and Find records now remain readable after typing or submission. Funding answers retain the finding, financial year and selected donor coverage at the top, with secondary methodology under “About these figures”.

## Reproduced problem

On production, the question “Who received more money from gambling donors, Labor or Liberal, in the financial year ending 2021?” occupied a 348-pixel-wide phone field but needed 804 pixels of horizontal text. After blur, the field was only 50 pixels high and used `white-space: nowrap`. The same truncation appeared at tablet width. The previous focus-only expansion did not cover questions supplied by a shared URL or suggestion.

## Changes

Filled Ask and Find records fields wrap and fit their content on input, focus, blur, programmatic assignment, font readiness and width changes. Empty placeholders retain the compact form layout. Very long text is limited to a 260-pixel field with vertical scrolling. Buttons keep their normal height next to multiline fields. Enter still submits, Shift+Enter inserts a newline, and a composing IME Enter does not submit.

For calculated receipt answers, the existing coverage paragraph is available through a native keyboard-accessible disclosure. The financial-year and matching-donor context remains visible above the table. Original API and export text, figures, citations and source destinations are unchanged. The footer no longer repeats raw financial-year keys (such as `2020–2020`) or filters when the explicit financial-year context is already displayed. Other answer types keep their existing metadata.

## Validation

- 404 portal tests, TypeScript, asset stamps, four jurisdiction graph smoke checks, and Worker deployment dry run passed.
- 20 local browser cases passed in Chromium and another 20 in WebKit. Four financial-year ranking, comparison, clarification and missing-data cases submitted actual deterministic requests at 320, 390, 768 and 1440 pixels. Additional checks covered a shared question, resizing, Enter, Shift+Enter, IME composition, long-input scrolling, home reset and the search field. No page errors or horizontal overflow were observed.
- Named-person rendering used previously source-verified Pauline Hanson responses, retaining the approximately 130,000 annual immigration cap and the linked original record. This was a presentation replay, not a fresh assessment of the current model.
- An independent Codex reviewer passed 46 additional Chromium assertions. These included a previously verified David Pocock proposal with the 75%-of-market / 30%-of-income conditions and original speech link; receipt comparisons retained every source destination, calculation link and caveat. No blocker was found.
- Nine actual local financial-year API regression cases passed their expected outcomes; the missing-year evidence gap correctly has no citation or invented zero.

No paid application-generation or enrichment calls were made during this pass. Ordinary local tests have no live knowledge-box credentials; the independent review encountered existing `/api/stats` and long-query `/api/search-all` failures in that configuration. Neither is treated as production verification. Existing production model configuration and unrelated commits are preserved.

Working evidence is in `/tmp/opax-discovery-pass6`; the completed release receipt, production checks and screenshots are archived under `/Users/jake/.cache/opax/discovery-reviews/pass-6-20260912` after deployment.

## Remaining limits

WebKit viewport testing is not a physical iPhone or its software keyboard. Exceptionally long questions require scrolling inside the field. Source-verified response replays assess presentation and source links, not the quality or latency of a new generation. The funding dataset remains a selection and contains receipts beyond gifts. A subsequent pass should test whether conversational funding follow-ups retain or explicitly change the correct donor, recipient and year scope.
