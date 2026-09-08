interface Env {
  /** Present only on staging: the existing public API, with secrets kept in its Worker. */
  STAGING_API?: Fetcher;
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  ARAG_KB_ID: string
  ARAG_KB_TOKEN: string
}

declare namespace Cloudflare {
  interface Env {
  /** Present only on staging: the existing public API, with secrets kept in its Worker. */
  STAGING_API?: Fetcher;
    STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  ARAG_KB_ID: string
    ARAG_KB_TOKEN: string
  }
}
