# Loop 1 — mobile reading order

Reviewed the baseline housing, gambling and index at 390px, then all 56 section captures at 360×780, 390×844, 430×932 and 1280×900. Live free API reads were cached by a local static proxy; ask requests are blocked by the harness.

Right: ask and report now follow counts; long party names wrap; parliament shares and counts remain distinct; arc years sit above entries on phones and in a serif margin on desktop. Briefs use unboxed serif text. No horizontal page overflow in the matrix.

Harsh findings: the first pass still made coverage look like a second headline and clipped the prefilled question on narrow phones. Fixed both before closing: caption typography and a wrapping textarea. The index remains an undifferentiated run of names and numbers, and the arc still loads every brief; those are loop 2's work. Long donor names take several lines at 360px, but no text is lost. Desktop deliberately retains a reading-width column.

Validation: node --check portal/public/app.js; git diff --check. No Worker changes. Captures: requested scratchpad, page-topic-loop1-*.png.
