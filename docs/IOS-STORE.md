# OPAX iOS: App Store submission readiness

Written 5 October 2026 and made final on 6 October 2026 for a v1 **with Talk to OPAX (voice), sign-in and account deletion**. This document holds the listing copy, App Review notes, the age rating, export compliance and content rights answers, the App Privacy label, the screenshot plan and the gap list against the App Store Review Guidelines. It does not submit anything. Nothing here has been entered in App Store Connect; submission is Jake's call (section 7).

**Jake, 6 October 2026, 10:40:** "unblock all the work that's waiting for me. Any placeholder stuff can be filled in quickly later. Enable the voice and account deletion - do not block for trivial/license related stuff". Every open store item is therefore settled at its documented default and recorded as "decided 6 Oct (default)" in section 8.

**Citations.** A bare `path:line` is `ios/app` at `946ef7e3`. Talk, Account and some other screens are in lanes that have not merged into `ios/app` yet; those citations name the branch and commit:

| Lane | Commit | What it adds | In v1 |
| --- | --- | --- | --- |
| `ios/talk-sheet` | `6cb7c7d4` | The Talk screen: sign-in prompt, consent, call, captions, sources, "Type instead", "Report this answer" | Yes, at the build-5 gate |
| `ios/account-ui` | `078031c9` | Sign-in by emailed code, sign-out, deletion | Yes, at the build-5 gate |
| `ios/follows` | `fb09e12e` | Follows on the device and Today's "Following" block | If merged before the gate |
| `ios/leads-feed` | `028f3e87` | Leads and the declared-interests feed | If merged before the gate |
| `ios/party-page` | `1babc9f1` | Party pages | If merged before the gate |
| `ios/portraits` | `61416e0c` | The website's portrait files, with credits | If merged before the gate |
| `web/privacy-app` | `f7f3e30b` | The `/privacy` and `/support` pages on opax.com.au (local branch; not on the public remote yet) | Deployed before submission |

The build-5 gate (section 6.2) rechecks every lane label quoted here against the build being submitted.

**What was checked.**

- `ios/app` at `946ef7e3`, with the production voice switch (`mobile/plugins/voiceProduction.js`, `mobile/voice-production-policy.json`), the release verifier (`mobile/scripts/verify-ios-release.py`), the welcome tour, the electorate map and every citation below. TestFlight Internal has builds 1 to 4; build 4 (0.1.0, build 4, from `bf47df10`) is the latest and ships neither voice nor account features.
- The lanes and the privacy branch in the table above, read on 6 October 2026.
- Apple's [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (guidelines 2.1(a), 4.7 and 5.1.1(v) reread on 6 October 2026; the rest read on 5 October, page marked "Last Updated: June 8, 2026"), [App privacy details](https://developer.apple.com/app-store/app-privacy-details/) and the App Store Connect [platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information), reread on 6 October 2026.
- The App Store Connect record, read with GET requests only on 5 October 2026 and not reread for this pass. The record is "OPAX", primary language English (Australia), version 1.0 in Prepare for Submission, with every listing, rating, rights, privacy and review field empty.

Related documents: [IOS-APP.md](IOS-APP.md) (decisions, sections 6 and 11), [IOS-VOICE.md](IOS-VOICE.md) (section 6), [IOS-UX.md](IOS-UX.md) (sections 6 and 8), [IOS-ELECTORATE-MAP.md](IOS-ELECTORATE-MAP.md), [IOS-RELEASE.md](IOS-RELEASE.md) (build and TestFlight tooling), [PHOTOS.md](PHOTOS.md).

**Status in one line.** The copy, notes and answers below are final. Between this document and submission stand the build-5 gate (section 6.2) and three things only Jake can do (section 7): submit, check the ElevenLabs dashboard, and set up a private inbox.

**Scope of v1.** Today, Your MP (with "Use my location"), member profiles, electorates with their outline, Bills, Search, About and sources, the welcome tour, Talk to OPAX, and Account (sign-in by emailed code, sign-out, deletion). Voice and Account ship when the build-5 gate passes: `ios/talk-sheet` and `ios/account-ui` merged, and the release built with `OPAX_PRODUCTION_VOICE=1`, which links both voice pods, adds the microphone purpose string and declares the voice data types in one switch (`mobile/plugins/voiceProduction.js:3-12`, `mobile/app.config.ts:155-165`, `mobile/scripts/release-ios.sh:41-42`). The switch defaults to off today (`mobile/src/voice/README.md:35-41`). Follows, leads, party pages and portraits join v1 only if their lanes merge before the gate; their listing lines and frames are marked "if in the build".

## 1. Listing copy

Counts are in characters as App Store Connect counts them, checked with a script on 6 October 2026; keywords are in bytes, Apple's unit for that field. No field uses an em dash.

| Field | Final | Count and limit | Evidence and notes |
| --- | --- | --- | --- |
| Name | OPAX | 4 of 30 | The record's name. `mobile/app.config.ts:53` |
| Subtitle | Your MP, votes, bills and pay | 29 of 30 | Decided 6 Oct (default), as drafted. Your MP tab, voting record, Bills tab, pay block (`mobile/src/app/(tabs)/_layout.tsx:21-28`, `mobile/src/features/Person.tsx:273,482`) |
| Promotional text | Find your MP and senators and see their votes, declared interests, pay and expenses. Follow federal bills, or ask OPAX about the public record by voice. | 152 of 170 | Your MP (`mobile/src/features/YourMP.tsx:473`); profile blocks (`Person.tsx:273,370,482,578`); federal bill keys only (`mobile/src/api/policy.ts:25-26`); voice in section 1.1. Can change without a new build |
| Description | Section 1.1 | 3,167 of 4,000; 3,635 with all three "if in the build" paragraphs | Each claim mapped to code in section 1.1 |
| Keywords | australia,parliament,senator,electorate,politician,legislation,interests,expenses,salary,civics | 95 of 100 bytes | No spaces; no word repeats the name or subtitle; no app, company or trademark names |
| Primary category | Reference | | Apple's Reference definition lists "general research" and "politics" ([categories](https://developer.apple.com/app-store/categories/)) |
| Secondary category | News | | Decided 6 Oct (default), as drafted. News covers "information about current events or developments in areas of interest such as politics" |
| Support URL | `https://opax.com.au/support` | | The page is on `web/privacy-app` (section 1.2); deployed before submission (section 6.2) |
| Marketing URL | Empty | | Optional field. A later `/app` page is nice-to-have N4 |
| Privacy policy URL | `https://opax.com.au/privacy` | | All sixteen placeholders filled on `web/privacy-app` (`docs/PRIVACY.md:9-30` there); deployed before submission |
| Copyright | 2026 Jake Tracey | | Decided 6 Oct (default): the person the privacy page names as responsible (`docs/PRIVACY.md:16` on `web/privacy-app`) |
| Primary language | English (Australia) | | Already set |
| Price | Free | | No in-app purchases (`mobile/package.json` has no purchase package) |
| Availability | Australia only | | Decided 6 Oct (default). Avoids the EU Digital Services Act trader declaration (old risk R7) |
| Apple silicon Mac and Apple Vision Pro | Off | | Decided 6 Oct (default): not tested on either (risk R5) |
| Version | 1.0.0 | | Decided 6 Oct (default). The app says 0.1.0 today (`mobile/app.config.ts:55,141`, `mobile/scripts/release-ios.sh:64,68,77`); the build-5 gate changes it, and the App Store version (1.0 in App Store Connect) is set to 1.0.0 at submission |

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
The data comes from public sources, including the Parliament of Australia, They Vote For You, the Australian Electoral Commission, the Independent Parliamentary Expenses Authority and the Remuneration Tribunal. Each source keeps its own copyright and licence, and the About and sources screen lists them.

