# Opax community

## Product contract

The public record stays open. An email account enables private or shared reading lists, public profiles, source-led discussions and read-only MCP tools. All community features are available to members without payment.

## Implementation

- `/community` serves responsive account, discussion, reading-list and connected-tool views. Shared desktop/mobile navigation links to the community.
- `/api/community/*` owns isolated D1 community data. Staging never proxies account requests to production.
- Magic links expire after 15 minutes, are stored only as hashes and are consumed atomically after an explicit POST. Tokens travel in URL fragments, which the browser removes immediately. Email scanners cannot consume them by fetching the link.
- Native code sign-in uses the same proof and session as the web; see the code flow below. Only native requests supersede earlier unused iOS proofs for the same normalized email. Web links remain independently usable until consumed or expired, including when a later web email fails to send.
- Sessions use hashed random tokens and a Secure, HttpOnly, SameSite=Lax `__Host-` cookie. Account mutations require the configured origin. Login and content creation are rate-limited.
- Reading lists start private. Owners control sharing and deletion; public profiles omit email. Saved records use Opax's `/doc/` paths.
- Saved conversations (13 September 2026): the chat keeps every conversation in the browser's localStorage (`opax-chats`, twenty newest, trimmed sources) and mirrors a signed-in member's to `member_chats` (migration 0006) through `GET/PUT/DELETE /api/community/chats[/:id]` - one owner per row, private, the reader's `updated` clock deciding between devices (an older write is acknowledged as `stale`). Fifty per member; a body up to 600 KB and eighty turns. Nothing anonymous is stored server-side.
- Members can report discussion content; moderators can review reports and hide content. Assign moderation ownership before opening discussions.
- MCP supports stateless HTTP POST with personal bearer tokens. Tokens are stored hashed, expire after 90 days and can be revoked. A member can have three active tokens. Compatible clients need bearer-token support; OAuth discovery is not implemented.
- MCP tools cover record search (`search_records`, including a `grant` kind), record reading (`read_record`), grant recipient detail (`read_grant_recipient`), grant program detail (`read_grant_program`), connection search (`find_connections`) and corpus coverage (`corpus_coverage`) — all read-only. Search/read results include absolute Opax citations. Oversized record responses are stopped while streaming.
- Grant search hits point at the file to open next. A recipient row carries `grant_recipient: {jurisdiction, id}` for `read_grant_recipient`; a program row (catalog slug `grant-program-<jur>-<key>`, title ending in "(grant program)") carries `grant_program: {jurisdiction, id}` for `read_grant_program`.
- Recipient citations use `/money/grants/<jurisdiction>/recipient/<encoded-id>` for standalone pages. Legacy `/money/grants?jur=...&open=...` links remain readable, and MCP search recognizes both forms.
- `read_grant_recipient` adds `program_lookup` entries for its top program labels. Each entry includes the recipient value and catalog `candidates` with `{jurisdiction, id, name, opax_url}`. These are label matches; verify membership in the program's grants. An empty candidate list means no matching exported program, not that no program exists.
- `read_grant_program({jurisdiction: "federal" | "qld", id})` resolves a canonical catalog ID, file key, or unique exact program label against `/graph/grants.<jur>.json`. It uses the catalog's file key, including exporter collision suffixes and truncation. Multiple programs with the same label return an error with candidates; an unknown program returns `{"error":"not found"}`. Only exported catalog programs are available.
- Both grant readers include `field_guide`, `coverage`, `dataset_source_url`, `grants_total` and `grants_listed`. Recipient agencies/programs/electorates and program top recipients may be partial summaries. Queensland values are annual expenditure lines, including grants, service agreements and other assistance; an agreement can recur in several years. Federal values are published award values, not evidence of payments received. Do not combine counts as unique grants or totals as payments received.
- A known GrantConnect GUID yields a row `source_url` with `source_kind: "original_record"`. Queensland rows without an individual URL instead link to the source dataset with `source_kind: "dataset"`. Missing individual record URLs are explicit in `original_source_status`. Dataset provenance does not verify an individual record, and external link availability is not guaranteed.
- Grant output is capped at 180 KB. If necessary, the grant list is shortened to at most 200 rows, then further reduced until the JSON fits; totals and metadata are preserved and `truncated: true` is set. Recipient asset omissions also set `truncated`. If metadata alone exceeds the cap, the tool returns an error with the Opax URL. Search currently returns the first ten results and has no MCP pagination argument.

  Example: use the candidate returned for Community Development Grants:

  ```json
  {"name": "read_grant_program", "arguments": {"jurisdiction": "federal", "id": "GO3141"}}
  ```

  The exact label `"Community Development Grants"` also resolves when unique. The response includes the canonical `id: "GO3141"`, `key: "go3141"` and `opax_url: "https://opax.com.au/money/grants?jur=federal&program=GO3141"` alongside current program data and coverage notes.

