# OPAX iOS: App Store submission readiness

Written 5 October 2026, defaults settled 6 October, and submission labels/privacy copy rechecked 7 October 2026 for a v1 **with Talk to OPAX (voice), sign-in and account deletion**. This document holds the listing copy, App Review notes, the age rating, export compliance and content rights answers, the App Privacy label, the screenshot plan and the gap list against the App Store Review Guidelines. It does not submit anything. App Store Connect metadata is managed by the sibling orchestrator session; submission is Jake’s call (section 7).

**Jake, 6 October 2026, 10:40:** "unblock all the work that's waiting for me. Any placeholder stuff can be filled in quickly later. Enable the voice and account deletion - do not block for trivial/license related stuff". Every open store item is therefore settled at its documented default and recorded as "decided 6 Oct (default)" in section 8.

**Citations.** Historical `path:line` references below document the 6 October review at `946ef7e3` and its lanes. Current label paths in sections 2.1 and 2.6 and the 7 October gate recheck supersede them for build 11. The lanes in this historical table have since merged into the `716e23d7` baseline; the website pages are on `main`:

| Lane | Commit | What it adds | In v1 |
| --- | --- | --- | --- |
| `ios/talk-sheet` | `6cb7c7d4` | The Talk screen: sign-in prompt, consent, call, captions, sources, "Type a message", "Report this answer" | Yes, at the submission gate |
| `ios/account-ui` | `078031c9` | Sign-in by emailed code, sign-out, deletion | Yes, at the submission gate |
| `ios/follows` | `fb09e12e` | Follows on the device and Today's "Following" block | If merged before the gate |
| `ios/leads-feed` | `028f3e87` | Leads and the declared-interests feed | If merged before the gate |
| `ios/party-page` | `1babc9f1` | Party pages | If merged before the gate |
| `ios/portraits` | `61416e0c` | The website's portrait files, with credits | If merged before the gate |
| `main` | `f7f3e30b` | The `/privacy` and `/support` pages, merged from `web/privacy-app` | Live on opax.com.au since 6 October 2026 (production Worker `c237a703`) |

The submission gate (section 6.2) rechecks every lane label quoted here against the build being submitted.

**What was checked.**

- `ios/app` at `946ef7e3`, with the production voice switch (`mobile/plugins/voiceProduction.js`, `mobile/voice-production-policy.json`), the release verifier (`mobile/scripts/verify-ios-release.py`), the welcome tour, the electorate map and every citation below. TestFlight Internal has builds 1 to 4; build 4 (0.1.0, build 4, from `bf47df10`) is the latest and ships neither voice nor account features.
- The lanes and the privacy branch in the table above, read on 6 October 2026.
- Apple's [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (guidelines 2.1(a), 4.7 and 5.1.1(v) reread on 6 October 2026; the rest read on 5 October, page marked "Last Updated: June 8, 2026"), [App privacy details](https://developer.apple.com/app-store/app-privacy-details/) and the App Store Connect [platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information), reread on 6 October 2026.
- The App Store Connect record, read with GET requests only on 5 October 2026 and not reread for this pass. The record is "OPAX", primary language English (Australia), version 1.0 in Prepare for Submission, with every listing, rating, rights, privacy and review field empty.

Related documents: [IOS-APP.md](IOS-APP.md) (decisions, sections 6 and 11), [IOS-VOICE.md](IOS-VOICE.md) (section 6), [IOS-UX.md](IOS-UX.md) (sections 6 and 8), [IOS-ELECTORATE-MAP.md](IOS-ELECTORATE-MAP.md), [IOS-RELEASE.md](IOS-RELEASE.md) (build and TestFlight tooling), [PHOTOS.md](PHOTOS.md).

**Status in one line.** Version 1.0.0/build 11 uses the redesigned app, including the native record reader. Source QA, the five standard-size journeys, reviewer walkthrough, AX5 notice captures and unsigned switch-on simulator build/launch pass on this lane. Sibling search/screenshot/metadata work, exact signed-artifact verification and four things only Jake can do remain relevant (section 7): ask App Review about guideline 4.7 before submitting, submit, check the ElevenLabs dashboard, and set up a private inbox.

**Scope of v1.** Today, Your MP (with "Use my location"), member profiles, electorates with their outline, Bills, Search, About and Sources and licences, the welcome tour, Talk to OPAX, and Account (sign-in by emailed code, sign-out, deletion). Voice and Account are merged; submission uses a release built with `OPAX_PRODUCTION_VOICE=1`, which links both voice pods, adds the microphone purpose string and declares the voice data types in one switch (`mobile/plugins/voiceProduction.js:3-12`, `mobile/app.config.ts:155-165`, `mobile/scripts/release-ios.sh:41-42`). The release switch now defaults to on. Follows, leads, party pages and portraits are in the build-10 baseline; their historical optional listing paragraphs below can be included.

## 1. Listing copy

Counts are in characters as App Store Connect counts them, checked with a script on 6 October 2026; keywords are in bytes, Apple's unit for that field. No field uses an em dash.

| Field | Final | Count and limit | Evidence and notes |
| --- | --- | --- | --- |
| Name | OPAX | 4 of 30 | The record's name. `mobile/app.config.ts:53` |
| Subtitle | Your MP, votes, bills and pay | 29 of 30 | Decided 6 Oct (default), as drafted. Your MP tab, voting record, Bills tab, pay block (`mobile/src/app/(tabs)/_layout.tsx:21-28`, `mobile/src/features/Person.tsx:273,482`) |
| Promotional text | Find your MP and senators and see their votes, declared interests, pay and expenses. Follow federal bills, or ask OPAX about the public record by voice. | 152 of 170 | Your MP (`mobile/src/features/YourMP.tsx:473`); profile blocks (`Person.tsx:273,370,482,578`); federal bill keys only (`mobile/src/api/policy.ts:25-26`); voice in section 1.1. Can change without a new build |
| Description | Section 1.1 | 3,170 of 4,000; 3,638 with all three included paragraphs | Each claim mapped to code in section 1.1 |
| Keywords | australia,parliament,senator,electorate,politician,legislation,interests,expenses,salary,civics | 95 of 100 bytes | No spaces; no word repeats the name or subtitle; no app, company or trademark names |
| Primary category | Reference | | Apple's Reference definition lists "general research" and "politics" ([categories](https://developer.apple.com/app-store/categories/)) |
| Secondary category | News | | Decided 6 Oct (default), as drafted. News covers "information about current events or developments in areas of interest such as politics" |
| Support URL | `https://opax.com.au/support` | | Live since 6 October 2026 (section 1.2) |
| Marketing URL | Empty | | Optional field. A later `/app` page is nice-to-have N4 |
| Privacy policy URL | `https://opax.com.au/privacy` | | Live since 6 October 2026, all sixteen placeholders filled (`docs/PRIVACY.md:9-30` on `main`) |
| Copyright | 2026 Jake Tracey | | Decided 6 Oct (default): the person the privacy page names as responsible (`docs/PRIVACY.md:16` on `main`) |
| Primary language | English (Australia) | | Already set |
| Price | Free | | No in-app purchases (`mobile/package.json` has no purchase package) |
| Availability | Australia only | | Decided 6 Oct (default). Avoids the EU Digital Services Act trader declaration (old risk R7) |
| Apple silicon Mac and Apple Vision Pro | Off | | Decided 6 Oct (default): not tested on either (risk R5) |
| Version | 1.0.0 | | Decided 6 Oct (default). The app and release tooling now use 1.0.0; the submission build is 11. App Store Connect metadata is managed separately by the orchestrator |

The full name, Open Parliamentary Accountability Exchange (42 characters), does not fit the subtitle, so it opens the description.

### 1.1 Description

```text
The Open Parliamentary Accountability Exchange (OPAX) is a reader for the public record of Australian politics. It brings together the recorded votes, declared interests, pay entitlements and reported expenses of members of parliament, with links to the records behind them. You can read it without an account.

Your MP
Search by electorate or member name to find your federal member and your senators, or let the app suggest your federal electorate from your location, which is used once on your iPhone and not sent anywhere. Where OPAX holds a verified roster of state members, you can add your state electorate too. Your choice is saved on this iPhone.

Member profiles
A profile shows the member’s recorded divisions, with ayes, noes and their votes on bills; interests declared on parliamentary registers; federal pay entitlements for the posts they hold; expenses reported by the Independent Parliamentary Expenses Authority; and a link to their party’s disclosed receipts. Blocks say where their figures came from and how current they are.

Electorates
An electorate shows its outline, its representatives, past election results and Census context, with sources.

Bills
Browse federal bills by status, chamber and year, or search them by title, sponsor or portfolio. A bill shows its key dates, the divisions on it with party splits, speeches made on it and the Act it became, where one is matched. Summaries written by a model from the explanatory memorandum are labelled as machine-written and are not the record.

Today
Recently introduced bills, recent declarations of interests and the latest daily edition published on opax.com.au.

Search
Search people, declared interests, pay and expenses. Suggestions for people, electorates and bills appear as you type.

Talk to OPAX
Ask about the public record by voice and hear answers with links to the records they draw on. Voice needs a free OPAX account, for people aged 16 and over, which you can delete in the app. Each account includes 10 minutes of voice time in total. Before your first call, OPAX asks your permission to send your voice and the words of the conversation to ElevenLabs, its third-party voice provider. Answers may be mistaken: check the linked records.

Offline and sharing
Records you have opened recently stay readable offline, marked with when they were saved. Share a link to the matching page on opax.com.au.

Independent and non-partisan
OPAX is independent and non-partisan. It is not a government app and is not affiliated with any parliament, government or political party. Patterns in the public record are leads, not findings: check the linked sources.

Sources
The data comes from public sources, including the Parliament of Australia, They Vote For You, the Australian Electoral Commission, the Independent Parliamentary Expenses Authority and the Remuneration Tribunal. Each source keeps its own copyright and licence, and the Sources and licences screen lists them.

Reading needs no account. The app has no advertising, in-app purchases or analytics.

Aboriginal and Torres Strait Islander readers are advised that this app contains names and images of people who have died.
```

