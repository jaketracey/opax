# Loop 3 — typography, density and accessible interaction

Reviewed all four people at 360×780, 390×844, 430×932 and 1280×900, including overlapping views of the entire page, topic era states, and open register/method disclosures. Final corrections were followed by another complete matrix. Evidence lives in the requested scratchpad under `page-person-loop3-`; `page-person-loop3-diagnostics.json` lists the canonical viewport captures.

## Now right

- Auxiliary headings now use the same serif section treatment through the person caller, without changing shared renderers. Mentions use serif reading text and larger title targets.
- Fine print and chart legends are 14px. Speech previews retain four readable lines rather than turning the entry into eight full speeches.
- Navigation updates preserve keyboard focus; jumps focus their destinations below the sticky header. Era switches retain selected-button focus. Focus outlines are visible and reduced-motion overrides are scoped to this page.
- Register source links have 44px targets. Vote totals use three equal columns.

## Harsh review and fixes

1. The first totals override specified grid columns on a flex container. The third total still wrapped by itself: wasted space and broken grouping. Explicitly switched the person totals to grid and removed the inherited tile minimum width.
2. Enlarged inline register source targets distorted the description's line spacing. Separated description and source metadata onto their own lines, preserving a coherent reading unit.

Residual limitations: source passage text can include chair/interjection material. Machine briefs are available only for some records. Expenses retain their pre-existing compact chart labels; that shared renderer is outside the permitted JavaScript boundary. Jo Briskey has no supplied portrait; the existing fallback is retained. Static browser checks cannot establish physical-phone touch feel or network behaviour.

## Validation

JavaScript syntax and diff whitespace checks pass. Interaction probes at all four widths report no horizontal overflow, no sub-44px primary controls, working focused jump destinations, and selected/focused era buttons. Reduced-motion screenshots stayed pixel-stable over 600ms. Separate scenarios verified missing briefs (Passage fallback), empty topics (section and jump removed), failed newest retrieval (honestly labelled indexed sample), and a real speech link opening its document route. Those scenarios recorded zero ask calls and no JavaScript exceptions.

No Worker, configuration or static-data changes. The original CSS prefix remains byte-for-byte intact; all overrides sit under the single required page-person banner.
