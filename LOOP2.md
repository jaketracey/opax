# Loop 2 — evidence and follow-ups

Added citation buttons from the cached response's explicit resource IDs and character ranges. The real 1,779-character answer has paragraph boundaries at 523 and 1,015; its ranges align exactly. Never infer the meaning of literal model-written [n] markers. Citation clicks open the appropriate disclosure, scroll to its source and focus the row. Citation evidence travels with the sources into the seeded chat session.

Each source now has its title, party dot / speaker / parliament / date and a two-line real passage. All cited chat sources remain cited (11 here), with the seven other retrieved sources separately collapsed. Other pages' sourceItem calls retain their existing rendering.

The first three follow-ups now appear together on Ask and in chat, with wrapping and a short opacity-only arrival. Cached answers render complete citation-aware text without a simulated streaming delay.

Reviewed 18 captures per width at 360, 390, 430 and 1280, including each answer paragraph, source list middle/end, retrieved middle/end, options, Ask suggestions and chat. No document overflow. Two final corrections: change the inaccurate “Generated today” stamp to “Viewed”, and make the citation destination's keyboard focus visible (plus paragraph scroll clearance).

Harsh remaining findings: the date ruler's invisible links overlap around recent years; long option popovers need an explicit viewport limit; 44px metadata links make sources tall, though still readable. The chat keyboard and pending loader need explicit exercise in loop 3. Source wording and missing party metadata are corpus limitations, not permission to invent data.

Checks: node --check portal/public/app.js; git diff --check. No Worker changes, configuration changes or paid generation calls. Browser replies and suggestions remain labelled local fixtures in the harness, with the original Ask response a verified live cache hit.