**Included in the build-10 baseline.** Follows, leads and party pages are merged. Include these paragraphs after "Search" for build 11; recheck if a later integration changes scope (guideline 2.3.1(a)).

| Lane | Paragraph | Characters | Evidence |
| --- | --- | --- | --- |
| `ios/follows` | "Follow" / "Follow members, bills and electorates on this iPhone, and Today shows what has changed in the record since you last looked. Follows are not synced and send no notifications." | 180 | `mobile/src/features/follows/README.md:3-6` on `ios/follows` ("Nothing is synced: no server, account or device token, and no notification") |
| `ios/leads-feed` | "Leads" / "Where recorded government contract value or party receipts concentrate, and companies that appear in both. Each lead keeps its caveats; a lead is not a finding." | 166 | `mobile/src/features/Today.tsx:95-106` on `ios/leads-feed` |
| `ios/party-page` | "Parties" / "A party page lists its members, its disclosed receipts, its associated entities and the bills it divided on." | 116 | `mobile/src/features/Party.tsx:159,218,317,376` on `ios/party-page` |

The slash marks the line break between the heading and its text, as in the paragraphs above.

**Evidence for each claim.**

| Claim | Evidence |
| --- | --- |
| Read without an account | Public requests carry no credential (`mobile/src/api/client.ts:126`, `credentials: 'omit'`); account cookies go only to ten voice and account routes (`mobile/voice-production-policy.json:5-16`) |
| Search by electorate or member name; federal member and senators | `mobile/src/features/YourMP.tsx:216` (field "Electorate or member’s name"), `:473` ("Your senators") |
| Location suggestion, used once on the iPhone, not sent | "Use my location" (`mobile/src/features/electorate-map/LocationSuggestion.tsx:63`), its on-screen statement "It is not sent, saved or logged" (`:69-72`), the fix confined to one function (`mobile/src/features/electorate-map/location.ts:5-6,23-31`), `mobile/tests/location-privacy.test.ts`; [IOS-ELECTORATE-MAP.md](IOS-ELECTORATE-MAP.md) |
| State members only where a verified roster exists | `YourMP.tsx:495-545`; `mobile/src/api/selectors.ts:1078-1093` |
| Choice saved on the iPhone | `mobile/src/features/your-mp/choice-store.ts:3` (file `opax-seat-v1.json`); on-screen text `YourMP.tsx:226,559` |
| Recorded divisions, ayes, noes, bill votes | `Person.tsx:273-339` |
| Declared interests from parliamentary registers | `Person.tsx:370`; House, Senate and Queensland registers on About (`mobile/src/features/About.tsx:214-217`) |
| Federal pay entitlements | `Person.tsx:482-486` |
| Expenses reported by IPEA | `Person.tsx:578-581`; About `:238-243` |
| Link to the party's disclosed receipts | `Person.tsx:694-708` |
| Blocks name their source and date | `AsAtLine` and `EvidenceFooter`, for example `Person.tsx:201-204,229` |
| Electorate outline, representatives, elections, Census context, sources | `mobile/src/features/Electorate.tsx:157` ("Electorate outline"), `:165`, `:189`, `:252` ("Local context"), `:327`; outline label and limits `mobile/src/features/electorate-map/OutlineMap.tsx:60-66` |
| Bills: filters and searched fields | `mobile/src/features/bills/BillsList.tsx:77,92-99`; `mobile/src/api/selectors.ts:776-790`; `mobile/src/features/bills/BillFilters.tsx:33,54,75` |
| Bill: key dates, divisions with party splits, speeches, Act | `mobile/src/features/bills/BillDetail.tsx:455,509,620,686`; `mobile/src/features/bills/parts.tsx:260` |
| Machine summaries labelled, not the record | `BillDetail.tsx:408-417`; About `:287-293` |
| Today: new bills, recent declarations, daily edition | `mobile/src/features/Today.tsx:59-111`; edition route `policy.ts:22` |
| Search kinds and suggestions | `mobile/src/features/search/model.ts:5-28`; `mobile/src/features/Search.tsx:184` |
| Talk: answers with links to records | Sources travel as validated record paths (`mobile/src/voice/README.md:25-27`); the Sources list on `ios/talk-sheet` (`mobile/src/features/talk/TalkScreen.tsx:410-422` there) |
| Account for people aged 16 and over | The privacy page and `/support` (`docs/PRIVACY.md:28` on `main`); the sign-in screen and Talk sign-in prompt show the same line (section 6.2) |
| Deletion in the app | `deleteAccount` in the bridge (`mobile/src/voice/README.md:12-13`) on the deletion routes (`voice-production-policy.json:14-15`); the flow on `ios/account-ui` (`mobile/src/features/account/copy.ts:24,47-76` there) |
| 10 minutes in total | 600 seconds per account, not monthly (privacy page, "Your 10 minutes", on `main`); "Voice time: … remaining" on `ios/account-ui` (`copy.ts:13-14` there) |
| Consent before the first call; ElevenLabs named | The native consent store, denied by default (`voice-production-policy.json:3-4`; `mobile/src/voice/README.md:43-50`); the consent screen on `ios/talk-sheet` (`TalkScreen.tsx:306-344` there) |
| "AI voice by ElevenLabs. It can be wrong: check the sources." | The disclosure before every call on `ios/talk-sheet` (`TalkScreen.tsx:474-481` there) |
| Offline reading, marked with save time | Disk cache `mobile/src/api/disk-store.ts:15`; saved-time notices `mobile/src/features/your-mp/Evidence.tsx:43-50`, `mobile/src/design/states.tsx:19,190-202`; journey `mobile/.maestro/04-offline.yaml`. Search results are not saved (`mobile/src/api/cache.ts:134`) |
| Share a link to opax.com.au | `mobile/src/navigation/share.ts:17-38`; Share on profile, electorate and bill (`Person.tsx:135`, `Electorate.tsx:117`, `BillDetail.tsx:143`) |
| Independence statement; "leads, not findings" | `mobile/src/features/ComingSoon.tsx:6-7`, `About.tsx:93-95`, `Today.tsx:57`; `Today.tsx:112-114` |
| Sources named | Sources and licences (`mobile/src/features/sources/datasets.ts`); electorate sources carry their own licence (`selectors.ts:1094-1101`) |
| No advertising, in-app purchases or analytics | `mobile/package.json`; `mobile/scripts/verify-ios-release.py:29-36,660-661` |
| Notice about people who have died | Decision 15 (section 8). The web's About carries it on `main` (`portal/public/index.html:1166` there); About and welcome page 1 show the same text (section 6.2) |

### 1.2 Support and privacy pages

App Store Connect says the support URL "must lead to actual contact information (legal address, email address, telephone number), as may be required by local law, so that users can reach you regarding app issues, general feedback, and feature enhancement requests". Guideline 1.5 asks that the app and its support URL "include an easy way to contact you".

**Decided 6 Oct (default), decision 12:** `/support` and `/privacy` are live on opax.com.au since 6 October 2026 (production Worker `c237a703`, from `main` at `f7f3e30b`), with honest interim wording until a private inbox exists.

`/support` (`portal/public/index.html:1869-1924` on `main`) has:

- the independence statement;
- "Report a wrong record or a wrong answer": what to include, and a button that opens a public GitHub issue, pre-filled with the record when the app or site passes `?record=<path>` for a page OPAX publishes (`docs/PRIVACY.md:36` there);
- "OPAX does not yet have a private contact address. One is coming, and this page will name it.";
- signing in (link and, from the app, an eight-digit code; 15 minutes, single use), signing out, the 10 minutes of voice, "Accounts and voice are for people aged 16 and over", and how to delete the account;
- links to Privacy, Methods and the source code.

`/privacy` names Jake Tracey as responsible, gives retention for logs (7 days) and analytics (31 days), the ElevenLabs settings as last checked (9 September 2026), the deletion scope of decision 5 and the minimum age of 16 (`docs/PRIVACY.md:13-30` there).

**Review contact.** With no inbox, the public route for support, corrections and "Report this answer" is `/support`, and the review notes say so. The App Review contact fields in App Store Connect (name, email and phone in international format) take Jake's own details at submission; they are not recorded here.

**Marketing URL.** Empty. A later `/app` page would carry the description's opening, two or three store screenshots, the App Store link, the independence statement and links to support and privacy (N4).

## 2. App Review

### 2.1 Notes to paste

3,799 bytes of the 4,000-byte Notes limit, including internal newlines and excluding the code fence, counted on 7 October 2026 (201 bytes remaining). Labels were checked against the redesigned source and the passing fixture walkthrough in section 2.6. Local gates use no real email, paid calls or audio playback.

