interface Env {
  /** Read-only DataTable queries; data loading is a separate local operation. */
  TABLE_DB: D1Database
  /** Publication waits for Jake's election authorisation decision. Exact "true" only. */
  VIC_ELECTION_HUB_ENABLED?: string
  AUTHORISATION_LINE?: string
  CORRECTION_CONTACT?: string
  /** Minimum native app version; absent/invalid defaults to 0.0.0 (never blocks). Raising it is Jake's deliberate update lever. */
  APP_MINIMUM_VERSION?: string
  /** HMAC-SHA-256 key for sign-in and member-bound deletion codes. Separate Worker secret in each environment. */
  COMMUNITY_CODE_MAC_SECRET?: string
  /** Optional eight-digit store reviewer credential; code-reviewed emails only. */
  REVIEWER_LOGIN_CODE?: string
  /** Present only on staging: the existing public API, with secrets kept in its Worker. */
  STAGING_API?: Fetcher;
  ARAG_KB_ID: string
  ARAG_KB_TOKEN: string
  /** Social publication: each channel requires its own credentials and identity. */
  /** Comma-separated ASNs refused on /api and /og (network-block.ts). */
  BLOCKED_ASNS?: string
  /** Comma-separated ASNs refused only on the model-backed /api routes (network-block.ts). */
  GENERATION_BLOCKED_ASNS?: string
  DAILY_POST_ENABLED?: string
  /** Bearer secret for POST /api/daily-post/run (an operator\'s chosen edition). */
  DAILY_POST_OPERATOR_SECRET?: string
  X_API_KEY?: string
  X_API_SECRET?: string
  X_ACCESS_TOKEN?: string
  X_ACCESS_TOKEN_SECRET?: string
  X_ACCOUNT_ID?: string
  X_USERNAME?: string
  FACEBOOK_POST_ENABLED?: string
  FACEBOOK_PAGE_ID?: string
  FACEBOOK_PAGE_TOKEN?: string
  INSTAGRAM_POST_ENABLED?: string
  INSTAGRAM_STORY_ENABLED?: string
  FACEBOOK_STORY_ENABLED?: string
  INSTAGRAM_ACCOUNT_ID?: string
  INSTAGRAM_USERNAME?: string
  INSTAGRAM_ACCESS_TOKEN?: string
  META_API_VERSION?: string
  /** Bluesky (AT Protocol): the account handle, an app password (secret), the PDS (default https://bsky.social). */
  BLUESKY_POST_ENABLED?: string
  BSKY_HANDLE?: string
  /** The account's DID, served at /.well-known/atproto-did so the domain can be the handle. */
  BSKY_DID?: string
  BSKY_APP_PASSWORD?: string
  BSKY_SERVICE?: string

  /**
   * Per-pipeline generative model pins (wrangler vars, editable without a code
   * change). 'openai-compatible' is the KB's single OpenRouter slot: model_id
   * @preset/opax-pro (DeepSeek V4 Pro pinned to the DeepSeek provider) since
   * 2026-09-12, and every pipeline uses it: platform-native names such as
   * gemini-2.5-flash-lite would generate platform-side as ARAG token burn.
   */
  ASK_MODEL?: string
  POSITION_RECOVERY_MODEL?: string
  SEARCH_SUMMARY_MODEL?: string
  JOURNEY_STORY_MODEL?: string
  FOLLOWUPS_MODEL?: string
  MONEY_OVERVIEW_MODEL?: string
  /** Default off. Orchestrator sets route after review; shadow remains available. */
  AGENTIC_ASK_MODE?: 'off' | 'shadow' | 'route'
  RESEARCH_LOOP?: 'off' | 'shadow' | 'route'
  RESEARCH_LOOP_STEPS?: string
  RESEARCH_LOOP_MS?: string
  RESEARCH_LOOP_TOKENS?: string
  RESEARCH_LOOP_DAILY_USD?: string
  /** Request-local policy, created only after operatorAuthorized passes. */
  RESEARCH_EVAL?: import('./research-eval').ResearchEvalState
  /** Provisioned by Jake; optional so missing configuration falls back. */
  OPENROUTER_API_KEY?: string
  /** Optional operator-configured token prices, USD per million, for monitoring. */
  AGENTIC_INPUT_USD_PER_MILLION?: string
  AGENTIC_OUTPUT_USD_PER_MILLION?: string

}

declare namespace Cloudflare {
  interface Env {
  /** Read-only DataTable queries; data loading is a separate local operation. */
  TABLE_DB: D1Database
    APP_MINIMUM_VERSION?: string
    /** HMAC-SHA-256 key for sign-in and member-bound deletion codes. Separate Worker secret in each environment. */
    COMMUNITY_CODE_MAC_SECRET?: string
    /** Optional eight-digit store reviewer credential; code-reviewed emails only. */
    REVIEWER_LOGIN_CODE?: string
  /** Present only on staging: the existing public API, with secrets kept in its Worker. */
  STAGING_API?: Fetcher;
  ARAG_KB_ID: string
    ARAG_KB_TOKEN: string
    /** Social publication: each channel requires its own credentials and identity. */
    /** Comma-separated ASNs refused on /api and /og (network-block.ts). */
    BLOCKED_ASNS?: string
    /** Comma-separated ASNs refused only on the model-backed /api routes (network-block.ts). */
    GENERATION_BLOCKED_ASNS?: string
    DAILY_POST_ENABLED?: string
    DAILY_POST_OPERATOR_SECRET?: string
    X_API_KEY?: string
    X_API_SECRET?: string
    X_ACCESS_TOKEN?: string
    X_ACCESS_TOKEN_SECRET?: string
    X_ACCOUNT_ID?: string
    X_USERNAME?: string
    FACEBOOK_POST_ENABLED?: string
    FACEBOOK_PAGE_ID?: string
    FACEBOOK_PAGE_TOKEN?: string
    INSTAGRAM_POST_ENABLED?: string
  INSTAGRAM_STORY_ENABLED?: string
  FACEBOOK_STORY_ENABLED?: string
    INSTAGRAM_ACCOUNT_ID?: string
    INSTAGRAM_USERNAME?: string
    INSTAGRAM_ACCESS_TOKEN?: string
    META_API_VERSION?: string
    BLUESKY_POST_ENABLED?: string
    BSKY_HANDLE?: string
    BSKY_DID?: string
    BSKY_APP_PASSWORD?: string
    BSKY_SERVICE?: string

  /**
   * Per-pipeline generative model pins (wrangler vars, editable without a code
   * change). 'openai-compatible' is the KB's single OpenRouter slot: model_id
   * @preset/opax-pro (DeepSeek V4 Pro pinned to the DeepSeek provider) since
   * 2026-09-12, and every pipeline uses it: platform-native names such as
   * gemini-2.5-flash-lite would generate platform-side as ARAG token burn.
   */
  ASK_MODEL?: string
  POSITION_RECOVERY_MODEL?: string
  SEARCH_SUMMARY_MODEL?: string
  JOURNEY_STORY_MODEL?: string
  FOLLOWUPS_MODEL?: string
  MONEY_OVERVIEW_MODEL?: string
  }
}
