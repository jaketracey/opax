# Dated state electorate members

`official-lists.json` contains facts transcribed from official member lists. Party labels are retained as supplied. `held-wikidata.json` is a snapshot of OPAX's `ext_state_roster` bindings for the previously uncovered state chambers. It excludes personal biographical fields. Neither file establishes unsourced service start dates.

Exported representatives keep the supplied `party` label. A separate `party_canonical` uses OPAX's existing party rules for links and grouping. A label naming a coalition cannot establish one party. These lookup labels do not change source labels or state division records.

`acquisition.json` records request URLs, response dates, digests and refusals. Raw pages, spreadsheets and refusal bodies are retained outside the repository at `~/opax-work/evidence/im-state-members/`. The response instant is UTC. Dated source documents retain their own dates, including the Tasmanian Council spreadsheet dated 25 August 2026, independently of retrieval. Undated lists use the Australian calendar date of retrieval. Previously held observations retain their recorded dates. Exported observations use `listed` or `partial`, and the page says "Listed as at" with the source.

`exceptions.json` lists every empty or under-capacity electorate with a reviewed reason. A refused source is an acquisition exception, not a claim of vacancy. NSW, Queensland, WA and NT refused this acquisition. No further requests were made to those jurisdictions. The official Queensland and NSW Council observations were already held in `scripts/roster_state_evidence.json` before this work.

The join uses jurisdiction, house and exact normalised electorate equality. It normalises case, apostrophes, hyphens, whitespace and the whole token Mt to Mount. It does not infer renamed electorates, missing districts or ambiguous identities. Official lists take precedence over open Wikidata terms, including newer terms that can still name former members. Same-source duplicates, excess members, multiple-seat claims and unresolved joins are checked or logged.

NSW Assembly observations must additionally prove a seat term starting on or after 25 March 2023, or a held win at that election plus a complete held by-election check since. No complete by-election register or seat-win check is held, so the second rule admits nobody. An empty event list is not a negative check. Conflicting open seat claims remain excluded even if one starts later. Wahroonga is separately quarantined because the review disputed its current membership; no resignation or replacement is asserted. `nsw-assembly-review.json` records every seat's before/after result and each surviving term's evidence.

`reviews.json` records the held-evidence check, the five requested surname-profile audits and six cross-jurisdiction identity follow-ups. The Martin, Lee, Smith and Brown public surname profiles combine people across jurisdictions, although their specific state database IDs are narrower. Their current members are shown unlinked. Field's reviewed Queensland speech scope agrees with the database and retains its link. Name aliases cannot express the six cross-jurisdiction person-ID equivalences; merging those needs a separate identity review while preserving historical and protected exports.

Reproduce the release offline:

```sh
python3 scripts/update_state_members.py export --base-release 9e281b4ef4edbd38 --generated 2026-11-14 --log /path/outside/repo/join-log.json
```

For a future authorised source refresh, fetch only the official list and resources it links or embeds. The fetch command saves responses and stops the entire jurisdiction after a refusal or challenge. It uses User-Agent `opax-improve-audit`, spaces requests by more than a second and does not retry refusals:

```sh
python3 scripts/update_state_members.py fetch --state STATE --url OFFICIAL_URL --label members --evidence /path/outside/repo
python3 scripts/update_state_members.py prepare --evidence /path/outside/repo
```

`prepare` supports the acquired ACT table, SA contact directory API and Tasmanian spreadsheets with their directory cross-checks. Parsers for refused sites have not been guessed or claimed as working. The full electorate builder also imports these observations. A new database snapshot includes `ext_state_roster` when available, with the pinned bindings as a fallback.

Unchanged Victorian and federal detail documents and summary links keep their original immutable URLs. Identical detail files are included in the new release for consumers reading a single release. Export fails if any protected detail changes. The tests compare protected detail bytes, summary bytes and person rows against the previous published release.

The report is in `docs/reports/2026-11-14-state-members.md`. State election timelines and state division party labels are outside this change.
