# Newsletter

Status, 16 November 2026: **capture side built, switched off** (`NEWSLETTER_ENABLED=false` in
production and staging). No migration has been applied, no email has been sent and no edition
sending job exists. Nothing here is sent, migrated or turned on without Jake's approval.

Why: about 541 Australians a week visit opax.com.au, 82% from Google, 96% for the first time,
reading about 1.8 pages each. The newsletter is a way to be asked back.

## What already exists (audit)

| Thing | State |
| --- | --- |
| Email sending | Cloudflare Email Service through the Worker's `send_email` binding `COMMUNITY_EMAIL`, from `hello@login.opax.com.au` (`COMMUNITY_EMAIL_FROM`). Templates in `portal/src/community-email.ts`. |
| What it sends today | Sign-in links and app codes (`community-auth.ts`), account deletion codes (`community-deletion.ts`), reply notifications with a one-click unsubscribe and an outbox with leases and retries (`community-notifications.ts`, five-minute cron). |
| Provider limits | Cloudflare's own FAQ says the service is for transactional email only; bulk and marketing tooling is "planned". It has daily sending limits per account. So it can send the confirmation email, and it cannot send editions. |
| Sending domain | `login.opax.com.au`. Published DNS on 16 November: DMARC `p=reject` on `_dmarc.login.opax.com.au`, SPF on the Cloudflare bounce subdomain. `docs/COMMUNITY.md` records a real sign-in email passing SPF, DKIM and DMARC. The apex `opax.com.au` has no DMARC record. None of this is in the repository's config; the Cloudflare dashboard holds it. |
| Stored email addresses | `members.email` and `login_links.email` in the `opax-community` D1 database (`COMMUNITY_DB`). There was no leads table or endpoint, on the website or in the apps. |
| Privacy page today | "OPAX sends no newsletters or marketing email." (`/privacy`, Email). Terms do not mention newsletters. Both must change before the flag goes on; see the proposed diff below. |
| Follows | Community follows are member to member only. There is no "follow this MP or bill" feature to reuse; the newsletter's optional postcode or electorate is the first. |
| Reused here | `limit()` (hashed, expiring counters in `community_limits`), the email layout, the reply email's token-link and one-click unsubscribe pattern, the five-minute cron, the app banner's Worker-side injection pattern. |

## Rulings from the hub (16 November)

1. **No election edition before polls close at 6pm on Saturday 28 November.** No emailed edition
   about the Victorian election during the campaign without Jake's explicit sign-off. A results
   edition after the close is fine.
2. **Cloudflare sends the confirmation email only.** Editions need a bulk-capable provider, to
   be picked by Jake from the table below. Nothing has been signed up for.
3. **Privacy wording is Jake's decision**; the draft is below. The PostHog `distinct_id` is
   never put on a subscriber row.
4. **Spam Act:** consent comes from the double opt-in only, the sender identity is accurate, and
   every edition has a working unsubscribe honoured within five working days (here: at once).
   Each has a test.
5. **The card** is never shown on a first page view, and never on an /ask answer until the
   answer has finished.

## The newsletter

Every edition is built from the record by fixed templates. No model writes any of it, nothing
is ranked or called important, and every item links to its source page on OPAX.

| Edition | Key | What is in it | Needs |
| --- | --- | --- | --- |
| Bills that moved | `bills` | Bills introduced, passed by a house, assented to or ended that week, by parliament, in date order. Title, stage reached, date, link. | Nothing |
| Your MP this week | `mp` | For the reader's electorate: how their member voted in each division, and their speeches, by date. Member name, the question, their vote, link. A week with nothing sends nothing. | Postcode or electorate |
| Victorian election results | (not built) | One issue after polls close on 28 November: declared results by district from the VEC, each linked. | Jake's sign-off |

**Default:** Bills that moved for everyone; a reader who gives a postcode or electorate also
gets Your MP this week. Weekly, on Friday morning after a sitting week's last sitting day. A
reader in a non-sitting week gets nothing rather than a filler issue.

**Electoral matter.** An edition that carries electoral matter (the results edition, and any
issue during a campaign that names candidates or parties) carries the authorised line
(`AUTHORISATION_LINE`) in its footer. Whether the two standing editions need it outside a
campaign is a question for Jake; the safe default is to print it in every edition.