## Native code sign-in (W1 to W3, branch implementation)

`POST /api/community/auth/request` accepts `{email, client:"ios"}`. Omitting `client` keeps the web email and response unchanged. Native requests receive `{sent:true, message, challenge_id}` for both existing and new accounts. The challenge is 32 cryptographically random bytes encoded as 43 URL-safe characters and bound in the proof row to the normalized email and `client:"ios"`. The response carries no code or link token.

The native email includes the existing `/community?view=signin#token=…` link and an eight-digit app code, including possible leading zeroes. Its copy says never to share the code and explains that the link signs in through the browser, not the app, and consumes the code too. Rejection sampling over `crypto.getRandomValues` makes every code equally likely. One proof holds the SHA-256 link hash, the challenge and an HMAC-SHA-256 of the code bound to that challenge. The code is never stored in clear or as an unkeyed hash. The proof expires after 15 minutes. The new proof is inserted first. Only after the email is accepted are older native proofs for that email superseded; supersession also sets their `expires_at` to the current time, so the existing link-consume SQL refuses them. Email-delivery failure deletes the newly created proof and leaves earlier codes and links working. The web and native share the existing `login-ip:` and `login-email:` counters: 15 per fixed hour per IP and 5 per fixed hour per email.

`POST /api/community/auth/consume-code` accepts `{challenge_id, code}`, with the code supplied as an eight-character decimal string. It looks up the challenge's email, then completes these atomic admissions in order before comparing any MAC:

1. IP: the existing `consume:` counter, shared with link consumption, permits 30 attempts per fixed 15-minute window. Unknown and malformed challenges still spend IP quota.
2. Email: a counter keyed by a digest of the proof's normalized email permits 10 attempts per fixed 24-hour window. Every known-challenge attempt counts, including attempts on expired, consumed or superseded proofs. Reissue and supersession never reset it; a caller-supplied email cannot choose its key.
3. Challenge: one conditional update increments attempts only on an unused, unexpired, unsuperseded iOS proof with fewer than five attempts and returns its MAC.

The Worker computes the submitted code's MAC and compares the two fixed-size MACs with Cloudflare's native constant-time `crypto.subtle.timingSafeEqual`. A matching code must then win a conditional `used_at` update that rechecks expiry and supersession. Link consumption competes for that same row: whichever wins consumes both forms. Parallel requests cannot create a second session from that proof.

Success returns `{signed_in:true}` and the existing `__Host-opax_session` cookie: host-only, `Path=/`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Max-Age=2592000` (30 days). Its random token remains stored only as a SHA-256 hash. Code exchange labels the session `client:"ios"`; browser link consumption labels it `web`. The label adds no authority. Existing member lookup and logout apply to both.

Wrong, malformed, expired, superseded, consumed, unknown, disabled-account and over-limit code exchanges return the same HTTP 400 body: `{"error":"This code could not be used. Request a new sign-in email or use its link to sign in through your browser."}`. Missing or partial native schema, or a missing/short MAC secret, makes both native issuance and exchange return the existing generic HTTP 503 before spending any quota or creating a proof. Origin rejection remains the existing HTTP 403. All auth POSTs, including native issuance/exchange and cookie-bearing mutations, require the exact configured `COMMUNITY_ORIGIN`. The native core explicitly sends `Origin: https://opax.com.au` in production, and the configured staging origin when testing staging. There is no Origin bypass, CORS addition or new session header.

At the email cap, the link remains the fallback until the daily window ends. Fixed windows can allow attempts on both sides of a boundary. Carrier NAT still shares the existing IP caps. Rotating the MAC secret invalidates outstanding codes; their links remain usable unless already consumed or superseded.

## Account deletion (W5 and W6, branch implementation)

Branch `ios/worker-deletion` implements deletion; it has never been deployed. Decision 5 is still open; this code uses its requested defaults. `/community?view=account` links to an accessible `/community?view=delete-account` flow with a fresh code field, permanent-deletion disclosure, cancel link, loading/status feedback and field errors using the shared controls.

