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
- `parseToolArgs(name, args)`: validate the shared schema and optional cross-field `validate(args)`; throws `ToolInputError` with code `-32602`.
- `callTool(env, name, args)`: validate, call the module handler and return canonical JSON. Operational failures return empty rows/citations with an error, never partial leaders or model substitutions.
- `toolSchema(name)`: the compiled schema used by the existing MCP SDK. JSON Schema remains the module's source of truth; the installed Zod converter is covered by contract tests.
- `getAskTool(name)` and `askToolSpecs`: thin compatibility adapters for the route lane's existing `ToolSpec`/`ToolResult` interface. A module can declare an optional `askName` for an existing plan; new tools should use their canonical name on both surfaces.
- `readToolAsset(env, path)`: read from the request's ASSETS binding or fixture/read adapter, respecting its abort signal. No external fetch or generation fallback.

`ToolEnv` exposes public `ASSETS`, `TABLE_DB`, `COMMUNITY_ORIGIN`, an optional asset read adapter, canonical origin and abort signal. It is derived from generated Worker binding types. Ask carries bindings through `ToolDeps.toolEnv`; the scoped asset adapter and signal take precedence.

Every handler returns `{ rows, citations, notes, ...metadata }`. Each citation has `{ text, url, value?, kind? }`; `text` must bind the figure to its entity, indicator and unit, and `url` must open its source page. The Ask adapter creates fact templates directly from citation text. An empty supported scope returns empty rows plus an explicit reason and coverage notes. Keep the confident-match donor rule, omit placeholder nodes, and include a no-causation note in joined money/votes results.

## Electorates and the route merge

`portal/src/tools/electorates.ts` exports canonical `electorates_rank`. Its temporary Ask name is `electorates`, retaining the four existing gold plans. The old `agentic-tool-electorates.ts` path only re-exports compatibility helpers; no second implementation remains.

The route lane was not an ancestor of refreshed `origin/main` when this change began. Its merge must retain:

1. `agentic-tools.ts`: spread `askToolSpecs` into `TOOL_SPECS`, validate registry arguments through `validRegisteredArgs`, and include `TOOL_REGISTRY_VERSION` in the cache version.
2. `agentic-ask.ts`: use `getAskTool` for registry step labels and turn each registry citation into a bound fact. Retain round 1's electorate classifier/plan and no-speech-fallback behavior.
3. `index.ts`: expose public bindings as `agenticDeps(...).toolEnv`; retain cancellation/scoped asset reads.
4. `community-mcp.ts`: retain the existing auth, origin, request-size and rate-limit prefix, the six existing tools, and the new registry loop. Prevalidate registry calls after authentication to return JSON-RPC `-32602`; valid output has identical text JSON and `structuredContent`.

Other lanes own their classifier and deterministic plan rules. Registry addition needs no hand-written MCP schema or second handler. Each lane must add a contract test, Ask/MCP gold parity tests and its reference entry under `/methods#mcp`.

The final merge preview against route commit `fa7dd6917f45a63706ed1281f746f931ab175a87` merges every source hook automatically. It has one `portal/public/index.html` conflict: the route adds `datatable.css`, `vote-tables.css` and `vote-tables.js` alongside the style import, while this lane updates the style hash. Keep those three incoming imports, this lane's MCP reference section, and the style import; run `npm run stamp` after resolving so the style hash and generated SPA shell match the combined tree. Do not resolve the hunk by dropping the vote-table imports.
