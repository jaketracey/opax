# Loop 1 — rhythm and phone wayfinding

Reviewed the full baseline for Pauline Hanson, Jo Briskey, Anne Ruston and Philip Donato at 390px, then every loop-1 viewport capture in contact sheets at 360×780, 390×844, 430×932 and 1280×900. Raw captures include consecutive overlapping scroll positions and open vote-method/register states in the requested scratchpad, prefixed `page-person-loop1-`.

The first baseline's Python proxy got HTTP 403s; replaced its network client with curl and repeated against real live API reads. The proxy blocks `/api/ask` and `nocache` entirely.

## Now right

- Section navigation follows quick facts and contains only available destinations. Money and a visibly labelled ask field are near the start.
- Main topics, votes, ties, interests and speeches headings share serif sizing/spacing; interests precede speeches.
- Phone topic labels are complete above bars; share/count remain separate and readable. All/Then/Now and register summaries have 44px heights.
- Vote columns stack, use serif bill links and retain the existing method disclosure.

## Harsh review and final corrections

1. Desktop Hanson ties were severely squeezed: a declaration without a holder fell into the old 5.5rem holder column. Fixed with a flowing declaration layout at every width, with holder and source on their own lines.
2. Empty news headings wasted a section on all four pages. The person caller now removes news without actual stories; shared news rendering is untouched.

Remaining: topic rows are tall; the heading qualifier can orphan at 360px. Speech passages remain clipped and need briefs and accurate newest retrieval. Register update links need a clear label. Expenses retain their existing small labels and uppercase section title; subsequent page-scoped polish can align the title without changing its renderer. No portrait/fact redesign.

Validation: `node --check portal/public/app.js` and `git diff --check` passed. No Worker, configuration or static-data changes. Final corrections are carried into the next capture matrix.
