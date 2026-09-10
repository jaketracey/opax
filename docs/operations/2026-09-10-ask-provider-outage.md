# Ask provider outage — 10 September 2026

## Symptom and cause

The production question “Who takes gambling money, and what do they say about
pokies?” returned an SSE `error` event containing `ask failed (412)`. The HTTP
response itself was 200, so checking HTTP status alone missed the failure.
The first request and its lighter retry failed immediately; money context still
rendered because its records are independent of answer generation.

The Progress `/ask` response body exposed OpenRouter's underlying 404:
“No allowed providers are available for the selected model.” The Opax preset
allowed only `deepseek`, but the model's listed hosts no longer included it.
Reducing retrieval size could not repair this routing restriction.

## Production configuration change

At 02:05 UTC the existing `opax` preset was updated from version 2 to version 3:

```json
{
  "model": "deepseek/deepseek-v4-flash-0731",
  "provider": {
    "order": ["deepseek"],
    "allow_fallbacks": true
  },
  "reasoning": {"enabled": false}
}
```

The only configuration change was replacing `provider.only` with
`provider.order`. The model and disabled reasoning remain unchanged. The KB
still references `@preset/opax`, so this is a live provider configuration
release; it does not require a Worker deployment. Reading the designated
version back confirmed version 3 and the exact configuration above.

The old preset's descriptive text still describes strict pinning; use the
designated version's configuration as the source of truth.

## Remaining recovery blocker

A direct preset call then returned 403, `Key limit exceeded (total limit)`.
Read-only account checks found the Opax key's lifetime cap was US$300, usage
US$300.027937444, and remaining key allowance zero. The account had approximately
US$40.33 in existing credit at that check. The key cap and account balance are
separate controls.

The proposed next step is to raise the key's cap to US$340, using existing
credit without purchasing more. User approval is pending; no cap, payment,
auto-recharge, or credential changes were made. Do not describe Ask as restored
until the checks below pass.

## Recovery verification

1. Read `/api/v1/presets/opax` and confirm the designated configuration has no
   `provider.only` restriction and retains `reasoning.enabled: false`.
2. Read OpenRouter `/api/v1/key` and `/api/v1/credits`. Confirm both key allowance
   and account credit, without printing API keys.
3. Make one bounded preset completion. Confirm a non-empty answer and
   `usage.completion_tokens_details.reasoning_tokens` equal to zero.
4. Submit the reported question to production `/api/ask?stream=1`. Inspect SSE
   events, not just HTTP status: require `done`, non-empty answer, valid
   citations and linked original sources, with no `error` event.
5. Verify the synchronous Ask path and the actual mobile Safari/WebKit flow.
   Preserve question filters and confirm that the answer, citations and
   source links render.

Do not bypass a spending cap by replacing the key or changing billing providers.
The earlier preset can be restored by posting its saved full configuration as
a new version, but strict pinning currently recreates the routing failure.

## References

- [OpenRouter presets](https://openrouter.ai/docs/guides/features/presets): creating
  a preset version using `POST /api/v1/presets/{slug}/chat/completions`.
- [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection):
  `order` expresses preference; `only` restricts eligible hosts.
- [Management API keys](https://openrouter.ai/docs/guides/overview/auth/management-api-keys):
  changing an existing key's limit requires management access.

Before/update provider responses are retained in the local maintenance evidence
directory. Credentials and full account responses are not committed.
