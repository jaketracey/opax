# Source identity audit, 10 October 2026

Baseline is `649adfff` (the branch start). This inventory covers the whole
repository, including scripts, ingest code, docs, service definitions, tests,
generated assets and portal code. Each matching file and line appears once;
multiple matching tokens on a line are grouped. Dependency trees, bytecode
and Git internals are excluded. No response payloads or credentials are included.

The scan matches agent header/property names, the removed bypass option,
identity product tokens followed by a version, and the scraping-service name.
Ordinary mentions of supported browsers or application chrome are not HTTP identities.

```sh
rg -n --hidden -i -o 'user.?agent|browser[_-]ua|Mozilla/[0-9]|Firefox/[0-9]|Chrome/[0-9]|Safari/[0-9]|AppleWebKit/[0-9]|Gecko/[0-9]|firecrawl' -g '!.git' -g '!.venv' -g '!node_modules' -g '!*.pyc' -g '!docs/SOURCES-ACCESS-AUDIT.md'
```

All executable scraping-service calls were in the federal interests path:
index acquisition, Senate detail acquisition (including its rendering retry),
and the direct-PDF failure fallback. They now use bounded direct HTTP.
Its class, service payload, API-key read, billing counters and proxy option
were removed. The old Senate script name delegates to direct acquisition.
The APH member list was a historical manual workflow documented in the repo;
it is now marked paused. Other service-name hits are historical docs, receipt
fixtures, or the explicit host deny rule. There are no active service requests.

Browser identities remain only in the incoming network-block unit fixtures.
These construct reader/crawler Requests for local classification and never fetch
source sites. The analytics bundle reads a real reader’s identity; it does not
set an outbound agent. They are the two narrow scan exceptions. All source
fetches and all new tests pass through the shared identity guard.

## Baseline matches and dispositions

310 unique file:line hits (389 distinct tokens).

