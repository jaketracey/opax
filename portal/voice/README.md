# Opax voice browser client

`node voice/build.mjs` (from `portal/`) builds the small `/voice.js` module,
lazy ElevenLabs SDK chunks, and content-addressed self-hosted audio worklets.

Voice is a feature of the chat, not a surface of its own. The module exports
`createVoiceAssistant({ mount, trigger })` and mounts nothing by itself:
`app.js` `import()`s it by bare path the first time the chat composer's mic
button (`#chat-mic`) is pressed, and passes that button as the `trigger` — the
element that owns `aria-haspopup`/`aria-expanded` and takes focus back when the
panel closes. The handle is `{ open, close, toggle, destroy }`. The page needs
`/voice.css`; because the module is imported by bare path it carries no `?v=`
stamp and takes the generic `/*.js` cache policy from `public/_headers`.

The panel mounts inside `#panel-chat`: docked it fills the assistant in the
corner, and on `/chat` it is its own sheet. Placement and visibility belong to
the dock (the docked-assistant block in `public/style.css`); the client owns
only the conversation.

Opening the panel only fetches `/api/voice/status`. Only **Start talking** loads
the SDK, primes playback, creates a reservation and requests the microphone.
No transcript, signed URL, account identifier or audio is persisted in browser
storage or emitted to analytics. Transcript DOM uses text nodes and allows only
same-origin published Opax record links.

The backend owns the ten-minute lifetime allowance and session reconciliation.
The browser timer is a display and extra stop guard, never billing authority.
`start.expires_at` is a short reservation expiry, not the live call's deadline.

## ElevenLabs 1.25.0 compatibility

The build uses guarded exact replacements for four upstream implementation
gaps. A changed upstream match fails the build and requires review:

- Pass an attempt-specific `AbortSignal` through capture and WebSocket setup.
  Capture calls use the local guard instead of replacing any browser API. A
  cancelled pending permission request stops its eventual stream immediately.
- Close successful input/output setup when its parallel counterpart fails.
- Pass the self-hosted resampler path to the output setup as well as input.
- Replace automatic document-wide iOS audio priming with explicit start-button
  priming. Closing or navigating away closes that context.

The public SDK's `Conversation.startSession`, callbacks, `setMicMuted` and
`endSession` still own the conversation. No provider protocol or authentication
logic is replaced. The backend supplies a same-origin proxied WebSocket URL.

`script-src 'self' 'wasm-unsafe-eval'`, `worker-src 'self'`, microphone permission
for self, and explicit same-origin WSS hosts are sufficient. `blob:`, `data:`,
`unsafe-eval`, external SDK scripts and external audio worklet hosts are not
needed. The resampler embeds its Wasm and is loaded only when browser sample
rates require it.

## Browser verification

After a build, run `node voice/check.mjs`. Set `OPAX_PLAYWRIGHT_MODULE` to an
installed Playwright module if it is not on the normal import path. The check
starts and stops its own local static server and uses synthetic API responses,
microphone streams and sockets. It never calls a paid provider or real account.
Its harness page mounts the client the way `app.js` does, from a trigger button.

It covers Chromium and WebKit at 320, 390, 768 and 1440 pixels (667-pixel mobile
height), opening focus and Escape, lazy loading, signed-out/disabled/exhausted
states, transcripts and safe source links, mute/end, reservation and connection
cancellation, denied permission, navigation/background/offline teardown and
allowance exhaustion. It also runs the actual bundled SDK with self-hosted Wasm
worklets under the required CSP, including delayed mic permission, delayed
socket metadata, partial audio setup failure and immediate track release.

### Staging browser verification, 9 September 2026

The shipped client was exercised against staging deployment `015601b1` in
Chromium at 390 × 667, using a separate synthetic account and synthetic
microphone. The real provider returned conversation metadata, its greeting
transcript and two audio events; the browser audio element was actively
playing. Start returned 201. End stopped both microphone tracks, removed the
audio element and closed the socket. Finish and the following status request
returned 200 with no active session. The synthetic account's remaining
allowance reconciled from 90 to 88 seconds. There were no CSP violations or
uncaught browser errors. The browser context was fully closed before account
cleanup. No email was sent.

## Agent prompt and tools (`agent-config.json`, `agent-sync.mjs`)

The ElevenLabs agent's prompt and its eight webhook tools are kept in
`agent-config.json`. `{{origin}}` becomes the agent's OPAX origin (from the
`agents` table) and `{{voice_tool_secret_id}}` the provider secret that holds
`VOICE_TOOL_SECRET`. The sync script only reads the provider until `--apply`.

```sh
cd portal
export ELEVENLABS_API_KEY=...      # never printed by the script
npm run voice:agent -- --agent <agent_id>            # dry run: the plan, nothing changed
npm run voice:agent -- --agent <agent_id> --apply    # back up, then apply, then re-check
```

`--apply` runs in this order:

1. It reads the agent, its attached tools, and workspace tools with a configured
   name.
