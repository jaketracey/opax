interface Env {
  /** Present only on staging: the existing public API, with secrets kept in its Worker. */
  STAGING_API?: Fetcher;
  ARAG_KB_ID: string
  ARAG_KB_TOKEN: string
  /** Daily X post (docs/DAILY-POST.md). All optional: missing secrets mean the cron only logs. */
  /** Comma-separated ASNs refused on /api and /og (network-block.ts). */
  BLOCKED_ASNS?: string
  DAILY_POST_ENABLED?: string
  X_API_KEY?: string
  X_API_SECRET?: string
  X_ACCESS_TOKEN?: string
  X_ACCESS_TOKEN_SECRET?: string
  /**
   * Per-pipeline generative model pins (wrangler vars, editable without a code
   * change). 'openai-compatible' is the KB's single OpenRouter slot: model_id
   * @preset/opax-pro (DeepSeek V4 Pro pinned to the DeepSeek provider) since
   * 2026-09-12. Platform-native names such as gemini-2.5-flash-lite generate
   * platform-side and show up as ARAG token burn, not OpenRouter spend.
   */
  ASK_MODEL?: string
  POSITION_RECOVERY_MODEL?: string
  SEARCH_SUMMARY_MODEL?: string
  JOURNEY_STORY_MODEL?: string
  FOLLOWUPS_MODEL?: string
}

declare namespace Cloudflare {
  interface Env {
  /** Present only on staging: the existing public API, with secrets kept in its Worker. */
  STAGING_API?: Fetcher;
  ARAG_KB_ID: string
    ARAG_KB_TOKEN: string
    /** Daily X post (docs/DAILY-POST.md). All optional: missing secrets mean the cron only logs. */
    /** Comma-separated ASNs refused on /api and /og (network-block.ts). */
    BLOCKED_ASNS?: string
    DAILY_POST_ENABLED?: string
    X_API_KEY?: string
    X_API_SECRET?: string
    X_ACCESS_TOKEN?: string
    X_ACCESS_TOKEN_SECRET?: string
  /**
   * Per-pipeline generative model pins (wrangler vars, editable without a code
   * change). 'openai-compatible' is the KB's single OpenRouter slot: model_id
   * @preset/opax-pro (DeepSeek V4 Pro pinned to the DeepSeek provider) since
   * 2026-09-12. Platform-native names such as gemini-2.5-flash-lite generate
   * platform-side and show up as ARAG token burn, not OpenRouter spend.
   */
  ASK_MODEL?: string
  POSITION_RECOVERY_MODEL?: string
  SEARCH_SUMMARY_MODEL?: string
  JOURNEY_STORY_MODEL?: string
  FOLLOWUPS_MODEL?: string
  }
}
