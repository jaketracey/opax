# Opax voice assistant

The bottom-right **Talk to Opax** panel is optional. A signed-in community member normally receives 600 seconds in total, shared across tabs and devices. Operator-approved accounts may have unlimited repeated calls, still limited to 600 seconds per call and the shared provider and application budgets. Opening the panel does not request microphone access or load the voice SDK. Start talking explicitly begins capture; ending, closing, navigating or leaving the tab stops it. Ask and public records remain available when voice time runs out.

## Provider configuration

Configured 9 September 2026, with separate private agents and restricted keys:

| Environment | Agent | Key credit ceiling per refresh | App monthly seconds |
| --- | --- | ---: | ---: |
| Production | `agent_9901m22sz1chfpbtqb7r2kkxdskv` | 300,000 | 40,000 |
| Staging | `agent_1501m22syqc3fhqsjkxnfy7d0xag` | 30,000 | 3,000 |

ElevenLabs exposes key ceilings in credits rather than USD. The configured ceilings combined are about USD99 at the existing Creator additional-credit rate (USD0.30/1,000 credits). This is a conversion, not a native dollar billing cap; revisit it if the plan or pricing changes. Account usage-based overage was disabled and left disabled. No plan upgrade, automatic top-up or new subscription was enabled. The account's included credit pool can therefore stop calls before the key ceilings.

Use ElevenAgents Write permission: despite being a GET, signed-URL issuance rejects a read-only key with `missing_permissions: convai_write`. Keys are Worker secrets, never browser assets. All other API endpoint permissions are disabled.

The voice is the premade Australian Charlie (`IKne3meq5aSn9XLyUdCD`), using `eleven_flash_v2` and `gemini-3.5-flash-lite` with minimal reasoning. Audio streams directly through a small same-origin WebSocket relay, without another LLM hop. Seven relevant tools are available: search records, read a record, find connections, corpus coverage, grants, topics and parties. The prompt requires source checks, neutral language and a distinction between grant awards and payments. Production record tools have Pre-tool speech set to Off, and the agent prompt requests quiet tool execution so successive searches and reads do not repeat a spoken preamble.

Agent authentication is private, restricted to the matching Opax origin. Maximum conversation length is 600 seconds with the duration override explicitly allowed. Bursting is disabled and concurrency is two. Audio recording is off and provider transcript retention is one day, with deletion enabled. Visitor conversation text is not sent to Opax analytics.

## Server enforcement

`voice_sessions` in COMMUNITY_DB atomically reserves the member's remaining time, monthly budget and one of two call slots. A short unused reservation expires without charge. Only its owner can claim it, once. The provider signed URL stays inside the Worker and uses the single-use signature option.

The relay replaces client initiation data with the trusted session ID and remaining duration. Prompt, identity, tools and time overrides from the browser are discarded. Tool endpoints require both a provider secret and a live, enabled member session. Tools only read approved public sources and return bounded text and source links.

The Worker timer and provider maximum duration both end a call. Only a confirmed clean provider close returns unused reserved time. A network failure or Worker interruption conservatively retains the reservation; this can consume a member's remaining allowance after a failed call. Do not refund from a browser-reported timer. Review a confirmed provider conversation before a manual correction.

## Build, deploy and disable

The SDK and resampler are pinned. `portal/voice/build.mjs` applies guarded compatibility patches for cancellable microphone setup and local audio worklets. An upstream change fails the build instead of silently dropping those fixes. Hashed SDK chunks load only after Start talking; worklets and resampling Wasm are self-hosted. CSP allows WebAssembly compilation, without general `unsafe-eval` or third-party script origins. Microphone access is limited to the same origin.

1. Apply all migrations through `portal/migrations/0004_voice_access.sql` to the target COMMUNITY_DB using Wrangler migrations.
2. Install `ELEVENLABS_API_KEY` and `VOICE_TOOL_SECRET` using Wrangler secrets; use separate values for each environment.
3. Set VOICE_AGENT_ID and VOICE_MONTHLY_SECONDS in that environment. Enable with VOICE_ENABLED=`true`.
4. Run `npm run build:voice`, `npm run stamp`, `npm run check` and `npm test` from portal.
5. Use `npm run deploy:staging` first, then `npm run deploy -- --env ''` after verification. These commands rebuild and content-stamp the public assets.

Disable new calls by deploying VOICE_ENABLED=`false`. Existing calls remain bounded by their current deadline. Disable the provider key for an immediate provider-side stop. Retain voice session rows for the lifetime account allowance; deleting them resets the affected usage.

Official references: [JavaScript SDK](https://elevenlabs.io/docs/eleven-agents/libraries/java-script), [agent authentication](https://elevenlabs.io/docs/eleven-agents/customization/authentication), [API key controls](https://elevenlabs.io/docs/overview/administration/workspaces/api-keys).

## Operator-approved unlimited calls

`voice_access` contains only explicit member entitlements. Setting `unlimited=1` permits a fresh reservation after a call ends; it does not extend a running call, clear usage history, waive authentication, or bypass monthly budgets and concurrency limits. There is no public API to grant this access. Provision an exact verified member ID through an operator database change. Set `unlimited=0` to restore the standard lifetime allowance. Apply migration 0004 before deploying code that reads this table.