2. It saves all of that to
   `~/.cache/opax/voice-agent-backups/<agent_id>-<time>.json` (mode 600, outside
   the repository; `--backup-dir` or `OPAX_VOICE_BACKUP_DIR` to change). It
   prints the path, never the contents.
3. It creates or updates the tools. A configured tool matches an attached tool
   with its name first, then a workspace tool with its name and this
   environment's URL. Staging and production tools share names, never URLs, so a
   re-run after a half-finished apply reuses the tool it created.
4. One agent update sets the prompt and attaches the tools. If that update
   fails, the script lists the tools it created (not attached) and updated, and
   the agent is unchanged. The update carries `tool_ids` and never the
   deprecated inline `prompt.tools`: ElevenLabs refuses a body with both
   (`400 both_tools_and_tool_ids_provided`, staging 13 November 2026) and its
   [agent tools deprecation guide](https://elevenlabs.io/docs/eleven-agents/customization/tools/agent-tools-deprecation)
   says POST and PATCH reject any request carrying `prompt.tools`, so the key
   is left out rather than sent as an empty list. Inline
   entries the agent also has as tool ids or built-in tools are left alone; a
   configured name is replaced by its tool id; any other inline entry would be
   dropped, so the plan raises a PROBLEM and `--apply` is refused until it is
   attached in the dashboard.
5. It reads the agent back (prompt compared with whitespace normalised), then
   runs the dry run again and exits non-zero unless every tool is `same` and
   attached and the prompt is unchanged.

The plan raises a PROBLEM, and `--apply` is refused before any backup or
write, when an attached tool of a configured name posts to another origin: it
may be the other environment's tool, and updating it would repoint that agent
too. The tool secret is only ever taken from tools that post to this
environment's origin.

To undo, restore from the backup the apply printed. It is a dry run without
`--apply`, and it backs up the current state first:

```sh
npm run voice:agent -- --agent <agent_id> --restore ~/.cache/opax/voice-agent-backups/<file>.json
npm run voice:agent -- --agent <agent_id> --restore ~/.cache/opax/voice-agent-backups/<file>.json --apply
```

Restore puts back the agent's prompt and `tool_ids` and each saved tool's
config. A backup's `prompt.tools` is not sent, for the same reason. Tools the apply created are detached, not deleted; delete them in the
ElevenLabs dashboard if unwanted.

### Provider fields used, and where they are defined

Checked against the public API reference on 13 November 2026. The tool fields
are `WebhookToolConfig` on
[tools/create](https://elevenlabs.io/docs/api-reference/tools/create) and
[tools/get](https://elevenlabs.io/docs/api-reference/tools/get).

| Field | Values used | Reference |
| --- | --- | --- |
| `tool_config.type`, `name`, `description` | `webhook` | [tools/create](https://elevenlabs.io/docs/api-reference/tools/create) (`WebhookToolConfig`) |
| `response_timeout_secs` | 90 for `ask_opax`, 20 otherwise (allowed 5 to 300, default 20) | [tools/create](https://elevenlabs.io/docs/api-reference/tools/create) |
| `pre_tool_speech` | `force` for `ask_opax`, `off` otherwise (`auto`, `force`, `off`) | [tools/create](https://elevenlabs.io/docs/api-reference/tools/create) |
| `execution_mode` | `immediate` (`immediate`, `post_tool_speech`, `async`) | [tools/create](https://elevenlabs.io/docs/api-reference/tools/create) |
| `tool_call_sound`, `tool_call_sound_behavior` | `typing`, `auto` for `ask_opax` only | [tools/create](https://elevenlabs.io/docs/api-reference/tools/create) |
| `api_schema.url`, `method` | `POST` to `/api/voice/tools/<name>` | [tools/create](https://elevenlabs.io/docs/api-reference/tools/create) (`WebhookToolApiSchemaConfig-Input`) |
| `api_schema.request_headers` | `x-opax-voice-token: {"secret_id": ...}` (`ConvAISecretLocator`) | [tools/get](https://elevenlabs.io/docs/api-reference/tools/get) |
| `request_body_schema` `type`, `description`, `required`, `properties` | object | [tools/create](https://elevenlabs.io/docs/api-reference/tools/create) (`ObjectJsonSchemaProperty-Input`) |
| property `type`, `description`, `dynamic_variable` | `session_id` uses `dynamic_variable: opax_session_id` and no description: only one of description, dynamic_variable, constant_value, is_system_provided and is_omitted may be set | [tools/get](https://elevenlabs.io/docs/api-reference/tools/get) (`LiteralJsonSchemaProperty`) |
| agent `conversation_config.agent.prompt.prompt`, `tool_ids` | prompt text, tool ids | [agents/get](https://elevenlabs.io/docs/api-reference/agents/get), [agents/update](https://elevenlabs.io/docs/api-reference/agents/update) |
| tool list `search`, `page_size`, `cursor` | name prefix search, 100 per page | [tools/list](https://elevenlabs.io/docs/api-reference/tools/list) |
