# Queensland historical diaries: app plan only

No app code or native build is part of this lane. Historical acquisition is held.

After source access and current Cabinet rights are cleared, use the existing person diary entry point and the reviewed `access.json` export. Additive `records` entries retain the current QLD meeting columns, period, PDF page/row, original file and older index URLs, snapshot date/hash, parse version and licence receipt. An optional `historical` block on an existing minister contains period labels, totals and the newest eight historical records. Preserve `votes.json` schema 1 and bytes.

Link to an existing person only for a unique exact full-name match in the Queensland roster. Display unmatched ministers as source record text and open their original PDF. Attendees and organisations remain plain text within a record; do not add them to search terms, profiles, contacts, entity links, donor matches or cross-record identity joins. Search may index minister, period and date metadata, with a generic meeting description; private strings in the purpose must also stay out of the index.

Show the original PDF, page, former-government index, snapshot date/hash, parse version and CC licence with every historical meeting block. Retain “A meeting is not evidence of influence.” Mark outside-government totals as unavailable for a historical-only minister; current diary classification does not classify older records. Use a web link first, then design a native reader only after the additive export contract is reviewed. Test small phones, VoiceOver, Dynamic Type, long source strings, source-link navigation and unavailable/held data before claiming an app surface is shipped.
