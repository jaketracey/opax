# Loop 1 — reading and phone controls

Reviewed the NSW speech (`speech-1286344`), a federal speech with a stored summary (`speech-773946`), and a Senate committee turn (`speech-424631`). Captures cover top, summary where present, record, transcription caveat where present, and open citations at 360×780, 390×844, 430×932 and 1280×900. Evidence: `page-doc-loop1-*.png` in the requested scratchpad.

The primary Ask link now owns the first toolbar row; five compact secondary controls occupy the second. Their full accessible names remain available. Research links occupy one quiet line with 44px targets. Source lines render as paragraphs, with a 17px phone serif and a 62ch maximum measure.

Harsh review: the committee title occupied nearly the whole first phone screen because it was trapped beside a portrait. Citations had an unnecessary box around four more boxes. Those two layout findings were fixed before closing the loop: long debate titles get full width, and citations use unboxed text with one hairline separator. Revised captures verify both.

Remaining: the NSW banner is still a malformed first sentence; the committee source repeats its enormous bracketed heading; the Housing chip is too small and uppercase; the summary note is too small. The federal source also says “Member for Australian Labor Party”, showing that its electorate field contains a party. Similar still navigates away. These need content handling in loop 2 and final accessibility polish in loop 3. NSW contains no source newlines, so paragraph breaks cannot honestly be reconstructed from this response.

Validation: `node --check portal/public/app.js` and `git diff --check` pass. Static local server proxies read-only live API requests into a local cache; ask and followup endpoints are blocked. No Worker or configuration changes.