## Sign-up and consent

- **The form** asks for an email address and, optionally, a postcode or electorate. Nothing else.
- **Double opt-in.** `POST /api/newsletter/subscribe` stores the address unconfirmed and sends
  one confirmation email. The link opens a page with one button; pressing it confirms.
  The link alone does not confirm, because mail scanners follow links and a scanner must not be
  able to consent for anyone. This is one more press than a one-tap link; Jake can choose the
  one-tap form instead (see decisions).
- **Only confirmed addresses are recipients.** `newsletterRecipients()` in
  `portal/src/newsletter.ts` is the one place a sending job may take addresses from.
- **Unsubscribe.** Every email carries an unsubscribe link and the `List-Unsubscribe` and
  `List-Unsubscribe-Post` headers. The link's page has one button; a mailbox's one-click post
  works too. It takes effect at once and keeps working when the flag is off.
- **Sender identity.** Every email names the sender and a postal address from
  `NEWSLETTER_SENDER`. Sign-up refuses to run while that is empty.
- **A subscriber who signs up again** gets the same on-screen answer and no email, so the form
  cannot be used to pester them or to find out who subscribes.
- Confirmation links last 48 hours. The confirmation email also carries a "remove this address
  now" link for someone who did not ask.

## The sign-up card

Not a popup. `portal/public/newsletter-card.js` puts a plain block in the page, above the
footer, in the normal flow. It covers nothing.

- Never on a visitor's first page view. From the second page view, after ten seconds on the
  page; or when an Ask answer has finished.
- Never while an answer is being written (on /ask or in the docked assistant). On /ask there
  is no timer at all, only the end of an answer.
- No layout shift: it is added only while the footer is below the screen, so nothing in view
  moves. If the footer is already in view, it waits for another page view.
- Once per visitor: after it has been on screen, dismissed or used, the device remembers
  (`localStorage` key `opax-newsletter`) and it is not offered again. A browser that cannot
  store that is never shown the card.
- Keyboard and screen reader: an `aside` named by its heading, labelled fields, a named
  dismiss button, a polite status line. It never takes focus when it appears. Dismissing moves
  focus to the footer, where the card was.
- Not in the app's web views, and not on privacy, terms, support, security, community, sign-in,
  press or map pages.
- Turnstile's script loads only when the reader first focuses the form.

**One prompt per page view, and the app prompt wins.** The contract with the app prompt lane
(im-web-app-prompt): whichever prompt appears sets `data-opax-prompt` on `<html>`
(`"app"` or `"newsletter"`) and clears its own value when the page view ends; neither appears
while the other's value is set. The app prompt should claim the view when it decides to show,
at load. The card waits at least ten seconds, so on a view where both qualify the app prompt
is the one shown and the card waits for a later view. The existing one-line app banner at the
top of the page is not a prompt and does not count.

## Storage

Migration `portal/migrations/0020_newsletter.sql`, in the `opax-community` database. Not applied.

`newsletter_subscribers`: `id`, `email`, `editions`, `electorate` (optional, as typed),
`confirm_token_hash`, `confirm_expires_at`, `unsubscribe_token`, `created_at`, `confirmed_at`,
`unsubscribed_at`. There is no member id, analytics id, IP address or source page on the row,
and a test fails if a column is added.

- The confirmation token is stored as a hash. The unsubscribe token is stored as issued,
  because every later edition has to rebuild the same link; the only thing it can do is
  unsubscribe that address.
- **Deletion:** an unsubscribed address is deleted 30 days after unsubscribing (kept that long
  so an issue already queued skips it and a complaint can be answered). An address never
  confirmed is deleted after 7 days. An address the confirmation email could not be sent to is
  deleted at once. `purgeNewsletter()` runs from the five-minute cron while the flag is on.
- No open tracking, no tracking pixel and no click tracking. Links in emails go straight to
  opax.com.au with no per-reader parameter.

`newsletter_counts`: daily totals of submitted, confirmed and unsubscribed, by page type. Not
joined to any subscriber.

## Abuse