Reading needs no account. The app has no advertising, in-app purchases or analytics.

Aboriginal and Torres Strait Islander readers are advised that this app contains names and images of people who have died.
```

**If in the build.** Insert each paragraph after "Search" only if its lane is in the submitted build (guideline 2.3.1(a): describe only what the build does).

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
| Account for people aged 16 and over | The privacy page and `/support` (`docs/PRIVACY.md:28` on `web/privacy-app`); the app's sign-in screen gains the same line at the build-5 gate (section 6.2) |
| Deletion in the app | `deleteAccount` in the bridge (`mobile/src/voice/README.md:12-13`) on the deletion routes (`voice-production-policy.json:14-15`); the flow on `ios/account-ui` (`mobile/src/features/account/copy.ts:24,47-76` there) |
| 10 minutes in total | 600 seconds per account, not monthly (privacy page, "Your 10 minutes", on `web/privacy-app`); "Voice time: … remaining" on `ios/account-ui` (`copy.ts:13-14` there) |
| Consent before the first call; ElevenLabs named | The native consent store, denied by default (`voice-production-policy.json:3-4`; `mobile/src/voice/README.md:43-50`); the consent screen on `ios/talk-sheet` (`TalkScreen.tsx:306-344` there) |
| "Answers may be mistaken" | The disclosure before every call on `ios/talk-sheet` (`TalkScreen.tsx:474-481` there) |
| Offline reading, marked with save time | Disk cache `mobile/src/api/disk-store.ts:15`; saved-time notices `mobile/src/features/your-mp/Evidence.tsx:43-50`, `mobile/src/design/states.tsx:19,190-202`; journey `mobile/.maestro/04-offline.yaml`. Search results are not saved (`mobile/src/api/cache.ts:134`) |
| Share a link to opax.com.au | `mobile/src/navigation/share.ts:17-38`; Share on profile, electorate and bill (`Person.tsx:135`, `Electorate.tsx:117`, `BillDetail.tsx:143`) |
| Independence statement; "leads, not findings" | `mobile/src/features/ComingSoon.tsx:6-7`, `About.tsx:93-95`, `Today.tsx:57`; `Today.tsx:112-114` |
| Sources named | About `:203-253`; electorate sources carry their own licence (`selectors.ts:1094-1101`) |
| No advertising, in-app purchases or analytics | `mobile/package.json`; `mobile/scripts/verify-ios-release.py:29-36,660-661` |
| Notice about people who have died | Decision 15 (section 8). The web's About carries it on `web/privacy-app` (`portal/public/index.html:1166` there); the app's About gains it at the build-5 gate |

### 1.2 Support and privacy pages

App Store Connect says the support URL "must lead to actual contact information (legal address, email address, telephone number), as may be required by local law, so that users can reach you regarding app issues, general feedback, and feature enhancement requests". Guideline 1.5 asks that the app and its support URL "include an easy way to contact you".

**Decided 6 Oct (default), decision 12:** `/support` and `/privacy` ship on opax.com.au from `web/privacy-app`, with honest interim wording until a private inbox exists. That branch is local and not deployed yet; deployment is in the build-5 gate list (section 6.2).

`/support` on that branch (`portal/public/index.html:1869-1924` there) has:

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

3,609 bytes of the 4,000 the Notes field allows, counted on 6 October 2026. The labels in the Talk and deletion steps come from `ios/talk-sheet` and `ios/account-ui`; recheck them against the submitted build (section 6.2).

```text
OPAX is a free reader for the public record of Australian politics. Reading needs no account; only Talk to OPAX, a voice assistant, needs sign-in. No in-app purchases, advertising, analytics or tracking.

Content. Public records from Australian parliaments and public agencies: recorded divisions, registers of members' interests, pay set by the Remuneration Tribunal, expenses reported by the Independent Parliamentary Expenses Authority, federal bills, and electorate and election results. Blocks name their source and how current they are. Native profiles exist only for members of parliament on OPAX's verified roster, as public office holders; other people named in records get no profile.

Machine-written text. Bill summaries and speech briefs were written in advance by a language model, stored, and labelled "Machine summary" or "Machine brief". Reading makes no AI requests; Talk to OPAX is the one AI feature.

OPAX is independent and non-partisan. It is not a government app and is not affiliated with any parliament, government or political party.

Reading (no account):
1. A welcome tour shows on first launch; Skip closes it. Today opens next.
2. Your MP: type an electorate such as Grayndler and tap it, or tap "Use my location" (optional; used once on the iPhone, never sent). Tap the member for the profile: votes, declared interests, pay, expenses. "Electorate record" shows the outline, elections and Census.
3. Bills: open a bill for its summary, divisions and party splits.
4. Search: type a surname; the Kind menu switches catalogs.
5. Sources and licences: the person icon at the top right of a tab's first screen, then "About and sources".