```text
OPAX is a free reader for Australian political public records. Reading needs no account; Talk to OPAX needs sign-in. No purchases, advertising, analytics or tracking.

Content: recorded divisions, registers of members' interests, federal pay, IPEA expenses, bills, electorates and elections. Records show update dates and link to originals; publisher terms and portrait credits are in Sources and licences. Native profiles are for parliamentarians on OPAX's verified roster. OPAX is independent and non-partisan, not a government app or affiliated with any parliament, government or party.

Machine-written text: stored bill summaries and briefs are labelled "Machine summary" (bill) or "Machine summary · not part of the record" (reader). Opening them does not generate a new answer. Opening a document, Cite or bill text can fetch records from our paid knowledge service; "Similar speeches" runs paid hybrid retrieval only when tapped. These are free to the reader, cached for the app session, and do not generate text. Talk uses paid ElevenLabs voice and record lookups. Sign-in and deletion send real emails. No purchase is required.

Reading (no account):
1. First launch shows a five-page welcome tour. "Skip" opens Today; finishing with "Choose your electorate" opens Your MP's chooser.
2. Your MP: enter Grayndler and tap the electorate, or "Use my location" (optional, used once on the iPhone, never sent). Tap the member for votes, interests, pay and expenses. "Electorate record" opens the outline, elections and local context.
3. Bills: open a bill for "In short", "Key dates", "Divisions" and "Speeches". A speech opens the native reader with "Cite" and "Similar speeches".
4. Search: "Search people, places and bills"; the Kind menu changes catalogs.
5. Person icon ("Account and about"), then "About OPAX" for coverage, corrections and privacy, or "Sources and licences" for publishers, licences, portrait credits and fonts.

Talk (waveform icon, "Talk to OPAX", top right on a tab's first screen):
1. Tap "Sign in", then "Sign in for voice". There is no demo account or password: use any email you can read. Accounts and voice are for people aged 16 and over.
2. Enter your email and tap "Send code". An 8-digit code comes from login.opax.com.au (check spam). Enter it; all 8 digits sign you in automatically, or tap "Sign in". This creates an account.
3. Open Talk again; tap "Start". First use shows "Before you talk": voice and conversation go to ElevenLabs. Tap "Agree and start", then allow the microphone. Consent is stored on this iPhone; More has "Withdraw voice consent".
4. Ask "Who represents Grayndler?". Tap "Captions" to show the words; tap the books button ("Sources") for linked records. More has "Type a message" and, after an answer, "Report this answer"; choose a record if offered. Tap "End call". Leaving OPAX ends the call.
Each account has 10 minutes of voice in total, within a shared monthly budget and two concurrent calls. Voice can be busy or closed for the rest of the month; reading still works.

Deletion: person icon, "Delete account". Read what is deleted and kept, request the emailed deletion code, enter it and tap "Delete account". "Account deleted" confirms completion; the iPhone is signed out.

Guideline 4.7: Talk is OPAX's own assistant over our public record, configured by OPAX on ElevenLabs. We read it as outside 4.7; please tell us if you disagree. It asks consent before first use, says "AI voice by ElevenLabs. It can be wrong: check the sources." before calls, and offers "Report this answer" in More after an answer.

Support/corrections: https://opax.com.au/support; privacy: https://opax.com.au/privacy. Reports go to public GitHub issues until a private inbox exists. For review, use the submission's App Review contact details.
```

**Evidence for the notes.** Current source: `mobile/src/onboarding/pages.ts`, `WelcomeTour.tsx`; `features/YourMP.tsx`, `Person.tsx`, `Electorate.tsx`, `bills/BillDetail.tsx`, `Search.tsx`; `features/account/{AccountScreen,SignInScreen,DeleteAccountScreen,DeleteAccountFlow}.tsx`, `features/account/copy.ts`; `features/talk/{TalkScreen,Consent,SourcesSheet}.tsx`, `menu.ts`, `reportAnswer.ts`; `features/sources/SourcesScreen.tsx`; `features/records/{DocumentReader.tsx,data.ts}`. Navigation: `navigation/chrome.ts`, `external.ts`. Journeys 01, 13, 20, 21 and 22 each pass once at standard size; the corrected reviewer walkthrough also passes with screenshots. Section 2.6 describes the private evidence, fixture boundary and paid requests.

### 2.2 App Review information fields

| Field | Entry | Why |
| --- | --- | --- |
| Sign-in required | Off | App Store Connect: required "If your app requires a login to use it". Only Talk needs an account; the notes give the test registration route, as the Notes field allows ("test registration or account details") |
| Contact name, email, phone | Jake's own details, entered at submission | Not recorded in this public repository |
| Notes | Section 2.1 | |
| Attachment | None | |

**No demo account (decided 6 Oct, default).** Sign-in sends a one-time code to the address entered (`voice-production-policy.json:11-12`), so a fixed demo account cannot work without a mailbox App Review can read. Review signs in with its own email. Guideline 2.1(a) says to "include demo account info ... if your app includes a login"; the risk that App Review insists is R10 (section 6.3).

### 2.3 Guideline 4.7 position (decision 11)

