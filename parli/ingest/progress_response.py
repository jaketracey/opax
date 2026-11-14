"""Stateless Progress refusal detection, suitable for shared repair guards."""
from __future__ import annotations

import json
import re


_REFUSAL = re.compile(
    r'quota|billing|payment|credit|insufficient.?fund|spend.?limit|subscription.?limit'
    r'|\b429\b|rate[\s_-]*limit|too[\s_-]+many[\s_-]+requests|throttl', re.I)


def is_refusal_body(body: object) -> bool:
    """Accept decoded JSON or response text; ignore stored resource content.

    Non-empty error envelopes are failures regardless of their HTTP status.
    Other envelope diagnostics are checked for rate, quota and billing refusals.
    No response body is logged or persisted.
    """
    if isinstance(body, str):
        try:
            decoded = json.loads(body)
        except ValueError:
            pass
        else:
            if isinstance(decoded, (dict, list)):
                return is_refusal_body(decoded)
        return bool(_REFUSAL.search(body))
    if isinstance(body, list):
        return any(is_refusal_body(item) for item in body)
    if not isinstance(body, dict):
        return False
    if body.get('error') or body.get('errors') or body.get('success') is False:
        return True
    # Do not scan extra, title, text or other resource data for political speech
    # about quotas or payments. Only inspect the response envelope diagnostics.
    diagnostics = {key: body[key] for key in
                   ('detail', 'message', 'reason', 'status', 'status_code', 'code') if key in body}
    return bool(_REFUSAL.search(json.dumps(diagnostics)))
