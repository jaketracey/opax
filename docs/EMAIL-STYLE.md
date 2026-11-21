# Email style

Every email OPAX sends is drawn with one layout, `portal/src/email-layout.ts`, so that an email looks like the app: a paper ground, one raised card, serif record headings over a system sans body, and navy as the one tint.

## The emails OPAX sends

The Worker has one mail binding, `COMMUNITY_EMAIL` (Cloudflare Email Sending, from `hello@login.opax.com.au`, sender name "Opax"). Three places send through it, and nothing else in the repository sends mail. `portal/test/email-layout.test.mjs` counts the sends, so a fourth fails the test until it is listed here.

| Email | Sent when | Sent from | Subject | Built by |
| --- | --- | --- | --- | --- |
| Sign-in link | Someone asks to sign in to the community on the web | `community-auth.ts` | Your sign-in link for Opax | `signInEmail(link)` |
| Sign-in link with app code | The app asks to sign in: the same email, with an eight-digit code to type in the app | `community-auth.ts` | Your sign-in link for Opax | `signInEmail(link, code)` |
| Reply notification | Someone replies to a discussion the member started, and the member has reply emails on. Queued in `community_email_outbox` and sent by the five-minute cron | `community-notifications.ts` | New reply to your Opax discussion | `replyEmail(...)` |
| Account deletion code | A signed-in member asks to delete their account | `community-deletion.ts` | Confirm your Opax account deletion | `deletionEmail(origin, code)` |

All four builders are in `portal/src/community-email.ts`. The embedded mark is `portal/src/community-email-mark.ts`.

The weekly digest is not sent yet. The layout carries it (see "A digest" below), and `digest-example` in the samples shows it.

### What they looked like before

The sign-in and reply emails shared a template in `community-email.ts`: a 560 px card with square corners, a navy masthead band with a bronze rule under it, Arial body text at 16 px, a square navy button, bronze links, the reason for the email inside the card, and a centred footer. The dark theme was a navy ground with a bronze button.

The account deletion email was plain text only, written where it was sent.

## The layout

`emailLayout(spec)` takes an email's facts and returns `{subject, html, text, attachments}`, ready to spread into `COMMUNITY_EMAIL.send`. No caller passes HTML: every value is escaped in the layout.

```ts
emailLayout({
  origin,            // the site's origin, for the footer's home and privacy links
  subject,           // under 50 characters; says what the email is
  preheader,         // the line a mailbox shows after the subject
  title,             // the one h1
  blocks: [          // in order, inside the card
    {kind: 'text', text},
    {kind: 'code', label, code, note},        // a one-time code, set large
    {kind: 'quote', title, text},             // someone else's words
    {kind: 'items', heading, items},          // a digest list (below)
  ],
  action: {href, label},   // the one button; leave out for an email with nothing to press
  note,                    // fine print under the button
  reason,                  // why this person got this email (footer)
  links: [{href, label}],  // this email's own footer links: manage, unsubscribe
  text,                    // the plain-text part; left out, it is written from the fields above
})
```