Decided 6 Oct (default): ship "Report this answer", and ask App Review about 4.7 **before** submission. Jake asks in an App Review appointment (Needs Jake 1, section 7). The notes (section 2.1, "Guideline 4.7") then state the position again for the reviewer. Apple says an appointment "is informational" and that App Review "cannot preapprove apps or specific features" ([App Review appointment](https://developer.apple.com/help/app-review/before-submitting-for-review/app-review-appointment)), so the answer guides the build but does not settle the review.

Guideline 4.7 covers software "not embedded in the binary", naming chatbots, and adds 4.7.1 ("a method for filtering objectionable material, a mechanism to report content and timely responses to concerns, and the ability to block abusive users") and 4.7.5 ("an age restriction mechanism based on verified or declared age"). OPAX's position, and what is already in place:

| 4.7 item | In place |
| --- | --- |
| Reporting | "Report this answer" in More after an answer, with a record submenu when needed (`mobile/src/features/talk/menu.ts`, `reportAnswer.ts`). On `ios/app`, `reportAnswer` opens a report in the in-app Safari view with a record path only, never answer text (`mobile/src/voice/report-answer.ts:11-48`); `supportPageAvailable` is true, so it opens `/support?record=<path>` or `/support` for an answer without a reportable record (`report-answer.ts`) |
| Timely responses | Reports land as public GitHub issues until a private inbox exists (Needs Jake 4) |
| Consent in each instance | Consent once, with the disclosure before every call (decision 10); a per-call consent would be needed if App Review applies 4.7.3 |
| Age restriction | Accounts and voice are for people 16 and over, stated, not checked (`docs/PRIVACY.md:28` on `main`). A declared-age step would be needed if App Review applies 4.7.5 |
| Filtering, blocking | The assistant answers from the public record through OPAX's search; there are no other users to block |
| Index with universal links (4.7.4) | Not in v1. If 4.7 applies, inbound universal links (W17) move into v1 (decision 11) |

### 2.4 Account deletion, guideline 5.1.1(v)

"If your app supports account creation, you must also offer account deletion within the app." Signing in creates an account, so deletion is in the app: Account sheet, "Delete account", a screen listing what is deleted and what is kept, a fresh emailed eight-digit deletion code, then "Account deleted" and signed out (`copy.ts:47-76` on `ios/account-ui`; journey `22-account.yaml` there). The bridge calls `requestDeletionCode` and `deleteAccount` (`mobile/src/voice/README.md:12-13`) on the two deletion routes (`voice-production-policy.json:14-15`); the voice core ends any live call before it deletes (`mobile/modules/opax-voice/ios/OpaxVoiceCore/Sources/OpaxVoiceCore/CallController.swift:387-395`).

What is kept follows decision 5, decided 6 Oct (default): other members keep their replies under a deleted discussion, which becomes a stub with no personal data, and their own messages; voice records lose their member link and keep their seconds, so deletion refunds no time; no legal retention beyond what is disclosed; a returning email gets a fresh 10 minutes, and no email hash is kept. The privacy page says the same ("Deleting your account", on `main`). Deletion has been live on the Worker since 3 October 2026 (`docs/COMMUNITY.md:55` on `main`).

### 2.5 Sources and licences, as the app states them

From the Sources and licences screen (`mobile/src/features/sources/SourcesScreen.tsx`, `datasets.ts`), reached from both Account and About. The app states each licence as a fact and grants none.

| Source | Used for | Licence as the app states it |
| --- | --- | --- |
| Parliament of Australia | Registers of interests, bills, the Hansard record behind divisions | Parliamentary copyright; Hansard under CC BY-NC-ND terms; House and Senate registers CC BY-NC-ND, shown as extracted facts with links |
| Queensland register of interests | Declared interests for Queensland members | No verified licence in the source review |
| They Vote For You | Compiled division data | Open Database Licence; the underlying Hansard keeps parliamentary copyright |
| AEC Transparency Register | Party receipts (linked on opax.com.au) | Creative Commons Attribution; versions vary by source |
| Independent Parliamentary Expenses Authority | Claimed expenses | CC BY 3.0 AU (data.gov.au) |
| Remuneration Tribunal | Pay entitlements | Entitlements set by instrument; each record's terms |
| Electorates release (outlines, elections, Census) | Electorate records and the outline map | Per source, with each record (`selectors.ts:1094-1101`; `OutlineMap.tsx:60-73`) |
| Wikimedia Commons portraits | Member portraits | Each file's own licence, with author and links. The app shows only CC BY and CC BY-SA files (any version), CC0 and public domain files, chosen by each file's recorded licence (`selectors.ts:205-214,253` on `ios/portraits-licence`). That leaves out the two GFDL and two "copyrighted free use" files, as decided (section 3.4). The credit reads `{author} · {licence}, via Wikimedia Commons, cropped` (`CachedPortrait.tsx:9-14` there) |
| Parliament of Australia official portraits | Member portraits | CC BY-NC-ND 4.0. Shown on `ios/app` since `ios/portraits` merged (`5fc8ac38`), with an "Official portrait" credit and licence link (`selectors.ts:239-251` on `ios/portraits-licence`). Never in store screenshots (section 5.2) |
| ElevenLabs | Runs the voice conversation | A processor, not a content source; named in the consent step and the privacy page |
| Merriweather, Public Sans | Fonts | SIL Open Font License 1.1; notices in the app (`About.tsx:318-348`) |
| OPAX code | The app | AGPL-3.0, with a link to the repository (`About.tsx:279-285`) |

### 2.6 Reviewer walkthrough, with evidence

**Device gates passed (7 October).** OPAX 17 Pro D (`6CDEBB87-7C56-4E06-872F-5A57397BB955`), standard text size, local port 8971 and synthetic account/voice fixtures. Journeys 01, 13, 20, 21 and 22 each passed once. The corrected reviewer walkthrough passed and retained 26 PNGs; a supplemental standard-size About capture shows the complete notice. AX5 captures show the full notice on About and welcome page 1 after scrolling. Evidence is gitignored under `mobile/private/qa/`: `submission-standard/` (journey reports and screenshots), `submission-walkthrough/screenshots/` (the `review-*.png` names below), `submission-about-standard/screenshots/review-12-about-full-notice.png`, and `submission-ax5-final/screenshots/` (`ax5-about-notice-fine-4.png`, `ax5-tour-notice-fine-2.png`). The evidence index is `submission-prep/index.md`.

The first private walkthrough incorrectly treated a tab switch as a reset of the Your MP navigation stack; use the native "Your MP" back button from a profile before "Electorate record". The corrected walkthrough passed. The first AX5 capture incorrectly required the whole tall paragraph frame to fit; corrected fine-scroll captures passed without changing font scaling. These were capture-script failures, not failed required journeys. The standard run's overall exit 1 includes that first private walkthrough; all five required journey reports have zero failures.

Each fixture run held the shared lock before boot, restored settings and shut down before releasing it. Fixture request audits allow only loopback; sampled app-connection audits pass with zero observed production/non-loopback connections (sampling can miss shorter connections). No production email, voice, generation or paid knowledge calls were made. E2E source links preview their destination locally; production uses Safari as described below. These are private QA images, not store marketing frames. The separate unsigned switch-on simulator build passes Info.plist, privacy, JS bundle and applicable native-marker checks; its public-reading Today launch also passes (`submission-prep/production-native-check.json`, `production-launch/report.xml`, `production-launch/screenshots/production-today.png`). The device-only microphone permission marker is compiled out on simulators; the signed device verifier remains unchanged. The exact signed archive/IPA, store capture set and iPad compatibility remain with the orchestrator.

| Feature | How to reach it | What the reviewer sees | Evidence |
| --- | --- | --- | --- |
| Welcome tour | First launch; Account → "Replay welcome tour" to repeat | Five pages: "Welcome to OPAX", "Your MP", "Profiles", "Bills and Today", "Search". Page 1 includes the deceased-person notice; samples say "Example". "Skip" opens Today; "Choose your electorate" opens the chooser | `review-01-welcome.png`, `review-01-welcome-notice.png`; journey 01; AX5 first-page notice |
| Today | First tab, after Skip | Front page, daily edition, "Following", "Recently introduced bills", "Just added to the record", "Leads", "Recent declarations" and independence copy | `review-02-today.png`; journeys 01, 13 |
| Your MP | Second tab; type Grayndler, choose the seat | "Find your MP", "Electorate or member’s name", "Use my location"; chosen member, "Your senators", verified state members, "Change seat", "Electorate record" | `review-03-chooser.png`, `review-04-your-mp.png` |
| Member profile | Tap the member | Portrait or blank circle, name, party, seat, "Voting record", "Declared interests", pay, expenses, party receipts and Share. Update lines and small "View original" links; credits are on Sources and licences | `review-05-profile.png`, `review-05a-votes.png`, `review-05b-interests.png`, `review-05c-pay.png`, `review-05d-expenses.png` |
| Electorate | From a profile, native "Your MP" back button, then "Electorate record"; switching tabs retains the open record | "Electorate outline", "Display outline", representation, elections and "Local context". Limits behind info buttons; licences on Sources and licences | `review-06-electorate.png`, `review-06a-elections.png`, `review-06b-context.png` |
| Bills | Third tab; choose a bill | Filters; "In short", "Machine summary", "Key dates", "Divisions", party splits, "Speeches", "What became law", "Read the bill text" | `review-07a-bills-list.png`, `review-07-bill.png`, `review-08-bill-speeches.png` |
| Native document reader | Tap a speech on a bill, or a document in Talk's Sources | Original document, "Machine summary · not part of the record", "Cite", linked bill/member where matched, "Similar speeches", selectable full text | `review-09-reader.png`, `review-10-cite.png`, `review-11-similar.png` |
| Search | Fourth tab; type a surname; use Kind menu | "Search people, places and bills", suggestions, "Kind: People"; changing Kind chooses another catalog | `review-17-search.png`, `review-18-search-results.png`; `search/KindPicker.tsx` |
| Talk signed out | Waveform icon (accessible name "Talk to OPAX") | Orb, "Sign in", "Accounts and voice are for people aged 16 and over." | `talk/TalkScreen.tsx`; journey 21 signed-out capture |
| Talk signed in | Sign in through Account, reopen Talk | "Start", allowance, "AI voice by ElevenLabs. It can be wrong: check the sources."; first-call "Before you talk", dated provider settings, "Agree and start", "Not now" | `talk/Consent.tsx`; journey 21 ready/consent captures |
| Talk conversation | Start a call; ask a question | Captions default off: tap "Captions". Books button (accessible name "Sources, N") opens the Sources sheet; tap a record. "Mute", "End call"; More (accessible name "More options") has "Type a message" and "Report this answer" after an answer, with record choice when needed; consent withdrawal also lives in More | `talk/menu.ts`, `SourcesSheet.tsx`; journey 21 captures |
| Account | Person icon ("Account and about") | "Sign in for voice", "Send code", "8-digit code", automatic sign-in when complete (or "Sign in"). Signed in: email, remaining voice time, "Sign out of this iPhone", "Delete account"; "About OPAX", "Sources and licences", "Replay welcome tour". Production has no Development section | `account/AccountScreen.tsx`, `copy.ts`; journey 22 captures |
| About and licences | Account → "About OPAX" → "Sources and licences", or Account directly | About: coverage, cultural notice, machine-text caveat, "Corrections and contact" → `/support`, "Privacy policy" → `/privacy`, retention and voice recipients. Sources: datasets, "Portraits", "Find a portrait credit", individual Commons credits including "cropped", fonts and code | Supplemental `review-12-about-full-notice.png`; `review-13-support.png`, `review-14-privacy.png`, `review-15-sources.png`, `review-16-cropped-credit.png`; AX5 About notice |
| External links | "View original" or OPAX page links | Checked third-party source pages open in-app Safari; OPAX pages open Safari outside the app ("Opens on opax.com.au"). Reports carry only a record path, or no path when no record is cited | `navigation/external.ts`, `voice/report-answer.ts`; journey 21 report-path capture |

**Actions that can cost OPAX money.** Free to the reviewer, with no purchase flow. These are deliberate actions, not background work. Cache misses may use paid infrastructure; a cached read can avoid the upstream call.

| Reviewer action | Request or provider | Cost boundary |
| --- | --- | --- |
| Open a speech/other document; open Cite directly before loading its document | `GET /api/resource/<slug>` → knowledge service resource read | Paid upstream service on a server cache miss; stored text/brief only, no answer generation. One request per successful path in the app session |
| Expand "Similar speeches" in a document | `GET /api/search?q=…&kind=speech&per=6[&topic=…]` → hybrid knowledge retrieval | Paid search on a server cache miss; no new brief/answer. Starts only when expanded; a successful path is reused within the session |
| "Just added to the record" | `GET /api/recent` → knowledge service | Paid upstream catalog read on a server cache miss; only after opening that screen |
| "Read the bill text", then choose/read a version | `/bill-texts/<key>/index.json`, `/bill-texts/<key>/<version>.json` | Paid knowledge-service catalog and stored-text reads on a server cache miss; a pre-exported static file is a fallback where available. No generated answer or hybrid search |
| Sign in, request another code, request deletion code | Account authentication/deletion routes → email provider | Transactional email delivery; local verification uses fixtures and sends nothing |
| "Agree and start" / "Start"; speak or "Type a message" | Voice start/relay → ElevenLabs and OPAX record lookups | Real paid voice/model/retrieval time; 600 seconds per account within the shared monthly and concurrency limits. Local verification is silent/synthetic |

Source: `mobile/src/features/records/data.ts`, `DocumentReader.tsx`, `README.md`; `portal/src/index.ts` (`apiResource`, `apiSearch`, `apiRecent`) and `portal/src/bill-text.ts` (`manifest`, `fullVersion`, `handleBillText`); `mobile/voice-production-policy.json`. Provider pricing is not asserted here.

## 3. Questionnaires

### 3.1 Age rating: 13+ (decided 6 Oct, default)

Field names are the App Store Connect API's; definitions from [Age ratings values and definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions). Guideline 2.3.6 asks for honest answers.

Counts come from the repository copies, which production refreshes nightly, run on 5 October 2026. Title counts match words in `portal/public/bills/index.json` (2,989 bills). Rendered-text counts pass each `portal/public/bills/au-federal-*.json` file through the app's own bill selector (`billFor`, `mobile/src/api/selectors.ts:898`), so they count what the bill screen shows: summaries, speech briefs, and each division's heading and note. The heading and note are They Vote For You's division text, debate excerpts included (`mobile/src/api/bill-transforms.ts:155-172`; `selectors.ts:951-963`; `mobile/src/features/bills/parts.tsx:376-424`).

| Question (API field) | Answer | Reason | Evidence |
| --- | --- | --- | --- |
| Parental controls (`parentalControls`) | No | None in the app | |
| Age assurance (`ageAssurance`) | No | No age checks. The minimum age of 16 for accounts and voice is stated, not checked (`docs/PRIVACY.md:28` on `main`) | |
| Unrestricted web access (`unrestrictedWebAccess`) | No | No browser or address bar. A source link opens one checked HTTPS page in an in-app Safari view; opax.com.au pages open in Safari outside the app. See risk R3 | `external.ts:238-264` (link checks), `:266-293`, `:317-329` |
| User-generated content (`userGeneratedContent`) | No | No community features in the app. What a reader says or types to Talk goes to the assistant and is shown to no one else | No community routes in `mobile/src/app`; the only account routes are sign-in, sign-out, status and deletion (`voice-production-policy.json:10-15`) |
| Social media (`socialMedia`, `socialMediaAgeRestricted`) | No | None | As above |
| Messaging and chat (`messagingAndChat`) | No | Readers cannot contact each other. Talk is a voice assistant answering from the public record | As above; voice routes `voice-production-policy.json:6-9` |
| Advertising (`advertising`) | No | None | `verify-ios-release.py:29-36` |
| Profanity or crude humour (`profanityOrCrudeHumor`) | Infrequent | Division notes quote debate. The rendered-text scan found one instance of crude language ("an act of political bastardry!", au-federal-r7493); other hits were names or ordinary words. Rare, but the notes change nightly | `portal/public/bills/au-federal-r7493.json:640`; `parts.tsx:376-424` |
| Horror or fear themes (`horrorOrFearThemes`) | None | | |
| Alcohol, tobacco or drug use or references (`alcoholTobaccoOrDrugUseOrReferences`) | Infrequent | The descriptor covers "references to or depictions of the consumption of alcohol, tobacco products, or other licit or illicit substances". 129 of the 2,989 bill files refer to smoking, vaping, drinking or drug use in what the bill screen shows (51 in summaries, 93 in speech briefs, 24 in division notes, 5 in headings; 127 without headings). One summary lists "adults who use e-cigarettes" (au-federal-s1071). 37 titles name these substances | `portal/public/bills/au-federal-s1071.json:58-67`; `BillDetail.tsx:419-436` |
| Medical or treatment information (`medicalOrTreatmentInformation`) | None | Health bills appear as legislation; no diagnosis or treatment guidance | |
| Health or wellness topics (`healthOrWellnessTopics`) | None | | |
| Mature or suggestive themes (`matureOrSuggestiveThemes`) | Infrequent | Apple's definition includes "real-world crimes ... or war or political strife". 149 bill titles use words such as crime, violence, abuse or terrorism | `portal/public/bills/index.json` |
| Sexual content or nudity (`sexualContentOrNudity`, `sexualContentGraphicAndNudity`) | None | | |
| Cartoon or fantasy violence (`violenceCartoonOrFantasy`) | None | | |
| Realistic violence (`violenceRealistic`, `violenceRealisticProlongedGraphicOrSadistic`) | None | Legislation about violence is not a depiction | |
| Guns or other weapons (`gunsOrOtherWeapons`) | Infrequent | Six bill titles name firearms or weapons | `portal/public/bills/index.json` |
| Gambling, simulated gambling (`gambling`, `gamblingSimulated`) | None | 29 titles name gambling legislation, which is not gambling | |
| Contests, loot boxes (`contests`, `lootBox`) | None | | |
| Made for Kids (`kidsAgeBand`) | Not applicable | | |
| Override (`ageRatingOverride`) | None | | |
| Age suitability URL (`developerAgeRatingInfoUrl`) | Empty | | |

**Result: 13+.** Apple's table puts infrequent alcohol, tobacco or drug references at 13+, the highest any answer reaches; Australia's regional values differ only for social media, loot boxes and simulated gambling. Voice changes no answer: the questionnaire has no AI or chatbot question, and the assistant answers from the same record. The minimum age of 16 for accounts and voice is OPAX's own rule, separate from the rating. If App Review applies guideline 4.7, 4.7.5 asks for an age restriction on the assistant (section 2.3).

### 3.2 Export compliance

**Answer: the app uses only encryption exempt from export documentation (HTTPS and TLS through iOS).** Unchanged by voice.

- **The key.** `ITSAppUsesNonExemptEncryption` is false (`mobile/app.config.ts:75`). With the key present, App Store Connect skips the encryption questions ([ITSAppUsesNonExemptEncryption](https://developer.apple.com/documentation/bundleresources/information-property-list/itsappusesnonexemptencryption)); HTTPS through the operating system is typically exempt ([Complying with encryption export regulations](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations)).
- **Enforcement.** The release verifier requires the key to be false and no ATS exception (`verify-ios-release.py:557-558`). The TestFlight script refuses a build that reports non-exempt encryption and sets `usesNonExemptEncryption: false` only when App Store Connect has no value (`mobile/scripts/asc-testflight.py:143-147`).
- **What is encrypted.** HTTPS to `https://opax.com.au`, the only production origin (`app.config.ts:25-30`), with no ATS exception in production (`app.config.ts:79-92` adds one only for e2e and loopback development). Voice uses `URLSessionWebSocketTask` over TLS (`mobile/modules/opax-voice/ios/OpaxVoiceCore/Sources/OpaxVoiceCore/Relay.swift:54`) and the Keychain (`Credentials.swift:48` there). `mobile/package.json` has no cryptography package.
- Apple notes that exempt use "might" still call for a year-end self-classification report to the U.S. government. That is a legal question, not answered here.

### 3.3 Content rights

App Store Connect asks whether the app "contain[s], show[s], or access[es] third-party content" and, if so, whether it has "all the necessary rights to that content".

- **First answer: Yes**: the sources in section 2.5.
- **Second answer: Yes. Decided 6 Oct (default)**, under decision 13 and Jake's instruction that licence items never block ("do not block for trivial/license related stuff"; and on 5 October, "Just use the website portraits for now - I will fix the licensing stuff later"). The open licensing questions are recorded, not hidden: the official portrait crops (risk R8) and the non-commercial, no-derivatives terms on Hansard and the House and Senate registers (section 3.4). Jake fixes them later.

### 3.4 Rights by source

Guideline 5.2: "Make sure your app only includes content that you created or that you have a license to use"; 2.3.9 applies the same to screenshots.

| Source | Decision | Where it stands |
| --- | --- | --- |
| Official parliamentary portraits (551 website files, CC BY-NC-ND 4.0) | Jake, 5 October: ship the website's files as they are, with an "Official portrait" credit and licence link; fix the licensing later. Decision 13: no APH portraits in store screenshots | Shown on `ios/app` with the credit since `ios/portraits` merged (`5fc8ac38`). The website's files are centre-square crops resized to 200x200 (`scripts/backfill_photos_oa.py:29`; PHOTOS.md:76-77); a crop is arguably an adaptation, which no-derivatives terms do not allow. Accepted as risk R8 |
| Commons, GFDL 1.2 (2 files) | Left out. Decided 6 Oct (default) | Melinda Pavey (`wd-Q6812492`) and Tim Bull (`wd-Q7803243`). Left out by licence on `ios/portraits-licence` (`selectors.ts:205-214,253`), whatever the name key; `tests/selectors.test.ts` checks that exactly these four files are left out and Gareth Evans's CC BY 1.0 file (`wd-Q381902`) is kept |
| Commons, "copyrighted free use" (2 files) | Left out. Decided 6 Oct (default) | Ian Hunter (`wd-Q1383644`) and Steve Minnikin (`wd-Q7613391`), whose website keys are initials or a surname. Left out by licence, as for GFDL |
| Commons, CC BY, CC BY-SA, CC0 and public domain (294 files) | Shown with author, licence and links, and "cropped" added to the credit. Decided 6 Oct (default) | The credit line is `{credit} · {licence}, via Wikimedia Commons, cropped` on Sources and licences (`CachedPortrait.tsx:9-14`, `Person.tsx:237`, `TodayDeclaration.tsx:84` on `ios/portraits-licence`); "cropped" marks OPAX's face-aware crop and resize (`scripts/recrop_commons_portraits.py:54-59`), which CC BY 4.0 section 3(a)(1)(B) asks to indicate. The website's credits still need the same change (section 6.2) |
| Hansard, House and Senate registers (CC BY-NC-ND); Queensland register (no verified licence) | Licence items never block. Decided 6 Oct (default) | The app is free, with no advertising or purchases, and shows the registers as extracted facts with links |
| Machine summaries and briefs | As above | May count as adaptations of explanatory memoranda and speeches; labelled as machine-written |
| OPAX code (AGPL-3.0) | `mobile/` under the repository licence (decision 13 default) | About links the repository (`About.tsx:279-285`) |
| Logos and insignia | None | `mobile/assets` holds only the icon, splash and fonts; the icon is a gold map of Australia on navy |

## 4. App Privacy label

Final answers, decided 6 Oct (default) under decision 14 ("answer conservatively"). The types are those of the privacy manifest the release builds with the voice switch on, which the release verifier enforces. All seven types, including Search History and Other Data (IP addresses), are now **linked** in the policy and manifest (rechecked 7 October 2026).

### 4.1 Answers to enter in App Store Connect

**Do you or your third-party partners collect data from this app?** Yes.

| Apple category and type | Collected | Linked to the user | Used for tracking | Purpose |
| --- | --- | --- | --- | --- |
| Contact Info: Email Address | Yes | Yes | No | App Functionality |
| Identifiers: User ID | Yes | Yes | No | App Functionality |
| User Content: Audio Data | Yes | Yes | No | App Functionality |
| User Content: Other User Content | Yes | Yes | No | App Functionality |
| Usage Data: Product Interaction | Yes | Yes | No | App Functionality |
| Search History | Yes | Yes | No | App Functionality |
| Other Data: Other Data Types (IP addresses) | Yes | Yes | No | App Functionality |

**Tracking: No.** No App Tracking Transparency prompt; `NSPrivacyTracking` is false and no tracking domains are declared (`verify-ios-release.py:98-99`).

**Not collected:** Location (used on the device only), Contacts, Health and Fitness, Financial Info, Purchases, Browsing History, Diagnostics (crash and performance data), Sensitive Info, Photos or Videos, Device ID and Advertising Data.

**Where it is enforced.** The types and their linkage come from one policy file (`mobile/voice-production-policy.json:17-24`), turned into manifest entries with tracking false and the App Functionality purpose (`mobile/plugins/voiceProduction.js:14-40`), merged into the app's manifest only when the switch is on (`mobile/app.config.ts:155-158`). The release verifier refuses a switch-on archive whose manifest differs in any type, linkage, tracking flag or purpose, and states "location not collected" (`verify-ios-release.py:97-116,570-573`).

**Manifest recheck, 7 October 2026.** The policy now has all seven types in `linkedDataTypes`, including Search History and Other Data, and an empty `unlinkedDataTypes`. The switch-on manifest follows those lists; `voice-production.test.ts`, `test-release-tooling.py` and the release verifier check linkage. The signed archive and IPA must still be verified against their exact artifact commit before upload.

### 4.2 Why each answer

Apple counts data as collected when it leaves the device and is kept "for a period longer than what is necessary to service the transmitted request in real time" ([App privacy details](https://developer.apple.com/app-store/app-privacy-details/)). App Functionality covers uses "such as to authenticate the user, enable features, prevent fraud, implement security measures, ensure server up-time".

| Type | What leaves the phone, and what is kept | Evidence |
| --- | --- | --- |
| Email Address | The address entered at sign-in, kept with the account until deletion | `POST /api/community/auth/request` (`voice-production-policy.json:11`); privacy page, "Community accounts", on `main` |
| User ID | The member ID behind the session and on each voice record. The session cookie lives in the Keychain, this device only, and goes only to the ten account and voice routes | `Credentials.swift:48`; `voice-production-policy.json:5-16`; `mobile/src/voice/README.md:52-55` |
| Audio Data | The voice during a call, through OPAX's relay to ElevenLabs. ElevenLabs was set not to record audio when last checked (9 September 2026); declared because a third-party AI processes it | `Relay.swift:54`; `docs/PRIVACY.md:24` on `main` (P10); the decision 8 check is Needs Jake 3 |
| Other User Content | The words of the conversation, spoken or typed with "Type a message", sent to ElevenLabs and the language model it runs; transcripts kept one day at ElevenLabs as last checked. The app does not store captions | `docs/PRIVACY.md:24-25,75` on `main`; `mobile/src/voice/README.md:71-72` |
| Product Interaction | For each call, the seconds reserved and charged and the start and end times, kept to count the 10 minutes and the shared monthly budget | Privacy page, "What is kept" and "Your 10 minutes", on `main`; IOS-APP.md section 6 |
| Search History (linked) | Catalog search words travel in the URL of `GET /api/search-all`; Workers Logs keep each URL for 7 days, and Cloudflare may keep the IP with it. Linked under decision 14: a catalog search carries no session (`client.ts:126,130-134`), but voice and account requests tie an IP to a member (next row), so a kept search can be tied to an account through its IP | `policy.ts:45-77`; `client.ts:126,130-134`; `portal/wrangler.jsonc:32-35`; `docs/PRIVACY.md:19-20` on `main` (P5, P6) |
| Other Data Types (IP addresses, linked) | IP addresses: read by rate limiters, possibly recorded in Workers Logs (kept 7 days) and kept up to 31 days in Cloudflare's traffic and security analytics, whose records hold the IP with the request's path and query. Apple has no IP type and says to "declare the relevant data types based on how you use IP address, such as precise location, coarse location, device ID, or diagnostics"; OPAX uses them for none of those, only rate limits and security, so they are declared as Other Data. **Linked**, because voice and account requests are tied to the member: they carry the session cookie, and the voice connection URL carries a `session_id` that the Worker stores against the member ID. A retained record of such a request can therefore tie its IP address to an account. Apple treats data as not linked only if it is de-identified before collection and never re-linked; OPAX has no such step, so decision 14's conservative answer is linked | `HTTPClient.swift:49,57-58`; `portal/src/voice.ts:42-45,264-266`; `docs/PRIVACY.md:19-20` on `main` (P5, P6); IOS-APP.md section 6 |
| Location (not collected) | One reading after "Use my location", turned into a seat suggestion on the iPhone; never sent, saved or logged. Outlines are fetched before the reading, so no request depends on it | `location.ts:5-6,13-31`; `LocationSuggestion.tsx:69-72`; `mobile/tests/location-privacy.test.ts`; `app.config.ts:76-77,99-107`; IOS-ELECTORATE-MAP.md |
| Seat, follows, consent, cache (not collected) | Kept on the device only: the seat file, the voice consent flag, the offline cache (at most 12 MB) and the follows file | `choice-store.ts:3-17`; `voice-production-policy.json:3-4`; `disk-store.ts:15`, `cache.ts:43`; `mobile/src/features/follows/README.md:8-12` on `ios/follows` |
| Analytics, crash reports, SDKs (none) | No analytics or crash-reporting SDK; the verifier rejects them | `verify-ios-release.py:29-36,660-661` |
| Share, opax.com.au pages, source records, reports (not collected by the app) | Share builds the URL on the phone; opax.com.au pages open in Safari; source records open in an in-app Safari view on the source's own site, which Apple exempts as "enabling the user to navigate the open web". "Report this answer" opens `/support` with a record path only, or no path; what the reader then submits goes to GitHub | `share.ts:17-38`; `external.ts:266-293,317-329`; `report-answer.ts:11-48`; risk R6 |

### 4.3 Submit only a switch-on build

With the switch off, the manifest declares no collected data, by design, so that switch-off builds keep build 4's configuration (`verify-ios-release.py:575-578`). The App Store label is per app, not per build, so the submitted build must be a switch-on build, or the manifest and the label disagree. The release records the switch in `production-voice-switch.txt` (`mobile/scripts/release-ios.sh:87`); the upload step refuses an explicit expected mode that differs from the recorded switch or verified release report.

### 4.4 Privacy policy link

- **App Store Connect:** `https://opax.com.au/privacy`; metadata is entered separately by the orchestrator.
- **In the app:** About's "Privacy policy" and Talk's "Voice privacy" point directly to `/privacy`. About's "Corrections and contact" points to `/support`.
- **In-app privacy text:** About states server logs 7 days, traffic/security analytics up to 31 days, voice recipients and records, provider settings checked 9 September 2026, one-day provider transcripts/reference housekeeping, and deleted-data recovery history up to 30 days. These retention settings are disclosed facts; the dashboard is not re-audited by this lane.

### 4.5 Purpose strings

| Key | Exact text | Evidence |
| --- | --- | --- |
| `NSMicrophoneUsageDescription` (switch on only) | "OPAX uses your microphone only during a Talk call you start. Your audio is sent to ElevenLabs, OPAX’s voice provider, to understand and answer you." | `mobile/voice-production-policy.json:2`; set by `app.config.ts:159-160`; required word for word by `verify-ios-release.py:84-85,559-565` |
| `NSLocationWhenInUseUsageDescription` | "OPAX uses your location once, on your iPhone, to suggest your electorate. It is not sent anywhere." | `app.config.ts:76-77,99-107`; `verify-ios-release.py:68,81-82` |

The `716e23d7` baseline used by this lane also has the unused-library `NSMotionUsageDescription`; the actual unsigned 1.0.0 (11) simulator app retains it. The sibling release-hygiene lane owns removing CoreMotion/Photos code and dropping the motion string when CoreMotion is absent; recheck the final integrated binary and Info.plist. OPAX never starts motion features, and the location plugin turns off Always permission. The verifier rejects unshipped purpose strings. The microphone is asked for only after consent (`mobile/src/voice/README.md:45-48`). [IOS-VOICE.md, section 6](IOS-VOICE.md#6-store-and-privacy-notes) and `docs/PRIVACY.md` on `main` hold older drafts of the microphone string; the policy file's text is the one that ships.

## 5. Screenshot plan

The sibling orchestrator owns the store screenshot set and App Store Connect metadata. This lane retains private reviewer/AX5 evidence (section 2.6); those synthetic QA captures are not the marketing set. Store frames use the current production navigation and the voice switch on (guideline 2.3).

### 5.1 Required sizes

From [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications), read on 5 October 2026:

- **6.9" display**, portrait, one of 1320 x 2868, 1290 x 2796 or 1260 x 2736 pixels. Capture at **1320 x 2868** on the iPhone 17 Pro Max simulator.
- **6.5" display** is required only if 6.9" screenshots are not provided; smaller sizes scale from the larger set.
- **No iPad set**: iPhone only (`supportsTablet: false`, `app.config.ts:69`).
- One to ten screenshots, JPEG or PNG, no alpha channel.

### 5.2 Capture rules

- **Build.** Production variant. Frames that need data the reader cannot easily reach (the Talk conversation, the Following block's changes) may come from an e2e build with a pinned snapshot, provided the frame shows nothing an e2e build alone draws: the Account sheet's "Development" section (`ComingSoon.tsx:63-72`; `AccountScreen.tsx` on `ios/account-ui`) never appears.
- **Device state.** Light appearance (`app.config.ts:58`), default text size, English (Australia), status bar at 9:41 with full signal and battery. No system permission alert in any frame.
- **No APH portraits (decision 13; decided 6 Oct, default).** No official parliamentary portrait appears in any frame, whatever the build shows. Choose members, seats and queries so that every portrait in view is a Wikimedia Commons file under CC BY, CC BY-SA, CC0 or public domain, or a blank circle; or scroll it out of view. Each Commons portrait in view gets a credit line outside the device image: "Photo: [author], [licence], via Wikimedia Commons, cropped". Federal members with a `wd-` key in `photos/people.json`, mostly first elected in 2025, have Commons portraits (PHOTOS.md:14).
- **Neutrality.** No frame reads as a verdict on a person, party or company. Frames 3 to 5 use two sitting members from different parties, neither a party leader nor a minister; across the set, senator lists and party splits include Labor, the Coalition and the crossbench, in that order where grouped (IOS-UX.md section 6). Single-party screens (party pages, single leads) are not used as frames.
- **Audience and rights.** No member who has died. No coat of arms, crest or party logo. Guideline 2.3.8 asks for 4+ suitable screenshots, so no bill about crime, firearms or gambling appears.
- **Captions** above the device image in Public Sans, plain sentence case, claiming nothing the frame does not show (2.3.3 allows text overlays).

### 5.3 Frames

| # | Screen | Data state | Caption (words) | Journey |
| --- | --- | --- | --- | --- |
| 1 | Welcome tour, page 1 | "Welcome to OPAX": what OPAX brings together and the independence line; Skip visible | The public record of Australian politics (6) | `mobile/.maestro/28-welcome.yaml` |
| 2 | Your MP, seat chosen | A federal seat with its member and that state's senators from several parties; Commons portraits or blank circles only; "Change seat" visible. "Use my location" is on the chooser reached with Change seat | Find your MP and senators (5) | `07-your-mp.yaml` |
| 3 | Member profile, top | Member A (Commons portrait or blank circle): name, party, seat, as-at line, voting record | A member’s recorded votes (4) | `08-profile.yaml` |
| 4 | Member profile, declared interests | Member A: interests and Declared ties with source footer | Declared interests from the registers (5) | `08-profile.yaml`, scrolled to `person-interests` |
| 5 | Member profile, pay and expenses | Member B, another party, portrait out of view: pay for the posts held, claimed expenses by year, as-at lines | Pay and expenses, as reported (5) | `08-profile.yaml` with member B |
| 6 | Electorate | The outline map with "Display outline" label, latest verified representation, an election with candidates | Electorates, outlines and results (4) | `09-electorate.yaml`, `24-electorate-map.yaml` |
| 7 | Bill detail, divisions | A passed bill on an uncontroversial subject, a division and party splits expanded, machine summary label in view | Divisions and party splits (4) | `11-bill-detail.yaml`, with a bill chosen under the audience rule (its current fixture is a gambling bill) |
| 8 | Talk | Captions enabled for a question and its answer. Capture the Sources sheet or More → "Report this answer" separately; the resting disclosure, source list and report menu do not appear together during a call. The answer is a real one, checked against the record it cites, for example who represents a seat | Ask by voice, with sources (5) | `21-talk.yaml` on `ios/talk-sheet`, with the fixture's answer replaced by the checked one |
| 9 | Today, Following (if `ios/follows` is in the build) | The Following block with a changed member, bill and electorate, and the Leads section's intro below it if `ios/leads-feed` is in the build; the daily edition scrolled out of view | Follow what changes (3) | `26-follows.yaml` on `ios/follows` (changed-data fixture mode) |
| 10 | Search results (optional) | People kind, a common surname with results from several parties; Commons portraits or blank circles only | Search people, interests, pay (4) | `12-search.yaml` |

If a later build omits follows, frame 9 becomes the Bills list (latest activity first, one filter chip applied; "Follow federal bills", 3 words; `10-bills.yaml`). Party pages and individual leads are left out under the neutrality rule; the party splits in frame 7 show parties side by side instead. The daily edition is left out because it changes every day and some editions compare parties.

## 6. Gap list

Ranked as before: **blocker** (submission should not go ahead), **risk** (could draw a rejection or a later problem), **nice-to-have**.

### 6.1 Resolved

| ID | Was | Resolution |
| --- | --- | --- |
| B1 | No contact or support page (1.5; decision 12) | `/support`, live since 6 October 2026, with interim wording and public GitHub issues until an inbox exists. Decided 6 Oct (default). The About link: section 6.2. The inbox: Needs Jake 4 |
| B2 | No privacy policy at the URL (5.1.1(i)) | `/privacy`, live since 6 October 2026, all sixteen placeholders filled (`docs/PRIVACY.md:9-30` on `main`). The app link: section 6.2 |
| B3 | Production placeholders for Talk and Account (2.1(a)) | Voice, sign-in and deletion ship (Jake, 6 October). The production build shows the real Talk and Account screens; About's pending sentences are replaced. Both are submission gate items |
| B4 | App Privacy answers pending P5 and P6 | Final label in section 4: the switch-on manifest's types, with every type linked. Decided 6 Oct (default) |
| B5 | Content rights and Commons compliance | Content rights Yes; GFDL and "free use" files left out; "cropped" added to the Commons credit. Decided 6 Oct (default) (section 3.4) |
| B6 | App Store Connect metadata empty | Every field is final in sections 1 to 4; entering it is part of submission (Needs Jake 2) |
| B7 | Version 0.1.0 against App Store version 1.0 | 1.0.0. Decided 6 Oct (default). The app and tooling are updated; the App Store version is set at submission |
| B8 | Official portrait licensing | Licence items never block (Jake, 5 and 6 October). Moved to risk R8; no APH portraits in screenshots |
| R7 | EU trader declaration | Australia only. Decided 6 Oct (default) |
| N1 | Notice about people who have died (decision 15) | In the description (section 1.1). Decided 6 Oct (default). In the app's About: section 6.2 |
| N2 | Privacy manifest matches the label | The verifier enforces the switch-on manifest; it matches the label once phase 2 makes Search History and Other Data linked (section 4.1, gate item 2) |
| V1 | Demo account for voice | No demo account; review signs in with its own email (section 2.2). Decided 6 Oct (default). Residual: risk R10 |
| V2 | Guideline 4.7 | Decision 11 at its default: "Report this answer" ships, and Jake asks App Review before submission (section 2.3, Needs Jake 1). Residual: risk R9 |
| V3 | Microphone purpose string stripped and refused | The switch adds the approved string and the verifier requires it (section 4.5) |
| V4 | Consent and privacy copy rested on P10 to P13 | Filled with dated wording on the live privacy page; the ElevenLabs dashboard check (decision 8) is Needs Jake 3 and changes only the date |
| V5 | Deletion policy (decision 5) and Worker routes | Decided 6 Oct (default); sign-in and deletion live on the Worker since 3 October 2026 |
| V6 | Review traffic spends real voice time | Decision 9 at its default: shared budget. The notes tell App Review the budget applies. Residual: risk R11 |
| V7 | Screenshots and B3 | Section 5 plans for the switch-on build, with a Talk frame |

### 6.2 The submission gate (1.0.0, build 11)

Engineering checklist carried forward from the first voice build. Rechecked on 7 October 2026 against `ios/submission-prep`, based on `ios/app` at `716e23d7` (the build-10 native reader, Today front page, Talk orb and Sources and licences screen). Submission version: 1.0.0, build 11. Items 9 and 11 and App Store Connect metadata belong to the sibling orchestrator session; this lane does not submit or upload.

1. **Talk and Account merged — already fine.** Production with the switch on resolves the real entries through `mobile/metro.config.js`; switch-off placeholders remain intentional. Account hides Development in production. Passing production-entry tests and the actual switch-on JS bundle check reverify this; journeys 01, 20, 21 and 22 exercise the real screens with fixtures.
2. **Switch on, with the label's linkage — already fine; artifact gate retained.** All seven privacy types are linked in `mobile/voice-production-policy.json`; release defaults to `OPAX_PRODUCTION_VOICE=1`. Upload requires an explicit expected mode and refuses a mismatch in recorded/verified mode. Source/policy tests and the actual unsigned Release simulator app pass: Info.plist/privacy, production JS, both voice pods, stored-consent/route markers, no native fixtures and public-reading Today launch. Evidence: `submission-prep/production-native-check.json`, `production-launch/report.xml`, `production-complete.log`. The device-only microphone marker is intentionally absent on simulators. The orchestrator must run both unchanged signed archive/IPA verifiers on the exact final release commit before upload.
3. **"Report this answer" wired — already fine.** `talk/menu.ts` passes the selected canonical source path from `reportChoices`, or `null` without a reportable source, to `voice/report-answer.ts`. It never passes captions. `supportPageAvailable` is true; `/support` and `/privacy` return the named live pages (public GETs, 7 October). Passing journey 21 checks `/support?record=/money/receipts` (`submission-standard/screenshots/21-report-support-path.png`); passing offline tests also cover the no-record path.
4. **About updated — fixed.** "Corrections and contact" → `/support`; "Privacy policy" → `/privacy`, verified by walkthrough destination previews. About now gives logs 7 days, traffic/security analytics up to 31 days, voice recipients/records, dated provider retention, one-day reference housekeeping and 30-day recovery history. The exact deceased-person notice appears in About and welcome page 1, including the welcome accessibility label. The standard captures and both complete AX5 notice images passed visual review (section 2.6).
5. **Minimum age in the app — fixed.** Sign-in already had "Accounts and voice are for people aged 16 and over."; the orb redesign omitted it from Talk's signed-out prompt. Talk now uses the same `accountCopy.ageLimit`; passing source tests and journeys 21 and 22 cover both locations (`submission-standard/screenshots/21-signed-out.png`, `22-email.png`).
6. **Consent wording dated — already fine.** `talk/Consent.tsx` says the provider was set to keep no audio/delete transcripts after a day, checked 9 September 2026, matching the published privacy page. Passing journey 21 shows this dated wording (`submission-standard/screenshots/21-consent.png`). This lane does not claim a fresh dashboard check.
7. **Version 1.0.0 — done.** App config, embedded app version, package identity, release path/tooling and version assumptions use 1.0.0. Both locally built apps have actual Info.plist identity 1.0.0 (11); `asc-testflight.py --next-build` now counts across all OPAX iOS marketing versions. Passing release-tooling tests prove prior build 10 yields 11 across the version change. Internal voice pod versions remain independent.
8. **Portraits — already fine in the native app.** `commonsLicenceShown` excludes both GFDL and "copyrighted free use" families; passing selector tests check the four excluded files and retained CC BY 1.0. Sources and licences uses `portraitCreditLine`, including "cropped", and its searchable list comes from the same verified portrait index as display. The passing walkthrough shows Sheena Watt's Gabagool2005 / CC0 Commons credit with "cropped" (`review-16-cropped-credit.png`). Website credit changes belong to the web owner; this lane makes no deployment. No APH portraits in store frames: sibling screenshot gate, section 5.2 (private QA evidence is not a store frame).
9. **Person search filtered to the verified roster — sibling session.** R1 belongs to the orchestrator; this lane does not alter the search boundary or mark it passed.
10. **Labels rechecked — done.** Sections 2.1, 2.6, 5.3 and other quoted current app labels match the redesigned navigation, including the profile's native back route to the electorate. The reviewer walkthrough passes with 26 screenshots, plus the standard About recapture and two complete AX5 notices. Notes are 3,799 UTF-8 bytes (201 remaining). Section 2.6 documents paid resource/Cite, similar-speech, recent-record, bill-text, email and voice actions; bill-text catalog/version reads can use the paid knowledge service, with static exports as a fallback. Fixture launch flows now use empty permission maps to avoid unnecessary default hardware permission grants. Recheck after any later UI integration.
11. **Store screenshots and iPad compatibility — sibling session.** Store capture/metadata work belongs to the orchestrator. The retained reviewer screenshots in this lane are fixture evidence, not the App Store screenshot set; item 11 is not claimed passed here.

### 6.3 Risks still open

| ID | Guideline | Risk | Evidence | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | 5.1.1(viii) | The largest review risk. Native profiles exist only for roster parliamentarians, but person search returns rows from the compiled catalog, 1,557 in the current manifest; 414 are surname-only and 63 appear only in Senate committee Hansard. The app shows the rows it gets back (non-roster names open on opax.com.au). Electorate pages list candidates with their votes, as published | `mobile/src/features/search/navigation.ts:9-14,32`; `portal/src/catalog-search.ts:45-50`; `scripts/build_search_catalog.mjs:45-46`; `portal/public/search-catalog/manifest.json` | The review notes explain the scope. Gate item 9 |
| R2 | 4.2 | Low to medium. Some blocks hand off to the website, each labelled "Opens on opax.com.au" | `mobile/src/design/record.tsx:120-136`; `external.ts:317-329` | The notes list native features; voice, the outline map and offline reading add native depth |
| R3 | 2.3.6 | "Unrestricted web access" answered No. A reviewer could read the in-app Safari view as web access, which would make the rating 16+; "Report this answer" opens the live support page with a record path or no record | `external.ts:266-293`; `report-answer.ts:30-47` | Keep No. If App Review disagrees, open source links in Safari |
| R4 | 1.1.1, 1.1.6 | Low. Facts with sources and dates, labelled machine text, "leads, not findings". Some daily editions compare parties, in balanced order | `Today.tsx:112-114`; `mobile/src/features/EditionCard.tsx:30-35` | Keep caveats visible; corrections through `/support` |
| R5 | 2.4.1 | iPhone only; App Review can run it on iPad in compatibility mode | `app.config.ts:69` | Gate item 11; Mac and Vision Pro availability off |
| R6 | 5.1.1 | The source-link checker accepts opax.com.au, so a catalog source link on the site itself would load the website's analytics in the in-app Safari view; whether any row carries one is unverified | `external.ts:238-264` | Route opax.com.au hosts through `openOnWeb` |
| R8 | 5.2, 5.2.1 | Official portraits are CC BY-NC-ND 4.0 and the website's files are crops; the app also clips portraits to a circle. Applies to the website too. Accepted by Jake ("I will fix the licensing stuff later") | Section 3.4; `scripts/backfill_photos_oa.py:29` | No APH portraits in screenshots. Later fix: resized-only files from uncropped originals, or the Parliament's permission |
| R9 | 4.7 | If App Review treats Talk as 4.7 software: filtering, timely responses, per-instance consent, a universal-link index (W17) and a verified or declared age gate | Section 2.3 | Ask before submission (Needs Jake 1); the notes repeat the position; the work is listed in section 2.3 |
| R10 | 2.1(a) | App Review may insist on a demo account. Codes go by email, and OPAX has no mailbox a reviewer could open | Section 2.2 | Review uses its own email. If rejected: a mailbox App Review can read (follows from Needs Jake 4) or a review-only route, which is a Worker change |
| R11 | 2.1 | Review spends real voice time: 600 seconds per account inside the shared 40,000-second monthly budget and two concurrent calls; a busy month could show "Voice is closed for the rest of this month." to the reviewer | IOS-APP.md section 5; `model.ts:64-65` on `ios/talk-sheet` | Submit early in a month; the notes explain the message |
| R12 | 1.5 | The support page has no email, address or phone, only public GitHub issues, until an inbox exists | Section 1.2 | Needs Jake 4; decision 12's interim wording is honest about it |

### 6.4 Nice-to-have

| ID | Item | Fix |
| --- | --- | --- |
| N3 | Accessibility Nutrition Labels | Fill after the AX5 release gate, from its evidence |
| N4 | Marketing page | `/app` page as in section 1.2 |
| N5 | Promotional text | Changes without a new build; use it for coverage news |

## 7. Needs Jake

Only these four need Jake. Everything else is decided (section 8) or is engineering in the submission gate (section 6.2).

1. **Before submitting: ask App Review about guideline 4.7 (decision 11).** Request an App Review appointment on Apple's [Meet with Apple](https://developer.apple.com/events/view/upcoming-events?search=%22App%20Review%22) schedule (Tuesdays and Thursdays, over Webex; the request asks for the app's Apple ID from App Store Connect and the questions). Draft questions:

   > OPAX is a free iPhone reader for the public record of Australian politics: votes, declared interests, pay, expenses and bills. Version 1.0.0 adds Talk to OPAX, an optional voice assistant for signed-in users. It answers questions about the public record through OPAX's own search and links the records it used. The conversation runs on an ElevenLabs voice agent that OPAX configures; OPAX's server runs the record lookups and keeps call time. Users agree once before their first call to sending their voice and words to ElevenLabs, see "AI voice by ElevenLabs. It can be wrong: check the sources." before every call, and can use "Report this answer" on each answer. Accounts and voice are for people aged 16 and over.
   >
   > 1. Does App Review treat a first-party assistant like this as software under guideline 4.7?
   > 2. If it does, is consent once, with that disclosure before every call, enough for 4.7.3, or do you expect consent before each call?
   > 3. If it does, is a stated minimum age of 16 enough for 4.7.5, or do you expect a declared-age step before voice?
   > 4. If it does, what would satisfy 4.7.4's index and universal link for a single assistant?

   If the answer is that 4.7 applies, the work in section 2.3 goes into the build before submission. If it does not, the notes stand as written.
2. **Submit.** After the submission gate passes: in App Store Connect, set the version to 1.0.0, enter sections 1 to 4 and the screenshots, choose the verified 1.0.0 build 11 (or a later monotonically numbered build), fill the App Review contact with his own details, and submit.
3. **ElevenLabs dashboard check (decision 8).** Confirm recording off, one-day transcript deletion and the agent's model, then make the first real call and sign-in on his iPhone with the submitted switch-on build. If anything differs, the privacy page, the consent wording and section 4.2 change; if it matches, only the "last checked" date changes.
4. **A private inbox (P3).** A monitored address for support, corrections and privacy requests. When it exists, `/support`, `/privacy`, About and the review notes name it, and risks R10 and R12 shrink.

## 8. Decisions recorded

| Item | Decision | Status |
| --- | --- | --- |
| Voice, sign-in and account deletion in v1 | Ship in production (Jake, 6 October, "Enable the voice and account deletion") | Decided 6 Oct |
| Version | 1.0.0 | Decided 6 Oct (default) |
| Availability | Australia only | Decided 6 Oct (default) |
| Mac and Vision Pro availability | Off | Decided 6 Oct (default) |
| Age rating | 13+ | Decided 6 Oct (default) |
| Minimum age for accounts and voice | 16, stated on the privacy page and `/support`, not checked | Decided 6 Oct (default) |
| Commons GFDL and "copyrighted free use" portraits | The two GFDL and two "free use" files left out | Decided 6 Oct (default) |
| Commons credit | "cropped" added | Decided 6 Oct (default) |
| Notice about people who have died (decision 15) | In About and the description | Decided 6 Oct (default) |
| Subtitle | "Your MP, votes, bills and pay", as drafted | Decided 6 Oct (default) |
| Secondary category | News, as drafted | Decided 6 Oct (default) |
| Copyright | 2026 Jake Tracey | Decided 6 Oct (default) |
| Support and privacy (decision 12) | `/support` and `/privacy`, live on opax.com.au since 6 October 2026; interim wording and public GitHub issues until an inbox exists; review contact through `/support` | Decided 6 Oct (default) |
| Content rights (decision 13) | Yes; licence items never block | Decided 6 Oct (default) |
| Store screenshots (decision 13) | No APH portraits | Decided 6 Oct (default) |
| Privacy label (decision 14) | Section 4.1: the switch-on manifest's seven types; Search History and Other Data (IP addresses) linked | Decided 6 Oct (default) |
| Account deletion policy (decision 5) | As in section 2.4 | Decided 6 Oct (default) |
| Provider settings (decision 8) | Documented settings; Jake checks the dashboard and makes the first call | Decided 6 Oct (default) |
| Voice budget (decision 9) | Shared with the web | Decided 6 Oct (default) |
| Voice behaviour (decision 10) | End on background; consent once, disclosure before every call | Decided 6 Oct (default) |
| Guideline 4.7 (decision 11) | Ship "Report this answer"; ask App Review before submission | Decided 6 Oct (default) |
| Demo account | None; review signs in with its own email | Decided 6 Oct (default) |
| Marketing URL | Empty | Decided 6 Oct (default) |

## 9. Claims not verified in this pass

- **Subsequent UI changes.** Labels were rechecked on 7 October 2026 for this lane. A later integration that changes them requires another notes/walkthrough check.
- **Live retention.** Log (7 days) and analytics (31 days) retention come from the privacy branch's read-only checks and Cloudflare's documentation (`docs/PRIVACY.md:19-20` there). Whether Workers Logs entries hold IP fields was not readable by API; the label declares IPs either way.
- **IP fields in Workers Logs.** Whether log entries hold the IP was not readable by API. The label declares Search History and Other Data linked either way.
- **ElevenLabs settings.** Recording off and one-day transcripts are as recorded on 9 September 2026 (Needs Jake 3).
- **Build selection.** That App Store Connect offers a 1.0.0 build for a version renamed 1.0.0 is expected, not tested.
- **Person search rows (R1)** and **opax.com.au source links (R6)**: as on 5 October; no production search was run.
- **How App Review reads** the in-app Safari view (R3), guideline 4.7 (R9) and own-email sign-in (R10).
- **Age rating.** Read from Apple's published table; App Store Connect computes the real one. Counts come from the repository copies and word matching.
- **Support page contact requirements.** Which of address, email and phone Australian law requires is a legal question.
- **Portrait crops.** Whether a crop or a circular mask is an adaptation under CC BY-NC-ND is a legal question.
- **Real-provider and physical-device execution.** The assigned simulator's five standard journeys, reviewer walkthrough and AX5 notice captures pass with local fixtures. This lane proves no real email, microphone, voice-provider dashboard or physical-device sign-in.
- **App Privacy answers already in App Store Connect.** Not readable through the API.