| File:line | Disposition |
| --- | --- |
| `.github/workflows/refresh-watchdog.yml:51` | Retained descriptive context; no outbound identity assignment |
| `docs/ANALYTICS.md:23` | Retained descriptive agent/robots context |
| `docs/DATA-ACT-HANSARD.md:12` | Retained descriptive agent/robots context |
| `docs/DATA-CONTRACTS.md:110` | Historical context; superseded by current access policy |
| `docs/DATA-GRANTS.md:57` | Retained descriptive agent/robots context |
| `docs/DATA-GRANTS.md:59` | Browser example or obsolete bypass instruction removed |
| `docs/DATA-INFLUENCE.md:41` | Retained descriptive agent/robots context |
| `docs/DATA-INTERESTS.md:6` | Historical context; superseded by current access policy |
| `docs/DATA-INTERESTS.md:7` | Historical context; superseded by current access policy |
| `docs/DATA-INTERESTS.md:9` | Historical context; superseded by current access policy |
| `docs/DATA-INTERESTS.md:18` | Historical context; superseded by current access policy |
| `docs/DATA-INTERESTS.md:39` | Historical context; superseded by current access policy |
| `docs/DATA-INTERESTS.md:44` | Historical context; superseded by current access policy |
| `docs/DATA-INTERESTS.md:46` | Historical context; superseded by current access policy |
| `docs/DATA-INTERESTS.md:80` | Historical context; superseded by current access policy |
| `docs/DATA-INTERESTS.md:94` | Historical context; superseded by current access policy |
| `docs/DATA-INTERESTS.md:106` | Historical context; superseded by current access policy |
| `docs/DATA-INTERESTS.md:107` | Historical context; superseded by current access policy |
| `docs/DATA-INTERESTS.md:139` | Retained descriptive agent/robots context |
| `docs/DATA-INTERESTS.md:145` | Retained descriptive agent/robots context |
| `docs/DATA-INTERESTS.md:171` | Historical context; superseded by current access policy |
| `docs/DATA-INTERESTS.md:172` | Historical context; superseded by current access policy |
| `docs/DATA-INTERESTS.md:177` | Historical context; superseded by current access policy |
| `docs/DATA-MEMBERS.md:11` | Historical context; superseded by current access policy |
| `docs/DATA-MEMBERS.md:15` | Historical context; superseded by current access policy |
| `docs/DATA-MEMBERS.md:45` | Historical context; superseded by current access policy |
| `docs/DATA-WORDS.md:15` | Retained descriptive agent/robots context |
| `docs/DATA-WORDS.md:29` | Browser example or obsolete bypass instruction removed |
| `docs/DATA-WORDS.md:30` | Browser example or obsolete bypass instruction removed |
| `docs/DATA-WORDS.md:31` | Browser example or obsolete bypass instruction removed |
| `docs/DATA-WORDS.md:32` | Browser example or obsolete bypass instruction removed |
| `docs/DATA-WORDS.md:33` | Browser example or obsolete bypass instruction removed |
| `docs/DATA-WORDS.md:34` | Browser example or obsolete bypass instruction removed |
| `docs/DATA-WORDS.md:56` | Browser example or obsolete bypass instruction removed |
| `docs/DATA-WORDS.md:233` | Browser example or obsolete bypass instruction removed |
| `docs/HUBS.md:139` | Retained descriptive agent/robots context |
| `docs/HUBS.md:144` | Retained descriptive agent/robots context |
| `docs/IOS-API-CONTRACT.md:17` | Retained descriptive agent/robots context |
| `docs/IOS-API-CONTRACT.md:19` | Retained descriptive agent/robots context |
| `docs/IOS-API-CONTRACT.md:34` | Retained descriptive agent/robots context |
| `docs/IOS-API-CONTRACT.md:479` | Retained descriptive agent/robots context |
| `docs/IOS-API-CONTRACT.md:555` | Retained descriptive agent/robots context |
| `docs/IOS-APP.md:193` | Retained descriptive agent/robots context |
| `docs/IOS-UX.md:13` | Retained descriptive agent/robots context |
| `docs/IOS-VOICE.md:115` | Retained descriptive agent/robots context |
| `docs/PHOTOS.md:257` | Retained descriptive agent/robots context |
| `docs/PHOTOS.md:258` | Retained descriptive agent/robots context |
| `docs/PICTURES.md:122` | Retained descriptive agent/robots context |
| `docs/PICTURES.md:386` | Historical context; superseded by current access policy |
| `docs/PICTURES.md:406` | Historical context; superseded by current access policy |
| `docs/PICTURES.md:408` | Historical context; superseded by current access policy |
| `docs/PICTURES.md:412` | Historical context; superseded by current access policy |
| `docs/PICTURES.md:413` | Historical context; superseded by current access policy |
| `docs/PICTURES.md:416` | Historical context; superseded by current access policy |
| `docs/SCOPE-BILLS.md:541` | Historical context; superseded by current access policy |
| `docs/SCOPE-BILLS.md:545` | Historical context; superseded by current access policy |
| `docs/SCOPE-BILLS.md:547` | Historical context; superseded by current access policy |
| `docs/SCOPE-BILLS.md:548` | Historical context; superseded by current access policy |
| `docs/SCOPE-BILLS.md:576` | Retained descriptive agent/robots context |
| `docs/SCOPE-BILLS.md:585` | Historical context; superseded by current access policy |
| `docs/SCOPE-BILLS.md:586` | Historical context; superseded by current access policy |
| `docs/SCOPE-BILLS.md:587` | Historical context; superseded by current access policy |
| `docs/SCOPE-BILLS.md:589` | Historical context; superseded by current access policy |
| `docs/SCOPE-BILLS.md:591` | Historical context; superseded by current access policy |
| `docs/SCOPE-BILLS.md:785` | Historical context; superseded by current access policy |
| `docs/SCOPE-BILLS.md:790` | Browser example or obsolete bypass instruction removed |
| `docs/SCOPE-BILLS.md:794` | Retained descriptive agent/robots context |
| `docs/SCOPE-BILLS.md:847` | Historical context; superseded by current access policy |
| `docs/SCOPE-BILLS.md:861` | Historical context; superseded by current access policy |
| `docs/SCOPE-BILLS.md:862` | Historical context; superseded by current access policy |
| `docs/SCOPE-BILLS.md:863` | Historical context; superseded by current access policy |
| `docs/VOTES.md:103` | Retained descriptive agent/robots context |
| `docs/operations/2026-09-13-bill-text-import.md:41` | Browser example or obsolete bypass instruction removed |
| `docs/operations/2026-09-13-bill-text-import.md:45` | Browser example or obsolete bypass instruction removed |
| `docs/operations/interests-refresh-2026-10-03.md:3` | Historical context; superseded by current access policy |
| `docs/operations/interests-refresh-2026-10-03.md:27` | Historical context; superseded by current access policy |
| `docs/operations/interests-refresh-2026-10-03.md:42` | Historical context; superseded by current access policy |
| `docs/operations/interests-refresh-2026-10-03.md:45` | Historical context; superseded by current access policy |
| `docs/operations/interests-refresh-2026-10-03.md:195` | Historical context; superseded by current access policy |
| `docs/operations/interests-refresh-2026-10-03.md:214` | Historical context; superseded by current access policy |
| `docs/operations/nightly-refresh.md:19` | Historical context; superseded by current access policy |
| `docs/operations/nightly-refresh.md:165` | Historical context; superseded by current access policy |
| `docs/operations/nightly-refresh.md:174` | Historical context; superseded by current access policy |
| `docs/operations/nightly-refresh.md:175` | Historical context; superseded by current access policy |
| `docs/operations/nightly-refresh.md:182` | Historical context; superseded by current access policy |
| `docs/operations/periodic-refresh.md:90` | Historical context; superseded by current access policy |
| `docs/operations/periodic-refresh.md:149` | Retained descriptive agent/robots context |
| `download_hansard.py:29` | Uses the shared identity / guarded transport |
| `download_hansard_fast.py:39` | Uses the shared identity / guarded transport |
| `download_hansard_fast.py:398` | Uses the shared identity / guarded transport |
| `parli/ingest/abs_profiles.py:46` | Uses the shared identity / guarded transport |
| `parli/ingest/acnc_ato.py:73` | Uses the shared identity / guarded transport |
| `parli/ingest/acnc_ato.py:638` | Uses the shared identity / guarded transport |
| `parli/ingest/act_hansard.py:68` | Uses the shared identity / guarded transport |
| `parli/ingest/act_hansard.py:106` | Uses the shared identity / guarded transport |
| `parli/ingest/aec_results.py:34` | Uses the shared identity / guarded transport |
| `parli/ingest/anao.py:32` | Uses the shared identity / guarded transport |
| `parli/ingest/anao.py:42` | Uses the shared identity / guarded transport |
| `parli/ingest/austender.py:29` | Uses the shared identity / guarded transport |
| `parli/ingest/austender_full.py:77` | Uses the shared identity / guarded transport |
| `parli/ingest/bill_texts.py:26` | Uses the shared identity / guarded transport |
| `parli/ingest/bill_texts.py:118` | Removed bypass flag |
| `parli/ingest/bill_texts.py:122` | Removed bypass flag |
| `parli/ingest/bill_texts.py:139` | Removed bypass flag |
| `parli/ingest/bill_texts.py:140` | Removed bypass flag |
| `parli/ingest/bill_texts.py:146` | Uses the shared identity / guarded transport |
| `parli/ingest/bills.py:35` | Uses the shared identity / guarded transport |
| `parli/ingest/bills.py:88` | Uses the shared identity / guarded transport |
| `parli/ingest/board_appointments.py:45` | Uses the shared identity / guarded transport |
| `parli/ingest/cache_apis.py:38` | Uses the shared identity / guarded transport |
| `parli/ingest/cache_apis.py:58` | Uses the shared identity / guarded transport |
| `parli/ingest/committee_hearings.py:6` | Uses the shared identity / guarded transport |
| `parli/ingest/committee_hearings.py:77` | Uses the shared identity / guarded transport |
| `parli/ingest/committee_hearings.py:78` | Uses the shared identity / guarded transport |
| `parli/ingest/committee_hearings.py:130` | Uses the shared identity / guarded transport |
| `parli/ingest/committee_witnesses.py:68` | Uses the shared identity / guarded transport |
| `parli/ingest/committee_witnesses.py:326` | Uses the shared identity / guarded transport |
| `parli/ingest/conduct_interests_federal.py:14` | Uses the shared identity / guarded transport |
| `parli/ingest/conduct_interests_federal.py:16` | Uses the shared identity / guarded transport |
| `parli/ingest/conduct_interests_federal.py:17` | Removed service call; direct honest transport or paused source |
| `parli/ingest/conduct_interests_federal.py:49` | Uses the shared identity / guarded transport |
| `parli/ingest/conduct_interests_federal.py:200` | Uses the shared identity / guarded transport |
| `parli/ingest/conduct_interests_federal.py:252` | Removed service call; direct honest transport or paused source |
| `parli/ingest/conduct_interests_federal.py:253` | Removed service call; direct honest transport or paused source |
| `parli/ingest/conduct_interests_federal.py:1165` | Removed service call; direct honest transport or paused source |
| `parli/ingest/conduct_interests_federal.py:1166` | Removed service call; direct honest transport or paused source |
| `parli/ingest/conduct_interests_qld.py:10` | Retained descriptive context; no outbound identity assignment |
| `parli/ingest/conduct_interests_qld.py:31` | Retained descriptive context; no outbound identity assignment |
| `parli/ingest/divisions.py:28` | Uses the shared identity / guarded transport |
| `parli/ingest/donations.py:45` | Uses the shared identity / guarded transport |
| `parli/ingest/electorates.py:71` | Uses the shared identity / guarded transport |
| `parli/ingest/ext_common.py:62` | Uses the shared identity / guarded transport |
| `parli/ingest/ext_common.py:92` | Uses the shared identity / guarded transport |
| `parli/ingest/federal_lobbyists.py:51` | Uses the shared identity / guarded transport |
| `parli/ingest/fetch_division_votes.py:74` | Uses the shared identity / guarded transport |
| `parli/ingest/fits_register.py:42` | Uses the shared identity / guarded transport |
| `parli/ingest/fits_register.py:64` | Uses the shared identity / guarded transport |
| `parli/ingest/fits_register.py:235` | Uses the shared identity / guarded transport |
| `parli/ingest/frl_instruments.py:401` | Uses the shared identity / guarded transport |
| `parli/ingest/grantconnect.py:72` | Uses the shared identity / guarded transport |
| `parli/ingest/grantconnect.py:464` | Uses the shared identity / guarded transport |
| `parli/ingest/grants.py:44` | Uses the shared identity / guarded transport |
| `parli/ingest/guardian_news.py:28` | Uses the shared identity / guarded transport |
| `parli/ingest/handbook.py:5` | Uses the shared identity / guarded transport |
| `parli/ingest/handbook.py:27` | Uses the shared identity / guarded transport |
| `parli/ingest/handbook.py:165` | Uses the shared identity / guarded transport |
| `parli/ingest/interests_fetch.py:3` | Removed service call; direct honest transport or paused source |
| `parli/ingest/interests_fetch.py:41` | Removed service call; direct honest transport or paused source |
| `parli/ingest/interests_fetch.py:48` | Removed service call; direct honest transport or paused source |
| `parli/ingest/interests_fetch.py:54` | Removed service call; direct honest transport or paused source |
| `parli/ingest/interests_fetch.py:58` | Removed service call; direct honest transport or paused source |
| `parli/ingest/interests_fetch.py:66` | Removed service call; direct honest transport or paused source |
| `parli/ingest/interests_fetch.py:71` | Removed service call; direct honest transport or paused source |
| `parli/ingest/interests_fetch.py:75` | Removed service call; direct honest transport or paused source |
| `parli/ingest/interests_fetch.py:81` | Removed service call; direct honest transport or paused source |
| `parli/ingest/interests_fetch.py:88` | Removed service call; direct honest transport or paused source |
| `parli/ingest/interests_fetch.py:91` | Removed service call; direct honest transport or paused source |
| `parli/ingest/interests_fetch.py:94` | Removed service call; direct honest transport or paused source |
| `parli/ingest/interests_fetch.py:99` | Removed service call; direct honest transport or paused source |
| `parli/ingest/interests_fetch.py:101` | Removed service call; direct honest transport or paused source |
| `parli/ingest/interests_fetch.py:106` | Removed service call; direct honest transport or paused source |
| `parli/ingest/interests_fetch.py:108` | Removed service call; direct honest transport or paused source |
| `parli/ingest/interests_fetch.py:112` | Removed service call; direct honest transport or paused source |
| `parli/ingest/interests_fetch.py:113` | Removed service call; direct honest transport or paused source |
| `parli/ingest/interests_fetch.py:246` | Removed service call; direct honest transport or paused source |
| `parli/ingest/load_votes.py:30` | Uses the shared identity / guarded transport |
| `parli/ingest/load_votes.py:48` | Uses the shared identity / guarded transport |
| `parli/ingest/members.py:31` | Uses the shared identity / guarded transport |
| `parli/ingest/ministerial_diaries.py:51` | Uses the shared identity / guarded transport |
| `parli/ingest/ministerial_diaries.py:76` | Uses the shared identity / guarded transport |
| `parli/ingest/mp_interests.py:45` | Uses the shared identity / guarded transport |
| `parli/ingest/nsw_hansard.py:35` | Uses the shared identity / guarded transport |
| `parli/ingest/nsw_hansard.py:62` | Uses the shared identity / guarded transport |
| `parli/ingest/photos.py:47` | Uses the shared identity / guarded transport |
| `parli/ingest/qao_reports.py:96` | Uses the shared identity / guarded transport |
| `parli/ingest/qld_contracts.py:97` | Uses the shared identity / guarded transport |
| `parli/ingest/qld_lobbyists.py:51` | Uses the shared identity / guarded transport |
| `parli/ingest/qld_lobbyists.py:104` | Uses the shared identity / guarded transport |
| `parli/ingest/qld_parliament.py:52` | Uses the shared identity / guarded transport |
| `parli/ingest/qld_parliament.py:53` | Uses the shared identity / guarded transport |
| `parli/ingest/qld_parliament.py:56` | Uses the shared identity / guarded transport |
| `parli/ingest/qld_parliament.py:57` | Uses the shared identity / guarded transport |
| `parli/ingest/qld_parliament.py:58` | Uses the shared identity / guarded transport |
| `parli/ingest/qld_parliament.py:134` | Uses the shared identity / guarded transport |
| `parli/ingest/qld_parliament.py:136` | Uses the shared identity / guarded transport |
| `parli/ingest/sa_hansard.py:40` | Uses the shared identity / guarded transport |
| `parli/ingest/sa_hansard.py:73` | Uses the shared identity / guarded transport |
| `parli/ingest/state_donations.py:42` | Uses the shared identity / guarded transport |
| `parli/ingest/state_donations.py:43` | Uses the shared identity / guarded transport |
| `parli/ingest/state_rosters.py:132` | Uses the shared identity / guarded transport |
| `parli/ingest/tvfy_refresh.py:50` | Uses the shared identity / guarded transport |
| `parli/ingest/tvfy_refresh.py:141` | Uses the shared identity / guarded transport |
| `parli/ingest/vic_parliament.py:71` | Uses the shared identity / guarded transport |
| `parli/ingest/votes_state.py:77` | Uses the shared identity / guarded transport |
| `parli/ingest/votes_state.py:168` | Uses the shared identity / guarded transport |
| `parli/ingest/words_common.py:34` | Removed bypass flag |
| `parli/ingest/words_common.py:35` | Uses the shared identity / guarded transport |
| `parli/ingest/words_common.py:36` | Removed bypass flag |
| `parli/ingest/words_common.py:45` | Uses the shared identity / guarded transport |
| `parli/ingest/words_common.py:50` | Uses the shared identity / guarded transport |
| `parli/ingest/words_parlinfo.py:31` | Uses the shared identity / guarded transport |
| `parli/ingest/words_parlinfo.py:36` | Removed bypass flag |
| `parli/ingest/words_parlinfo.py:44` | Removed bypass flag |
| `parli/ingest/words_parlinfo.py:45` | Removed bypass flag |
| `parli/ingest/words_parlinfo.py:46` | Removed bypass flag |
| `parli/ingest/words_parlinfo.py:47` | Removed bypass flag |
| `parli/ingest/words_parlinfo.py:48` | Removed bypass flag |
| `parli/ingest/words_parlinfo.py:49` | Removed bypass flag |
| `parli/ingest/words_parlinfo.py:50` | Removed bypass flag |
| `parli/ingest/words_parlinfo.py:67` | Removed bypass flag |
| `parli/ingest/words_parlinfo.py:326` | Removed bypass flag |
| `parli/ingest/words_parlinfo.py:327` | Removed bypass flag |
| `parli/ingest/words_parlinfo.py:329` | Uses the shared identity / guarded transport |
| `parli/ingest/words_parlinfo.py:330` | Removed bypass flag |
| `parli/ingest/words_parlinfo.py:333` | Removed bypass flag |
| `parli/ingest/words_parlinfo.py:352` | Removed bypass flag |
| `parli/ingest/words_parlinfo.py:389` | Removed bypass flag |
| `parli/ingest/words_parlinfo.py:443` | Removed bypass flag |
| `parli/ingest/words_parlinfo.py:723` | Removed bypass flag |
| `parli/ingest/words_parlinfo.py:724` | Uses the shared identity / guarded transport |
| `portal/public/analytics.js:1` | Retained: incoming identity / robots / reader classification |
| `portal/public/analytics.js:2` | Retained: incoming identity / robots / reader classification |
| `portal/public/chunks/chunk-OA6WGAJN.js:4084` | Retained descriptive context; no outbound identity assignment |
| `portal/public/chunks/voice-sdk-XRBS4UDV.js:3` | Retained descriptive context; no outbound identity assignment |
| `portal/public/chunks/voice-sdk-XRBS4UDV.js:37` | Retained descriptive context; no outbound identity assignment |
| `portal/public/chunks/voice-sdk-XRBS4UDV.js:143` | Retained descriptive context; no outbound identity assignment |
| `portal/public/grants-map.js:1` | Retained descriptive context; no outbound identity assignment |
| `portal/src/index.ts:2624` | Retained honest Worker API identity; runtime API outside ingestion/build scope |
| `portal/src/index.ts:5164` | Retained: incoming identity / robots / reader classification |
| `portal/src/index.ts:5662` | Retained: incoming identity / robots / reader classification |
| `portal/src/network-block.ts:12` | Retained: incoming identity / robots / reader classification |
| `portal/src/network-block.ts:22` | Retained: incoming identity / robots / reader classification |
| `portal/src/network-block.ts:25` | Retained: incoming identity / robots / reader classification |
| `portal/src/network-block.ts:28` | Retained: incoming identity / robots / reader classification |
| `portal/src/network-block.ts:101` | Retained: incoming identity / robots / reader classification |
| `portal/src/posthog.ts:19` | Retained: incoming identity / robots / reader classification |
| `portal/test/network-block.test.mjs:60` | Retained: incoming identity fixtures; no fetch |
| `portal/test/network-block.test.mjs:61` | Retained: incoming identity fixtures; no fetch |
| `portal/test/network-block.test.mjs:68` | Retained: incoming identity fixtures; no fetch |
| `portal/test/network-block.test.mjs:69` | Retained: incoming identity fixtures; no fetch |
| `portal/test/network-block.test.mjs:70` | Retained: incoming identity fixtures; no fetch |
| `portal/test/network-block.test.mjs:73` | Retained: incoming identity fixtures; no fetch |
| `portal/test/network-block.test.mjs:74` | Retained: incoming identity fixtures; no fetch |
| `portal/test/qao_loader_test.py:45` | Retained offline receipt/robots fixture; no source fetch |
| `portal/test/qao_loader_test.py:270` | Retained offline receipt/robots fixture; no source fetch |
| `portal/wrangler.jsonc:99` | Retained: incoming identity / robots / reader classification |
| `portal/wrangler.jsonc:102` | Retained: incoming identity / robots / reader classification |
| `scripts/arag_enrich.py:224` | Uses the shared identity / guarded transport |
| `scripts/arag_enrich.py:309` | Uses the shared identity / guarded transport |
| `scripts/arag_enrich.py:330` | Uses the shared identity / guarded transport |
| `scripts/ask_evidence_audit.py:25` | Uses the shared identity / guarded transport |
| `scripts/ask_harness.py:55` | Uses the shared identity / guarded transport |
| `scripts/ask_harness.py:74` | Uses the shared identity / guarded transport |
| `scripts/ask_regression.py:85` | Uses the shared identity / guarded transport |
| `scripts/backfill_photos_oa.py:51` | Uses the shared identity / guarded transport |
| `scripts/bills_registry/bills_common.py:34` | Uses the shared identity / guarded transport |
| `scripts/bills_registry/bills_common.py:79` | Removed service call; direct honest transport or paused source |
| `scripts/bills_registry/bills_common.py:109` | Uses the shared identity / guarded transport |
| `scripts/build_pay.py:75` | Uses the shared identity / guarded transport |
| `scripts/build_pay.py:76` | Uses the shared identity / guarded transport |
| `scripts/build_pay.py:90` | Uses the shared identity / guarded transport |
| `scripts/build_pay.py:134` | Uses the shared identity / guarded transport |
| `scripts/daily_refresh.sh:107` | Removed service call; direct honest transport or paused source |
| `scripts/fetch_commons_portraits.py:10` | Uses the shared identity / guarded transport |
| `scripts/fetch_senate_firecrawl.py:3` | Removed service call; direct honest transport or paused source |
| `scripts/generate_years.py:216` | Uses the shared identity / guarded transport |
| `scripts/grantconnect_details.py:48` | Uses the shared identity / guarded transport |
| `scripts/grantconnect_details.py:122` | Uses the shared identity / guarded transport |
| `scripts/insights.mjs:103` | Uses the shared identity / guarded transport |
| `scripts/insights.mjs:104` | Uses the shared identity / guarded transport |
| `scripts/insights.mjs:106` | Uses the shared identity / guarded transport |
| `scripts/insights.mjs:121` | Uses the shared identity / guarded transport |
| `scripts/propose_social_photos.mjs:36` | Uses the shared identity / guarded transport |
| `scripts/propose_social_photos.mjs:68` | Uses the shared identity / guarded transport |
| `scripts/publish_bill_texts.py:5` | Removed bypass flag |
| `scripts/publish_bill_texts.py:6` | Removed bypass flag |
| `scripts/publish_bill_texts.py:48` | Removed bypass flag |
| `scripts/publish_bill_texts.py:71` | Removed bypass flag |
| `scripts/publish_bill_texts.py:258` | Removed bypass flag |
| `scripts/recrop_commons_portraits.py:23` | Uses the shared identity / guarded transport |
| `scripts/refresh_releases.py:7` | Retained descriptive context; no outbound identity assignment |
| `scripts/stamp_assets.mjs:54` | Uses the shared identity / guarded transport |
| `scripts/stamp_assets.mjs:55` | Uses the shared identity / guarded transport |
| `scripts/stamp_assets.mjs:67` | Uses the shared identity / guarded transport |
| `scripts/stamp_assets.mjs:87` | Uses the shared identity / guarded transport |
| `scripts/systemd/opax-bill-text-crawl-20260913.service:9` | Removed bypass flag |
| `scripts/test_update_corpus_manifest.py:306` | Retained offline receipt/robots fixture; no source fetch |
| `scripts/update_corpus_manifest.py:385` | Removed service call; direct honest transport or paused source |
| `scripts/vm/probe_sources.py:7` | Uses the shared identity / guarded transport |
| `scripts/vm/probe_sources.py:44` | Uses the shared identity / guarded transport |
| `scripts/vm/probe_sources.py:45` | Uses the shared identity / guarded transport |
| `scripts/vm/probe_sources.py:46` | Uses the shared identity / guarded transport |
| `scripts/vm/probe_sources.py:51` | Uses the shared identity / guarded transport |
| `scripts/vm/probe_sources.py:52` | Uses the shared identity / guarded transport |
| `scripts/vm/probe_sources.py:106` | Uses the shared identity / guarded transport |
| `scripts/vm/probe_sources.py:133` | Uses the shared identity / guarded transport |
| `scripts/vm/probe_sources.py:188` | Uses the shared identity / guarded transport |
| `scripts/vm/probe_sources.py:191` | Uses the shared identity / guarded transport |
| `scripts/vm/probe_sources.py:214` | Uses the shared identity / guarded transport |
| `scripts/warm_cache.py:170` | Uses the shared identity / guarded transport |
| `scripts/wikidata_match.py:33` | Uses the shared identity / guarded transport |
| `tests/fixtures/interests/README.md:5` | Retained offline receipt/robots fixture; no source fetch |
| `tests/test_bill_texts.py:188` | Transport and preservation expectations updated |
| `tests/test_bill_texts.py:220` | Transport and preservation expectations updated |
| `tests/test_interests_fetch.py:42` | Transport and preservation expectations updated |
| `tests/test_interests_fetch.py:43` | Transport and preservation expectations updated |
| `tests/test_interests_fetch.py:131` | Transport and preservation expectations updated |
| `tests/test_interests_fetch.py:342` | Transport and preservation expectations updated |
| `tests/test_interests_fetch.py:364` | Transport and preservation expectations updated |
| `tests/test_interests_fetch.py:406` | Transport and preservation expectations updated |

