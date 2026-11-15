// The newsletter sign-up card (docs/NEWSLETTER.md). The Worker adds an inert
// <template> and a deferred script to a page only while NEWSLETTER_ENABLED is
// exactly "true" and a Turnstile site key is set; with the flag off a page is
// byte-for-byte what it was. The script is deferred and the stylesheet is
// fetched only when the card is about to appear, so neither holds up a page.
// When, where and whether the card appears is
// decided in the browser (public/newsletter-card.js), so cached HTML is the
// same for everyone.

// Unstamped, on the default asset cache (as not-found.js is): public/_headers is at
// Workers Assets' 100-rule limit, and each stamped file needs an immutable rule there.
const stylesheet = '/newsletter-card.css'
const script = '/newsletter-card.js'

/** Turnstile's script and its challenge frame: the one extra origin a page with the card may load, and only after the reader focuses the form. */
export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com'

export const newsletterCardOn = (env: { NEWSLETTER_ENABLED?: string; NEWSLETTER_TURNSTILE_SITE_KEY?: string }): boolean =>
  String(env.NEWSLETTER_ENABLED) === 'true' && /^[\w-]{10,100}$/.test(env.NEWSLETTER_TURNSTILE_SITE_KEY ?? '')

/** Pages that never carry the card: data, policy and account pages, and the map (no page footer to sit above). */
const EXCLUDED = /^\/(?:api|og|mcp|oauth|support|privacy|terms|security|community|signin|sign-in|login|auth|map|press)(?:\/|\.html|$)/i

export const NEWSLETTER_CARD_HTML = `<aside class="opax-newsletter" aria-labelledby="opax-newsletter-title">
  <div class="opax-newsletter-inner">
    <div class="opax-newsletter-head">
      <h2 id="opax-newsletter-title">The record, once a week</h2>
      <button type="button" class="opax-newsletter-dismiss" aria-label="Dismiss newsletter sign-up" data-newsletter-dismiss><svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m5 5 10 10M15 5 5 15"/></svg></button>
    </div>
    <p class="opax-newsletter-lede">A weekly email of bills that moved in parliament. Every item links to its source.</p>
    <form class="opax-newsletter-form" novalidate>
      <div class="opax-newsletter-field">
        <label for="opax-newsletter-email">Email address</label>
        <input id="opax-newsletter-email" name="email" type="email" autocomplete="email" inputmode="email" required maxlength="254" aria-describedby="opax-newsletter-status">
      </div>
      <button type="submit" class="opax-newsletter-submit">Subscribe</button>
      <div class="opax-newsletter-check" data-newsletter-check></div>
    </form>
    <p class="opax-newsletter-status" id="opax-newsletter-status" role="status" aria-live="polite"></p>
    <p class="opax-newsletter-fine">You confirm by email before anything is sent. Unsubscribe from any edition. <a href="/privacy">Privacy</a></p>
  </div>
</aside>`

export function withNewsletterCard(response: Response, url: URL, siteKey: string): Response {
  if (!response.body || response.status !== 200 || !response.headers.get('content-type')?.startsWith('text/html') || EXCLUDED.test(url.pathname)) return response
  const transformed = new HTMLRewriter()
    .on('head', { element(el) { el.append(`<script src="${script}" defer></script>`, { html: true }) } })
    .on('body', { element(el) { el.append(`<template id="opax-newsletter-template" data-site-key="${siteKey}" data-stylesheet="${stylesheet}">${NEWSLETTER_CARD_HTML}</template>`, { html: true }) } })
    .transform(response)
  const out = new Response(transformed.body, transformed)
  out.headers.delete('content-length')
  if (!/^W\/"h-/.test(out.headers.get('etag') ?? '')) out.headers.delete('etag')
  out.headers.delete('last-modified')
  return out
}
