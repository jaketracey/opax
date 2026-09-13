# Discovery review pass 15 — ordinary questions about recorded positions

## Reproduced weakness

“Does Pauline Hanson support nuclear power?”, “What does Andrew Wilkie think about poker machines?” and “What is David Pocock’s position on gambling advertising?” did not resolve a named speaker or enter the original-speaking-turn answer path. The same people were recognised when the question used “what did … say”.

A separate original-source check found that speech-828756, indexed under Pocock, includes a ministerial reply beginning “Thank you,Senator Pocock.” The previous turn-boundary detector allowed that reply into evidence attributed to the questioner.

## Change

Ordinary support, opposition, favour, stance and opinion questions now resolve an exact roster name and use the existing dated, cited position pipeline. They describe recorded statements, including for hypothetical wording. Unknown names, surname fragments, party objects and comparisons containing multiple named people cannot silently resolve to one speaker. Explicit user filters retain precedence.

Pronoun follow-ups keep the person, replace an explicit topic, and retain the prior topic for “it” or “that policy”. Replacement date windows travel in structured filters without searching for an obsolete earlier year. Only user questions supply conversational scope.

A paragraph-leading “Thank you, Senator…” or equivalent member/minister address now ends the first speaking turn, including imported text without a space after the comma. An initial address or an inline phrase does not end a turn. Named-position cache keys advance to original-turns-v7; general Ask and funding caches are unchanged.

## Evidence and review

Three independently reviewed original records support useful, narrow examples:

- Hanson, 27 August 2025, speech-1196491: proposed repealing the nuclear-energy ban and an initial 1,400-megawatt East Coast reactor. “To start with” matters. A nearby cost for three coal/nuclear plants cannot become the reactor's cost.
- Wilkie, 6 February 2018, speech-358332: advocated removing poker machines from Tasmanian hotels and clubs in an upcoming state-election context. This does not establish a national ban or completed reform.
- Pocock, 23 July 2025, speech-1195201: criticised the lack of action on gambling advertising after the Murphy report and urged reform. This turn does not itself specify a ban, timetable or regulator.

The mixed 21 March 2023 Pocock record now yields only his 233-character question. The minister’s answer is excluded.

Independent Codex challenge found a comparison that still selected only the first person and stale year terms in follow-ups. Both were corrected and re-reviewed. The final review passes.

## Validation and limits

The initial final patch passed 461 portal tests, type checks, asset stamps and production dry-run. Three real archived source records were run through the local retrieval/attribution/citation pipeline with independently reviewed mock summary drafts. Eighteen Chromium/WebKit replays at 390, 768 and 1440 pixels checked named answers, dates, source links, mobile/tablet readability and overflow. Release checks after integration with newer main are recorded separately.

No paid generation calls were made. These are original-source and routing checks plus mock-summary browser replays, not a new measurement of live model answer quality. The conservative grammar and turn boundaries do not recognise every form of speech. Truncating a same-speaker paragraph beginning with a parliamentary thank-you can omit material; this favours limited evidence over attributing another person’s words. A selected dated statement does not establish a current policy or prove there are no other positions.

Final integration, deployment identifiers, production replays and source hashes are archived in `/Users/jake/.cache/opax/discovery-reviews/pass-15-20260913/release-verified.json`. This completes the scheduled fifteen discovery passes; enrichment monitoring continues.

Integration with `ff55f0d9` preserved the concurrently added grants program data, interfaces and MCP tools. All 478 tests and type/stamp checks passed on that integrated head; the source replay checks passed unchanged. The eighteen local browser cases were repeated against that integrated build before release.
