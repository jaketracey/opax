# Shared structured-data tools

`portal/src/tools/index.ts` is the catalog for the data-tool lanes. Add a module's exported `tool` to `tools` once and bump `TOOL_REGISTRY_VERSION`. MCP registration, input validation and the current Ask adapter then use the same definition and handler. The six existing record/grant MCP tools keep their existing registration and behavior.

```ts
import { readToolAsset, type ToolDefinition } from './types'

export const tool: ToolDefinition = {
  name: 'example_rank',
  description: 'One or two plain sentences explaining the published data and scope.',
  inputSchema: {
    type: 'object', additionalProperties: false,
    properties: { jurisdiction: { type: 'string', enum: ['federal'] } },
    examples: [{ jurisdiction: 'federal' }],
  },
  stepLabel: () => ({ label: 'Checking example data', arg: 'example indicator' }),
  async handler(env, args) {
    // Read published JSON with readToolAsset(env, path), or query env.TABLE_DB.
    // Return the exact published figures; never call generation here.
    return { rows: [], citations: [], notes: ['No published example data.'] }
  },
}
```

The example is interface guidance, not a registered tool.

## API

- `tools`: immutable catalog of `ToolDefinition` entries.
- `getTool(name)`: look up a canonical MCP name; `listTools()` returns name, description and JSON Schema.
- `parseToolArgs(name, args)`: validate the shared schema, name/slug/ID selectors and optional cross-field `validate(args)`; throws `ToolInputError` with code `-32602`. Conventional `name`, `slug`, `id` and fields ending in `_name`, `_slug`, `_id` are checked automatically; declare other selectors in `identifierFields`. `validToolIdentifier` allows letters, numbers, spaces, dots, apostrophes, parentheses, underscores and hyphens, capped at 200 characters before and after normalization. Free-text queries are outside this selector check.
- `validateToolArgs(env, name, args)`: additionally run the module's optional async `validateKnown(env, args)` against its published catalog. MCP calls this after its existing authentication/abuse checks and before SDK dispatch, so unknown electorate selectors return `-32602`. Ask uses the same validation through `callTool` and returns a non-answer. An unavailable catalog remains an operational error.
- `callTool(env, name, args)`: validate, call the module handler and return canonical JSON. Operational failures return empty rows/citations with an error, never partial leaders or model substitutions.
- `toolSchema(name)`: the compiled schema used by the existing MCP SDK. JSON Schema remains the module's source of truth; the installed Zod converter is covered by contract tests.
- `getAskTool(name)` and `askToolSpecs`: thin compatibility adapters for the route lane's existing `ToolSpec`/`ToolResult` interface. A module can declare an optional `askName` for an existing plan; new tools should use their canonical name on both surfaces.
- `readToolAsset(env, path)`: read from the request's ASSETS binding or fixture/read adapter, respecting its abort signal. No external fetch or generation fallback.

`ToolEnv` exposes public `ASSETS`, `TABLE_DB`, `COMMUNITY_ORIGIN`, an optional asset read adapter, canonical origin and abort signal. It is derived from generated Worker binding types. Ask carries bindings through `ToolDeps.toolEnv`; the scoped asset adapter and signal take precedence.

Every handler returns `{ rows, citations, notes, ...metadata }`. Each citation has `{ text, url, value?, kind? }`; `text` must bind the figure to its entity, indicator and unit, and `url` must open its source page. The Ask adapter creates fact templates directly from citation text. An empty supported scope returns empty rows plus an explicit reason and coverage notes. Keep the confident-match donor rule, omit placeholder nodes, and include a no-causation note in joined money/votes results.

## Electorates and Ask

`portal/src/tools/electorates.ts` exports canonical `electorates_rank`. Its temporary Ask name is `electorates`, retaining the four existing gold plans. The old `agentic-tool-electorates.ts` path only re-exports compatibility helpers; no second implementation remains.

Agentic Ask is integrated from `origin/main` at `f38a55251`. Both surfaces retain the shared registry:

1. `agentic-tools.ts`: spread `askToolSpecs` into `TOOL_SPECS`, validate registry arguments through `validRegisteredArgs`, and include `TOOL_REGISTRY_VERSION` in the cache version.
2. `agentic-ask.ts`: use `getAskTool` for registry step labels and turn each registry citation into a bound fact. Retain round 1's electorate classifier/plan and no-speech-fallback behavior.
3. `index.ts`: expose public bindings as `agenticDeps(...).toolEnv`; retain cancellation/scoped asset reads.
4. `community-mcp.ts`: retain the existing auth, origin, request-size and rate-limit prefix, the six existing tools, and the new registry loop. Prevalidate registry calls after authentication to return JSON-RPC `-32602`; valid output has identical text JSON and `structuredContent`.

Other lanes own their classifier and deterministic plan rules. Registry addition needs no hand-written MCP schema or second handler. Each lane must add a contract test, Ask/MCP gold parity tests and its reference entry under `/methods#mcp`.

The integration preserves main's named-entity binding, scope checks, scoped cache keys and cancellation. Census requests skip speech-name resolution, use only electorate lookups, and return Census non-answers without ordinary speech fallback. Main's table harness already includes `localMiniflare`, the isolated root, persistence/runtime paths and unique D1 name. The resolved integration follows the review's table:

| Conflicting file | Against | Resolution |
|---|---|---|
| `portal/public/index.html` | Both | Keep datatable/vote-table imports and MCP docs; regenerate style/app hashes and SPA shell. |
| `portal/src/agentic-tools.ts` | Route | Keep registry adapters/validation; combine route's `agentic-tools-4` version with `TOOL_REGISTRY_VERSION`. |
| `portal/src/agentic-ask.ts` | Route | Combine registry facts/labels with round-3 entity binding and scope checks. Census plans skip speech-name resolution and retain Census-only execution. Keep requested ranking limits and render all returned Census rows, including cutoff ties, instead of applying the speech answer's eight-fact limit. |
| `portal/src/index.ts` | Route | Preserve round-3 scoped cache keys and scope propagation, `toolEnv`, and Census non-answer handling without speech fallback. Census cache keys must retain selector punctuation/controls so rejected names cannot reuse a validated lookup answer. |
| `portal/test/table-d1-harness.mjs` | Main | Keep `localMiniflare` plus main's isolated root, persistence/temp paths and unique D1 name (resolved in this lane). |

Ask's deterministic electorate plans parse complete digit, spaced and hyphenated number-word counts through 99. Counts above 20 consistently decline, with the requested count and the limit in the notes; they never return a silently truncated ranking. Counts from 1 to 20 include every tie at the cutoff. Ordinal positions are recognized and declined because individual rank lookups are unsupported; “first three” is a count of three. The tool's MCP limit remains 1–50. Speech intent, including remarks, statements, said, speeches, debate and mentioned, retains speech routing.