## Final matches

321 unique file:line hits. These line numbers describe the final code
and documentation before generating this inventory. This inventory’s own
quoted scan expression and evidence references are excluded to avoid recursion.

| File:line | Meaning |
| --- | --- |
| `.github/workflows/refresh-watchdog.yml:51` | Shared honest identity declaration, header or transport |
| `docs/ANALYTICS.md:23` | Policy / historical evidence / shared-identity reference |
| `docs/DATA-ACT-HANSARD.md:12` | Policy / historical evidence / shared-identity reference |
| `docs/DATA-CONTRACTS.md:115` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/DATA-GRANTS.md:57` | Policy / historical evidence / shared-identity reference |
| `docs/DATA-GRANTS.md:59` | Policy / historical evidence / shared-identity reference |
| `docs/DATA-INFLUENCE.md:41` | Policy / historical evidence / shared-identity reference |
| `docs/DATA-INTERESTS.md:11` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/DATA-INTERESTS.md:12` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/DATA-INTERESTS.md:14` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/DATA-INTERESTS.md:23` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/DATA-INTERESTS.md:44` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/DATA-INTERESTS.md:49` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/DATA-INTERESTS.md:51` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/DATA-INTERESTS.md:85` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/DATA-INTERESTS.md:99` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/DATA-INTERESTS.md:111` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/DATA-INTERESTS.md:112` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/DATA-INTERESTS.md:144` | Policy / historical evidence / shared-identity reference |
| `docs/DATA-INTERESTS.md:150` | Policy / historical evidence / shared-identity reference |
| `docs/DATA-INTERESTS.md:176` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/DATA-INTERESTS.md:177` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/DATA-INTERESTS.md:182` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/DATA-MEMBERS.md:11` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/DATA-MEMBERS.md:15` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/DATA-MEMBERS.md:18` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/DATA-MEMBERS.md:49` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/DATA-WORDS.md:15` | Policy / historical evidence / shared-identity reference |
| `docs/HUBS.md:139` | Policy / historical evidence / shared-identity reference |
| `docs/HUBS.md:144` | Policy / historical evidence / shared-identity reference |
| `docs/IOS-API-CONTRACT.md:17` | Policy / historical evidence / shared-identity reference |
| `docs/IOS-API-CONTRACT.md:19` | Policy / historical evidence / shared-identity reference |
| `docs/IOS-API-CONTRACT.md:34` | Policy / historical evidence / shared-identity reference |
| `docs/IOS-API-CONTRACT.md:479` | Policy / historical evidence / shared-identity reference |
| `docs/IOS-API-CONTRACT.md:555` | Policy / historical evidence / shared-identity reference |
| `docs/IOS-APP.md:193` | Policy / historical evidence / shared-identity reference |
| `docs/IOS-UX.md:13` | Policy / historical evidence / shared-identity reference |
| `docs/IOS-VOICE.md:115` | Policy / historical evidence / shared-identity reference |
| `docs/PHOTOS.md:257` | Policy / historical evidence / shared-identity reference |
| `docs/PHOTOS.md:258` | Policy / historical evidence / shared-identity reference |
| `docs/PICTURES.md:127` | Policy / historical evidence / shared-identity reference |
| `docs/PICTURES.md:391` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/PICTURES.md:411` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/PICTURES.md:413` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/PICTURES.md:417` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/PICTURES.md:418` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/PICTURES.md:421` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/SCOPE-BILLS.md:546` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/SCOPE-BILLS.md:550` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/SCOPE-BILLS.md:552` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/SCOPE-BILLS.md:553` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/SCOPE-BILLS.md:581` | Policy / historical evidence / shared-identity reference |
| `docs/SCOPE-BILLS.md:590` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/SCOPE-BILLS.md:591` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/SCOPE-BILLS.md:592` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/SCOPE-BILLS.md:594` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/SCOPE-BILLS.md:596` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/SCOPE-BILLS.md:790` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/SCOPE-BILLS.md:795` | Policy / historical evidence / shared-identity reference |
| `docs/SCOPE-BILLS.md:799` | Policy / historical evidence / shared-identity reference |
| `docs/SCOPE-BILLS.md:852` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/SCOPE-BILLS.md:866` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/SCOPE-BILLS.md:867` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/SCOPE-BILLS.md:868` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/SOURCES-ACCESS.md:4` | Policy / historical evidence / shared-identity reference |
| `docs/SOURCES-ACCESS.md:31` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/SOURCES-ACCESS.md:34` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/SOURCES-ACCESS.md:35` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/SOURCES-ACCESS.md:36` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/SOURCES-ACCESS.md:65` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/VOTES.md:103` | Policy / historical evidence / shared-identity reference |
| `docs/operations/interests-refresh-2026-10-03.md:8` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/operations/interests-refresh-2026-10-03.md:32` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/operations/interests-refresh-2026-10-03.md:47` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/operations/interests-refresh-2026-10-03.md:50` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/operations/interests-refresh-2026-10-03.md:200` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/operations/interests-refresh-2026-10-03.md:219` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/operations/nightly-refresh.md:24` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/operations/nightly-refresh.md:170` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/operations/nightly-refresh.md:179` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/operations/nightly-refresh.md:180` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/operations/nightly-refresh.md:187` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/operations/periodic-refresh.md:95` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `docs/operations/periodic-refresh.md:154` | Policy / historical evidence / shared-identity reference |
| `download_hansard.py:31` | Shared honest identity declaration, header or transport |
| `download_hansard_fast.py:41` | Shared honest identity declaration, header or transport |
| `download_hansard_fast.py:402` | Shared honest identity declaration, header or transport |
| `parli/ingest/abs_profiles.py:48` | Shared honest identity declaration, header or transport |
| `parli/ingest/acnc_ato.py:75` | Shared honest identity declaration, header or transport |
| `parli/ingest/acnc_ato.py:640` | Shared honest identity declaration, header or transport |
| `parli/ingest/act_hansard.py:70` | Shared honest identity declaration, header or transport |
| `parli/ingest/act_hansard.py:108` | Shared honest identity declaration, header or transport |
| `parli/ingest/aec_results.py:36` | Shared honest identity declaration, header or transport |
| `parli/ingest/anao.py:34` | Shared honest identity declaration, header or transport |
| `parli/ingest/austender.py:31` | Shared honest identity declaration, header or transport |
| `parli/ingest/austender_full.py:37` | Shared honest identity declaration, header or transport |
| `parli/ingest/austender_full.py:79` | Shared honest identity declaration, header or transport |
| `parli/ingest/bill_texts.py:28` | Shared honest identity declaration, header or transport |
| `parli/ingest/bill_texts.py:145` | Shared honest identity declaration, header or transport |
| `parli/ingest/bills.py:37` | Shared honest identity declaration, header or transport |
| `parli/ingest/bills.py:90` | Shared honest identity declaration, header or transport |
| `parli/ingest/board_appointments.py:47` | Shared honest identity declaration, header or transport |
| `parli/ingest/cache_apis.py:40` | Shared honest identity declaration, header or transport |
| `parli/ingest/cache_apis.py:60` | Shared honest identity declaration, header or transport |
| `parli/ingest/committee_hearings.py:79` | Shared honest identity declaration, header or transport |
| `parli/ingest/committee_hearings.py:80` | Shared honest identity declaration, header or transport |
| `parli/ingest/committee_hearings.py:132` | Shared honest identity declaration, header or transport |
| `parli/ingest/committee_witnesses.py:70` | Shared honest identity declaration, header or transport |
| `parli/ingest/committee_witnesses.py:330` | Shared honest identity declaration, header or transport |
| `parli/ingest/conduct_interests_federal.py:48` | Shared honest identity declaration, header or transport |
| `parli/ingest/conduct_interests_federal.py:199` | Shared honest identity declaration, header or transport |
| `parli/ingest/conduct_interests_qld.py:10` | Shared honest identity declaration, header or transport |
| `parli/ingest/conduct_interests_qld.py:31` | Shared honest identity declaration, header or transport |
| `parli/ingest/divisions.py:30` | Shared honest identity declaration, header or transport |
| `parli/ingest/donations.py:47` | Shared honest identity declaration, header or transport |
| `parli/ingest/electorates.py:73` | Shared honest identity declaration, header or transport |
| `parli/ingest/ext_common.py:64` | Shared honest identity declaration, header or transport |
| `parli/ingest/ext_common.py:94` | Shared honest identity declaration, header or transport |
| `parli/ingest/federal_lobbyists.py:53` | Shared honest identity declaration, header or transport |
| `parli/ingest/fetch_division_votes.py:76` | Shared honest identity declaration, header or transport |
| `parli/ingest/fits_register.py:42` | Shared honest identity declaration, header or transport |
| `parli/ingest/fits_register.py:66` | Shared honest identity declaration, header or transport |
| `parli/ingest/fits_register.py:237` | Shared honest identity declaration, header or transport |
| `parli/ingest/frl_instruments.py:55` | Shared honest identity declaration, header or transport |
| `parli/ingest/frl_instruments.py:404` | Shared honest identity declaration, header or transport |
| `parli/ingest/grantconnect.py:74` | Shared honest identity declaration, header or transport |
| `parli/ingest/grantconnect.py:466` | Shared honest identity declaration, header or transport |
| `parli/ingest/grants.py:46` | Shared honest identity declaration, header or transport |
| `parli/ingest/guardian_news.py:30` | Shared honest identity declaration, header or transport |
| `parli/ingest/handbook.py:5` | Shared honest identity declaration, header or transport |
| `parli/ingest/handbook.py:29` | Shared honest identity declaration, header or transport |
| `parli/ingest/handbook.py:167` | Shared honest identity declaration, header or transport |
| `parli/ingest/http.py:25` | Shared honest identity declaration, header or transport |
| `parli/ingest/http.py:74` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `parli/ingest/http.py:114` | Shared honest identity declaration, header or transport |
| `parli/ingest/http.py:115` | Shared honest identity declaration, header or transport |
| `parli/ingest/http.py:123` | Shared honest identity declaration, header or transport |
| `parli/ingest/http.py:135` | Shared honest identity declaration, header or transport |
| `parli/ingest/http.py:141` | Shared honest identity declaration, header or transport |
| `parli/ingest/http.py:175` | Shared honest identity declaration, header or transport |
| `parli/ingest/http.py:177` | Shared honest identity declaration, header or transport |
| `parli/ingest/http.py:195` | Shared honest identity declaration, header or transport |
| `parli/ingest/http.py:196` | Shared honest identity declaration, header or transport |
| `parli/ingest/http.py:222` | Shared honest identity declaration, header or transport |
| `parli/ingest/http.py:250` | Shared honest identity declaration, header or transport |
| `parli/ingest/http.py:264` | Shared honest identity declaration, header or transport |
| `parli/ingest/interests_fetch.py:55` | Shared honest identity declaration, header or transport |
| `parli/ingest/interests_fetch.py:96` | Shared honest identity declaration, header or transport |
| `parli/ingest/load_votes.py:32` | Shared honest identity declaration, header or transport |
| `parli/ingest/load_votes.py:50` | Shared honest identity declaration, header or transport |
| `parli/ingest/members.py:33` | Shared honest identity declaration, header or transport |
| `parli/ingest/ministerial_diaries.py:53` | Shared honest identity declaration, header or transport |
| `parli/ingest/ministerial_diaries.py:78` | Shared honest identity declaration, header or transport |
| `parli/ingest/mp_interests.py:47` | Shared honest identity declaration, header or transport |
| `parli/ingest/nsw_hansard.py:37` | Shared honest identity declaration, header or transport |
| `parli/ingest/nsw_hansard.py:64` | Shared honest identity declaration, header or transport |
| `parli/ingest/photos.py:49` | Shared honest identity declaration, header or transport |
| `parli/ingest/qao_reports.py:34` | Shared honest identity declaration, header or transport |
| `parli/ingest/qao_reports.py:98` | Shared honest identity declaration, header or transport |
| `parli/ingest/qld_contracts.py:46` | Shared honest identity declaration, header or transport |
| `parli/ingest/qld_contracts.py:99` | Shared honest identity declaration, header or transport |
| `parli/ingest/qld_lobbyists.py:53` | Shared honest identity declaration, header or transport |
| `parli/ingest/qld_lobbyists.py:106` | Shared honest identity declaration, header or transport |
| `parli/ingest/qld_parliament.py:55` | Shared honest identity declaration, header or transport |
| `parli/ingest/qld_parliament.py:56` | Shared honest identity declaration, header or transport |
| `parli/ingest/qld_parliament.py:132` | Shared honest identity declaration, header or transport |
| `parli/ingest/qld_parliament.py:134` | Shared honest identity declaration, header or transport |
| `parli/ingest/sa_hansard.py:42` | Shared honest identity declaration, header or transport |
| `parli/ingest/sa_hansard.py:75` | Shared honest identity declaration, header or transport |
| `parli/ingest/state_donations.py:44` | Shared honest identity declaration, header or transport |
| `parli/ingest/state_rosters.py:49` | Shared honest identity declaration, header or transport |
| `parli/ingest/state_rosters.py:134` | Shared honest identity declaration, header or transport |
| `parli/ingest/tvfy_refresh.py:52` | Shared honest identity declaration, header or transport |
| `parli/ingest/tvfy_refresh.py:143` | Shared honest identity declaration, header or transport |
| `parli/ingest/vic_parliament.py:73` | Shared honest identity declaration, header or transport |
| `parli/ingest/votes_state.py:79` | Shared honest identity declaration, header or transport |
| `parli/ingest/votes_state.py:170` | Shared honest identity declaration, header or transport |
| `parli/ingest/words_common.py:35` | Shared honest identity declaration, header or transport |
| `parli/ingest/words_common.py:47` | Shared honest identity declaration, header or transport |
| `portal/public/analytics.js:1` | Incoming reader identity or robots metadata |
| `portal/public/analytics.js:2` | Incoming reader identity or robots metadata |
| `portal/public/chunks/chunk-OA6WGAJN.js:4084` | Shared honest identity declaration, header or transport |
| `portal/public/chunks/voice-sdk-XRBS4UDV.js:3` | Shared honest identity declaration, header or transport |
| `portal/public/chunks/voice-sdk-XRBS4UDV.js:37` | Shared honest identity declaration, header or transport |
| `portal/public/chunks/voice-sdk-XRBS4UDV.js:143` | Shared honest identity declaration, header or transport |
| `portal/public/grants-map.js:1` | Shared honest identity declaration, header or transport |
| `portal/src/index.ts:2624` | Honest Worker runtime API identity; outside ingestion/build scope |
| `portal/src/index.ts:5164` | Incoming reader identity or robots metadata |
| `portal/src/index.ts:5662` | Incoming reader identity or robots metadata |
| `portal/src/network-block.ts:12` | Incoming reader identity or robots metadata |
| `portal/src/network-block.ts:22` | Incoming reader identity or robots metadata |
| `portal/src/network-block.ts:25` | Incoming reader identity or robots metadata |
| `portal/src/network-block.ts:28` | Incoming reader identity or robots metadata |
| `portal/src/network-block.ts:101` | Incoming reader identity or robots metadata |
| `portal/src/posthog.ts:19` | Incoming reader identity or robots metadata |
| `portal/test/network-block.test.mjs:60` | Incoming identity fixture only |
| `portal/test/network-block.test.mjs:61` | Incoming identity fixture only |
| `portal/test/network-block.test.mjs:68` | Incoming identity fixture only |
| `portal/test/network-block.test.mjs:69` | Incoming identity fixture only |
| `portal/test/network-block.test.mjs:70` | Incoming identity fixture only |
| `portal/test/network-block.test.mjs:73` | Incoming identity fixture only |
| `portal/test/network-block.test.mjs:74` | Incoming identity fixture only |
| `portal/test/qao_loader_test.py:45` | Offline identity/preservation/robots check |
| `portal/test/qao_loader_test.py:270` | Offline identity/preservation/robots check |
| `portal/wrangler.jsonc:99` | Incoming reader identity or robots metadata |
| `portal/wrangler.jsonc:102` | Incoming reader identity or robots metadata |
| `scripts/arag_enrich.py:229` | Shared honest identity declaration, header or transport |
| `scripts/arag_enrich.py:314` | Shared honest identity declaration, header or transport |
| `scripts/arag_enrich.py:335` | Shared honest identity declaration, header or transport |
| `scripts/arag_smoke.sh:13` | Shared honest identity declaration, header or transport |
| `scripts/arag_smoke.sh:16` | Shared honest identity declaration, header or transport |
| `scripts/ask_evidence_audit.py:30` | Shared honest identity declaration, header or transport |
| `scripts/ask_harness.py:43` | Shared honest identity declaration, header or transport |
| `scripts/ask_harness.py:60` | Shared honest identity declaration, header or transport |
| `scripts/ask_harness.py:79` | Shared honest identity declaration, header or transport |
| `scripts/ask_regression.py:90` | Shared honest identity declaration, header or transport |
| `scripts/backfill_photos_oa.py:56` | Shared honest identity declaration, header or transport |
| `scripts/bills_registry/bills_common.py:39` | Shared honest identity declaration, header or transport |
| `scripts/bills_registry/bills_common.py:113` | Shared honest identity declaration, header or transport |
| `scripts/build_pay.py:80` | Shared honest identity declaration, header or transport |
| `scripts/build_pay.py:94` | Shared honest identity declaration, header or transport |
| `scripts/build_pay.py:138` | Shared honest identity declaration, header or transport |
| `scripts/fetch_commons_portraits.py:15` | Shared honest identity declaration, header or transport |
| `scripts/generate_years.py:221` | Shared honest identity declaration, header or transport |
| `scripts/grantconnect_details.py:53` | Shared honest identity declaration, header or transport |
| `scripts/grantconnect_details.py:127` | Shared honest identity declaration, header or transport |
| `scripts/insights.mjs:106` | Shared honest identity declaration, header or transport |
| `scripts/insights.mjs:107` | Shared honest identity declaration, header or transport |
| `scripts/insights.mjs:109` | Shared honest identity declaration, header or transport |
| `scripts/insights.mjs:124` | Shared honest identity declaration, header or transport |
| `scripts/lib/http.mjs:5` | Shared honest identity declaration, header or transport |
| `scripts/lib/http.mjs:6` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `scripts/lib/http.mjs:47` | Shared honest identity declaration, header or transport |
| `scripts/lib/http.sh:3` | Shared honest identity declaration, header or transport |
| `scripts/propose_social_photos.mjs:1` | Shared honest identity declaration, header or transport |
| `scripts/propose_social_photos.mjs:26` | Shared honest identity declaration, header or transport |
| `scripts/propose_social_photos.mjs:39` | Shared honest identity declaration, header or transport |
| `scripts/propose_social_photos.mjs:71` | Shared honest identity declaration, header or transport |
| `scripts/recrop_commons_portraits.py:28` | Shared honest identity declaration, header or transport |
| `scripts/refresh_releases.py:7` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `scripts/stamp_assets.mjs:2` | Shared honest identity declaration, header or transport |
| `scripts/stamp_assets.mjs:53` | Shared honest identity declaration, header or transport |
| `scripts/stamp_assets.mjs:65` | Shared honest identity declaration, header or transport |
| `scripts/stamp_assets.mjs:86` | Shared honest identity declaration, header or transport |
| `scripts/test_update_corpus_manifest.py:306` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `scripts/vm/bootstrap.sh:284` | Shared honest identity declaration, header or transport |
| `scripts/vm/bootstrap.sh:285` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:7` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:49` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:50` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:55` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:56` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:57` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:84` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:88` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:91` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:95` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:99` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:101` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:104` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:107` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:110` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:113` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:115` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:117` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:121` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:125` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:127` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:129` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:131` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:134` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:137` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:140` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:142` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:144` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:146` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:148` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:150` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:157` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:159` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:161` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:163` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:165` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:169` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:171` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:172` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:174` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:177` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:180` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:184` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:187` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:189` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:192` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:195` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:198` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:199` | Shared honest identity declaration, header or transport |
| `scripts/vm/probe_sources.py:218` | Shared honest identity declaration, header or transport |
| `scripts/vm/test_nightly.sh:57` | Offline identity/preservation/robots check |
| `scripts/warm_cache.py:58` | Shared honest identity declaration, header or transport |
| `scripts/warm_cache.py:175` | Shared honest identity declaration, header or transport |
| `scripts/wikidata_match.py:38` | Shared honest identity declaration, header or transport |
| `tests/fixtures/interests/README.md:5` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `tests/test_interests_fetch.py:128` | Offline identity/preservation/robots check |
| `tests/test_source_http.py:60` | Offline identity/preservation/robots check |
| `tests/test_source_http.py:61` | Offline identity/preservation/robots check |
| `tests/test_source_http.py:62` | Offline identity/preservation/robots check |
| `tests/test_source_http.py:71` | Offline identity/preservation/robots check |
| `tests/test_source_http.py:76` | Offline identity/preservation/robots check |
| `tests/test_source_http.py:78` | Offline identity/preservation/robots check |
| `tests/test_source_http.py:86` | Offline identity/preservation/robots check |
| `tests/test_source_http.py:87` | Offline identity/preservation/robots check |
| `tests/test_source_http.py:108` | Explicit deny rule / historical note / legacy filename / offline fixture; no service request |
| `tests/test_source_http.py:115` | Offline identity/preservation/robots check |
| `tests/test_source_http.py:116` | Offline identity/preservation/robots check |
| `tests/test_source_http.py:142` | Offline identity/preservation/robots check |
| `tests/test_source_http.py:149` | Offline identity/preservation/robots check |
| `tests/test_source_http.py:203` | Offline identity/preservation/robots check |
| `tests/test_source_http.py:235` | Offline identity/preservation/robots check |
| `tests/test_source_http.py:236` | Offline identity/preservation/robots check |
| `tests/test_source_http.py:239` | Offline identity/preservation/robots check |
| `tests/test_source_http.py:242` | Offline identity/preservation/robots check |