- Turnstile, verified on the server (`TURNSTILE_SECRET_KEY`). With no secret the endpoint
  refuses; it does not fall open.
- Same-origin posts only.
- Limits, all as hashed expiring counters: 5 sign-ups an hour per IP address, 3 confirmation
  emails a day per email address, 300 confirmation emails a day across the site. The IP address
  is used for the counter and sent to Turnstile's check; it is not stored.
- The reply is the same for a new, pending or subscribed address, and the email is sent after
  the reply, so the timing is the same too.
- Logs carry event names, a provider message id or an error code. Never an address or token.

## Measurement

Counts only, with page type (`home`, `person`, `bill`, `electorate`, `party`, `topic`, `ask`,
`search`, `money`, `doc`, `other`):

| Step | Where it is counted |
| --- | --- |
| Shown, dismissed, submitted (browser) | Analytics event `opax_newsletter` with `action` and `page_type`, both from fixed lists, with no page path (`portal/analytics/privacy.mjs`). |
| Submitted, confirmed, unsubscribed (server) | `newsletter_counts`. The page type rides in the confirmation link's `from` parameter, so it is never stored against the address. |

## Flags and settings

| Name | Kind | Meaning |
| --- | --- | --- |
| `NEWSLETTER_ENABLED` | var, `"false"` | Exactly `"true"` turns on the card, sign-up and confirm. Off: 404, and pages are unchanged. |
| `NEWSLETTER_SENDER` | var, unset | Legal name and postal address for the footer. Required. |
| `NEWSLETTER_TURNSTILE_SITE_KEY` | var, unset | Turnstile widget's public key. Without it the card is not added. |
| `TURNSTILE_SECRET_KEY` | Worker secret, unset | Turnstile's secret. |

While the card is on, the page Content-Security-Policy also allows
`https://challenges.cloudflare.com` in `script-src` and `frame-src`. With the flag off the
policy is unchanged.

To turn on, in order, each with Jake's approval: publish the privacy and terms text; create
the Turnstile widget (free) and set the key and secret; set `NEWSLETTER_SENDER`; apply
migration 0020 to staging, then production; set the flag on staging and test with real
mailboxes; then production.

## The sending job (designed, not built)

- **Provider.** Editions cannot go through Cloudflare. Options, in US dollars, from public
  price lists and third-party summaries read on 16 November; check the provider's page before
  buying. Volume assumes one or two issues a week per subscriber: about 4,000 to 9,000 emails a
  month at 1,000 subscribers, 43,000 to 87,000 at 10,000.

  | Provider | 1,000 subscribers | 10,000 subscribers | Notes |
  | --- | --- | --- | --- |
  | Amazon SES | about $1 to $2 | about $7 to $14 | $0.10 to $0.16 per 1,000. Cheapest. We keep the list in D1 and do the sending, bounce and complaint handling ourselves (SNS webhooks). Needs an AWS account out of the sandbox. |
  | Postmark (broadcast stream) | $15 | about $55 to $120 | $15 for 10,000 a month, then about $1.80 per 1,000, or the 50,000 tier near $55. Separate broadcast stream protects sign-in mail. Strict about consent, which this design meets. |
  | Mailgun | $15 | $35 to about $90 | Basic 10,000 for $15; Foundation 50,000 for $35; Scale 100,000 for $90. |
  | Buttondown | about $9 | about $79 to $89 | Priced by subscriber. Hosts the list and archive itself, so the address would be held by a second company and its own tracking would have to be turned off. Least code. |

  Recommendation: **Amazon SES** if the list stays in OPAX's database (it matches the privacy
  wording below, and costs a few dollars), with **Postmark** as the choice if Jake would rather
  pay for someone else's deliverability work. Either way editions go from a new subdomain
  (for example `news.opax.com.au`) with its own SPF, DKIM and DMARC, so a newsletter complaint
  cannot hurt sign-in email from `login.opax.com.au`.
- **Building an issue.** A weekly cron reads the same published record files the pages read,
  for the seven days to the cut-off, and fills fixed templates. One issue body per edition for
  Bills; one per electorate for Your MP. The issue is stored before any send, so what was sent
  can be shown.
- **Release.** The first issues are sent to an internal address first and released by an
  operator (`operator-auth.ts`), not automatically. Automatic release is a later decision.
