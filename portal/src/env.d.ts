interface Env {
  /** Present only on staging: the existing public API, with secrets kept in its Worker. */
  STAGING_API?: Fetcher;
  ARAG_KB_ID: string
  ARAG_KB_TOKEN: string
}

declare namespace Cloudflare {
  interface Env {
  /** Present only on staging: the existing public API, with secrets kept in its Worker. */
  STAGING_API?: Fetcher;
    ARAG_KB_ID: string
    ARAG_KB_TOKEN: string
  }
}