## Validation

The broad Python run passed 335 tests and 125 subtests. A subsequent focused
run passed 79 tests and 20 subtests, including prepared-request identity,
internal API identification, Node CLI refusal status and the whole-repository scan.
The final redirect-terminal regression check passed with an in-memory HTTP
fixture: bill acquisition does not follow a terminal redirect into a download path.
The final source/bill suite passed 41 tests; the multi-source releases suite passed
11 tests, including continuation and publication suppression after a source pause.

`scripts/vm/test_nightly.sh` passed **303 checks, 0 failures** (exit 0). Its
added cases cover paused status entries, nightly continuation, suppression of
staged applies and witness/KB dependencies, and retained bills while votes refresh.

No production refresh, production write, push or deploy was performed. The harness
uses disposable local repositories and stub providers. Only read-only public
honest-agent probes and read-only inspection of published/local snapshot metadata
were used to establish access and freshness evidence.

## Review correction inventory

Inventory after the review corrections (10 October 2026). Every tracked and
unignored file is screened, including extensionless scripts. This generated
inventory is excluded from its own search to avoid recursive matches. Locations
list tokens only, without source records or private names.

Disposition: the shared JSON identity is the sole outbound value; HTTP callers
read it through the Python, Node, shell or Worker imports. Firecrawl references
are historical documentation, denial rules, legacy direct-HTTP filenames or
fixtures; no executable service call remains. Browser identities in the incoming
classification fixture and bundled reader analytics describe readers. Browser
framework imports remain only in `portal/test/` and the four explicitly listed
OPAX UI harnesses; the contact-log and demo capture launch paths were removed.
Guard definitions and mutation fixtures never acquire a source.

