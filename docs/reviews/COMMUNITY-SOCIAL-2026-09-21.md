# Community social release review

## Delivered scope

- Private one-to-one messages with an inbox, unread counts, chronological history, safe retries, older-message loading and foreground refresh every 15 seconds. Drafts remain in the current page's memory during community navigation and clear on reload/sign-out.
- Member search, following, follower counts, recent discussions on profiles and a Following feed.
- Discussion search, likes, privately saved discussions and copy-link sharing.
- In-app activity for new followers, likes and replies to the member's discussions.
- Message policy choices (everyone, people you follow, nobody), bilateral blocking, message reports and moderation of individually reported messages. Reports do not grant access to the rest of a conversation.
- Discussion spacing and paragraph rhythm, active navigation, avatars, mobile inbox layout and accessible state labels.
- Money-map profile button: white text on navy, lighter navy plus underline on hover, a clear focus ring.

## Design direction

The existing Opax language remains the authority: paper #FAF9F6, raised white #FFFFFF, subdued #F1EFE8, ink #23271F, navy #142A43 and bronze #8A5A12. Merriweather carries headings; Public Sans carries text, metadata and controls. Discussions use readable columns and rows; only member summaries and the inbox need contained surfaces. The main interaction is finding a conversation, reading it and joining in. Navigation uses text destinations and current-page underlines.

## Review loops

1. **Baseline and desktop structure.** Inspected production discussions and the signed-in account. Replaced the large signed-in introduction with discussions and clear social destinations. Browser review found generic masthead CSS leaking into nested discussion/profile/conversation headers; scoped those headers to their actual content role. Matched the new controls to the shared UI system.
2. **Mobile and vertical rhythm.** Reviewed discussion paragraphs and replies at 390px, and feeds at 320px. Separated breadcrumb, heading, byline, body and replies with consistent spacing. Removed the extra page introduction when reading a mobile conversation, shortened its scrolling history, and corrected textarea specificity so the send control fits at 390×844. Removed the clipped main-site link from the mobile tab row and retained it in the footer. Confirmed no document-level horizontal overflow at 320px and 390px.
3. **Interaction and final polish.** Exercised sign-in, sending a synthetic DM, unread acknowledgement, follow/unfollow state, the Following filter, likes, saved discussions, replies, message privacy settings, activity acknowledgement and draft preservation through navigation/back. Verified visible keyboard focus and no community console errors. Corrected heading levels, retained meaningful follow labels, preserved composer focus after sending, reopened an existing conversation from its member profile, and handled conversations becoming unavailable during polling.

Browser mutations used synthetic accounts in local D1 only. The real signed-in production account was inspected without sending messages or creating public posts.

## Automated coverage

The community integration tests cover participant and moderator isolation; no private data in public profiles; per-recipient conversation lookup; single-copy retries; same-second read cursors; pagination; account disablement; message privacy; bilateral blocking; report visibility; cross-origin rejection; input bounds; rate limiting; privacy changing during a send; and transaction rollback. The pre-existing community tests run with the additive migration applied.

Release checks: the full portal test suite (635 passing), TypeScript, syntax checks, asset stamps, graph smoke tests and Worker deployment dry run. The full suite requires building the generated search catalog first.

## Storage and release

`0009_community_social.sql` is additive and must be applied to the production community database before deploying the new Worker. It adds a message policy column and separate relationship, reaction, message/read-cursor and notification tables. Existing members, sessions, discussions and reading lists remain intact.

Private routes require an authenticated member; writes also require the configured same-origin header. Messages use D1 prepared statements and batched transactions. Read cursors are monotonic and cannot acknowledge a message in another conversation. Bodies never enter notification payloads, public profiles, MCP tools or analytics. Messages are stored by Opax and are not end-to-end encrypted; the account privacy page explains this.

Apply the migration, deploy through `npm run deploy -- --env ''`, then verify public community pages, the existing signed-in account, private-route denial when signed out and the homepage money map. Reverting the Worker is compatible with the additive tables; retain message data rather than dropping the migration during a rollback.