| Method/path | JSON request | Response |
| --- | --- | --- |
| `POST /api/community/account/deletion-code` | `{}`; the server uses the signed-in member, never a submitted email or member ID | 200 `{sent:true,challenge_id,message:"Check your email for a deletion code. It expires in 15 minutes."}` |
| `POST /api/community/account/delete` | `{challenge_id,code}`; code is an eight-digit decimal **string** | 200 `{deleted:true,signed_out:true,message:"Your account and authored content have been deleted."}`; expires `__Host-opax_session` with Path=/, HttpOnly, Secure, SameSite=Lax, Max-Age=0 |

Account deletion remains reachable when `COMMUNITY_ENABLED=false` and for a disabled member with an unexpired, unrevoked cookie session. This is the orchestrator's deletion policy for App Review 5.1.1(v). Only these two routes use the deletion-specific member lookup; sign-in, other writes and moderation rules retain their existing restrictions. `GET /api/community/status` adds `can_delete_account` for a valid session, including disabled members, while its normal `member` remains NULL for disabled members. The web account entry and deletion-code UI use that boolean to keep deletion available without exposing other disabled-member features.

Both routes require the existing cookie session and an exact configured Origin, and accept at most 2,000 bytes of JSON. Missing/invalid/revoked cookie: 401; missing/wrong Origin: 403; unsupported method: 405 with Allow: POST. Code issuance/admission and verification failures use generic 400 `{"error":"This deletion could not be completed. Request a new deletion code and try again."}`. Wrong, malformed, unknown, other-member, expired, reused, superseded and over-limit proofs have the same failure body; none reveals another account or proof. Missing/partial schema, missing/short secret, email failure or database failure returns generic 503 `{"error":"This action could not be completed. Please try again shortly."}`. Responses are no-store and no-referrer. A revoked cookie’s 401 takes precedence over verification failures, including a retry after success. There is no deletion status/read endpoint, native bearer token, Origin bypass or new outbound provider call.

`community_deletion_challenges` stores a random 43-character challenge, member foreign key, MAC, attempts, creation/expiry, use/supersession and redemption marker. It reuses the native generator, secret and constant-time comparison, but uses MAC context `["opax-deletion-code-v1",member_id,challenge_id,code]`. It expires after 15 minutes and has **no sign-in link**. Sign-in links/codes cannot delete an account; deletion codes cannot sign in. Issuance shares `login-ip:` (15/hour) and `login-email:` (5/hour); exchange spends shared `consume:` IP quota (30/15 minutes), then the known member-bound proof’s `consume-code-email:` quota (10/day), then conditionally increments its attempts (5). Malformed/unknown challenges still spend IP quota. Reissuing supersedes only deletion challenges, in the insertion batch before email delivery, and cannot reset email admission. A failed email deletes its new challenge; the older superseded challenge stays unusable, so another deletion-code request is required. This deletion-purpose rule is separate from native sign-in: native proofs supersede only after accepted delivery, leaving earlier codes and web links usable on a failed send. The response/logs contain no code.

A successful comparison must win one D1 `batch()`: conditional proof redemption rechecks expiry, supersession, member existence and the **exact cookie session hash** (including its expiry); disabled status does not remove the deletion right. A new random redemption marker guards every scope mutation. One concurrent request wins. A failing statement rolls back proof redemption and every scope change; earlier admission counters remain spent. All credentials are revoked in that transaction, the member is removed, and voice foreign keys become NULL. Sign-in session issuance also checks its still-present redeemed login proof in an atomic batch; a sign-in paused after consuming an old proof cannot recreate the account after deletion removes that proof. The guarded web statements remain compatible before 0011.

Every table in migrations 0001–0012 is accounted for:

| Table(s) | Handling in the deletion batch |
| --- | --- |
| `members` | Delete the row, including email/profile/preferences/legacy Stripe customer field |
| `member_sessions` | Delete **all** member sessions, web and iOS |
| `login_links` | Delete all normalized-email proofs, including used/unused web links and native challenges |
| `community_deletion_challenges` | Cascade every member-bound deletion proof on member deletion |
| `mcp_keys`, `voice_access`, `member_chats` | Delete all member rows, including revoked/expired keys and saved chat JSON |
| `reading_lists`, `reading_list_items` | Delete owned lists; their items cascade |
| `community_threads` | Delete openings with no surviving reply; otherwise scrub title to `Deleted discussion`, body to empty, source to NULL and opening time to zero, then unlink owner; preserve hidden moderation status. At the end of later deletions, remove owner-less stubs left without replies, including dependent reactions/activity/reports |
| `community_replies` | Delete all authored replies, including hidden ones; preserve other members’ replies under surviving stubs |
| `direct_messages` | Delete all sent messages, including hidden ones; preserve other senders’ messages |
| `direct_reads` | Delete the member’s markers and every marker for an affected empty conversation |
| `direct_conversations` | Delete affected empty conversations; surviving ones lose the deleted participant and creation timestamp (zero), remain readable by the other participant, and refuse new messages |
| `member_follows`, `member_blocks` | Delete either-direction edges involving the member |
| `thread_likes`, `thread_bookmarks` | Delete the member’s reactions and all reactions to removed openings, including stubs |
| `community_notifications` | Delete to/from-member notifications and records referencing removed openings or authored replies |
| `community_reports` | Delete reports filed by the member and anyone’s reports targeting their removed opening/reply/message; keep unrelated reports |
| `community_email_outbox` | Delete jobs addressed to the member or tied to their authored replies, before deleting reply rows |
| `community_email_unsubscribes` | Delete member tokens |
| `voice_sessions` | **Never delete or alter charges/state/times in the batch**. 0012’s ON DELETE SET NULL unlinks the owner, retaining monthly charges and live slots |
| `community_limits` | Delete expired buckets and current email/member/MCP buckets; retain shared IP quota. No email hash remains after successful deletion |
| `supporter_subscriptions`, `supporter_checkouts` | Already dropped by 0002; absent |
| `social_editions`, `social_deliveries` | Automated site publication, no member references; unchanged |
| Temporary `*_next` tables | Migration-only rebuilds; absent afterwards |

Discussion posts are `community_threads` openings and `community_replies`; no other member-post table exists. Remaining messages/replies are other members’ own content and can contain their own quotations; deletion does not rewrite that text. The browser clears its `opax-chats` cache, message drafts and displayed tool key on success. Other devices must clear their local account data when signed out; SQL cannot clear their browser/device storage.

Decisions where the contract was open, for review:

- Use the two POST paths above and a dedicated member-bound deletion challenge, with native admission defaults. Scope SQL and limiter inventory are isolated in `community-deletion.ts` to make later policy changes straightforward.
- Extend **0012**, alongside the exact voice rebuild, to rebuild discussion ownership and conversation participants as nullable ON DELETE SET NULL references, and add deletion challenges. This avoids synthetic identities/emails and permits multiple distinct conversations whose peers have been deleted. Existing row values, constraints, indexes and child foreign keys survive migration.
- Keep any surviving reply, including hidden ones, in a scrubbed discussion; new replies to visible stubs remain possible without owner notifications/email. Preserve the remaining participant’s messages and read markers in a read-only conversation. Later deletion of that participant removes their content and the empty shell. NULL authors/peers are labelled `Deleted account`, with no profile/block link.
- Remove reports/activity/reactions tied to the deleted opening or authored content as well as the member’s own rows. Preserve unrelated content and automated site publication.
- Remove email/member/MCP quota hashes during deletion; shared IP limits remain. A returning email gets a new member ID and fresh 600 seconds; there is no retained email hash or lifetime-allowance record. Unlinked voice rows still consume shared budget and slots.
- Refuse deletion before quota or email until the complete 0012 and existing MAC secret are present, including on post-0011 accounts with no voice history. Proof admission uses generic 400; session/Origin/configuration failures retain 401/403/503. Recheck the precise session on redemption and guard sign-in session issuance against deleted proofs.
- Disclose provider-ID retention without promising an unverified provider deletion or making new provider calls. The provider setting still needs Jake’s live confirmation; an email already handed to the sending binding cannot be recalled by the SQL transaction.

W6 changes `voice_sessions.member_id` to nullable ON DELETE SET NULL and recreates all four indexes, including `voice_one_active_member WHERE member_id IS NOT NULL AND state IN ('reserved','connecting','active')`, under PRAGMA defer_foreign_keys. Reservation/claim/reconciliation/tool SQL and the conservative month-start-minus-720-second window stay unchanged. Orphaned calls’ tools return 403; their relay can reconcile by ID. An unclaimed orphan reservation still holds its budget/slot until normal expiry cancels it at zero charge.

