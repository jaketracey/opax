// Both URLs are content-stamped by scripts/stamp_assets.mjs.
const stylesheet = '/app-banner.css?v=a2f04f7742'
const script = '/app-banner.js?v=e094b8f17e'

const APP_STORE = 'https://apps.apple.com/au/app/opax/id6818756305'
const APP_ID = '6818756305'

/** The pages people land on from search, in the order they are read (PostHog
 * page views, 8 to 14 November 2026). Each has a matching screen in the app
 * (mobile/src/navigation/external), so the line can name the record and
 * Apple's banner can open it. The key is the only thing the two analytics events carry.
 * public/app-banner.js holds the same table for in-page navigation; the test
 * keeps the two in step. */
export const APP_PROMPTS = {
  document: 'Read this record in the app',
  supplier: 'See this supplier in the app',
  grant_recipient: 'See this grant recipient in the app',
  ask: 'Ask the public record in the app',
  vic_district: 'See this district in the app',
  member: 'Follow this member in the app',
  electorate: 'Follow this electorate in the app',
  bill: 'Track this bill in the app',
  donor: 'See this donor in the app',
} as const
export type AppPromptType = keyof typeof APP_PROMPTS

// An id may be percent-encoded; nothing here can close an attribute or split
// the Smart App Banner's comma-separated content.
const ID = '[A-Za-z0-9._~%:-]+'
const PROMPT_PATHS: [AppPromptType, RegExp][] = [
  ['document', /^\/doc\/[a-z0-9-]+$/],
  ['supplier', new RegExp(`^/subject/supplier/${ID}$`)],
  // The app opens federal and Queensland recipients, and never a person's.
  ['grant_recipient', new RegExp(`^/money/grants/(?:federal|qld)/recipient/(?!person(?::|%3[Aa]))${ID}$`)],
  ['ask', /^\/ask$/],
  ['vic_district', /^\/vic-election-2026\/[a-z0-9]+(?:-[a-z0-9]+)*$/],
  ['member', /^\/subject\/person\/[a-z0-9-]+$/],
  ['electorate', /^\/subject\/electorate\/[a-z0-9_-]+$/],
  ['bill', /^\/bill\/[a-z0-9-]+$/],
  ['donor', new RegExp(`^/subject/donor/${ID}$`)],
]

/** The page type and the same record's address in the app, or null for a page
 * that keeps the general line. Only the path is read: never a question or a filter. */
export function appPromptFor(pathname: string): { type: AppPromptType; open: string } | null {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  const type = PROMPT_PATHS.find(([, pattern]) => pattern.test(path))?.[0]
  return type ? { type, open: `opax:/${path}` } : null
}

/** Apple's provider token (pt) for campaign links, from App Store Connect.
 * It is the Worker variable APP_STORE_PROVIDER; until that is set the links
 * carry the campaign token alone and no pt at all. Digits only, or ignored. */
let provider = ''
export function setAppStoreProvider(value: string | undefined): void {
  provider = /^\d{1,20}$/.test(value ?? '') ? value! : ''
}
/** One fixed campaign token (ct) per page type, never per visitor, so App
 * Store Connect can say which kind of page an install came from. */
const campaign = (ct: string) => `${provider ? `pt=${provider}&` : ''}ct=${ct}`
export const appStoreLink = (type: AppPromptType) => `${APP_STORE}?${campaign(`web_${type}`)}`

/** Apple's own Smart App Banner, on the prompt pages only. Safari on iPhone and
 * iPad draws it above the page, knows whether the app is installed (Open or
 * View) and hands app-argument to the app. No script and no analytics of ours. */
export function smartBannerMeta(pathname: string): string {
  const prompt = appPromptFor(pathname)
  return prompt ? `<meta name="apple-itunes-app" content="app-id=${APP_ID}, app-argument=${prompt.open}, affiliate-data=${campaign(`web_${prompt.type}_safari`)}">` : ''
}

/** One banner, two lines, both in the HTML so nothing moves when the head
 * script picks one: the general line (every page, and every desktop reader),
 * and on a prompt page the line worded for it, for iPhone and iPad browsers
 * that do not draw Apple's banner. Its one link goes to the App Store: a page
 * cannot know whether the app is installed, and Apple's banner is what offers
 * Open to a reader who has it. */
export function appBannerHTML(pathname = '/'): string {
  const prompt = appPromptFor(pathname)
  return `<div class="opax-app-banner" id="opax-app-banner" role="region" aria-label="OPAX app"${prompt ? ` data-app-prompt="${prompt.type}"` : ''}>
  <div class="opax-app-banner-row">
    <p class="opax-app-banner-general">OPAX is on iPhone<span class="opax-app-banner-ipad"> and iPad</span>. <a href="${APP_STORE}">Get the app</a></p>
    <p class="opax-app-banner-prompt"><a href="${prompt ? appStoreLink(prompt.type) : APP_STORE + (provider ? `?pt=${provider}` : '')}" data-app-prompt-get>${prompt ? APP_PROMPTS[prompt.type] : 'Get the app'}</a></p>
    <button type="button" class="opax-app-banner-dismiss" aria-label="Dismiss" data-app-banner-dismiss><svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m5 5 10 10M15 5 5 15"/></svg></button>
  </div>
</div>`
}
export const APP_BANNER_HTML = appBannerHTML()

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
      /^\/(?:api|support|privacy|community|signin|sign-in|login|auth|oauth)(?:\/|\.html|$)/i.test(url.pathname)) return response

  const transformed = new HTMLRewriter()
    .on('head', { element(el) {
      // No defer or async: visibility is decided before the body can paint.
      // The Smart App Banner tag comes first, so the script can see it is there.
      el.prepend(`${smartBannerMeta(url.pathname)}<link rel="stylesheet" href="${stylesheet}"><script src="${script}"></script>`, { html: true })
    } })
    .on('body', { element(el) { el.prepend(skipLinkHTML(el.getAttribute('data-skip-target')) + appBannerHTML(url.pathname), { html: true }) } })
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
