// Both URLs are content-stamped by scripts/stamp_assets.mjs.
const stylesheet = '/app-banner.css?v=f3743e87ba'
const script = '/app-banner.js?v=9829079d3e'

export const APP_BANNER_HTML = `<div class="opax-app-banner" id="opax-app-banner">
  <div class="opax-app-banner-row">
    <p>OPAX is now on iPhone and iPad. <a href="https://apps.apple.com/au/app/opax/id6818756305">Get the app on the App Store</a></p>
    <button type="button" class="opax-app-banner-dismiss" aria-label="Dismiss" data-app-banner-dismiss><svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m5 5 10 10M15 5 5 15"/></svg></button>
  </div>
</div>`

/** The page's first tab stop, ahead of the banner: a keyboard reader skips the
 * banner and the masthead in one step. It points at the page's own main element,
 * which the page names on its body (data-skip-target: index.html's "main",
 * home's "hp-main", /press's "press-main", the map's "map"), so it works without
 * scripts; app-banner.js then moves focus to the title (H1) inside it. */
export function skipLinkHTML(target: string | null): string {
  const id = /^[A-Za-z][\w-]*$/.test(target ?? '') ? target : 'main'
  return `<a class="opax-skip-link" href="#${id}" data-skip-link>Skip to content</a>`
}
export const SKIP_LINK_HTML = skipLinkHTML('main')

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
    .on('body', { element(el) { el.prepend(skipLinkHTML(el.getAttribute('data-skip-target')) + APP_BANNER_HTML, { html: true }) } })
    // Every page marks its own skip link data-skip; it gives way to the one above, which comes first.
    .on('a[data-skip]', { element(el) { el.remove() } })
    .transform(response)
  const out = new Response(transformed.body, transformed)
  out.headers.delete('content-length')
  // Worker page validators already include the deployed Worker version. A raw
  // asset validator describes the file before this shared chrome was added.
  if (!/^W\/"h-/.test(out.headers.get('etag') ?? '')) out.headers.delete('etag')
  out.headers.delete('last-modified')
  return out
}
