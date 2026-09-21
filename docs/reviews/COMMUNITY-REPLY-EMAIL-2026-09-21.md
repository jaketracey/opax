# Community reply email notifications

Members receive a branded email when another member replies to a discussion they started. The email names the replier, includes a short excerpt and opens the exact reply. Reply emails default to enabled, with a separate account preference and an unsubscribe link in every email. This release does not email historical replies or add direct-message emails.

## Delivery and privacy

- The reply, in-app notification and email outbox entry are committed together. Delivery runs after the response; an email provider failure does not prevent posting a reply.
- Every send rechecks the recipient's preference, both members' account status, blocks and content visibility. Own replies never generate email. Changing the preference cancels queued emails.
- Atomic claims prevent overlapping deliveries. Explicit transient provider failures receive bounded retries from a separate five-minute scheduled handler. Unknown outcomes and interrupted sends are recorded for investigation instead of being blindly resent. No provider idempotency guarantee is assumed.
- Unsubscribe tokens are random, stored only as hashes and scoped solely to disabling reply emails. GET/HEAD show a confirmation without mutating preferences; POST supports both the native form and mailbox one-click unsubscribe. Re-enabling notifications invalidates old unsubscribe links. Sign-in email remains available.
- The unsubscribe document permits its own form and inline styles under a dedicated script-free CSP. Other API responses retain their restrictive CSP. Reply content and addresses are not logged.

## Review and verification

- Full portal suite: 648 tests passed. TypeScript and asset stamps passed.
- Integration tests cover recipients, self-replies, blocks, hidden content, preference changes, concurrent delivery, provider failures, unsubscribe, transaction rollback, escaped content and deep links beyond 200 replies.
- Actual Worker regression verifies the unsubscribe form's security headers, successful POST and unchanged policy for JSON errors.
- Browser review at desktop and 390px: branded email light/dark modes, exact reply focus and gold highlight, persisted settings and successful unsubscribe using synthetic local accounts. No horizontal overflow.
- Review loop fixed an API CSP that prevented the unsubscribe form submission and a dynamic-rendering issue that prevented the CSS target highlight.
- No artificial replies or test email were sent to production members. Inbox-provider rendering and final real-mail delivery were not independently tested.

## Rollout

Apply additive migration `0010_reply_email_notifications.sql` to `opax-community` before deploying the Worker. No data backfill is performed. Preserve both the existing daily social publication schedule and the independent reply-email schedule. The previous Worker remains compatible with the additive schema; rollback must also restore the previous cron configuration so its generic scheduled handler cannot run the social publisher every five minutes.
