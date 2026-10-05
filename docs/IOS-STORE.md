# OPAX iOS: App Store submission readiness

Written 5 October 2026. This document prepares the first App Store submission of the OPAX iPhone app: listing copy, App Review notes, the age rating, export compliance and content rights answers, a draft App Privacy label, a screenshot plan and a gap list against the App Store Review Guidelines. It does not submit anything. Nothing here has been entered in App Store Connect.

**What was checked.**

- The app at commit `a8bec98f` (`mobile/`), the build 3 integration base. Build 2 (version 0.1.0, build 2) is the build in TestFlight Internal: Today, Your MP, member profiles, electorates, Bills, Search, and About and sources.
- Apple's [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), "Last Updated: June 8, 2026", and the App Store Connect help pages linked in each section, read on 5 October 2026.
- The App Store Connect record, read with GET requests only on 5 October 2026. The record exists as "OPAX" with primary language English (Australia). Version 1.0 is in Prepare for Submission. Subtitle, description, keywords, promotional text, support URL, marketing URL, privacy policy URL, copyright, categories, content rights, the age rating questionnaire and the App Review information are all empty. Builds 1 and 2 are valid and report `usesNonExemptEncryption: false`. The App Privacy answers are not readable through the API and were not checked.
- The live website, read on 5 October 2026: `/about` and `/methods` load; `/privacy`, `/support` and `/contact` return 404.

Related documents: [IOS-APP.md](IOS-APP.md) (decisions, sections 6 and 11), [IOS-UX.md](IOS-UX.md) (sections 6 and 8), [IOS-RELEASE.md](IOS-RELEASE.md) (build and TestFlight tooling).

**Status in one line.** The listing copy, review notes and questionnaire answers below are ready to enter. Submission is blocked by seven gaps in section 6: a published contact and support page, a deployed privacy policy, placeholder sheets in the production build, the privacy label inputs, the rights review, unentered metadata, and the version number.

## 1. Listing copy

Every count below is in characters as App Store Connect counts them, checked with a script. Keywords are counted in bytes, which is Apple's unit for that field. No field uses an em dash.

| Field | Proposed | Count and limit | Evidence and notes |
| --- | --- | --- | --- |
| Name | OPAX | 4 of 30 | Already the record's name. `mobile/app.config.ts:47` (`name: 'OPAX'`) |
| Subtitle | Your MP, votes, bills and pay | 29 of 30 | Names four shipped features: Your MP tab, voting record, Bills tab, pay block (`mobile/src/app/(tabs)/_layout.tsx:21-28`, `mobile/src/features/Person.tsx:273,482`) |
| Subtitle, alternative | Parliament’s public record | 26 of 30 | Plainer, fewer search terms |
| Promotional text | Find your MP and senators and see their votes, declared interests, pay and expenses. Follow federal bills through parliament, with links to the records behind them. | 164 of 170 | Your MP shows member and senators (`mobile/src/features/YourMP.tsx:457`); profile blocks (`Person.tsx:273,370,482,578`); federal bill keys only (`mobile/src/api/policy.ts:25-26`) |
| Description | Section 1.1 | 2,440 of 4,000; 2,564 with the PENDING notice | Each claim is mapped to code in section 1.1 |
| Keywords | australia,parliament,senator,electorate,politician,legislation,interests,expenses,salary,civics | 95 of 100 bytes | No spaces. No word repeats the name or subtitle (OPAX, MP, votes, bills, pay). No app, company or trademark names, as App Store Connect requires ("Names of other apps or companies aren't allowed") |
| Primary category | Reference | | Apple's Reference definition lists "general research" and "politics" ([categories](https://developer.apple.com/app-store/categories/)) |
| Secondary category | News | | News covers "information about current events or developments in areas of interest such as politics". Today is a dated digest of new bills and declarations. Education is the fallback if News is not wanted |
| Support URL | `https://opax.com.au/support` | | 404 today. Contents in section 1.2. Required field |
| Marketing URL | Leave empty for now; later `https://opax.com.au/app` | | Optional field. Contents in section 1.2 |
| Privacy policy URL | `https://opax.com.au/privacy` | | 404 today. The page is drafted on branch `web/privacy-app` (approved at `89781797`) with 16 placeholders; see section 4.5 |
| Copyright | 2026 [the responsible entity] | | Needs Jake (section 7) |
| Primary language | English (Australia) | | Already set |

The full name "Open Parliamentary Accountability Exchange" (42 characters) does not fit the subtitle, so it opens the description.

### 1.1 Description

```text
The Open Parliamentary Accountability Exchange (OPAX) is a reader for the public record of Australian politics. It brings together the recorded votes, declared interests, pay entitlements and reported expenses of members of parliament, with links to the records behind them. You can read it without an account.

Your MP
Search by electorate or member name to find your federal member and your senators. Where OPAX holds a verified roster of state members, you can add your state electorate too. Your choice is saved on this iPhone.

Member profiles
A profile shows the member’s recorded divisions, with ayes, noes and their votes on bills; interests declared on parliamentary registers; federal pay entitlements for the posts they hold; expenses reported by the Independent Parliamentary Expenses Authority; and a link to their party’s disclosed receipts. Blocks say where their figures came from and how current they are.

Electorates
An electorate shows its representatives, past election results and Census context, with sources.

Bills
Browse federal bills by status, chamber and year, or search them by title, sponsor or portfolio. A bill shows its key dates, the divisions on it with party splits, speeches made on it and the Act it became, where one is matched. Summaries written by a model from the explanatory memorandum are labelled as machine-written and are not the record.

Today
Recently introduced bills, recent declarations of interests and the latest daily edition published on opax.com.au.

Search
Search people, declared interests, pay and expenses. Suggestions for people, electorates and bills appear as you type.

Offline and sharing
Records you have opened recently stay readable offline, marked with when they were saved. Share a link to the matching page on opax.com.au.

Independent and non-partisan
OPAX is independent and non-partisan. It is not a government app and is not affiliated with any parliament, government or political party. Patterns in the public record are leads, not findings: check the linked sources.

Sources
The data comes from public sources, including the Parliament of Australia, They Vote For You, the Australian Electoral Commission, the Independent Parliamentary Expenses Authority and the Remuneration Tribunal. Each source keeps its own copyright and licence, and the About and sources screen lists them.

The app needs no account and has no advertising, in-app purchases or analytics.
```

