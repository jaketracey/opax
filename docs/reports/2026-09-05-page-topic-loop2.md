# Loop 2 — progressive arc and taxonomy rows

Reviewed all 72 captures: both topics' top, parties, parliaments, tide, arc, expanded and oldest states; gambling money; index top/middle/end; all four requested viewports. No horizontal overflow.

Right: first 30 passages render before brief reads. Initial reads are serial 24 + 6; subsequent slices read only on demand. Brief updates preserve controls and focus. Oldest/newest resets to 30 within the returned search window, with already-read resources reused. Speaker and party dot share a line; parliament/date are separate. Index rows include canonical taxonomy descriptions and one free tide read for decorative sparks.

Harsh findings: full taxonomy sentences made the phone index far too tall, and expansion's default focus scroll exposed the tail of the previous entry. Fixed before close: descriptions occupy one ellipsised line (full text stays in the accessible link name and title), and expansion explicitly aligns the first new entry below the header. A further code review caught a chronology/brief race; completed briefs now update matching visible resources even after a toggle.

Still: oldest records sometimes lack debate names; no substitute title is invented. The captions are dense, and the remaining buttons need a final register/focus pass. The money section sits after the initial 30, so a top jump link would help.

Validation: node --check portal/public/app.js; git diff --check. Browser probe held brief responses, verified 30 immediate passages, batches [24,6], 60 after expansion, ascending oldest dates, focus on the first added source, and final exhaustion at 153 housing matches. Mock briefs were used only for this behavioral probe; visual captures use live retrieval responses. No ask calls, Worker changes or deployment.
