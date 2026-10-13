# OPAX Android 1.0: Play listing and Data safety

Android 1.0 ships at iOS 1.0 parity, with Talk and accounts, including account deletion (Jake, 11 October 2026). This page is the canonical text; the local kit under `mobile/private/play/1.0/` (gitignored) holds signed artifacts and evidence only. Nothing here has been entered in Play Console.

**Superseded:** the reading-plus-Ask alternative (`listing-android-current.json` in the 11 October local kit, "Alternative truthful draft for this Android reading/Ask binary") and the Data safety draft's "Binary mismatch blocking this draft" section. Both described a binary without Talk and accounts. Neither is to be used.

**Verified on candidate 2026101201 (integration lane, 12 October 2026):** it links the Android OpaxVoice module, declares `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS`, embeds `productionVoiceEnabled: true` with `voiceConsentDefault: false`, hides Community, and bundles the Talk, sign-in and deletion routes (`mobile/scripts/verify-android-build.py`, `verify-play.py --require-ios-parity`). The listing and the seven types below are true only of such a binary. Before submission, a physical-device smoke test of a production build still has to cover a real microphone call, audio focus, a phone-call interruption and sign-in with a real emailed code.

## Listing

| Field | Text | Count and limit |
| --- | --- | --- |
| Name | OPAX | 4 of 30 |
| Short description | Your MP, votes, bills and pay | 29 of 80 |
| Full description | Below | 3,318 of 4,000 |
| Support | https://opax.com.au/support | |
| Privacy policy | https://opax.com.au/privacy | |

The full description is the iOS 1.0 parity text (`release/store-1.0:release/1.0/listing.json`) without its "Tablets" paragraph. Side-by-side lists and records are iPad-only (`isPad` in `mobile/src/design/adaptive.tsx`), so Android must not claim them. Talk, the free account (16 and over), in-app deletion, the 10 minutes and the consent step are all claimed as on iOS.

```text
The Open Parliamentary Accountability Exchange (OPAX) is a reader for the public record of Australian politics. It brings together recorded votes, declared interests, pay entitlements, reported expenses, bills and electorates, with links to the records behind them. Reading needs no account.

Your MP
Search by electorate or member name to find your federal member and your senators, or let the app suggest your federal electorate from your location, which is used once on your device and not sent anywhere. Your choice is saved on your device.

Member profiles
A profile shows the member's recorded divisions and votes on bills, interests declared on parliamentary registers, federal pay entitlements for the posts they hold, expenses reported by the Independent Parliamentary Expenses Authority, and a link to their party's disclosed receipts. Each block says where its figures came from and how current they are.

Electorates
An electorate shows its outline, its representatives, past election results and Census context, with sources.

Bills
Browse federal bills by status, chamber and year, or search them. A bill shows its key dates, the divisions on it with party splits, the speeches made on it and the Act it became, where one is matched.

Today
Recently introduced bills, recent declarations of interests, the daily edition from opax.com.au, and ways into the money map, public money, leads and reports.

Search
Search people, places and bills, and declared interests, pay and expenses.

Ask
Type a question about the public record. Answers are written by an AI model from records OPAX retrieves, are labelled "Machine-written" and list their sources. Before your first question, OPAX asks your permission to send questions to its AI providers. Check the sources: an answer is not the record, and you can report a wrong one.

Talk to OPAX
Ask about the public record by voice and hear answers with links to the records they draw on. Talk needs a free OPAX account, for people aged 16 and over, which you can delete in the app. Each account includes 10 minutes of voice time in total. Before your first call, OPAX asks your permission to send your voice and the words of the conversation to ElevenLabs, its voice provider. Answers can be wrong: check the linked records.

Follow
Follow members, bills and electorates on your device, and Today shows what has changed in the record since you last looked.

Offline and sharing
Records you have opened recently stay readable offline, marked with when they were saved. Share a link to the matching page on opax.com.au.

Independent and non-partisan
OPAX is independent and non-partisan. It is not a government app and is not affiliated with any parliament, government or political party. Patterns in the public record are leads, not findings: check the linked sources.

Sources
The data comes from public sources, including the Parliament of Australia, They Vote For You, the Australian Electoral Commission, the Independent Parliamentary Expenses Authority and the Remuneration Tribunal. Each source keeps its own copyright and licence; the Sources and licences screen lists them.

The app has no advertising, in-app purchases or tracking.

Aboriginal and Torres Strait Islander readers are advised that this app contains names and images of people who have died.
```

## Data safety

Exactly the iOS 1.0 App Privacy label: seven types, all linked to the user, none used for tracking, all for app functionality only (`mobile/voice-production-policy.json`, `linkedDataTypes`; docs/IOS-STORE.md section 4). Play has no "linked to the user" field; the column keeps the iOS answer so the two declarations cannot drift.

| iOS type | Play category and type | Linked | Tracking | Purpose |
| --- | --- | --- | --- | --- |
| Email Address | Personal info: Email address | Yes | No | App functionality |
| User ID | Personal info: User IDs | Yes | No | App functionality |
| Audio Data | Audio: Voice or sound recordings | Yes | No | App functionality |
| Other User Content | App activity: Other user-generated content | Yes | No | App functionality |
| Product Interaction | App activity: App interactions | Yes | No | App functionality |
| Search History | App activity: In-app search history | Yes | No | App functionality |
| Other Diagnostic Data | App info and performance: Diagnostics | Yes | No | App functionality |

- **Not collected:** location (one foreground reading after "Use my location", matched to an electorate on the phone; never sent, saved or logged), contacts, photos, files, calendar, financial info, health, messages, device or advertising IDs, crash logs. Community is not in the 1.0 app.
- **Microphone:** a runtime permission, not an eighth type. It is declared only by the production voice build and asked for only when the reader starts Talk, after the voice consent and a rationale with the iOS purpose string ("OPAX uses your microphone only during a Talk call you start. Your audio is sent to ElevenLabs, OPAX’s voice provider, to understand and answer you."). Never at launch. Consent is off by default (`mobile/src/voice/README.md`, "Android microphone permission").
- **Credential:** the account session is kept on the device in the Android Keystore, origin-scoped, and excluded from backup and device transfer.
- **Encryption in transit:** yes. Cleartext traffic is disabled in every release build (`withAndroidPolicy.js`, verified by `verify-android-build.py`).
- **Deletion:** in the app (Account and about, Delete account, confirmed by an emailed code) and on opax.com.au. Deletion removes the account and its personal data from the live database at once; recovery history keeps it for up to 30 days.
- **No advertising, no tracking, no analytics or crash-reporting SDK.**
- **Answer from the evidence, not from this table:** whether each type counts as "shared" (the service-provider exemption depends on the provider contracts: Cloudflare, ElevenLabs, Progress Agentic RAG, OpenRouter), whether each is optional or required, and whether any is processed ephemerally. "No tracking" does not mean "no sharing".

Support: https://opax.com.au/support. Privacy: https://opax.com.au/privacy.