**PENDING (IOS-APP.md decision 15).** If Jake adopts the notice about people who have died, append it as the last paragraph (122 characters; the description is then 2,564): "Aboriginal and Torres Strait Islander readers are advised that this app contains names and images of people who have died." The same notice belongs on the About screen.

**Evidence for each claim.**

| Claim | Evidence |
| --- | --- |
| Read without an account; no sign-in in this build | `mobile/src/features/ComingSoon.tsx:33` (signing in is not in this version); no credential on public requests (`mobile/src/api/client.ts:126`, `credentials: 'omit'`) |
| Search by electorate or member name; federal member and senators | `mobile/src/features/YourMP.tsx:200` (field "Electorate or member’s name"), `:457` ("Your senators") |
| State members only where a verified roster exists | `mobile/src/features/YourMP.tsx:479-528`; `mobile/src/api/selectors.ts:1085-1087` |
| Choice saved on the iPhone | `mobile/src/features/your-mp/choice-store.ts:3` (document file `opax-seat-v1.json`); on-screen text `YourMP.tsx:210` |
| Recorded divisions, ayes, noes, bill votes | `mobile/src/features/Person.tsx:273-339` |
| Declared interests from parliamentary registers | `Person.tsx:370`; House, Senate and Queensland registers named on About (`mobile/src/features/About.tsx:214-217`) |
| Federal pay entitlements | `Person.tsx:482-486` ("Pay for the posts held"; state pay is outside the series) |
| Expenses reported by IPEA | `Person.tsx:578-581` (coverage from April 2017); About `:238-243` |
| Link to the party's disclosed receipts | `Person.tsx:694-708` (opens on opax.com.au) |
| Blocks name their source and date | `AsAtLine` and `EvidenceFooter` on profile blocks, for example `Person.tsx:201-204,229`; IOS-APP.md section 4 ("Every block shows an 'As at' line") |
| Electorate representatives, elections, Census context, sources | `mobile/src/features/Electorate.tsx:157,181,244,319` |
| Bills: status, chamber and year filters; search by title, sponsor or portfolio | `mobile/src/features/bills/BillsList.tsx:77,92-99`; `mobile/src/api/selectors.ts:776-790` (searched fields); `mobile/src/features/bills/BillFilters.tsx:33,54,75` |
| Bill: key dates, divisions with party splits, speeches, Act | `mobile/src/features/bills/BillDetail.tsx:455,509,620,686`; party splits `mobile/src/features/bills/parts.tsx:260` |
| Machine summaries labelled, not the record | `BillDetail.tsx:408-417` ("Machine summary" and the stored attribution); About `:287-293` |
| Today: new bills, recent declarations, daily edition | `mobile/src/features/Today.tsx:59-111`; edition route `policy.ts:22` (live on 5 October 2026) |
| Search kinds and suggestions | `mobile/src/features/search/model.ts:5-28`; `mobile/src/features/Search.tsx:182,278,295,317` |
| Offline reading, marked with save time | Disk cache `mobile/src/api/disk-store.ts:15`; saved-time notices on profile blocks (`mobile/src/features/your-mp/Evidence.tsx:43-50`, `mobile/src/design/states.tsx:19,190-202`) and the offline journey `mobile/.maestro/04-offline.yaml`. Search results are not saved (`mobile/src/api/cache.ts:134`), which "Records you have opened" respects |
| Share a link to opax.com.au | `mobile/src/navigation/share.ts:17-38`; Share buttons on profile, electorate and bill (`Person.tsx:135`, `Electorate.tsx:116`, `BillDetail.tsx:143`) |
| Independence statement | `ComingSoon.tsx:5-6`, `About.tsx:93-95`, `Today.tsx:57` |
| "Leads, not findings" | `Today.tsx:112-114` |
| Sources named | About `:203-253`; Census and electoral sources carry their own licence in the electorates release (`selectors.ts:1088-1095`) |
| No advertising, in-app purchases or analytics | `mobile/package.json` has no ad, purchase or analytics package; `mobile/scripts/verify-ios-release.py:29-36,487-492` rejects analytics SDKs and hosts; build 2 passed those checks |

