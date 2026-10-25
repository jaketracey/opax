# iOS 1.0 App Review access: existing reviewer credential

Status: local deletion patch, 25 October 2026; production deployment and verification remain Jake's steps. No push, deployment, production request, remote secret/database change, real email, App Store Connect edit, native build or device run was performed in this lane.

## Scope against main

Main already contains the inbox-free store reviewer sign-in path from `ec3945914` (12 October). Its allowlist remains **play-review@opax.com.au** and **app-review@opax.com.au**, and its only reviewer credential remains **REVIEWER_LOGIN_CODE**. The sign-in implementation is unchanged; its existing allowlist is exported for reuse by deletion. No new secrets, environment bindings, migration, permissions, native UI or session format are introduced.

Jake confirms he set `REVIEWER_LOGIN_CODE` in production on 12 October and its name appears in the secret list. This lane did not inspect production or retrieve the code. That existing sign-in path already needs no inbox. The remaining backend gap addressed here is account deletion, which previously emailed a fresh code that the reviewer could not receive.

The earlier hash-only proposal is preserved separately at `ac0b11a1cd73cdfc47ae1386410c95ba7555f350`, branch `web/app-review-access-hash-only`. It is not an ancestor of this replacement change and is not included in the main diff.

## Deletion behavior

For either allowlisted reviewer, the existing deletion request obtains a fresh challenge without sending email. The user enters the **same existing REVIEWER_LOGIN_CODE** after reading the deletion disclosure. The code is stored only as the existing member/challenge-bound deletion-purpose HMAC. Confirmation checks the current reviewer secret in constant time and verifies that HMAC before the unchanged atomic deletion transaction.

Cookie, Origin, 15-minute expiry, supersession, single redemption and all existing limits remain: request 15/IP/hour and 5/email/hour; confirmation 30/IP/15 minutes, 10/email/day and 5/challenge. An unset or malformed reviewer secret refuses review deletion issuance with generic 503 and confirmation with generic 400, without email fallback. Removing or rotating the secret invalidates pending review deletion proofs. A successful deletion logs `community_reviewer_deletion` with timestamp and colo, never the code, challenge or session.

Non-reviewers retain emailed deletion codes. Deletion removes account data and revokes all account sessions. Signing in again with a fresh challenge and the existing reviewer code creates a fresh ordinary member with the normal 600-second Talk allowance and shared budget. The Google Play reviewer path remains available too.

**New app build: no.** The existing eight-digit numeric code entry, including leading zeroes, fits this flow unchanged. Only the backend deletion patch needs a reviewed release; Jake then checks the current iOS 1.0 build on his own iPad.

## Jake: App Store Connect credentials

| Field | Value |
| --- | --- |
| Sign-in required | Yes, because Talk requires it |
| User name | **app-review@opax.com.au** |
| Password | **The existing eight-digit REVIEWER_LOGIN_CODE Jake set on 12 October**, including leading zeroes; copy its value into the private field |

There is nothing new to provision. Retrieve the existing code from Jake's private password record/1Password. Never put its value in this file, listing JSON, Git, shell arguments, screenshots, issues or logs.

If Jake cannot find it, **Jake resets that same secret himself**, from the reviewed production `portal/` checkout after checking the intended Worker/account:

```sh
npx wrangler secret put REVIEWER_LOGIN_CODE
```

Use the hidden interactive prompt. Generate a new random **eight-digit, digits-only** password in 1Password, preserve leading zeroes, and save it in the existing review Login item. Update the private Apple Password field and the Google Play reviewer credential too: both store addresses share this same secret. No additional secret is needed. This command is operator guidance only; this lane has not run it.

## Jake: production proof on his own iPad

After the orchestrator releases the reviewed backend patch, use the exact submitted iOS 1.0 build:

1. Signed out, open Today, Your MP, Bills, Search and Ask; none requires sign-in.
2. Account and about → Sign in for voice. Enter **app-review@opax.com.au**, tap Send code, then enter the existing eight-digit Password. Do not wait for email or open the sender domain.
3. Confirm the expected signed-in account and Talk access with an open shared budget and normal allowance. Complete voice consent/microphone permission, reach captions, Sources and Type a message, then End call. Check saved Ask conversations as appropriate.
4. Account → Delete account. Read the disclosure, request the deletion code, enter the **same Password**, then confirm deletion. Check Account deleted and signed-out Talk, with the old account/session unavailable.
5. Sign in again using a fresh challenge and the same credentials. Confirm a fresh ordinary member and restored Talk access. Inspect sanitized sign-in/deletion audit events and verify that no review email was attempted.

If rate limited, wait for the normal fixed quota window. Do not weaken limits or change voice access for this review. Jake's own iPad check is the production proof; local success and a secret-name listing are not a substitute. No simulator step is required in this lane.

Optional retirement after both stores finish review: delete the review accounts in-app to revoke sessions, then remove `REVIEWER_LOGIN_CODE` if neither store still needs it. Removing the shared secret disables both reviewer sign-in paths; already issued sessions otherwise retain normal expiry. Do not retire it merely because Apple has finished while Android review still needs it.

## Replacement App Review notes

Populate the private fields above, then paste this text. The actual password is intentionally absent:

> OPAX is a free, independent reader for the public record of Australian politics. It is not a government app.
>
> NO SIGN-IN IS NEEDED for Today, Your MP, Bills, Search or Ask. Only Talk (voice) requires sign-in. Signing in also saves Ask conversations to the account.
>
> REVIEW ACCOUNT: the User name is app-review@opax.com.au. Use the Password supplied in this submission's private Password field. The Password is an eight-digit sign-in code; no inbox access is required.
>
> 1. Tap the person icon (Account and about), then Sign in for voice.
> 2. Enter the supplied User name, then tap Send code. This opens the code-entry step; no email is sent for the demo account.
> 3. Enter the eight-digit Password from App Store Connect, including any leading zeroes. Use the same Password after requesting a new sign-in challenge.
>
> Correction to our previous notes: login.opax.com.au is only the email sender domain (hello@login.opax.com.au). It is not a website or a link to open to obtain a code. Please complete sign-in inside the app using the supplied credentials.
>
> TALK: tap the waveform icon (Talk to OPAX), then Start. Before you talk explains that voice and words go to ElevenLabs. Tap Agree and start, then allow the microphone. Try “Who represents Grayndler?”. Show captions displays the words; Sources lists linked records. More includes Type a message, Report this answer and Withdraw voice consent. End call stops the call. The demo account has normal member access, including the normal 10-minute voice allowance and shared monthly budget.
>
> ASK: typed questions work signed out. Before you ask explains the AI providers (Progress Agentic RAG and a model via OpenRouter) and requires consent before sending. Answers are labelled Machine-written and cite their sources. Your conversations lists saved chats; each can be deleted.
>
> DELETE ACCOUNT: person icon → Delete account. Read the disclosure, request the deletion code, then enter the SAME eight-digit Password supplied in App Store Connect and tap Delete account. No email is required for this demo account. Account deleted confirms success and signs out. A later sign-in with the supplied credentials recreates a fresh account.
>
> Sources and licences is in Account and about. Support: https://opax.com.au/support. Privacy: https://opax.com.au/privacy.

## Local verification

From `portal/`, run `node scripts/prove-app-review-access.mjs --native-origin`. Add `--play-review` to repeat with the Google Play address. The script uses only an obviously fake credential, isolated local D1 and an independent Wrangler config; it blocks external fetch and makes every email attempt fail. It starts `wrangler dev --local` on port 8931, calls the actual portal router, and removes its runtime state on exit. The canonical native Origin header is accepted only by this local Worker; all HTTP requests still go to loopback.

Redacted Apple proof (also repeated successfully for Google Play):

```text
LOCAL ONLY: isolated D1 migrations applied; no remote bindings or schedules.
POST /api/community/auth/request -> 200; challenge=[REDACTED]; email_attempts=0
POST /api/community/auth/consume-code (wrong fixture) -> 400; no session
POST /api/community/auth/consume-code -> 200; signed_in=true; session=[REDACTED]
GET /api/community/status -> 200; role=member; can_delete_account=true
GET /api/voice/status -> 200; signed_in=true; remaining_seconds=600; unlimited=false
POST /api/community/account/deletion-code -> 200; challenge=[REDACTED]; email_attempts=0
POST /api/community/account/delete -> 200; deleted=true; old session no longer signs in
POST /api/community/auth/request -> 200; challenge=[REDACTED]; email_attempts=0
POST /api/community/auth/consume-code -> 200; signed_in=true; session=[REDACTED]
Recreated fresh member; Talk signed_in=true; email_attempts=0; 3 redacted audit events.
PASS: local Wrangler end-to-end proof; no provider call or model spend.
```

Fixture tests cover both reviewer addresses, wrong/right code, no email, all missing/malformed secret forms, pending-proof revocation and rotation, normal attempt/IP/email limits, ordinary emailed deletion with the reviewer secret enabled or unset, re-sign-in after deletion, and the concurrent deletion/sign-in race. An actual workerd/Miniflare D1 case repeats the main flow with outbound traffic denied. Every captured response, header, log and relevant database row is checked for fixture credential leakage.

## Gates

Run in `portal/`, with `build:search` before the complete suite. All checks below passed on this replacement version. Logs stay under gitignored `portal/private/app-review/`.

| Gate | Result |
| --- | --- |
| `npm run build:search` | Pass; local inputs only |
| Focused reviewer suite | **59 passed**, including workerd/Miniflare D1 |
| Full `npm test` | **3,678 passed, 0 failed, 0 skipped**; external Node sockets denied |
| `tsc --noEmit` | Pass |
| `npm run check` | Pass: Worker types, tsc, design tokens, asset stamps, donor index and statute titles |
| `wrangler deploy --dry-run` | Pass; exited without upload; external Node sockets denied |
| Local Wrangler proof, Apple and Play | Pass; email_attempts=0 throughout |
| `votes.json` and `pay.json` vs main | Byte-identical to `12ce00e22`: 1,321,580 bytes and 590,501 bytes respectively |

Search building regenerates pre-existing stale statute-source metadata, party membership and the search manifest. Those unrelated outputs are excluded from this patch; reproduce the gates in the stated build-search-first order.
