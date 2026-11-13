// Both URLs are content-stamped by scripts/stamp_assets.mjs.
const stylesheet = '/app-banner.css?v=f3743e87ba'
const script = '/app-banner.js?v=ebe7550a36'

export const APP_BANNER_HTML = `<div class="opax-app-banner" id="opax-app-banner">
  <div class="opax-app-banner-row">
    <p>OPAX is now on iPhone and iPad. <a href="https://apps.apple.com/au/app/opax/id6818756305">Get the app on the App Store</a></p>
    <button type="button" class="opax-app-banner-dismiss" aria-label="Dismiss" data-app-banner-dismiss><svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m5 5 10 10M15 5 5 15"/></svg></button>
  </div>
</div>`

/** The page's first tab stop, ahead of the banner: a keyboard reader skips the
 * banner and the masthead in one step. app-banner.js moves focus to the page's
 * title (its H1); without scripts the anchor still lands on index.html's main. */
export const SKIP_LINK_HTML = '<a class="opax-skip-link" href="#main" data-skip-link>Skip to content</a>'

/** One response boundary covers asset pages and every Worker page. Policy and
 * community (including sign-in) pages stay clear for App Review. Audience and
 * dismissal checks run in the browser, so cached HTML is the same for everyone. */
export function withAppBanner(response: Response, url: URL): Response {
  if (!response.body || !response.headers.get('content-type')?.startsWith('text/html') ||
      /^\/(?:api|support|privacy|community|signin|sign-in|login|auth)(?:\/|\.html|$)/i.test(url.pathname)) return response

  const transformed = new HTMLRewriter()
    .on('head', { element(el) {
      // No defer or async: visibility is decided before the body can paint.
      el.prepend(`<link rel="stylesheet" href="${stylesheet}"><script src="${script}"></script>`, { html: true })
    } })
    .on('body', { element(el) { el.prepend(SKIP_LINK_HTML + APP_BANNER_HTML, { html: true }) } })
    // The page's own skip link (index.html) gives way to the one above, which comes first.
    .on('a[href="#main"]:not([data-skip-link])', { element(el) { el.remove() } })
    .transform(response)
  const out = new Response(transformed.body, transformed)
  out.headers.delete('content-length')
  // Worker page validators already include the deployed Worker version. A raw
  // asset validator describes the file before this shared chrome was added.
  if (!/^W\/"h-/.test(out.headers.get('etag') ?? '')) out.headers.delete('etag')
  out.headers.delete('last-modified')
  return out
}