The description makes no promise about voice or sign-in, which are not in this build (guideline 2.3.1(a)). The [IOS-UX.md drafts](IOS-UX.md#app-store-drafts-for-jake) mention talking to OPAX and must not be used for v1.

### 1.2 Support and marketing pages

App Store Connect says the support URL "must lead to actual contact information (legal address, email address, telephone number), as may be required by local law" ([platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)). Guideline 1.5 asks that the app and its support URL "include an easy way to contact you".

**`https://opax.com.au/support` must contain:**

- A monitored contact email address for support, corrections and privacy requests (one address can serve all three), plus whatever postal address or phone number legal advice says is needed.
- How to report a data error: what to include (the page or record link, what is wrong, the source that shows it) and what happens next. The same route serves corrections and, once voice ships, "Report this answer" (IOS-APP.md decision 11).
- The independence statement, word for word as in the app.
- Short answers: no account needed to read; where the data comes from, with links to Methods and source terms; how current it is (each block's as-at line); why a portrait can be a blank circle (only openly licensed portraits are shown); why state members appear for some states only (verified rosters).
- Supported devices: iPhone, iOS 18.4 or later (`mobile/app.config.ts:62-63`).
- Links to the privacy policy (`/privacy`), Methods (`/methods`) and the source code repository.

The site is a single-page app, so `/support` needs a panel, a route, a sitemap entry and footer links, as `/privacy` has on its branch. That is a web deployment and needs Jake's OK.

**Marketing URL (optional).** Leave it empty for the first submission. If a page is wanted later, `https://opax.com.au/app` would carry the description's opening paragraph, two or three of the store screenshots, the App Store link once live, the independence statement and links to support and privacy.

## 2. App Review notes

### 2.1 Notes to paste

These notes assume gap B3 is fixed, so the production build has no Talk sheet and no sign-in text. If a build still shows them, replace the second paragraph with: "The Talk button and the Account sheet show that voice and sign-in are not in this version. They have no other function." The text is 2,845 bytes of the 4,000 the Notes field allows.

```text
OPAX is a free, read-only reader for the public record of Australian politics. No account, sign-in or demo account is needed. The app has no in-app purchases, advertising, analytics or tracking.

This version contains Today, Your MP, member profiles, electorates, Bills and Search, plus About and sources. Voice and sign-in are not in this version and are not in the build.

Content. The app shows public records published by Australian parliaments and public agencies: recorded divisions, registers of members' interests, pay entitlements set by the Remuneration Tribunal, expenses reported by the Independent Parliamentary Expenses Authority, federal bills, and electorate and election results. Blocks name their source and how current they are. Native profiles exist only for members of parliament on OPAX's verified roster, as public office holders, and cover their official records. Other people named in public records do not get a profile in the app.

Machine-written text. Bill summaries and speech briefs were written in advance by a language model and stored. The app labels them "Machine summary" or "Machine brief" with an attribution line, and it makes no AI or model requests.

Sources and licences are listed in the app: tap the person icon at the top right of a tab's first screen, then "About and sources".

OPAX is independent and non-partisan. It is not a government app and is not affiliated with any parliament, government or political party.

Walkthrough (about three minutes, no account):
1. The app opens on Today: the independence line, the latest daily edition, recently introduced bills and recent declarations.
2. Your MP tab: type an electorate such as Grayndler and tap it. The screen shows the seat, its member and senators. Tap the member's name for the profile: voting record, declared interests, pay, expenses and party receipts. The Share button is at the top right.
3. On Your MP, tap "Electorate record": representatives, elections (tap "Candidates and recorded votes"), Census context and sources.
4. Bills tab: search by title or tap Filters (status, chamber, year). Open a bill: a labelled machine summary, key dates, divisions with party splits, speeches and the Act it became.
5. Search tab: type a surname. Suggestions appear for people, electorates and bills. Submit to search; the "Kind" menu switches between People, Declared interests, Pay and Expenses.
6. Source links open the original record in an in-app Safari view. Links marked "Opens on opax.com.au" open Safari.
7. Offline: open a profile, turn on Airplane Mode, then reopen it. The saved copy shows, marked with when it was saved.

The app needs a network connection on first launch to load public data from opax.com.au.

Contact for this review: [review contact name, email and phone]. Support and corrections: https://opax.com.au/support
```

The bracketed contact is the App Review contact, which App Store Connect also asks for separately (name, email, phone in international format).

### 2.2 Sources and licences, as the app states them

From the About and sources screen (`mobile/src/features/About.tsx:203-285`). The app states each licence as a fact and does not grant a new one (`About.tsx:271-272`).

| Source | Used for | Licence as the app states it |
| --- | --- | --- |
| Parliament of Australia | Registers of interests, bills, the Hansard record behind divisions | Parliamentary copyright; Hansard reproduced under CC BY-NC-ND terms; House and Senate registers CC BY-NC-ND, shown as extracted facts with links |
| Queensland register of interests | Declared interests for Queensland members | No verified licence in the source review |
| They Vote For You | Compiled division data | Open Data Commons Open Database Licence; the underlying Hansard keeps parliamentary copyright |
| AEC Transparency Register | Party receipts (linked on opax.com.au) | Creative Commons Attribution; versions vary by source |
| Independent Parliamentary Expenses Authority | Claimed expenses | CC BY 3.0 AU (data.gov.au) |
| Remuneration Tribunal | Pay entitlements | Entitlements set by instrument, not payslips; refer to each record's terms |
| Electorates release (boundaries, elections, Census) | Electorate records | Per source, shown with each record (`mobile/src/api/selectors.ts:1088-1095`) |
| Wikimedia Commons portraits | Member portraits | Shown only under CC BY, CC BY-SA, CC0 or public domain, with credit and licence link (`selectors.ts:223-238`, `Person.tsx:231-263`). Official APH portraits are never displayed (`selectors.ts:210-220`) |
| Merriweather, Public Sans | Fonts | SIL Open Font License 1.1; notices in the app (`About.tsx:318-348`) |
| OPAX code | The app | AGPL-3.0, with a link to the repository (`About.tsx:279-285`) |

### 2.3 Reviewer walkthrough, with evidence

| Feature | How to reach it | What the reviewer sees | Evidence |
| --- | --- | --- | --- |
| Today | Opens first | Independence line, Daily edition, Recently introduced bills, Recent declarations | `mobile/src/app/(tabs)/_layout.tsx:17`; `Today.tsx:51-115` |
| Your MP | Tab 2; type an electorate; tap it | Seat, member, senators, state members where verified, Change seat, AEC electorate finder link | `YourMP.tsx:194-260,457-545`; Maestro `07-your-mp.yaml` uses Grayndler |
| Member profile | Tap the member on Your MP | Portrait or blank circle, party, seat, as-at line, voting record, declared interests, declared ties, pay, expenses, party receipts, Share | `Person.tsx:160-727` |
| Electorate | "Electorate record" on Your MP, or a seat button on a profile | Latest verified representation, elections with candidates and votes, Census, related constituencies, sources | `Electorate.tsx:139-330`; `YourMP.tsx:284-290` |
| Bills | Tab 3 | Search field, Filters sheet (Status, Chamber introduced in, Year) | `BillsList.tsx:74-104`; `BillFilters.tsx` |
| Bill detail | Tap a bill | In short (machine summary label first), Key dates, Divisions, Party splits, Speeches with machine briefs, What became law, Sources | `BillDetail.tsx:206-703` |
| Search | Tab 4 | Field "Search people, places and bills", suggestions, Kind menu | `Search.tsx:182-470`; `KindPicker.tsx` |
| About and sources | Person icon (top right on a tab's root screen), then "About and sources" | Coverage, sources and licences, machine-written text, corrections and contact, privacy policy link, font notices | `mobile/src/navigation/chrome.ts:57-63`; `mobile/src/features/ComingSoon.tsx:47-51`; `About.tsx` |
| External links | Any source link | In-app Safari view, visibly presented (5.1.1(vii)); "Opens on opax.com.au" links leave for Safari | `mobile/src/navigation/external.ts:266-293,317-329` |

## 3. Questionnaires

### 3.1 Age rating

The App Store Connect record has no answers yet; every field below was empty on 5 October 2026. Field names are the App Store Connect API's. Definitions and the rating table are from [Age ratings values and definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions). Guideline 2.3.6 asks for honest answers.

Content counts below use the repository copy of `portal/public/bills/index.json` (2,989 bills), matched by title words on 5 October 2026.

| Question (API field) | Answer | Reason | Evidence |
| --- | --- | --- | --- |
| Parental controls (`parentalControls`) | No | The app has none | No such feature in `mobile/src` |
| Age assurance (`ageAssurance`) | No | No age checks | As above |
| Unrestricted web access (`unrestrictedWebAccess`) | No | No browser or address bar. A source link opens one checked HTTPS page in an in-app Safari view; opax.com.au pages open in Safari outside the app. See risk R3 | `external.ts:238-264` (link checks), `:266-293`, `:317-329` |
| User-generated content (`userGeneratedContent`) | No | No community features in v1 | IOS-APP.md section 3; no community routes in `mobile/src/app` |
| Social media (`socialMedia`, `socialMediaAgeRestricted`) | No | None | As above |
| Messaging and chat (`messagingAndChat`) | No | None. Voice, a future feature, is not in this build | `mobile/plugins/withVoiceAutolinking.js:17` |
| Advertising (`advertising`) | No | None | `verify-ios-release.py:29-36` |
| Profanity or crude humour (`profanityOrCrudeHumor`) | None | The app shows titles, register entries, figures and labelled summaries, not speech transcripts | `BillDetail.tsx:620-665` (speeches show a brief and link to the web) |
| Horror or fear themes (`horrorOrFearThemes`) | None | None | |
| Alcohol, tobacco or drug use or references (`alcoholTobaccoOrDrugUseOrReferences`) | None | Judgement call. 37 bill titles name tobacco, alcohol, vaping or drugs as subjects of regulation or tax (for example "Combatting Illicit Tobacco Bill 2026"), and registers can list gifts such as wine. Apple's descriptor is about consumption; none of this depicts or refers to it. Answering "Infrequent" would make the rating 13+ | `portal/public/bills/index.json` |
| Medical or treatment information (`medicalOrTreatmentInformation`) | None | Health bills appear as legislation; the app gives no diagnosis or treatment guidance | |
| Health or wellness topics (`healthOrWellnessTopics`) | None | No self-care or lifestyle advice | |
| Mature or suggestive themes (`matureOrSuggestiveThemes`) | Infrequent | Apple's definition includes "real-world crimes, psychological trauma or abuse ... or war or political strife". 149 bill titles use words such as crime, violence, abuse or terrorism, and summaries describe them. They are the subject of legislation, not the app's focus | `portal/public/bills/index.json` |
| Sexual content or nudity (`sexualContentOrNudity`, `sexualContentGraphicAndNudity`) | None | None | |
| Cartoon or fantasy violence (`violenceCartoonOrFantasy`) | None | None | |
| Realistic violence (`violenceRealistic`, `violenceRealisticProlongedGraphicOrSadistic`) | None | Legislation about violence is not a depiction of physical conflict | |
| Guns or other weapons (`gunsOrOtherWeapons`) | Infrequent | The descriptor covers "references to" guns; six bill titles name firearms or weapons | `portal/public/bills/index.json` |
| Gambling, simulated gambling (`gambling`, `gamblingSimulated`) | None | No betting. 29 titles name gambling legislation, which is not gambling | |
| Contests, loot boxes (`contests`, `lootBox`) | None | None | |
| Made for Kids (`kidsAgeBand`) | Not applicable | Not a Kids category app | |
| Override (`ageRatingOverride`) | None | | |
| Age suitability URL (`developerAgeRatingInfoUrl`) | Empty | | |

**Result.** Infrequent mature or suggestive themes and infrequent guns or other weapons both sit at **9+** in Apple's table; nothing answered reaches 13+. Australia's regional values differ only for social media, loot boxes and simulated gambling, so the Australian rating is also 9+. Re-answer when voice ships: if guideline 4.7 applies, 4.7.5 adds an age restriction, and the privacy page's minimum age (placeholder P14) feeds that answer.

### 3.2 Export compliance

**Answer: the app uses only encryption that is exempt from export documentation (HTTPS through iOS).**

- **The key.** `ITSAppUsesNonExemptEncryption` is `false` in the app's Info.plist, set in `mobile/app.config.ts:65`. Apple: set it to NO when the app "either uses no encryption, or only uses encryption that's exempt from export compliance requirements"; with the key present, App Store Connect skips the encryption questions ([ITSAppUsesNonExemptEncryption](https://developer.apple.com/documentation/bundleresources/information-property-list/itsappusesnonexemptencryption)). Apple's export documentation says HTTPS through the operating system is typically exempt ([Complying with encryption export regulations](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations)).
- **How it is enforced.** The release verifier requires the key to be false (`mobile/scripts/verify-ios-release.py:419`, check "standard HTTPS encryption compliance", passed for build 2). The TestFlight script refuses a build that reports non-exempt encryption and sets `usesNonExemptEncryption: false` only when App Store Connect has no value (`mobile/scripts/asc-testflight.py:143-147`). On 5 October 2026 builds 1 and 2 both reported `false`.
- **What the app encrypts.** HTTPS to `https://opax.com.au`, the only production origin (`app.config.ts:19-24`), under App Transport Security defaults: production builds carry no ATS exception (`app.config.ts:67-80`; verifier check "no ATS exception"). `mobile/package.json` has no cryptography package.
- **Later.** The voice core, excluded from production builds, uses `URLSessionWebSocketTask` over TLS, which is also the operating system's encryption (IOS-APP.md section 4). Recheck when it ships.
- Apple notes that exempt use "might" still call for a year-end self-classification report to the U.S. government. That is a legal question, not answered here.

### 3.3 Content rights

App Store Connect asks whether the app "contain[s], show[s], or access[es] third-party content" and, if so, whether it has "all the necessary rights to that content" ([app information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information)). The field is empty today.

- **First answer: yes**, the app contains third-party content: the sources in section 2.2.
- **Second answer: PENDING** the rights review (IOS-APP.md decision 13). Do not assert the rights until it is done. The questions it has to settle are in gap B5.

## 4. Privacy nutrition label draft

### 4.1 Expected answer

**"Data Not Collected"**, with tracking "No", for this build, **PENDING placeholders P5 and P6.**

Apple defines collection as "transmitting data off the device in a way that allows you and/or your third-party partners to access it for a period longer than what is necessary to service the transmitted request in real time", and lists "an authentication token or IP address ... sent on a server call and not retained" as not collected ([App privacy details](https://developer.apple.com/app-store/app-privacy-details/)). Two things the app sends may be retained longer: the words of a catalog search, which reach the server in the URL, and the IP address of every request. Whether either counts depends on how long Cloudflare keeps them, which only Jake can confirm.

### 4.2 What leaves the phone, checked against the code

| Path | What is sent | Kept by OPAX or a partner? | Label consequence | Evidence |
| --- | --- | --- | --- | --- |
| Public catalogs and portraits | GET of allow-listed static files and `/photos/<id>.webp` from `https://opax.com.au`, with the IP address and the User-Agent `OPAX-iOS/<version> (<build>)` | Served as static assets: they do not reach the Worker or its logs. Cloudflare's own security and traffic analytics see the IP (P6) | None, unless P6 shows IP retention Jake chooses to declare | `mobile/src/api/policy.ts:4-17`; `mobile/src/api/portrait-policy.ts:3-6`; `mobile/src/api/client.ts:126-131`; `portal/wrangler.jsonc:15` (`run_worker_first` lists `/api/*`, not catalog files) |
| Catalog search | `GET /api/search-all?q=<words>&kind=<person, interest, pay or expense>` | Handled by the Worker. Workers Logs record every invocation with its URL, including the search words. Retention is 3 days on Workers Free or 7 on Workers Paid; whether entries hold the IP is unconfirmed (P5) | **PENDING P5.** If the logs keep the URL beyond the request, declare **Search History**, purpose App Functionality, not used for tracking; linked to the user only if the entries hold the IP | `mobile/src/api/policy.ts:2,44-77`; `portal/wrangler.jsonc:32-35` (`head_sampling_rate: 1`); the privacy page draft: "Each log entry records the address requested, which for a search includes the search words" |
| Search words to other services | None. Catalog kinds stay on OPAX's server and never reach Progress or a model | No | None | Never-call rule, IOS-APP.md section 2; the privacy page draft's "Questions and searches"; `policy.ts:49-77` refuses `all` and `bill` |
| `/api/person-slugs`, `/api/app/v1/edition/latest` | GET with no user input | Logged URL holds nothing about the reader | None | `policy.ts:22,80-88` |
| IP address on each request | Read by Cloudflare's per-address rate limiters over 60-second windows; may appear in Workers Logs (P5) and security analytics (P6) | Rate limiter counts cover 60-second windows; logs and analytics unconfirmed | **PENDING P5, P6.** Apple has no IP data type and says to "declare the relevant data types based on how you use IP address". OPAX derives no location or identifier from it, so no type applies unless Jake treats retained logs as Other Data | Privacy page draft, "Reading the record"; IOS-APP.md section 6 |
| Seat choice | Nothing; a file in the app's documents | On device only | None | `mobile/src/features/your-mp/choice-store.ts:3-17` |
| Offline cache | Nothing; responses saved in the app's cache directory, at most 12 MB | On device only | None | `mobile/src/api/disk-store.ts:15`; `mobile/src/api/cache.ts:43` |
| Search results | Nothing further; kept in memory for the session | Not saved | None | `cache.ts:134` (`memoryOnly`); About `:305-308` |
| Share | The system share sheet gets a canonical URL and a title built on the phone; no page or image fetch | No | None | `mobile/src/navigation/share.ts:17-38` |
| opax.com.au pages | Opened in Safari, outside the app | The website's own analytics apply to Safari, as for any visit | None for the app. Apple's web-view rule covers web traffic inside the app | `external.ts:317-329` (`Linking.openURL`) |
| Source records | Opened in an in-app Safari view on the source's own site | Third-party sites the reader navigates to | None: Apple exempts "enabling the user to navigate the open web" | `external.ts:266-293`; see risk R6 |
| Crash reports, analytics, SDKs | None from OPAX. Eight shipped frameworks and no analytics or crash-reporting SDK. Apple's own diagnostics are Apple's to disclose | No | None | `verify-ios-release.py:29-36,266-270,487-492`. In the build 2 archive, the app's privacy manifest and the seven SDK manifests each declare no collected data types and `NSPrivacyTracking` false |
| Credentials | None. Public requests omit credentials and refuse redirects | No | None | `client.ts:126-127` |
| Permissions | None. The build has no purpose strings, so it cannot ask for the microphone, location, contacts or photos | No | None | `verify-ios-release.py:423` |

### 4.3 Answers in App Store Connect

| Question | Draft answer | Status |
| --- | --- | --- |
| Do you or your third-party partners collect data from this app? | No ("Data Not Collected") | PENDING P5 and P6 |
| If P5 shows URLs with search words are kept: Search History | Collected; App Functionality; not linked (or linked, if log entries hold the IP); not used for tracking | Alternative to the line above |
| Tracking | No; no App Tracking Transparency prompt | Ready |
| Privacy policy URL | `https://opax.com.au/privacy` | PENDING deployment of the privacy page (section 4.5) |
| Privacy choices URL | Empty; optional | Ready |

If Search History is declared, add the same type to the app's privacy manifest through `ios.privacyManifests` in `mobile/app.config.ts`, so the manifest and the label agree (gap N2).

### 4.4 The privacy placeholders this label depends on

The privacy page draft carries 16 placeholders, P1 to P16, listed in `docs/PRIVACY.md` on branch `web/privacy-app` at `89781797`. That branch is not on the public remote yet.

| Placeholder | What it decides for v1 | Status |
| --- | --- | --- |
| P5, Workers Logs retention and whether entries hold IP addresses | Search History, and whether it is linked | PENDING |
| P6, how long Cloudflare security and traffic analytics keep IP addresses | Whether retained IPs need declaring | PENDING |
| P1, P2, P3 (publication date, responsible person or organisation, private contact) | The privacy policy's validity under 5.1.1(i), and its match with the App Store seller | PENDING |
| P4, P7 to P13, P15, P16 | Website, account and voice facts. They do not change the v1 label, but the deploy guard refuses to publish the page while any remains, so they block the privacy policy URL | PENDING |
| P14, minimum age for accounts and voice | Not used by v1; feeds the age rating when voice ships | PENDING |

### 4.5 Privacy policy link: in App Store Connect and in the app

- **App Store Connect**: `https://opax.com.au/privacy`. Live today: 404. The page is drafted and approved on `web/privacy-app` at `89781797`, and a guard (`scripts/check_privacy_placeholders.mjs`) blocks `npm run deploy` while any placeholder remains.
- **In the app**: About and sources has a "Privacy policy" link (`About.tsx:312-316`) to `/community?view=privacy`. Live today, that is the community page's "Account privacy" view, which predates the app. On `web/privacy-app` that address hands over to `/privacy`, so the link works once the page deploys, but it should point at `/privacy` directly.
- **In-app privacy text** (`About.tsx:302-310`) says "IP log retention is not yet confirmed" and "Voice uses an email address, member ID, audio and words". The first is pending text and the second describes a feature this build lacks; both go when P5 is answered and voice ships (gap B3).

### 4.6 After voice ships

Sign-in and voice add Email Address, User ID, Audio Data, Other User Content and usage data (voice minutes and times), all linked, App Functionality only, no tracking, as set out in [IOS-UX.md, section 8](IOS-UX.md#8-app-store-and-policy-notes) and [IOS-VOICE.md, section 6](IOS-VOICE.md#6-store-and-privacy-notes). The label and the privacy manifest change in the same release as the feature.

## 5. Screenshot plan

No captures in this pass. Captures happen after the build 3 QA gate, on simulators the OPAX orchestrator assigns.

### 5.1 Required sizes

From [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications), read on 5 October 2026:

- **6.9" display**, portrait, one of 1320 x 2868, 1290 x 2796 or 1260 x 2736 pixels. Capture at **1320 x 2868** on the iPhone 17 Pro Max simulator, the project's large reference device (IOS-APP.md section 8).
- **6.5" display** (1284 x 2778 or 1242 x 2688) is "Required if app runs on iPhone and screenshots for 6.9" display aren't provided". With 6.9" provided, it is not needed; smaller iPhone sizes are scaled from the larger set.
- **No iPad set**: the app is iPhone only (`supportsTablet: false`, `app.config.ts:63`).
- One to ten screenshots, JPEG or PNG, no alpha channel.

### 5.2 Capture rules

- **Build.** A production-variant build, so no Development section or fixture origin can appear. An e2e build with a pinned snapshot is acceptable for frames that never open the Account sheet, which shows a "Development" section outside production (`ComingSoon.tsx:53-63`).
- **Device state.** Light appearance (the app is light only, `app.config.ts:52`), default text size, language and region English (Australia), status bar overridden to 9:41 with full signal and battery.
- **Neutrality.** Frames 2 to 4 use two sitting members from different parties, neither a party leader nor a minister, and no frame shows a block that reads as a verdict on a person. Choose frames whose senator lists and party splits include Labor, the Coalition and the crossbench, following the balance rule in IOS-UX.md section 6.
- **Rights and audience.** No official APH portraits (the app never displays them, `selectors.ts:210-220`). A Commons portrait appears only with its credit in the same frame; otherwise choose a member whose profile shows the blank circle. No member who has died. No coat of arms, crest or party logo (the app bundles none: `mobile/assets` holds only the icon and fonts). Guideline 2.3.8 asks for 4+ suitable screenshots, so no bill about crime, firearms or gambling appears in a frame.
- **Captions** sit above the device image in Public Sans, plain sentence case, no claims beyond what the frame shows (guideline 2.3.3 allows text overlays).

### 5.3 Frames

| # | Screen | Data state | Caption (words) | Journey or fixture |
| --- | --- | --- | --- | --- |
| 1 | Your MP, seat chosen | A federal House seat with its member and that state's senators, from several parties; the Change seat button visible | Find your MP and senators (5) | `.maestro/07-your-mp.yaml`, with the seat chosen under the neutrality rule |
| 2 | Member profile, top | Member A: name, party label, seat, as-at line, voting record with recorded divisions, ayes and noes | A member’s recorded votes (4) | `.maestro/08-profile.yaml` |
| 3 | Member profile, declared interests | Member A: declared interests counts and Declared ties with source footer | Declared interests from the registers (5) | `.maestro/08-profile.yaml`, scrolled to `person-interests` |
| 4 | Member profile, pay and expenses | Member B (another party): Pay for the posts held and Claimed expenses by year, as-at lines visible | Pay and expenses, as reported (5) | `.maestro/08-profile.yaml` with member B |
| 5 | Bills list | Latest activity first, one filter chip applied, count line visible | Follow federal bills (3) | `.maestro/10-bills.yaml` |
| 6 | Bill detail, divisions | A passed bill on an uncontroversial subject, with a division and party splits expanded; machine summary label visible above or in a second take | Divisions and party splits (4) | `.maestro/11-bill-detail.yaml`, with a bill chosen under the rights and audience rule (its current fixture is a gambling bill) |
| 7 | Electorate | Representatives, an election with candidates expanded, Census context heading | Electorates, elections and Census (4) | `.maestro/09-electorate.yaml` |
| 8 | Search results (optional) | People kind, a common surname with results from several parties | Search people, interests, pay (4) | `.maestro/12-search.yaml` |

Today is left out because its daily edition changes every day and some editions compare parties.

## 6. Gap list

Ranked: **blocker** (submission should not go ahead), **risk** (could draw a rejection or a later problem), **nice-to-have**. Each row says what the app does today.

### Blockers

| ID | Guideline | Gap and what the app does today | Evidence | Fix |
| --- | --- | --- | --- | --- |
| B1 | 1.5, 2.1(a); decision 12 | No contact or support page. The app's About screen says "A corrections and contact address will be added here when it is confirmed." The live About page says "OPAX has no dedicated inbox" and points to GitHub issues. `/support` and `/contact` return 404 | `About.tsx:295-300`; live `/about` | Publish a monitored contact address and `/support` (section 1.2); put the address in About's "Corrections and contact"; use the page as the support URL |
| B2 | 5.1.1(i) | No privacy policy at the URL the listing needs. `/privacy` returns 404; the draft cannot deploy until its 16 placeholders are filled. The app links to `/community?view=privacy`, the older account privacy view | `About.tsx:312-316`; section 4.5 | Fill P1 to P16, deploy the page, enter `https://opax.com.au/privacy` in App Store Connect, change the app link to `/privacy` |
| B3 | 2.1(a) ("placeholder text ... should be scrubbed"), 2.3.1(a), 2.3 | Production builds show a Talk button on every tab's root screen that opens "Talk to OPAX is not in this version of the app yet", and an Account sheet that says "Signing in is not in this version of the app yet". About's privacy text describes voice data the build does not collect and says IP retention "is not yet confirmed" | `mobile/src/navigation/chrome.ts:47-65` (not gated by build variant), applied to the four root screens in `mobile/src/app/(tabs)/(today,your-mp,bills,search)/_layout.tsx:18-35`; `ComingSoon.tsx:14,33`; `About.tsx:295-310` | In production builds, hide Talk until voice ships and present the Account button as About; remove the pending sentences. The voice module itself is already excluded from production (`withVoiceAutolinking.js:17`) |
| B4 | 5.1.1, 2.3 (privacy information is metadata); decision 14 | The App Privacy answers cannot be final. Catalog search words reach Workers Logs in the URL, and IP retention in logs and analytics is unconfirmed | Section 4; `portal/wrangler.jsonc:32-35` | Answer P5 and P6, then choose "Data Not Collected" or declare Search History (section 4.3). Alternatively stop logging the query string on `/api/search-all`, which would keep "Data Not Collected" |
| B5 | 5.2, 5.2.1, 5.2.2; content rights; decision 13 | No rights review yet. Hansard and the House and Senate registers carry non-commercial, no-derivatives terms; Queensland's register has no verified licence; the code is AGPL-3.0. The app is free, with no ads or purchases. It shows registers as extracted facts with links, and machine-written summaries of explanatory memoranda and briefs of speeches. It never displays official APH portraits, only Commons portraits under open licences with credit, and bundles no parliament logo or crest | `About.tsx:203-285`; `selectors.ts:210-238`; `mobile/assets` (icon and fonts only); the icon is a gold map of Australia on navy (`mobile/assets/icon/icon.png`) | Before submission, settle: App Store distribution under the non-commercial terms; whether machine summaries and briefs are adaptations under no-derivatives terms; the unlicensed Queensland register; the AGPL question for code reused from the web. Then answer content rights (section 3.3) |
| B6 | 2.1(a) ("all necessary metadata"), 2.3 | App Store Connect metadata is empty: subtitle, description, keywords, support URL, privacy policy URL, copyright, categories, age rating, content rights, App Review contact and notes, screenshots | App Store Connect read, 5 October 2026 | Enter sections 1 to 3 once B1, B2 and B5 settle; capture section 5 after the build 3 gate |
| B7 | Build selection | The App Store version in App Store Connect is 1.0; the app's version is 0.1.0. App Store Connect files builds under their version number and asks you to choose from the builds uploaded for the version, so a 0.1.0 build is not expected to be offered for version 1.0 (section 8) | `mobile/app.config.ts:49`; IOS-RELEASE.md; App Store Connect read | Choose the release version. Recommended: build the submission as 1.0.0 (app config and release tooling), since guideline 2.2 keeps betas off the App Store and a 0.1 version reads as one; or rename the App Store version to 0.1.0 |

### Risks

| ID | Guideline | Gap and what the app does today | Evidence | Fix |
| --- | --- | --- | --- | --- |
| R1 | 5.1.1(viii) ("compile personal information ... even public databases") | The largest review risk; the guideline states no exception for office holders. Native profiles exist only for roster parliamentarians; other names open on opax.com.au. But catalog person search shows whatever the server's person catalog returns: `parliamentarians.json` (1,557 speech-derived entries in the 3 October snapshot) plus electorate-release members. The app does not filter these rows to the verified roster. Electorate pages list the candidates in each election record with their votes, as the electoral commission publishes them. Register entries can name family members, shown under the member | `Person.tsx:150-151`; `Search.tsx:396-410`; `mobile/src/features/search/navigation.ts:9-14`; `portal/src/index.ts:3340-3352`; `Electorate.tsx:195-235`; IOS-API-CONTRACT.md (1,557 entries) | Explain scope in the review notes (done in section 2.1). Confirm the person catalog holds parliamentarians only, or filter person results to roster identities in the app. Keep candidates as published results with no profile or link |
| R2 | 4.2, 4.2.2 | Low to medium. The app is native: saved seat, offline reading, native profiles, bills, electorates, search, share, Dynamic Type. Some blocks hand off to the website: speeches, party receipts, non-roster people, the daily edition's page. Each hand-off is labelled "Opens on opax.com.au" | `mobile/src/design/record.tsx:120-136`; `external.ts:317-329` | Keep hand-offs labelled; the review notes list the native features. P1 work (record reader, speeches) reduces hand-offs |
| R3 | 2.3.6; age rating | "Unrestricted web access" answered No. A reviewer could read the in-app Safari view, which lets the reader follow links onward from a source page, as web access; that answer alone would make the rating 16+ | `external.ts:266-293` | Keep the No answer with this reasoning. If App Review disagrees, open source links in Safari, as opax.com.au links already are |
| R4 | 1.1.1, 1.1.6 (political content) | Low. The app states facts with sources and dates, labels machine text, calls patterns "leads, not findings" and has no score. The daily edition is text OPAX publishes, shown frozen as posted; some editions compare parties (the 5 October 2026 edition shares grant dollars by party holding the seat), in the balanced Labor, Coalition, crossbench order. Bill titles are official names, including politically worded ones | `Today.tsx:112-114`; `mobile/src/features/EditionCard.tsx:30-35`; IOS-UX.md section 6 | Keep the caveats visible; the corrections route from B1 serves complaints |
| R5 | 2.4.1 | The app is iPhone only. App Review can run iPhone apps on iPad in compatibility mode, and App Store Connect has availability settings for offering iPhone apps on Apple silicon Macs and Apple Vision Pro | `app.config.ts:63` | Run the release build once on an iPad simulator before submission; turn off Mac and Vision Pro availability unless tested |
| R6 | 5.1.1, App Privacy (web traffic) | The source-link checker accepts opax.com.au addresses, so a catalog source link on the site itself would open in the in-app Safari view and load the website's analytics inside the app. Whether any catalog row carries such a link is unverified | `external.ts:238-264` | Route opax.com.au hosts through the Safari hand-off (`openOnWeb`) in `openSource` |
| R7 | Availability; App Store Connect Digital Services Act field | Distribution in the European Union needs a Digital Services Act trader declaration, and a trader's contact details are shown on EU product pages. The content is Australian | App Store Connect help, [app information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information) | Recommended: make v1 available in Australia only. Otherwise answer the trader question |

### Not applicable to this build, and when they start to apply

| Guideline | Today | When it applies |
| --- | --- | --- |
| 1.2 User-generated content | No community features in the app | If community content is shown in the app (P2 in IOS-APP.md section 3) |
| 4.7 Chatbots; decision 11 | No voice in the build | When voice ships. Ask App Review first; if 4.7 applies, filtering, reporting, blocking, consent in each instance, an index with universal links (W17 moves into v1) and an age restriction follow |
| 5.1.1(v) Account deletion | No sign-in in the build, so no accounts are created | When sign-in ships. Deletion must be in the app; the Worker's deletion route is in IOS-APP.md section 6 and W5 |
| 5.1.2 Data use and sharing | No personal data is used or shared; catalog searches reach OPAX's server only | When voice ships: the third-party AI consent step before the first call (IOS-APP.md section 6) |

### Nice-to-have

| ID | Item | Today | Fix |
| --- | --- | --- | --- |
| N1 | Notice about people who have died (decision 15) | Not in the app or the listing. The app shows names of former members and Commons portraits | Add the notice to About and the description's last paragraph (section 1.1) |
| N2 | Privacy manifest matches the label | Build 2's manifest declares no collected data | If Search History is declared (B4), declare it in `ios.privacyManifests` too |
| N3 | Accessibility Nutrition Labels | Optional in App Store Connect | Fill after the AX5 release gate passes, from its evidence |
| N4 | Marketing page | None | `/app` page as in section 1.2 |
| N5 | Promotional text | Not set | Can change without a new build; use it for coverage news, such as a new state roster |

### Decisions 11 to 15 at a glance

| Decision (IOS-APP.md section 11) | Where it lands here |
| --- | --- |
| 11, guideline 4.7 | Not applicable until voice ships (table above) |
| 12, support URL and contact | Blocker B1 |
| 13, rights review | Blocker B5; content rights (section 3.3) |
| 14, privacy label inputs | Blocker B4; section 4 |
| 15, notice about people who have died | Nice-to-have N1; description (section 1.1) |

## 7. Needs Jake

Only Jake can give these. Specifics are kept outside the repository.

1. The contact details to publish for support, corrections and privacy requests, and who answers them (B1, B2).
2. The responsible entity: the seller and copyright name, the privacy policy's owner, and the App Review contact person (sections 1, 2.1, 4.4).
3. The facts behind the privacy page placeholders, first the log and analytics retention ones (P5, P6) that decide the label, then the rest so the page can deploy (B2, B4).
4. Approval to deploy the privacy page and a support page on opax.com.au, and the production-build change that hides the voice and sign-in placeholders (B1 to B3).
5. The rights review and who does it (B5).
6. The release version number for the App Store (B7).
7. The age rating judgement calls: confirm 9+ (section 3.1).
8. Availability: Australia only, or wider with the trader declaration (R7).
9. Whether to add the notice about people who have died, and its wording (N1).
10. Final choices: subtitle, secondary category.

## 8. Claims not verified in this pass

- **Build selection rule (B7).** Apple's help files builds "by version number" and says to choose a build "from those you've uploaded for the version"; it does not state the matching rule in so many words. The 1.0 and 0.1.0 values are as read.
- **Person search results (R1).** Whether the production person catalog can return non-parliamentarians. No production search was run.
- **opax.com.au source links (R6).** Whether any catalog row's source link points at opax.com.au.
- **Workers Logs and analytics retention (P5, P6).** From the privacy page draft and Cloudflare's documented plan limits, not OPAX's account settings.
- **Unrestricted web access (R3).** How App Review reads the in-app Safari view.
- **Age rating.** The 9+ result is read from Apple's published table; App Store Connect computes the real one. Title counts come from the repository copy of the bills index, not the live file.
- **Support page contact requirements.** Which of address, email and phone Australian law requires is a legal question.
- **Screens on a device.** No simulator or device run was made in this pass; walkthrough steps come from the code and the Maestro journeys.
- **App Privacy answers already in App Store Connect.** Not readable through the API.