- **Sending.** An outbox table keyed by issue and subscriber, with the reply-email pattern:
  claim with a lease, never resend an uncertain send, retry only named provider errors.
  Recipients come from `newsletterRecipients()` at send time, so an unsubscribe a minute
  before is honoured. Each email carries the unsubscribe link and both headers, the sender
  identity and, where it applies, the authorised line.
- **Bounces and complaints.** A hard bounce or a complaint unsubscribes the address through
  the same path as the link.

## Proposed privacy page change (for Jake; not applied)

Against `portal/public/index.html`, the `/privacy` Email section. Wording to be settled by Jake.

```diff
       <h3>Email</h3>
       <p>Emails come from login.opax.com.au and are sent through Cloudflare's email service.
       OPAX sends sign-in emails, account deletion codes and, when someone replies to a
       discussion you started, a reply notification. You can turn reply emails off in Privacy
-      &amp; messages, and each one has an unsubscribe link. OPAX sends no newsletters or
-      marketing email. Cloudflare's email service keeps its own delivery records, under
+      &amp; messages, and each one has an unsubscribe link. OPAX sends a newsletter only to
+      people who asked for it and confirmed by email; it sends no other marketing email.
+      Cloudflare's email service keeps its own delivery records, under
       <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener">Cloudflare's privacy policy</a>.</p>
+
+      <h2 id="privacy-newsletter">The newsletter</h2>
+      <p>The newsletter is optional and needs no account. You ask for it with your email
+      address, and OPAX emails you a link to confirm. Nothing else is sent unless you
+      confirm.</p>
+      <ul class="about-list">
+        <li><strong>What is stored:</strong> your email address, the editions you chose, the
+        postcode or electorate if you gave one, and the dates you signed up, confirmed and
+        unsubscribed.</li>
+        <li><strong>What it is not joined to:</strong> the list is kept apart from community
+        accounts and from OPAX's usage measurement. OPAX does not record which pages you read
+        against your address, and does not build a profile of you.</li>
+        <li><strong>No tracking in emails:</strong> no tracking pixels, and links are not
+        rewritten to record clicks. OPAX does not know whether you opened an issue.</li>
+        <li><strong>Where it is held:</strong> in OPAX's database on Cloudflare. Issues are
+        sent through [provider], which receives your email address to deliver them.</li>
+        <li><strong>Leaving:</strong> every email has an unsubscribe link. It works at once,
+        and OPAX deletes your address from the list within 30 days. An address that is never
+        confirmed is deleted after 7 days.</li>
+        <li><strong>Never sold or shared:</strong> OPAX does not sell, rent or share the
+        list.</li>
+      </ul>
+      <p>The sign-up form uses Cloudflare Turnstile to check that a person, not a program, is
+      filling it in. Turnstile loads when you start to fill in the form and receives your IP
+      address and browser details, under Cloudflare's privacy policy. OPAX counts sign-ups
+      per IP address for an hour to stop misuse and does not keep the address.</p>
```

Also needed with it: a line in `/terms`, the newsletter in the "what is deleted" notes (it is
separate from account deletion: deleting an account does not unsubscribe the same address, and
the page should say so or the code should do both), the provider added to the list of
companies that receive reader data, and `docs/PRIVACY.md` updated to match.

## Decisions that are Jake's

1. Go or no go, and the order above.
2. The provider for editions and its cost.
3. The privacy and terms wording.
4. The sender identity and postal address printed in every email (`NEWSLETTER_SENDER`), and
   whether the authorised line goes in every edition or only electoral ones.
5. The results edition after 28 November.
6. Confirm by link then button (built, safer against mail scanners) or by link alone.
7. The editions, the default and the send day.
8. Whether deleting a community account should also unsubscribe the same address.
9. The card's wording and the ten-second wait.

## Tests

`portal/test/newsletter.test.mjs`: flag off (nothing stored, checked or sent; pages unchanged),
double opt-in, token reuse, unsubscribe and deletion periods, rate limits and Turnstile, sender
identity and unsubscribe in the email, no address in logs, counts or analytics, and the card's
rules in a browser. The email sender is a list in the test; nothing is sent.