**Migration warning: never rebuild `members` by drop and rename after 0012; ON DELETE SET NULL/CASCADE would fire.** D1 performs these delete actions even with `PRAGMA defer_foreign_keys=ON`: dropping the parent deletes its rows first, unlinks content and voice history, and destroys deletion proofs. Later migrations must not drop, rename or recreate `members`, `voice_sessions`, `community_threads` or `direct_conversations` without an explicit reviewed exception. `portal/test/migration-deletion-safety.test.mjs` enforces this, with an initially empty exception list. An exception must name the reviewer, review reference and preservation rationale and pin the exact migration SHA-256 in that test; a SQL comment alone cannot waive it. Rehearse any approved exception on seeded local D1 and verify row/constraint/foreign-key preservation.

`expireVoiceSessions` now runs reserved expiry, connecting/active expiry, **then** clears `conversation_id` only on orphaned terminal rows with stored `closed_at <= now-86400`. The existing five-minute `scheduled()` branch runs this before reply-email delivery, in independent error handling, even when voice/community are disabled or email delivery throws. For a lost relay, `closed_at` is the expiry processing time, not its deadline; cleanup waits a full day from that stored time. Staging has no cron, so staging validation must explicitly invoke scheduled housekeeping or request expiry. No production/staging calls or migrations have run in this lane.

Deploy order (future, Jake-authorized only): staging first, with seeded discussions/replies and conversations/messages; satisfy the sign-in compatibility release and apply **0011_native_signin**, then follow the W6 sequence below. No rollout action is authorized by these notes.

1. Schedule the entire disable/drain/migrate/release sequence **outside the nightly refresh/deploy window (03:15 Australia/Sydney)**, including its running time. Confirm no nightly is running or can overlap: it deploys `main` with `VOICE_ENABLED=true` and could re-enable voice mid-drain. Do not leave the drain or migration spanning that window.
2. Disable voice, drain old requests, read the latest stored open-row deadlines, run expiry after those deadlines and verify **zero open rows**. Repeat deadline/expiry checks if any remain.
3. **Immediately before applying 0012, record a D1 Time Travel bookmark** for that environment/database in private operator evidence, with the timestamp, database identifier and currently applied migration. This is the restore point; 0012 has no down migration.
4. Apply **0012_voice_deletion_safe**. Run **`PRAGMA foreign_key_check` as a separate database command after applying**, inspect its output and require zero rows. `migrations apply` does not print the query results of the check inside the migration. Verify row/constraint/index preservation and no remaining rebuild tables before release.
5. For production, **merge W5/W6 to `main` only after the production migration and separate FK check pass, then deploy that merged `main`** with voice still disabled. Validate deletion, preserved content, accounting and housekeeping, then re-enable voice. A branch deployment would be replaced by the next nightly; it is not the production shipping procedure.

The old corrected Worker is compatible with 0012 until deletion is enabled. After deletion creates NULL content owners, rollback must retain the NULL-aware readers and guarded session issuance. **Nothing reaches main before its required migration is applied in production: the nightly refresh deploys main.** Production first needs the separate web-sign-in compatibility release described below, then 0011; after staging passes and Jake authorizes production, repeat the complete W6 sequence. The approved sign-in branch at `0028a5f5` was merged locally into this branch with merge commit `dbc85cf4`, without conflicts. No push, main merge or deployment was performed here.

## Configuration and launch requirements

Production and staging have separate `COMMUNITY_DB` bindings. Apply every migration in `portal/migrations` to each target database before enabling accounts. Configure:

- `COMMUNITY_ORIGIN`: the exact HTTPS origin for that environment.
- `COMMUNITY_EMAIL_FROM`: an authenticated Cloudflare Email Sending address.
- `COMMUNITY_EMAIL`: the sending binding.
- `COMMUNITY_CODE_MAC_SECRET`: a new Worker secret for HMAC-SHA-256 code storage, with separate high-entropy values (at least 32 random bytes) for staging and production. The runtime requires at least 32 characters after trimming, before any native quota call. Keep it out of Wrangler vars, source and logs. Missing or short configuration refuses native issuance/exchange without spending shared web quota, storing a proof or sending email. Automated tests use a fixed test-only key.
- `COMMUNITY_ENABLED`: enable after real email delivery and sign-in are verified.