From top to bottom: the mark and "OPAX" with the full name; the card (title, blocks, the button, the note, the button's address as a line to copy); then a plain footer with the reason, the email's own links, the site and account privacy links, the tagline and who sent it.

### Design choices

- **Tokens.** Colours and spacing are the values in `docs/design/design-tokens.json`: `paper` ground, `raised` card, `sunken` code panel, `ink` and `inkSoft` text, `dividerSubtle` rules. Corner radii and type follow the app (`mobile/src/design/tokens.ts`): container corners (22) on the card, tile corners (18) on the code panel, `recordTitle` (serif 28/36) for the title, `recordHeading` (serif 22/30) for digest headings, `rowRecord` (serif 17/23) for item titles, body at 17, secondary at 15, footnote at 13. Body text keeps a longer line (26) than the app's for reading in a mailbox.
- **Navy is the one tint.** The button is a navy pill and every link is navy and underlined. Bronze appears only in the mark, as in the app.
- **One column, 600 px at most**, on tables with inline styles. No web fonts (system sans, Georgia for serif), no scripts, no background images.
- **One button at most.** It is a padded link 50 px tall, with a VML fallback for Outlook. Under it the same address is printed to copy. Footer links and digest titles are each on a line of their own, 44 px tall.
- **Light and dark.** Light colours are inline, so a client that ignores dark mode still reads. Dark colours (the tokens' dark values) come from `prefers-color-scheme`, the `color-scheme` meta, and `[data-ogsc]` for Outlook.com.
- **Images off.** The only image is the mark, embedded in the message (`cid:opax-brand-mark`), 40 by 40 with empty alt text because "OPAX" is written beside it. Nothing is lost with images off, and no remote request is made.
- **Text size.** Sizes are in px with fixed line heights that scale together; nothing is clipped at 200%, because no box has a fixed height.
- **A plain-text part for every email**, with the same facts and links.
- **Only https links.** An address that is not `https:` (`javascript:`, `data:`, a bare path) is drawn as plain text, and an action with such an address is not drawn at all. OPAX sends no `mailto:` links.
- **Nothing that tracks.** No pixel and no redirect: every link is the address it goes to, the same one as in the text part. The tests hold each email to its own list of links.

## Copy edits

Subjects, link targets, expiry times, codes and the text parts are unchanged. The words that changed:

1. **Reply notification, footer.** Was one sentence: "You're receiving this because you started this discussion. Manage email notifications or unsubscribe from reply emails." Now the sentence ends after "discussion." and the two links sit on lines of their own: "Manage email notifications" and "Unsubscribe from reply emails" (the same wording the text part already used). The targets are the same.
2. **Account deletion code.** It was text only, so its HTML part is new: the title "Confirm your account deletion", the preheader "Your code to delete your Opax account. Valid for 15 minutes.", and the label "Your Opax account deletion code" over the code. The sentences after the code are the text part's own, and the text part is unchanged. The HTML footer carries the site and account privacy links like every other email; it has no button and no sign-in link.
3. **Sign-in with app code.** "Your Opax app sign-in code" is now a label above the code rather than the start of a sentence, so its colon is gone. The words are the same.
4. **Every email, footer.** One line added: "Sent by OPAX, the Open Parliamentary Accountability Exchange." The reason for the email ("If you didn't request this email, you can safely ignore it." and the like) moved from inside the card to the footer, unchanged. "Open Parliamentary Accountability Exchange" now sits beside the mark rather than in a masthead band.

## A digest

The newsletter builds a spec and calls `emailLayout`; it needs no template of its own.

```ts
emailLayout({
  origin,
  subject: 'This week in Parliament',
  preheader: 'Three records from the sitting week, each with its source.',
  title: 'This week in Parliament',
  blocks: [
    {kind: 'text', text: 'Three records from the sitting week of 9 November 2026.'},
    {kind: 'items', heading: 'Bills', items: [
      {title, href, summary, source, sourceHref, date},   // summary, sourceHref and date are optional
    ]},
  ],
  action: {href: origin + '/', label: 'Open OPAX'},
  reason: 'You’re receiving this because you subscribed to the OPAX weekly digest.',
  links: [{href: unsubscribeUrl, label: 'Unsubscribe from the digest'}],
})
```

Each item shows its title as a link to the OPAX page, an optional summary, and a "Source:" line naming where the record came from (linked when `sourceHref` is given) with its date. With no `text`, the plain-text part is written from the same fields, each link on its own line. The sender adds the `List-Unsubscribe` and `List-Unsubscribe-Post` headers beside the layout's result, as `replyEmail` does, pointing at the same address as the footer link. `digestSpec` in `portal/scripts/email-samples.mjs` is a worked example, and the tests hold it to the same rules as the sent emails.

## Seeing them

```sh
node portal/scripts/render-emails.mjs [folder] [--before=<git ref>]
```

writes each email to one folder (default `portal/private/email-preview`, not committed) as `<email>.<before|after>.<light|dark>.html`, with the plain-text part as `<email>.after.txt` and an `index.html`. "Before" is the email as `origin/main` (or the given ref) drew it. The script sends nothing.

```sh
OPAX_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node portal/scripts/screenshot-emails.mjs [html folder] [png folder]
```

screenshots every page at 390 px and 700 px wide, offline, and fails if a page asks for anything outside the message.

## Adding an email

1. Write a builder in `community-email.ts` that returns `emailLayout({...})`, and spread it into the send. A send never writes its own subject or body.
2. Add a sample to `portal/scripts/email-samples.mjs`, with every link the email may carry.
3. Add a row to the table above, and raise the send count in `portal/test/email-layout.test.mjs`.