Talk to OPAX (voice). There is no demo account and no password: sign in with any email address you can read, using a one-time code.
1. Tap Talk (waveform icon, top right of a tab's first screen), then "Sign in to talk for free", then "Sign in for voice".
2. Enter your email and tap "Send code". OPAX emails an 8-digit code from login.opax.com.au (check spam). Enter it and tap "Sign in". This creates the account.
3. Open Talk again and tap "Start talking". The first time, a consent screen says your voice and the conversation's words go to ElevenLabs, a third-party AI provider. Tap "Agree and start", then allow the microphone.
4. Ask, for example, "Who represents Grayndler?" Captions and Sources appear; "Type instead" sends text; each answer has "Report this answer". Tap "End call". Leaving the app also ends a call.
Each account has 10 minutes of voice in total. All accounts share a monthly voice budget and at most two calls at once, so voice can be busy for a moment, or closed for the rest of the month; reading still works.

Account deletion (5.1.1(v)): person icon, then "Delete account". The screen lists what is deleted and what is kept; OPAX emails a deletion code; entering it deletes the account and signs the iPhone out.

Guideline 4.7: Talk to OPAX is OPAX's own assistant, not third-party software offered in the app. It answers from OPAX's public record through OPAX's own search, as an ElevenLabs voice agent that OPAX configures. We read it as outside 4.7; please tell us if App Review disagrees. It already asks consent before first use, shows "Answers may be mistaken; check the linked records" before every call, offers "Report this answer" on each answer, and accounts are for people aged 16 and over.

Support and corrections: https://opax.com.au/support. OPAX has no private inbox yet, so reports go to public GitHub issues from that page. For this review, use the App Review contact details in this submission.
```

**Evidence for the notes.**

| Note | Evidence |
| --- | --- |
| Welcome tour on first launch; Skip | `mobile/src/onboarding/WelcomeTour.tsx:45,54,204`; pages `mobile/src/onboarding/pages.ts:15-48`; replay from the Account sheet (`ComingSoon.tsx:53-61`); journey `mobile/.maestro/28-welcome.yaml` |
| Your MP, "Use my location", "Electorate record" | `YourMP.tsx:209,216,301`; `LocationSuggestion.tsx:63-72`; `Electorate.tsx:157,189,252`; journeys `07-your-mp.yaml`, `24-electorate-map.yaml` |
| Search and the Kind menu | `Search.tsx:184`; `mobile/src/features/search/KindPicker.tsx` |
| Person icon, About and sources; Talk (waveform icon) | `mobile/src/navigation/chrome.ts:47-65`; `ComingSoon.tsx:48-52` |
| "Sign in to talk for free" | `TalkScreen.tsx:294-304` on `ios/talk-sheet` (opens the Account sheet) |
| "Sign in for voice", "Send code", "8-digit code", "Sign in" | `mobile/src/features/account/copy.ts:10,32,40-41` on `ios/account-ui`; `AccountSection.tsx:83-84` there |
| Code from login.opax.com.au; 15 minutes; creates the account | The privacy page's email section and `/support` on `web/privacy-app` (`docs/PRIVACY.md:72-73` there); `copy.ts:29-30,35-36` on `ios/account-ui` |
| Consent screen, "Agree and start", microphone after consent | `TalkScreen.tsx:306-344` on `ios/talk-sheet`; the native order on `ios/app`: consent, then permission (`mobile/src/voice/README.md:45-48`) |
| Captions, Sources, "Type instead", "Report this answer", "End call" | `TalkScreen.tsx:189,399,410,491-502` and `mobile/src/features/talk/AnswerCaption.tsx:21-27` on `ios/talk-sheet` |
| Leaving the app ends a call (decision 10) | `mobile/modules/opax-voice/ios/OpaxVoiceCore/Sources/OpaxVoiceCore/AppleAudio.swift:226`; `CallController.swift:400` there |
| 10 minutes, shared monthly budget, two calls | Privacy page "Your 10 minutes" on `web/privacy-app`; IOS-APP.md section 5; "closed for the rest of this month" on `ios/talk-sheet` (`mobile/src/features/talk/model.ts:64-65` there) |
| Deletion path | `AccountSection.tsx:57-58` and `copy.ts:47-76` on `ios/account-ui`; routes `voice-production-policy.json:14-15` |
| No AI requests when reading | The public client's allow-list (`policy.ts:1-2,29-90`); IOS-APP.md section 2 (never-call rule) |

### 2.2 App Review information fields

| Field | Entry | Why |
| --- | --- | --- |
| Sign-in required | Off | App Store Connect: required "If your app requires a login to use it". Only Talk needs an account; the notes give the test registration route, as the Notes field allows ("test registration or account details") |
| Contact name, email, phone | Jake's own details, entered at submission | Not recorded in this public repository |
| Notes | Section 2.1 | |
| Attachment | None | |

**No demo account (decided 6 Oct, default).** Sign-in sends a one-time code to the address entered (`voice-production-policy.json:11-12`), so a fixed demo account cannot work without a mailbox App Review can read. Review signs in with its own email. Guideline 2.1(a) says to "include demo account info ... if your app includes a login"; the risk that App Review insists is R10 (section 6.3).

### 2.3 Guideline 4.7 position (decision 11)

Decided 6 Oct (default): ship "Report this answer", and ask App Review. The question goes to App Review in the notes (section 2.1, "Guideline 4.7"), so it is asked with the submission itself; Jake can also send it through App Review's contact form first (section 7).

Guideline 4.7 covers software "not embedded in the binary", naming chatbots, and adds 4.7.1 ("a method for filtering objectionable material, a mechanism to report content and timely responses to concerns, and the ability to block abusive users") and 4.7.5 ("an age restriction mechanism based on verified or declared age"). OPAX's position, and what is already in place:

| 4.7 item | In place |
| --- | --- |
| Reporting | "Report this answer" under each completed answer (`AnswerCaption.tsx:21-27` on `ios/talk-sheet`). On `ios/app`, `reportAnswer` opens a report in the in-app Safari view with a record path only, never answer text (`mobile/src/voice/report-answer.ts:11-48`); it opens `/support?record=<path>` once `supportPageAvailable` is set, and a public GitHub issue until then (`report-answer.ts:6-9,31-41`) |
| Timely responses | Reports land as public GitHub issues until a private inbox exists (Needs Jake 3) |
| Consent in each instance | Consent once, with the disclosure before every call (decision 10); a per-call consent would be needed if App Review applies 4.7.3 |
| Age restriction | Accounts and voice are for people 16 and over, stated, not checked (`docs/PRIVACY.md:28` on `web/privacy-app`). A declared-age step would be needed if App Review applies 4.7.5 |
| Filtering, blocking | The assistant answers from the public record through OPAX's search; there are no other users to block |
| Index with universal links (4.7.4) | Not in v1. If 4.7 applies, inbound universal links (W17) move into v1 (decision 11) |

### 2.4 Account deletion, guideline 5.1.1(v)

"If your app supports account creation, you must also offer account deletion within the app." Signing in creates an account, so deletion is in the app: Account sheet, "Delete account", a screen listing what is deleted and what is kept, a fresh emailed eight-digit deletion code, then "Account deleted" and signed out (`copy.ts:47-76` on `ios/account-ui`; journey `22-account.yaml` there). The bridge calls `requestDeletionCode` and `deleteAccount` (`mobile/src/voice/README.md:12-13`) on the two deletion routes (`voice-production-policy.json:14-15`); the voice core ends any live call before it deletes (`mobile/modules/opax-voice/ios/OpaxVoiceCore/Sources/OpaxVoiceCore/CallController.swift:387-395`).

What is kept follows decision 5, decided 6 Oct (default): other members keep their replies under a deleted discussion, which becomes a stub with no personal data, and their own messages; voice records lose their member link and keep their seconds, so deletion refunds no time; no legal retention beyond what is disclosed; a returning email gets a fresh 10 minutes, and no email hash is kept. The privacy page says the same ("Deleting your account", on `web/privacy-app`). Deletion has been live on the Worker since 3 October 2026 (`docs/COMMUNITY.md:55` on `main`).

### 2.5 Sources and licences, as the app states them

From the About and sources screen (`mobile/src/features/About.tsx:203-285`). The app states each licence as a fact and grants none (`About.tsx:271-272`).

| Source | Used for | Licence as the app states it |
| --- | --- | --- |
| Parliament of Australia | Registers of interests, bills, the Hansard record behind divisions | Parliamentary copyright; Hansard under CC BY-NC-ND terms; House and Senate registers CC BY-NC-ND, shown as extracted facts with links |
| Queensland register of interests | Declared interests for Queensland members | No verified licence in the source review |
| They Vote For You | Compiled division data | Open Database Licence; the underlying Hansard keeps parliamentary copyright |
| AEC Transparency Register | Party receipts (linked on opax.com.au) | Creative Commons Attribution; versions vary by source |
| Independent Parliamentary Expenses Authority | Claimed expenses | CC BY 3.0 AU (data.gov.au) |
| Remuneration Tribunal | Pay entitlements | Entitlements set by instrument; each record's terms |
| Electorates release (outlines, elections, Census) | Electorate records and the outline map | Per source, with each record (`selectors.ts:1094-1101`; `OutlineMap.tsx:60-73`) |
| Wikimedia Commons portraits | Member portraits | Each file's own licence, with author and links. `ios/app` shows only CC BY and CC BY-SA 2.x to 4.x, CC0 and public domain files (`selectors.ts:225-240`, `Person.tsx:165-176`), which leaves out the two GFDL and two "copyrighted free use" files, as decided (section 3.4) |
| Parliament of Australia official portraits | Member portraits | CC BY-NC-ND 4.0. Not shown on `ios/app` (`selectors.ts:210-222`, "review-required"); shown with an "Official portrait" credit if `ios/portraits` is in the build (`selectors.ts:232-239` there) |
| ElevenLabs | Runs the voice conversation | A processor, not a content source; named in the consent step and the privacy page |
| Merriweather, Public Sans | Fonts | SIL Open Font License 1.1; notices in the app (`About.tsx:318-348`) |
| OPAX code | The app | AGPL-3.0, with a link to the repository (`About.tsx:279-285`) |

### 2.6 Reviewer walkthrough, with evidence

| Feature | How to reach it | What the reviewer sees | Evidence |
| --- | --- | --- | --- |
| Welcome tour | First launch | Five pages (Welcome to OPAX, Your MP, Profiles, Bills and Today, Search), sample records labelled Example, Skip, "Choose your electorate" | `pages.ts:15-48`; `WelcomeTour.tsx:45-54,204` |
| Today | Opens after the tour | Independence line, daily edition, recently introduced bills, recent declarations | `mobile/src/app/(tabs)/_layout.tsx:17`; `Today.tsx:51-115` |
| Your MP | Tab 2 | Seat field, "Use my location", seat, member, senators, state members where verified, Change seat, AEC electorate finder | `YourMP.tsx:193-301,473-559`; `LocationSuggestion.tsx:63-72` |
| Member profile | Tap the member | Portrait (Commons) or blank circle, party, seat, as-at line, voting record, interests, pay, expenses, party receipts, Share | `Person.tsx:160-727` |
| Electorate | "Electorate record" on Your MP | Outline map with its source and limits, latest verified representation, elections with candidates and votes, local context, related constituencies, sources | `Electorate.tsx:157-330`; `OutlineMap.tsx:43-73` |
| Bills, bill detail | Tab 3 | Search, Filters; machine summary label, key dates, divisions, party splits, speeches, what became law | `BillsList.tsx:74-104`; `BillDetail.tsx:206-703` |
| Search | Tab 4 | Field "Search people, places and bills", suggestions, Kind menu | `Search.tsx:184-475` |
| Talk | Waveform icon on a tab's first screen | Signed out: "Sign in to talk for free". Signed in: the disclosure, "Start talking", the consent step once, captions, Sources, "Type instead", "Report this answer", "End call", voice consent and "Withdraw voice consent" | `chrome.ts:49-56`; `TalkScreen.tsx:294-502` on `ios/talk-sheet` |
| Account | Person icon | Signed out: "Sign in for voice". Signed in: email, voice time remaining, "Sign out of this iPhone", "Delete account"; About OPAX, About and sources, Replay welcome tour | `chrome.ts:57-64`; `AccountSection.tsx:49-107` and `AccountScreen.tsx` on `ios/account-ui` |
| External links | Any source link | In-app Safari view (5.1.1(vii)); "Opens on opax.com.au" links leave for Safari | `mobile/src/navigation/external.ts:266-293,317-329` |

## 3. Questionnaires

### 3.1 Age rating: 13+ (decided 6 Oct, default)

Field names are the App Store Connect API's; definitions from [Age ratings values and definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions). Guideline 2.3.6 asks for honest answers.

Counts come from the repository copies, which production refreshes nightly, run on 5 October 2026. Title counts match words in `portal/public/bills/index.json` (2,989 bills). Rendered-text counts pass each `portal/public/bills/au-federal-*.json` file through the app's own bill selector (`billFor`, `mobile/src/api/selectors.ts:898`), so they count what the bill screen shows: summaries, speech briefs, and each division's heading and note. The heading and note are They Vote For You's division text, debate excerpts included (`mobile/src/api/bill-transforms.ts:155-172`; `selectors.ts:951-963`; `mobile/src/features/bills/parts.tsx:376-424`).

| Question (API field) | Answer | Reason | Evidence |
| --- | --- | --- | --- |
| Parental controls (`parentalControls`) | No | None in the app | |
| Age assurance (`ageAssurance`) | No | No age checks. The minimum age of 16 for accounts and voice is stated, not checked (`docs/PRIVACY.md:28` on `web/privacy-app`) | |
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
| Official parliamentary portraits (551 website files, CC BY-NC-ND 4.0) | Jake, 5 October: ship the website's files as they are, with an "Official portrait" credit and licence link; fix the licensing later. Decision 13: no APH portraits in store screenshots | Not shown on `ios/app` (`selectors.ts:210-222`). If `ios/portraits` is in the build, shown with the credit. The website's files are centre-square crops resized to 200x200 (`scripts/backfill_photos_oa.py:29`; PHOTOS.md:76-77); a crop is arguably an adaptation, which no-derivatives terms do not allow. Accepted as risk R8 |
| Commons, GFDL 1.2 (2 files) | Left out. Decided 6 Oct (default) | `ios/app` already leaves them out (`selectors.ts:225-228`). `ios/portraits` shows them (`selectors.ts:241-253` there) and must filter them before it merges (section 6.2) |
| Commons, "copyrighted free use" (2 files) | Left out. Decided 6 Oct (default) | As for GFDL |
| Commons, CC BY, CC BY-SA, CC0 and public domain (294 files) | Shown with author, licence and links, and "cropped" added to the credit. Decided 6 Oct (default) | The credit line is `{credit} · {licence}` (`Person.tsx:241`); "cropped" marks OPAX's face-aware crop and resize (`scripts/recrop_commons_portraits.py:54-59`), which CC BY 4.0 section 3(a)(1)(B) asks to indicate. The wording change lands with the portraits lane and on the website's credits (section 6.2) |
| Hansard, House and Senate registers (CC BY-NC-ND); Queensland register (no verified licence) | Licence items never block. Decided 6 Oct (default) | The app is free, with no advertising or purchases, and shows the registers as extracted facts with links |
| Machine summaries and briefs | As above | May count as adaptations of explanatory memoranda and speeches; labelled as machine-written |
| OPAX code (AGPL-3.0) | `mobile/` under the repository licence (decision 13 default) | About links the repository (`About.tsx:279-285`) |
| Logos and insignia | None | `mobile/assets` holds only the icon, splash and fonts; the icon is a gold map of Australia on navy |

## 4. App Privacy label

Final answers, decided 6 Oct (default) under decision 14 ("answer conservatively"). They match the privacy manifest the release builds with the voice switch on, which the release verifier enforces; the same types are on the privacy page.

### 4.1 Answers to enter in App Store Connect

**Do you or your third-party partners collect data from this app?** Yes.

| Apple category and type | Collected | Linked to the user | Used for tracking | Purpose |
| --- | --- | --- | --- | --- |
| Contact Info: Email Address | Yes | Yes | No | App Functionality |
| Identifiers: User ID | Yes | Yes | No | App Functionality |
| User Content: Audio Data | Yes | Yes | No | App Functionality |
| User Content: Other User Content | Yes | Yes | No | App Functionality |
| Usage Data: Product Interaction | Yes | Yes | No | App Functionality |
| Search History | Yes | No | No | App Functionality |
| Other Data: Other Data Types | Yes | No | No | App Functionality |

**Tracking: No.** No App Tracking Transparency prompt; `NSPrivacyTracking` is false and no tracking domains are declared (`verify-ios-release.py:98-99`).

**Not collected:** Location (used on the device only), Contacts, Health and Fitness, Financial Info, Purchases, Browsing History, Diagnostics (crash and performance data), Sensitive Info, Photos or Videos, Device ID and Advertising Data.

**Where it is enforced.** The types and their linkage come from one policy file (`mobile/voice-production-policy.json:17-24`), turned into manifest entries with tracking false and the App Functionality purpose (`mobile/plugins/voiceProduction.js:14-40`), merged into the app's manifest only when the switch is on (`mobile/app.config.ts:155-158`). The release verifier refuses a switch-on archive whose manifest differs in any type, linkage, tracking flag or purpose, and states "location not collected" (`verify-ios-release.py:97-116,570-573`).

### 4.2 Why each answer

Apple counts data as collected when it leaves the device and is kept "for a period longer than what is necessary to service the transmitted request in real time" ([App privacy details](https://developer.apple.com/app-store/app-privacy-details/)). App Functionality covers uses "such as to authenticate the user, enable features, prevent fraud, implement security measures, ensure server up-time".

| Type | What leaves the phone, and what is kept | Evidence |
| --- | --- | --- |
| Email Address | The address entered at sign-in, kept with the account until deletion | `POST /api/community/auth/request` (`voice-production-policy.json:11`); privacy page, "Community accounts", on `web/privacy-app` |
| User ID | The member ID behind the session and on each voice record. The session cookie lives in the Keychain, this device only, and goes only to the ten account and voice routes | `Credentials.swift:48`; `voice-production-policy.json:5-16`; `mobile/src/voice/README.md:52-55` |
| Audio Data | The voice during a call, through OPAX's relay to ElevenLabs. ElevenLabs was set not to record audio when last checked (9 September 2026); declared because a third-party AI processes it | `Relay.swift:54`; `docs/PRIVACY.md:24` on `web/privacy-app` (P10); the decision 8 check is Needs Jake 2 |
| Other User Content | The words of the conversation, spoken or typed with "Type instead", sent to ElevenLabs and the language model it runs; transcripts kept one day at ElevenLabs as last checked. The app does not store captions | `docs/PRIVACY.md:24-25,75` on `web/privacy-app`; `mobile/src/voice/README.md:71-72` |
| Product Interaction | For each call, the seconds reserved and charged and the start and end times, kept to count the 10 minutes and the shared monthly budget | Privacy page, "What is kept" and "Your 10 minutes", on `web/privacy-app`; IOS-APP.md section 6 |
| Search History (unlinked) | Catalog search words travel in the URL of `GET /api/search-all`; Workers Logs keep each URL for 7 days. Unlinked: public requests carry no credential, so no account cookie travels with a search | `policy.ts:45-77`; `client.ts:126`; `portal/wrangler.jsonc:32-35`; `docs/PRIVACY.md:19` on `web/privacy-app` (P5) |
| Other Data Types (unlinked) | IP addresses: read by rate limiters, possibly recorded in Workers Logs (kept 7 days) and kept up to 31 days in Cloudflare's traffic and security analytics. Apple has no IP type and says to "declare the relevant data types based on how you use IP address, such as precise location, coarse location, device ID, or diagnostics"; OPAX uses them for none of those, only rate limits and security, so they are declared as Other Data | `docs/PRIVACY.md:19-20` on `web/privacy-app` (P5, P6); IOS-APP.md section 6 |
| Location (not collected) | One reading after "Use my location", turned into a seat suggestion on the iPhone; never sent, saved or logged. Outlines are fetched before the reading, so no request depends on it | `location.ts:5-6,13-31`; `LocationSuggestion.tsx:69-72`; `mobile/tests/location-privacy.test.ts`; `app.config.ts:76-77,99-107`; IOS-ELECTORATE-MAP.md |
| Seat, follows, consent, cache (not collected) | Kept on the device only: the seat file, the voice consent flag, the offline cache (at most 12 MB) and, if `ios/follows` is in the build, the follows file | `choice-store.ts:3-17`; `voice-production-policy.json:3-4`; `disk-store.ts:15`, `cache.ts:43`; `mobile/src/features/follows/README.md:8-12` on `ios/follows` |
| Analytics, crash reports, SDKs (none) | No analytics or crash-reporting SDK; the verifier rejects them | `verify-ios-release.py:29-36,660-661` |
| Share, opax.com.au pages, source records, reports (not collected by the app) | Share builds the URL on the phone; opax.com.au pages open in Safari; source records open in an in-app Safari view on the source's own site, which Apple exempts as "enabling the user to navigate the open web". "Report this answer" opens `/support` or a GitHub issue in that view with a record path only; what the reader then submits goes to GitHub | `share.ts:17-38`; `external.ts:266-293,317-329`; `report-answer.ts:11-48`; risk R6 |

### 4.3 Submit only a switch-on build

With the switch off, the manifest declares no collected data, by design, so that switch-off builds keep build 4's configuration (`verify-ios-release.py:575-578`). The App Store label is per app, not per build, so the submitted build must be a switch-on build, or the manifest and the label disagree. The release records the switch in `production-voice-switch.txt` (`mobile/scripts/release-ios.sh:87`); making the upload step refuse a mismatch is in the build-5 gate.

### 4.4 Privacy policy link

- **App Store Connect:** `https://opax.com.au/privacy`, live once `web/privacy-app` deploys. A guard (`scripts/check_privacy_placeholders.mjs` there) blocks deployment while any placeholder remains; none remains.
- **In the app:** About links "Privacy policy" to `/community?view=privacy` (`About.tsx:312-316`), which hands over to `/privacy` once the branch deploys; the build-5 gate points it at `/privacy` directly. Talk links "Voice privacy" to `/privacy` (`TalkScreen.tsx:323-327` on `ios/talk-sheet`).
- **In-app privacy text** (`About.tsx:302-310`) says "IP log retention is not yet confirmed". The build-5 gate replaces it with the facts above: logs 7 days, analytics 31 days.

### 4.5 Purpose strings

| Key | Exact text | Evidence |
| --- | --- | --- |
| `NSMicrophoneUsageDescription` (switch on only) | "OPAX uses your microphone only during a Talk call you start. Your audio is sent to ElevenLabs, OPAX’s voice provider, to understand and answer you." | `mobile/voice-production-policy.json:2`; set by `app.config.ts:159-160`; required word for word by `verify-ios-release.py:84-85,559-565` |
| `NSLocationWhenInUseUsageDescription` | "OPAX uses your location once, on your iPhone, to suggest your electorate. It is not sent anywhere." | `app.config.ts:76-77,99-107`; `verify-ios-release.py:68,81-82` |

No other purpose string ships: the verifier refuses any other `NS*UsageDescription` (`verify-ios-release.py:84-85`), and the location plugin turns off Always and motion permissions (`app.config.ts:103-105`). The microphone is asked for only after consent (`mobile/src/voice/README.md:45-48`). [IOS-VOICE.md, section 6](IOS-VOICE.md#6-store-and-privacy-notes) and `docs/PRIVACY.md` on `web/privacy-app` hold older drafts of the microphone string; the policy file's text is the one that ships.

## 5. Screenshot plan

No captures in this pass. Captures run on simulators the OPAX orchestrator assigns, after the build-5 gate passes, from a production-variant build with the voice switch on, so the navigation bar, Talk and Account match the submitted app (guideline 2.3).

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
| 2 | Your MP, seat chosen | A federal seat with its member and that state's senators from several parties; Commons portraits or blank circles only; "Use my location" and Change seat visible | Find your MP and senators (5) | `07-your-mp.yaml` |
| 3 | Member profile, top | Member A (Commons portrait or blank circle): name, party, seat, as-at line, voting record | A member’s recorded votes (4) | `08-profile.yaml` |
| 4 | Member profile, declared interests | Member A: interests and Declared ties with source footer | Declared interests from the registers (5) | `08-profile.yaml`, scrolled to `person-interests` |
| 5 | Member profile, pay and expenses | Member B, another party, portrait out of view: pay for the posts held, claimed expenses by year, as-at lines | Pay and expenses, as reported (5) | `08-profile.yaml` with member B |
| 6 | Electorate | The outline map with "Display outline" label, latest verified representation, an election with candidates | Electorates, outlines and results (4) | `09-electorate.yaml`, `24-electorate-map.yaml` |
| 7 | Bill detail, divisions | A passed bill on an uncontroversial subject, a division and party splits expanded, machine summary label in view | Divisions and party splits (4) | `11-bill-detail.yaml`, with a bill chosen under the audience rule (its current fixture is a gambling bill) |
| 8 | Talk | Captions for one question and its answer, Sources listing the record, "Report this answer" and the disclosure line in view. The answer is a real one, checked against the record it cites, for example who represents a seat | Ask by voice, with sources (5) | `21-talk.yaml` on `ios/talk-sheet`, with the fixture's answer replaced by the checked one |
| 9 | Today, Following (if `ios/follows` is in the build) | The Following block with a changed member, bill and electorate, and the Leads section's intro below it if `ios/leads-feed` is in the build; the daily edition scrolled out of view | Follow what changes (3) | `26-follows.yaml` on `ios/follows` (changed-data fixture mode) |
| 10 | Search results (optional) | People kind, a common surname with results from several parties; Commons portraits or blank circles only | Search people, interests, pay (4) | `12-search.yaml` |

If `ios/follows` is not in the build, frame 9 becomes the Bills list (latest activity first, one filter chip applied; "Follow federal bills", 3 words; `10-bills.yaml`). Party pages and individual leads are left out under the neutrality rule; the party splits in frame 7 show parties side by side instead. The daily edition is left out because it changes every day and some editions compare parties.

## 6. Gap list

Ranked as before: **blocker** (submission should not go ahead), **risk** (could draw a rejection or a later problem), **nice-to-have**.

### 6.1 Resolved

| ID | Was | Resolution |
| --- | --- | --- |
| B1 | No contact or support page (1.5; decision 12) | `/support` on `web/privacy-app`, with interim wording and public GitHub issues until an inbox exists. Decided 6 Oct (default). Deployment and the About link: section 6.2. The inbox: Needs Jake 3 |
| B2 | No privacy policy at the URL (5.1.1(i)) | `/privacy` on `web/privacy-app`, all sixteen placeholders filled (`docs/PRIVACY.md:9-30` there). Deployment and the app link: section 6.2 |
| B3 | Production placeholders for Talk and Account (2.1(a)) | Voice, sign-in and deletion ship (Jake, 6 October). The production build shows the real Talk and Account screens; About's pending sentences are replaced. Both are build-5 gate items |
| B4 | App Privacy answers pending P5 and P6 | Final label in section 4, from the switch-on manifest. Decided 6 Oct (default) |
| B5 | Content rights and Commons compliance | Content rights Yes; GFDL and "free use" files left out; "cropped" added to the Commons credit. Decided 6 Oct (default) (section 3.4) |
| B6 | App Store Connect metadata empty | Every field is final in sections 1 to 4; entering it is part of submission (Needs Jake 1) |
| B7 | Version 0.1.0 against App Store version 1.0 | 1.0.0. Decided 6 Oct (default). The app change is a build-5 gate item; the App Store version is set at submission |
| B8 | Official portrait licensing | Licence items never block (Jake, 5 and 6 October). Moved to risk R8; no APH portraits in screenshots |
| R7 | EU trader declaration | Australia only. Decided 6 Oct (default) |
| N1 | Notice about people who have died (decision 15) | In the description (section 1.1). Decided 6 Oct (default). In the app's About: section 6.2 |
| N2 | Privacy manifest matches the label | The switch-on manifest is the label (section 4.1) and the verifier enforces it |
| V1 | Demo account for voice | No demo account; review signs in with its own email (section 2.2). Decided 6 Oct (default). Residual: risk R10 |
| V2 | Guideline 4.7 | Decision 11 at its default: "Report this answer" ships, and the question goes to App Review with the submission (section 2.3). Residual: risk R9 |
| V3 | Microphone purpose string stripped and refused | The switch adds the approved string and the verifier requires it (section 4.5) |
| V4 | Consent and privacy copy rested on P10 to P13 | Filled with dated wording on `web/privacy-app`; the ElevenLabs dashboard check (decision 8) is Needs Jake 2 and changes only the date |
| V5 | Deletion policy (decision 5) and Worker routes | Decided 6 Oct (default); sign-in and deletion live on the Worker since 3 October 2026 |
| V6 | Review traffic spends real voice time | Decision 9 at its default: shared budget. The notes tell App Review the budget applies. Residual: risk R11 |
| V7 | Screenshots and B3 | Section 5 plans for the switch-on build, with a Talk frame |

### 6.2 The build-5 gate

Engineering items for the OPAX orchestrator, not for Jake. Build 5 is the first build with voice; it must pass the usual QA gate plus these before it is the submission build.

1. **Talk and Account merged.** `ios/talk-sheet` and `ios/account-ui` merge into `ios/app`; voice-prod phase 2 replaces the production twins, which still resolve to the placeholders (`mobile/src/app/talk.tsx:1-2`, `mobile/src/app/account/index.tsx:1`; `ComingSoon.tsx:10-75`), and the production Account screen has no "Development" section.
2. **Switch on.** The release is built with `OPAX_PRODUCTION_VOICE=1`, both release verifiers pass in that mode, the switch-on app is launched once on a simulator, and upload refuses a build whose recorded switch does not match (section 4.3).
3. **"Report this answer" wired.** Talk passes a source's record path, not answer text, with a mode for answers that cite no record (`report-answer.ts:12-29` takes a path; `AnswerCaption.tsx:27` on `ios/talk-sheet` passes text). `supportPageAvailable` is set only after `/support` is live (`report-answer.ts:6-7`).
4. **The privacy and support pages deployed** from `web/privacy-app` (its placeholder guard passes), then checked live: `/privacy`, `/support`, `/support?record=<path>`.
5. **About updated** (`About.tsx:295-316`): "Corrections and contact" points to `/support`; "Privacy policy" points to `/privacy`; the privacy text states the retention facts and what voice sends; the notice about people who have died is added.
6. **Minimum age in the app.** The sign-in screen and Talk's sign-in prompt say "Accounts and voice are for people aged 16 and over", as the website does (`copy.ts:27-30` on `ios/account-ui`; `TalkScreen.tsx:296-298` on `ios/talk-sheet`).
7. **Consent wording dated.** Talk's consent screen gives the ElevenLabs settings as last checked, matching the privacy page, not as a standing policy (`TalkScreen.tsx:315-318` on `ios/talk-sheet`; `docs/PRIVACY.md:94` on `web/privacy-app`).
8. **Version 1.0.0** in `mobile/app.config.ts:55,141` and the release tooling (`mobile/scripts/release-ios.sh:64,68,77`).
9. **Portraits, if `ios/portraits` is in the build:** leave out the two GFDL and two "copyrighted free use" files, and add "cropped" to the Commons credit; the website's credits change in the same way.
10. **Person search filtered to the verified roster** (risk R1), or non-member rows labelled, before submission.
11. **Labels rechecked.** Every quoted label in sections 2.1, 2.6 and 5.3 is checked against the submitted build, and the notes are recounted (4,000-byte limit).
12. **Screenshots captured** under section 5, then the iPad compatibility run for risk R5.

### 6.3 Risks still open

| ID | Guideline | Risk | Evidence | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | 5.1.1(viii) | The largest review risk. Native profiles exist only for roster parliamentarians, but person search returns rows from the compiled catalog, 1,557 in the current manifest; 414 are surname-only and 63 appear only in Senate committee Hansard. The app shows the rows it gets back (non-roster names open on opax.com.au). Electorate pages list candidates with their votes, as published | `mobile/src/features/search/navigation.ts:9-14,32`; `portal/src/catalog-search.ts:45-50`; `scripts/build_search_catalog.mjs:45-46`; `portal/public/search-catalog/manifest.json` | The review notes explain the scope. Gate item 10 |
| R2 | 4.2 | Low to medium. Some blocks hand off to the website, each labelled "Opens on opax.com.au" | `mobile/src/design/record.tsx:120-136`; `external.ts:317-329` | The notes list native features; voice, the outline map and offline reading add native depth |
| R3 | 2.3.6 | "Unrestricted web access" answered No. A reviewer could read the in-app Safari view as web access, which would make the rating 16+; "Report this answer" also opens GitHub there until `/support` is set | `external.ts:266-293`; `report-answer.ts:30-47` | Keep No. If App Review disagrees, open source links in Safari |
| R4 | 1.1.1, 1.1.6 | Low. Facts with sources and dates, labelled machine text, "leads, not findings". Some daily editions compare parties, in balanced order | `Today.tsx:112-114`; `mobile/src/features/EditionCard.tsx:30-35` | Keep caveats visible; corrections through `/support` |
| R5 | 2.4.1 | iPhone only; App Review can run it on iPad in compatibility mode | `app.config.ts:69` | Gate item 12; Mac and Vision Pro availability off |
| R6 | 5.1.1 | The source-link checker accepts opax.com.au, so a catalog source link on the site itself would load the website's analytics in the in-app Safari view; whether any row carries one is unverified | `external.ts:238-264` | Route opax.com.au hosts through `openOnWeb` |
| R8 | 5.2, 5.2.1 | Official portraits are CC BY-NC-ND 4.0 and the website's files are crops; the app also clips portraits to a circle. Applies to the website too. Accepted by Jake ("I will fix the licensing stuff later") | Section 3.4; `scripts/backfill_photos_oa.py:29` | No APH portraits in screenshots. Later fix: resized-only files from uncropped originals, or the Parliament's permission |
| R9 | 4.7 | If App Review treats Talk as 4.7 software: filtering, timely responses, per-instance consent, a universal-link index (W17) and a verified or declared age gate | Section 2.3 | The notes ask the question up front; the work is listed in section 2.3 |
| R10 | 2.1(a) | App Review may insist on a demo account. Codes go by email, and OPAX has no mailbox a reviewer could open | Section 2.2 | Review uses its own email. If rejected: a mailbox App Review can read (follows from Needs Jake 3) or a review-only route, which is a Worker change |
| R11 | 2.1 | Review spends real voice time: 600 seconds per account inside the shared 40,000-second monthly budget and two concurrent calls; a busy month could show "closed for the rest of this month" to the reviewer | IOS-APP.md section 5; `model.ts:64-65` on `ios/talk-sheet` | Submit early in a month; the notes explain the message |
| R12 | 1.5 | The support page has no email, address or phone, only public GitHub issues, until an inbox exists | Section 1.2 | Needs Jake 3; decision 12's interim wording is honest about it |

### 6.4 Nice-to-have

| ID | Item | Fix |
| --- | --- | --- |
| N3 | Accessibility Nutrition Labels | Fill after the AX5 release gate, from its evidence |
| N4 | Marketing page | `/app` page as in section 1.2 |
| N5 | Promotional text | Changes without a new build; use it for coverage news |

## 7. Needs Jake

Only these three need Jake. Everything else is decided (section 8) or is engineering in the build-5 gate (section 6.2).

1. **Submit.** After the build-5 gate passes: in App Store Connect, set the version to 1.0.0, enter sections 1 to 4 and the screenshots, choose build 5 (or later), fill the App Review contact with his own details, and submit. Decision 11 says to ask App Review about 4.7 before submission; the notes ask it, and he can also send the question through App Review's contact form first.
2. **ElevenLabs dashboard check (decision 8).** Confirm recording off, one-day transcript deletion and the agent's model, then make the first real call and sign-in on his iPhone with build 5. If anything differs, the privacy page, the consent wording and section 4.2 change; if it matches, only the "last checked" date changes.
3. **A private inbox (P3).** A monitored address for support, corrections and privacy requests. When it exists, `/support`, `/privacy`, About and the review notes name it, and risks R10 and R12 shrink.

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
| Support and privacy (decision 12) | `/support` and `/privacy` on opax.com.au from `web/privacy-app`; interim wording and public GitHub issues until an inbox exists; review contact through `/support` | Decided 6 Oct (default) |
| Content rights (decision 13) | Yes; licence items never block | Decided 6 Oct (default) |
| Store screenshots (decision 13) | No APH portraits | Decided 6 Oct (default) |
| Privacy label (decision 14) | Section 4.1, matching the switch-on manifest | Decided 6 Oct (default) |
| Account deletion policy (decision 5) | As in section 2.4 | Decided 6 Oct (default) |
| Provider settings (decision 8) | Documented settings; Jake checks the dashboard and makes the first call | Decided 6 Oct (default) |
| Voice budget (decision 9) | Shared with the web | Decided 6 Oct (default) |
| Voice behaviour (decision 10) | End on background; consent once, disclosure before every call | Decided 6 Oct (default) |
| Guideline 4.7 (decision 11) | Ship "Report this answer"; ask App Review | Decided 6 Oct (default) |
| Demo account | None; review signs in with its own email | Decided 6 Oct (default) |
| Marketing URL | Empty | Decided 6 Oct (default) |

## 9. Claims not verified in this pass

- **Lane labels.** Talk and Account labels come from `ios/talk-sheet` at `6cb7c7d4` and `ios/account-ui` at `078031c9`, both unmerged and still changing; gate item 11 rechecks them.
- **Live retention.** Log (7 days) and analytics (31 days) retention come from the privacy branch's read-only checks and Cloudflare's documentation (`docs/PRIVACY.md:19-20` there). Whether Workers Logs entries hold IP fields was not readable by API; the label declares IPs either way.
- **Linkage of log entries for account routes.** The label treats search history and IP addresses as not linked. Public catalog requests carry no cookie (`client.ts:126`); whether log entries for the ten account and voice routes hold anything that identifies the member was not checked.
- **ElevenLabs settings.** Recording off and one-day transcripts are as recorded on 9 September 2026 (Needs Jake 2).
- **Build selection.** That App Store Connect offers a 1.0.0 build for a version renamed 1.0.0 is expected, not tested.
- **Person search rows (R1)** and **opax.com.au source links (R6)**: as on 5 October; no production search was run.
- **How App Review reads** the in-app Safari view (R3), guideline 4.7 (R9) and own-email sign-in (R10).
- **Age rating.** Read from Apple's published table; App Store Connect computes the real one. Counts come from the repository copies and word matching.
- **Support page contact requirements.** Which of address, email and phone Australian law requires is a legal question.
- **Portrait crops.** Whether a crop or a circular mask is an adaptation under CC BY-NC-ND is a legal question.
- **Screens on a device.** No simulator or device run was made in this pass.
- **App Privacy answers already in App Store Connect.** Not readable through the API.