Migration `0011_native_signin.sql` adds the proof's client, challenge, MAC, attempts and supersession columns, its lookup indexes, and the session client label. Existing rows default to `web` and remain valid. The corrected web request, consume and session statements work on both schemas: they use explicit original-column inserts, the original expiry-based consume statement, and omit session `client` so the migrated default supplies `web`. Native paths require the migration and secret and fail closed before quota when unavailable.

Two orders preserve web sign-in. In staging, either deploy compatibility commit `9039198`, apply 0011, set the secret and deploy the corrected native feature; or deploy the complete corrected Worker first, then apply 0011 and set the secret (either order). In the second order, native routes return generic 503 until both are ready. The compatibility commit can be folded into that complete corrected staging release; it need not be deployed separately there. Applying 0011 while the original positional-insert Worker is live is unsafe.

**don't merge the native feature to `main` until migration 0011 is applied to production, because the nightly refresh deploys `main`.** For production, first ship `9039198` (or an equivalent web-only compatibility patch) on `main` and verify that its Worker is live; then apply 0011 and set the distinct production secret; only then merge/release the corrected native feature. This separate compatibility release is still required when production and `main` retain the original positional inserts: folding it solely into the native merge cannot satisfy this gate. A manually deployed corrected branch cannot protect production from a later nightly deployment of an incompatible `main`. Staging must pass before this production sequence is authorized.

After migration, rollback to the compatibility commit or the corrected Worker preserves web sign-in and expiry-based refusal of superseded native links. Do not roll back to the original positional-insert baseline. No deployment, remote migration, secret setup or `main` change was performed in this lane. W6 uses migration 0012; the iOS design documents now reference that number and the implemented deletion routes.

The current release removes payment routes, SDK dependencies, promotional copy and payment-based MCP restrictions. Migration 0002 removes the unused subscription and checkout tables from the earlier draft.

## Verification

Automated tests cover single-use links, expiration, sessions, origins, login rate limiting, private list ownership/sharing, public profile privacy, moderation, disabled accounts and member MCP access. MCP tests exercise tool discovery, search/read citations, invalid arguments, bounded responses, hashed keys and revocation. Grant regressions cover recipient-to-program candidates, exact-label resolution, ambiguous names, authoritative collision keys, malformed assets, source provenance, jurisdiction-specific value semantics and adaptive truncation. External email is simulated in these tests.

Deletion tests cover all ten 0012 accounting cases, every content type, preserved content accessibility, revoked credentials, schema compatibility, code failures/admission/races, rollback and scheduled-only orphan housekeeping with email failure. The real Worker/local D1 test forbids outbound traffic and stubs email.

Native sign-in tests additionally cover unbiased code generation, challenge-bound keyed storage, issuance non-enumeration, shared quotas, native-only supersession, admission order, concurrent per-challenge and email caps across old/new challenges and at the cap boundary, one-winner link/code races, generic failures, cookie attributes and unchanged Origin enforcement. Real route statements exercise the full web flow before and after 0011 and across migration, both web links staying valid, failed second delivery and native supersession preserving web links, and missing/short secrets or partial migration spending no native quota. A local Worker/D1 runtime test uses an ephemeral port, stubs the email binding and denies outbound requests; it verifies the concurrent email-cap boundary and native session label. Existing community and voice fixtures apply the additive migration too.

The mobile browser harness exercises sign-in, profile editing, reading lists, discussions and token creation/revocation in Chromium and WebKit at 390, 768 and 1280 pixels. TypeScript, syntax and asset-stamp checks are also required.

Preview: `https://staging.opax.com.au/community`. Cloudflare Email Sending is enabled for `login.opax.com.au`. The real sign-in email arrived at the owner's mailbox and passed SPF, DKIM and DMARC authentication. A WebKit browser consumed the emailed link successfully, verified the Secure/HttpOnly session cookie, rejected replay, created an MCP token, read a live public record, revoked the token and confirmed its rejection. The test signed out afterwards.

The official MCP client passes an HTTP integration check: initialization, tool discovery, record reading and rejection after token revocation. Run `npm run test:community` from `portal` to reproduce the account and MCP checks. Both production database migrations have been applied successfully; the configured production launch enables community accounts.

Production moderation ownership is assigned to the project owner. This does not create a session: the owner must still authenticate using a single-use email link.