362 unique file:line matches:

- `.github/workflows/refresh-watchdog.yml:46` — `user-agent`, `user_agent`
- `.github/workflows/refresh-watchdog.yml:54` — `User-Agent`, `user_agent`
- `docs/ANALYTICS.md:23` — `User-Agent`
- `docs/DATA-CONTRACTS.md:115` — `Firecrawl`
- `docs/DATA-GRANTS.md:59` — `user-agent`
- `docs/DATA-INFLUENCE.md:41` — `User-Agent`
- `docs/DATA-INTERESTS.md:11` — `Firecrawl`
- `docs/DATA-INTERESTS.md:12` — `firecrawl`
- `docs/DATA-INTERESTS.md:14` — `Firecrawl`
- `docs/DATA-INTERESTS.md:23` — `Firecrawl`
- `docs/DATA-INTERESTS.md:44` — `Firecrawl`
- `docs/DATA-INTERESTS.md:49` — `Firecrawl`
- `docs/DATA-INTERESTS.md:51` — `Firecrawl`
- `docs/DATA-INTERESTS.md:85` — `firecrawl`
- `docs/DATA-INTERESTS.md:99` — `Firecrawl`
- `docs/DATA-INTERESTS.md:111` — `Firecrawl`, `firecrawl`
- `docs/DATA-INTERESTS.md:112` — `firecrawl`
- `docs/DATA-INTERESTS.md:144` — `User-Agent`
- `docs/DATA-INTERESTS.md:150` — `User-Agent`
- `docs/DATA-INTERESTS.md:176` — `Firecrawl`, `firecrawl`
- `docs/DATA-INTERESTS.md:177` — `FIRECRAWL`, `firecrawl`
- `docs/DATA-INTERESTS.md:182` — `Firecrawl`
- `docs/DATA-MEMBERS.md:11` — `Firecrawl`
- `docs/DATA-MEMBERS.md:15` — `Firecrawl`
- `docs/DATA-MEMBERS.md:18` — `Firecrawl`
- `docs/DATA-MEMBERS.md:49` — `Firecrawl`
- `docs/DATA-WORDS.md:15` — `User-Agent`
- `docs/IOS-API-CONTRACT.md:17` — `User-Agent`
- `docs/IOS-API-CONTRACT.md:19` — `User-Agent`
- `docs/IOS-API-CONTRACT.md:34` — `User-Agent`
- `docs/IOS-API-CONTRACT.md:479` — `User-Agent`
- `docs/IOS-API-CONTRACT.md:555` — `User-Agent`
- `docs/IOS-APP.md:193` — `User-Agent`
- `docs/PHOTOS.md:257` — `User-Agent`
- `docs/PHOTOS.md:258` — `User-Agent`
- `docs/PICTURES.md:391` — `Firecrawl`
- `docs/PICTURES.md:411` — `Firecrawl`
- `docs/PICTURES.md:413` — `Firecrawl`
- `docs/PICTURES.md:417` — `firecrawl`
- `docs/PICTURES.md:418` — `firecrawl`
- `docs/PICTURES.md:421` — `Firecrawl`
- `docs/SCOPE-BILLS.md:546` — `Firecrawl`
- `docs/SCOPE-BILLS.md:550` — `Firecrawl`
- `docs/SCOPE-BILLS.md:552` — `Firecrawl`
- `docs/SCOPE-BILLS.md:553` — `Firecrawl`
- `docs/SCOPE-BILLS.md:581` — `User-Agent`
- `docs/SCOPE-BILLS.md:590` — `Firecrawl`
- `docs/SCOPE-BILLS.md:591` — `Firecrawl`
- `docs/SCOPE-BILLS.md:592` — `Firecrawl`
- `docs/SCOPE-BILLS.md:594` — `Firecrawl`
- `docs/SCOPE-BILLS.md:596` — `Firecrawl`, `firecrawl`
- `docs/SCOPE-BILLS.md:790` — `Firecrawl`
- `docs/SCOPE-BILLS.md:795` — `USER_AGENT`
- `docs/SCOPE-BILLS.md:799` — `User-Agent`
- `docs/SCOPE-BILLS.md:852` — `Firecrawl`
- `docs/SCOPE-BILLS.md:866` — `Firecrawl`
- `docs/SCOPE-BILLS.md:867` — `Firecrawl`
- `docs/SCOPE-BILLS.md:868` — `Firecrawl`
- `docs/SOURCES-ACCESS.md:4` — `user-agent`
- `docs/SOURCES-ACCESS.md:34` — `Firecrawl`
- `docs/SOURCES-ACCESS.md:37` — `firecrawl`
- `docs/SOURCES-ACCESS.md:38` — `firecrawl`
- `docs/SOURCES-ACCESS.md:39` — `firecrawl`
- `docs/SOURCES-ACCESS.md:82` — `Firecrawl`
- `docs/VOTES.md:103` — `User-Agent`
- `docs/VOTES.md:112` — `Playwright`
- `docs/VOTES.md:380` — `Playwright`
- `docs/operations/evidence-enrichment-layers.md:47` — `Playwright`
- `docs/operations/interests-refresh-2026-10-03.md:8` — `Firecrawl`
- `docs/operations/interests-refresh-2026-10-03.md:32` — `Firecrawl`
- `docs/operations/interests-refresh-2026-10-03.md:47` — `Firecrawl`
- `docs/operations/interests-refresh-2026-10-03.md:50` — `Firecrawl`
- `docs/operations/interests-refresh-2026-10-03.md:200` — `Firecrawl`
- `docs/operations/interests-refresh-2026-10-03.md:219` — `FIRECRAWL`
- `docs/operations/nightly-refresh.md:24` — `Firecrawl`
- `docs/operations/nightly-refresh.md:170` — `FIRECRAWL`
- `docs/operations/nightly-refresh.md:179` — `Firecrawl`
- `docs/operations/nightly-refresh.md:180` — `Firecrawl`
- `docs/operations/nightly-refresh.md:187` — `FIRECRAWL`
- `docs/operations/periodic-refresh.md:95` — `Firecrawl`
- `docs/operations/periodic-refresh.md:154` — `User-Agent`
- `docs/reports/2026-09-05-page-search-report.md:32` — `Playwright`
- `docs/reports/2026-10-09-search-toolbar.md:51` — `Playwright`
- `docs/reports/2026-10-09-search-toolbar.md:57` — `PLAYWRIGHT`
- `download_hansard.py:31` — `USER_AGENT`, `User-Agent`
- `download_hansard_fast.py:41` — `USER_AGENT`
- `download_hansard_fast.py:402` — `USER_AGENT`, `User-Agent`
- `enrich/src/kb.ts:1` — `user-agent`
- `enrich/src/kb.ts:88` — `user-agent`, `user_agent`
- `parli/ingest/abs_profiles.py:48` — `USER_AGENT`, `User-Agent`
- `parli/ingest/acnc_ato.py:75` — `USER_AGENT`
- `parli/ingest/acnc_ato.py:640` — `USER_AGENT`, `User-Agent`
- `parli/ingest/act_hansard.py:70` — `USER_AGENT`
- `parli/ingest/act_hansard.py:108` — `USER_AGENT`, `User-Agent`
- `parli/ingest/aec_results.py:36` — `USER_AGENT`, `User-Agent`
- `parli/ingest/anao.py:34` — `USER_AGENT`
- `parli/ingest/austender.py:31` — `USER_AGENT`, `User-Agent`
- `parli/ingest/austender_full.py:37` — `USER_AGENT`
- `parli/ingest/austender_full.py:79` — `USER_AGENT`, `User-Agent`
- `parli/ingest/bill_texts.py:28` — `USER_AGENT`
- `parli/ingest/bill_texts.py:145` — `USER_AGENT`, `User-Agent`
- `parli/ingest/bills.py:37` — `USER_AGENT`
- `parli/ingest/bills.py:90` — `USER_AGENT`, `User-Agent`
- `parli/ingest/board_appointments.py:47` — `USER_AGENT`, `User-Agent`
- `parli/ingest/cache_apis.py:40` — `USER_AGENT`
- `parli/ingest/cache_apis.py:60` — `USER_AGENT`, `User-Agent`
- `parli/ingest/committee_hearings.py:79` — `USER_AGENT`
- `parli/ingest/committee_hearings.py:80` — `USER_AGENT`
- `parli/ingest/committee_hearings.py:132` — `USER_AGENT`, `User-Agent`
- `parli/ingest/committee_witnesses.py:70` — `USER_AGENT`
- `parli/ingest/committee_witnesses.py:330` — `USER_AGENT`, `User-Agent`
- `parli/ingest/conduct_interests_federal.py:48` — `USER_AGENT`
- `parli/ingest/conduct_interests_federal.py:199` — `USER_AGENT`, `User-Agent`
- `parli/ingest/conduct_interests_qld.py:10` — `User-Agent`
- `parli/ingest/conduct_interests_qld.py:31` — `USER_AGENT`
- `parli/ingest/divisions.py:30` — `USER_AGENT`, `User-Agent`
- `parli/ingest/donations.py:47` — `USER_AGENT`, `User-Agent`
- `parli/ingest/electorates.py:73` — `USER_AGENT`, `User-Agent`
- `parli/ingest/ext_common.py:64` — `USER_AGENT`
- `parli/ingest/ext_common.py:94` — `USER_AGENT`, `User-Agent`
- `parli/ingest/federal_lobbyists.py:53` — `USER_AGENT`, `User-Agent`
- `parli/ingest/fetch_division_votes.py:76` — `USER_AGENT`, `User-Agent`
- `parli/ingest/fits_register.py:42` — `User-Agent`
- `parli/ingest/fits_register.py:66` — `USER_AGENT`
- `parli/ingest/fits_register.py:237` — `USER_AGENT`, `User-Agent`
- `parli/ingest/frl_instruments.py:55` — `USER_AGENT`
- `parli/ingest/frl_instruments.py:404` — `user-agent`
- `parli/ingest/grantconnect.py:74` — `USER_AGENT`
- `parli/ingest/grantconnect.py:466` — `User-Agent`
- `parli/ingest/grants.py:46` — `USER_AGENT`, `User-Agent`
- `parli/ingest/guardian_news.py:30` — `USER_AGENT`, `User-Agent`
- `parli/ingest/handbook.py:29` — `USER_AGENT`
- `parli/ingest/handbook.py:167` — `USER_AGENT`, `User-Agent`
- `parli/ingest/http.py:26` — `USER_AGENT`, `user-agent`, `user_agent`
- `parli/ingest/http.py:113` — `firecrawl`
- `parli/ingest/http.py:156` — `user-agent`
- `parli/ingest/http.py:157` — `USER_AGENT`, `User-Agent`
- `parli/ingest/http.py:165` — `USER_AGENT`, `User-Agent`
- `parli/ingest/http.py:178` — `USER_AGENT`, `User-Agent`
- `parli/ingest/http.py:184` — `USER_AGENT`, `User-Agent`
- `parli/ingest/http.py:220` — `user-agent`
- `parli/ingest/http.py:222` — `USER_AGENT`, `User-Agent`
- `parli/ingest/http.py:240` — `User-agent`
- `parli/ingest/http.py:241` — `USER_AGENT`, `User-Agent`
- `parli/ingest/http.py:268` — `USER_AGENT`, `User-Agent`
- `parli/ingest/http.py:296` — `USER_AGENT`, `User-Agent`
- `parli/ingest/http.py:311` — `USER_AGENT`, `User-Agent`
- `parli/ingest/interests_fetch.py:55` — `USER_AGENT`, `User-Agent`
- `parli/ingest/interests_fetch.py:96` — `USER_AGENT`, `User-Agent`
- `parli/ingest/load_votes.py:32` — `USER_AGENT`
- `parli/ingest/load_votes.py:50` — `USER_AGENT`, `User-Agent`
- `parli/ingest/members.py:33` — `USER_AGENT`, `User-Agent`
- `parli/ingest/ministerial_diaries.py:53` — `USER_AGENT`
- `parli/ingest/ministerial_diaries.py:78` — `USER_AGENT`, `User-Agent`
- `parli/ingest/mp_interests.py:47` — `USER_AGENT`, `User-Agent`
- `parli/ingest/nsw_hansard.py:37` — `USER_AGENT`
- `parli/ingest/nsw_hansard.py:64` — `USER_AGENT`, `User-Agent`
- `parli/ingest/photos.py:49` — `USER_AGENT`, `User-Agent`
- `parli/ingest/qao_reports.py:34` — `USER_AGENT`
- `parli/ingest/qao_reports.py:98` — `USER_AGENT`, `User-Agent`
- `parli/ingest/qld_contracts.py:46` — `USER_AGENT`
- `parli/ingest/qld_contracts.py:99` — `USER_AGENT`, `User-Agent`
- `parli/ingest/qld_lobbyists.py:46` — `USER_AGENT`
- `parli/ingest/qld_lobbyists.py:99` — `USER_AGENT`, `User-Agent`
- `parli/ingest/qld_parliament.py:55` — `USER_AGENT`
- `parli/ingest/qld_parliament.py:56` — `USER_AGENT`
- `parli/ingest/qld_parliament.py:132` — `user-agent`
- `parli/ingest/qld_parliament.py:134` — `USER_AGENT`, `User-Agent`
- `parli/ingest/sa_hansard.py:42` — `USER_AGENT`
- `parli/ingest/sa_hansard.py:75` — `USER_AGENT`, `User-Agent`
- `parli/ingest/state_donations.py:44` — `USER_AGENT`, `User-Agent`
- `parli/ingest/state_rosters.py:49` — `USER_AGENT`
- `parli/ingest/state_rosters.py:134` — `USER_AGENT`, `User-Agent`
- `parli/ingest/tvfy_refresh.py:52` — `USER_AGENT`
- `parli/ingest/tvfy_refresh.py:143` — `USER_AGENT`, `User-Agent`
- `parli/ingest/user-agent.json:2` — `user_agent`
- `parli/ingest/vic_parliament.py:73` — `USER_AGENT`, `User-Agent`
- `parli/ingest/votes_state.py:79` — `USER_AGENT`
- `parli/ingest/votes_state.py:170` — `USER_AGENT`, `User-Agent`
- `parli/ingest/words_common.py:35` — `USER_AGENT`
- `parli/ingest/words_common.py:47` — `USER_AGENT`, `User-Agent`
- `portal/public/analytics.js:1` — `userAgent`
- `portal/public/analytics.js:2` — `userAgent`, `user_agent`, `useragent`
- `portal/public/chunks/chunk-OA6WGAJN.js:4084` — `userAgent`
- `portal/public/chunks/voice-sdk-XRBS4UDV.js:3` — `userAgent`
- `portal/public/chunks/voice-sdk-XRBS4UDV.js:37` — `userAgent`
- `portal/public/chunks/voice-sdk-XRBS4UDV.js:143` — `userAgent`
- `portal/public/evidence/1e.json:1` — `playwright`
- `portal/public/evidence/2e.json:1` — `playwright`
- `portal/public/evidence/d4.json:1` — `playwright`
- `portal/public/evidence/d7.json:1` — `playwright`
- `portal/public/grants-map.js:1` — `userAgent`
- `portal/public/grants/federal/shard-33.json:1` — `Playwright`
- `portal/src/index.ts:1` — `user-agent`
- `portal/src/index.ts:223` — `user-agent`, `user_agent`
- `portal/src/index.ts:2626` — `user-agent`, `user_agent`
- `portal/src/index.ts:5166` — `User-agent`
- `portal/src/index.ts:5664` — `User-agent`
- `portal/src/network-block.ts:25` — `user-agent`
- `portal/src/network-block.ts:101` — `user-agent`
- `portal/src/posthog.ts:19` — `user-agent`
- `portal/test/community-deletion-browser.mjs:1` — `Playwright`
- `portal/test/community-deletion-browser.mjs:2` — `PLAYWRIGHT`
- `portal/test/community-deletion-browser.mjs:13` — `PLAYWRIGHT`, `playwright`
- `portal/test/network-block.test.mjs:60` — `user-agent`
- `portal/test/network-block.test.mjs:61` — `Mozilla/[version]`
- `portal/test/network-block.test.mjs:68` — `Chrome/[version]`, `Mozilla/[version]`
- `portal/test/network-block.test.mjs:69` — `AppleWebKit/[version]`, `Chrome/[version]`, `Edg/[version]`, `Mozilla/[version]`, `Safari/[version]`
- `portal/test/network-block.test.mjs:70` — `Chrome/[version]`, `Mozilla/[version]`
- `portal/test/network-block.test.mjs:74` — `AppleWebKit/[version]`, `Chrome/[version]`, `Mozilla/[version]`, `Safari/[version]`, `user-agent`
- `portal/test/qao_loader_test.py:45` — `User-agent`
- `portal/test/qao_loader_test.py:270` — `User-agent`
- `portal/test/source-access.test.mjs:8` — `USER_AGENT`
- `portal/test/source-access.test.mjs:47` — `USER_AGENT`, `user-agent`, `user_agent`
- `portal/test/source-access.test.mjs:50` — `user_agent`
- `portal/test/source-access.test.mjs:53` — `user-agent`
- `portal/test/source-access.test.mjs:54` — `User-Agent`, `user_agent`
- `portal/voice/README.md:55` — `PLAYWRIGHT`
- `portal/voice/README.md:56` — `Playwright`
- `portal/voice/check.mjs:8` — `PLAYWRIGHT`, `playwright`
- `scripts/arag_enrich.py:229` — `USER_AGENT`, `user-agent`
- `scripts/arag_enrich.py:314` — `USER_AGENT`, `user-agent`
- `scripts/arag_enrich.py:335` — `USER_AGENT`, `user-agent`
- `scripts/arag_smoke.sh:13` — `USER_AGENT`, `user-agent`
- `scripts/arag_smoke.sh:16` — `USER_AGENT`, `user-agent`
- `scripts/ask_evidence_audit.py:30` — `USER_AGENT`, `user-agent`
- `scripts/ask_harness.py:43` — `USER_AGENT`
- `scripts/ask_harness.py:60` — `USER_AGENT`, `user-agent`
- `scripts/ask_harness.py:79` — `USER_AGENT`, `user-agent`
- `scripts/ask_regression.py:90` — `USER_AGENT`, `user-agent`
- `scripts/backfill_photos_oa.py:56` — `User-Agent`
- `scripts/bills_registry/bills_common.py:39` — `USER_AGENT`
- `scripts/bills_registry/bills_common.py:113` — `USER_AGENT`, `User-Agent`
- `scripts/build_pay.py:80` — `USER_AGENT`
- `scripts/build_pay.py:94` — `USER_AGENT`, `User-Agent`
- `scripts/build_pay.py:138` — `USER_AGENT`, `User-Agent`
- `scripts/check_community_tools.mjs:3` — `PLAYWRIGHT`, `Playwright`
- `scripts/check_community_tools.mjs:7` — `PLAYWRIGHT`, `playwright`
- `scripts/check_search_summary.mjs:2` — `PLAYWRIGHT`, `playwright`
- `scripts/check_search_toolbar.mjs:7` — `PLAYWRIGHT`, `Playwright`
- `scripts/check_search_toolbar.mjs:8` — `PLAYWRIGHT`, `playwright`
- `scripts/check_search_toolbar.mjs:59` — `Playwright`
- `scripts/check_search_toolbar.mjs:62` — `Playwright`
- `scripts/fetch_commons_portraits.py:15` — `USER_AGENT`, `User-Agent`
- `scripts/generate_years.py:221` — `USER_AGENT`, `user-agent`
- `scripts/grantconnect_details.py:53` — `USER_AGENT`
- `scripts/grantconnect_details.py:127` — `USER_AGENT`, `User-Agent`
- `scripts/insights.mjs:106` — `userAgent`
- `scripts/insights.mjs:107` — `userAgent`
- `scripts/insights.mjs:109` — `userAgent`
- `scripts/lib/http.mjs:5` — `user-agent`
- `scripts/lib/http.mjs:6` — `USER_AGENT`, `user_agent`
- `scripts/lib/http.mjs:7` — `firecrawl`
- `scripts/lib/http.mjs:80` — `USER_AGENT`, `user-agent`
- `scripts/lib/http.sh:3` — `USER_AGENT`, `user-agent`, `user_agent`
- `scripts/propose_social_photos.mjs:1` — `USER_AGENT`
- `scripts/propose_social_photos.mjs:26` — `USER_AGENT`
- `scripts/propose_social_photos.mjs:39` — `user-agent`
- `scripts/propose_social_photos.mjs:71` — `user-agent`
- `scripts/recrop_commons_portraits.py:28` — `User-Agent`
- `scripts/refresh_releases.py:7` — `Firecrawl`
- `scripts/source_access_guard.py:15` — `playwright`, `puppeteer`
- `scripts/source_access_guard.py:16` — `Firecrawl`
- `scripts/source_access_guard.py:18` — `userAgent`
- `scripts/source_access_guard.py:19` — `user-agent`
- `scripts/source_access_guard.py:20` — `user-agent`
- `scripts/source_access_guard.py:34` — `user-agent`
- `scripts/source_access_guard.py:44` — `USER_AGENT`
- `scripts/source_access_guard.py:47` — `USER_AGENT`
- `scripts/stamp_assets.mjs:2` — `USER_AGENT`
- `scripts/stamp_assets.mjs:53` — `USER_AGENT`
- `scripts/stamp_assets.mjs:65` — `user-agent`
- `scripts/stamp_assets.mjs:88` — `user-agent`
- `scripts/test_update_corpus_manifest.py:306` — `Firecrawl`
- `scripts/vm/bootstrap.sh:284` — `USER_AGENT`, `user-agent`
- `scripts/vm/bootstrap.sh:285` — `USER_AGENT`, `user-agent`
- `scripts/vm/probe_sources.py:7` — `User-Agent`
- `scripts/vm/probe_sources.py:49` — `USER_AGENT`
- `scripts/vm/probe_sources.py:50` — `USER_AGENT`
- `scripts/vm/probe_sources.py:53` — `USER_AGENT`
- `scripts/vm/probe_sources.py:54` — `USER_AGENT`
- `scripts/vm/probe_sources.py:55` — `USER_AGENT`
- `scripts/vm/probe_sources.py:81` — `USER_AGENT`
- `scripts/vm/probe_sources.py:85` — `USER_AGENT`
- `scripts/vm/probe_sources.py:88` — `USER_AGENT`
- `scripts/vm/probe_sources.py:92` — `USER_AGENT`
- `scripts/vm/probe_sources.py:96` — `USER_AGENT`
- `scripts/vm/probe_sources.py:98` — `USER_AGENT`
- `scripts/vm/probe_sources.py:101` — `USER_AGENT`
- `scripts/vm/probe_sources.py:104` — `USER_AGENT`
- `scripts/vm/probe_sources.py:107` — `USER_AGENT`
- `scripts/vm/probe_sources.py:110` — `USER_AGENT`
- `scripts/vm/probe_sources.py:112` — `USER_AGENT`
- `scripts/vm/probe_sources.py:114` — `USER_AGENT`
- `scripts/vm/probe_sources.py:118` — `USER_AGENT`
- `scripts/vm/probe_sources.py:122` — `USER_AGENT`
- `scripts/vm/probe_sources.py:124` — `USER_AGENT`
- `scripts/vm/probe_sources.py:126` — `USER_AGENT`
- `scripts/vm/probe_sources.py:128` — `USER_AGENT`
- `scripts/vm/probe_sources.py:131` — `USER_AGENT`
- `scripts/vm/probe_sources.py:134` — `USER_AGENT`
- `scripts/vm/probe_sources.py:137` — `USER_AGENT`
- `scripts/vm/probe_sources.py:139` — `USER_AGENT`
- `scripts/vm/probe_sources.py:141` — `USER_AGENT`
- `scripts/vm/probe_sources.py:143` — `USER_AGENT`
- `scripts/vm/probe_sources.py:145` — `USER_AGENT`
- `scripts/vm/probe_sources.py:147` — `USER_AGENT`
- `scripts/vm/probe_sources.py:154` — `USER_AGENT`
- `scripts/vm/probe_sources.py:156` — `USER_AGENT`
- `scripts/vm/probe_sources.py:158` — `USER_AGENT`
- `scripts/vm/probe_sources.py:160` — `USER_AGENT`
- `scripts/vm/probe_sources.py:162` — `USER_AGENT`
- `scripts/vm/probe_sources.py:166` — `USER_AGENT`
- `scripts/vm/probe_sources.py:168` — `USER_AGENT`
- `scripts/vm/probe_sources.py:169` — `USER_AGENT`
- `scripts/vm/probe_sources.py:171` — `USER_AGENT`
- `scripts/vm/probe_sources.py:174` — `USER_AGENT`
- `scripts/vm/probe_sources.py:177` — `USER_AGENT`
- `scripts/vm/probe_sources.py:181` — `USER_AGENT`
- `scripts/vm/probe_sources.py:184` — `USER_AGENT`
- `scripts/vm/probe_sources.py:186` — `USER_AGENT`
- `scripts/vm/probe_sources.py:189` — `USER_AGENT`
- `scripts/vm/probe_sources.py:192` — `USER_AGENT`
- `scripts/vm/probe_sources.py:195` — `USER_AGENT`
- `scripts/vm/probe_sources.py:196` — `USER_AGENT`
- `scripts/vm/probe_sources.py:217` — `User-Agent`
- `scripts/vm/test_fixture_imports.py:58` — `user-agent`
- `scripts/vm/test_nightly.sh:57` — `user-agent`
- `scripts/warm_cache.py:58` — `USER_AGENT`
- `scripts/warm_cache.py:175` — `USER_AGENT`, `user-agent`
- `scripts/wikidata_match.py:38` — `USER_AGENT`, `User-Agent`
- `tests/fixtures/interests/README.md:5` — `Firecrawl`
- `tests/test_interests_fetch.py:128` — `USER_AGENT`, `User-Agent`
- `tests/test_source_guard.py:15` — `user-agent`
- `tests/test_source_guard.py:17` — `firecrawl`
- `tests/test_source_guard.py:18` — `Firecrawl`
- `tests/test_source_guard.py:22` — `Playwright`
- `tests/test_source_guard.py:24` — `Puppeteer`
- `tests/test_source_guard.py:27` — `user-agent`
- `tests/test_source_guard.py:30` — `user-agent`
- `tests/test_source_guard.py:35` — `user-agent`
- `tests/test_source_guard.py:57` — `user-agent`
- `tests/test_source_guard.py:58` — `USER_AGENT`
- `tests/test_source_http.py:60` — `User-Agent`
- `tests/test_source_http.py:61` — `user-agent`
- `tests/test_source_http.py:62` — `USER_AGENT`, `User-Agent`
- `tests/test_source_http.py:71` — `USER_AGENT`, `User-Agent`
- `tests/test_source_http.py:76` — `User-Agent`
- `tests/test_source_http.py:78` — `USER_AGENT`, `User-Agent`
- `tests/test_source_http.py:86` — `user-agent`
- `tests/test_source_http.py:87` — `USER_AGENT`, `User-Agent`
- `tests/test_source_http.py:108` — `firecrawl`
- `tests/test_source_http.py:115` — `user-agent`
- `tests/test_source_http.py:116` — `USER_AGENT`, `User-agent`
- `tests/test_source_http.py:143` — `User-agent`
- `tests/test_source_http.py:150` — `USER_AGENT`
- `tests/test_source_http.py:221` — `USER_AGENT`
- `tests/test_source_http.py:222` — `USER_AGENT`, `user-agent`, `user_agent`
- `tests/test_source_http.py:225` — `USER_AGENT`, `user-agent`
- `tests/test_source_http.py:228` — `user-agent`
- `tests/test_source_http.py:319` — `USER_AGENT`
- `tests/test_source_http.py:320` — `USER_AGENT`
