interface Env {
  /** Present only on staging: the existing public API, with secrets kept in its Worker. */
  STAGING_API?: Fetcher;
  ARAG_KB_ID: string
  ARAG_KB_TOKEN: string
  /** Daily X post (docs/DAILY-POST.md). All optional: missing secrets mean the cron only logs. */
  DAILY_POST_ENABLED?: string
  X_API_KEY?: string
  X_API_SECRET?: string
  X_ACCESS_TOKEN?: string
  X_ACCESS_TOKEN_SECRET?: string
}

declare namespace Cloudflare {
  interface Env {
  /** Present only on staging: the existing public API, with secrets kept in its Worker. */
  STAGING_API?: Fetcher;
  ARAG_KB_ID: string
    ARAG_KB_TOKEN: string
    /** Daily X post (docs/DAILY-POST.md). All optional: missing secrets mean the cron only logs. */
    DAILY_POST_ENABLED?: string
    X_API_KEY?: string
    X_API_SECRET?: string
    X_ACCESS_TOKEN?: string
    X_ACCESS_TOKEN_SECRET?: string
  }
}
