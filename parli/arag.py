"""
parli.arag -- Progress Agentic RAG (Nuclia) client for OPAX.

Two credential planes (do not mix them up — most 403s are a wrong-token problem):
  - NUA key (account-level): create/list/delete knowledge boxes, mint service
    accounts. 403s on KB-scoped writes. Header: x-nuclia-nuakey.
  - KB service-account token (SOWNER): all KB data ops — ingest, /find, /ask,
    DA tasks. Header: x-nuclia-serviceaccount.

Two hosts per zone:
  - rag-host  https://{zone}.rag.progress.cloud  — retrieval (/find, /ask) + ingest
  - dp-host   https://{zone}.dp.progress.cloud   — DA tasks, account management

Environment:
  ARAG_ZONE        e.g. aws-ap-southeast-2-1
  ARAG_ACCOUNT     account UUID (NOT the slug — the API rejects slugs)
  ARAG_NUA_KEY     account-level key
  ARAG_KB_ID       OPAX knowledge box id
  ARAG_KB_TOKEN    OPAX KB service-account token (SOWNER)

Enrichment (DA tasks) is intentionally NOT wired to run anywhere in this
module's ingest path — tasks only start via an explicit start_task() call,
which scripts/arag_provision.py gates behind cost approval.
"""

import json
import os
import time
from dataclasses import dataclass
from typing import Any, Optional

import requests

DEFAULT_ZONE = "aws-ap-southeast-2-1"

# Transient statuses worth retrying (backpressure 429 is handled separately).
_RETRY_STATUSES = {500, 502, 503, 504}
_MAX_RETRIES = 6


def rag_base(zone: str) -> str:
    return f"https://{zone}.rag.progress.cloud/api/v1"


def dp_base(zone: str) -> str:
    return f"https://{zone}.dp.progress.cloud/api/v1"


class AragError(Exception):
    def __init__(self, status: int, url: str, detail: str):
        self.status = status
        self.url = url
        self.detail = detail[:500]
        self.backpressure = _parse_backpressure(status, detail)
        super().__init__(f"ARAG {status} {url}: {self.detail[:200]}")

    @property
    def retryable(self) -> bool:
        return self.backpressure is not None or self.status in _RETRY_STATUSES


def _parse_backpressure(status: int, detail: str) -> Optional[dict]:
    """The platform reports ingestion backpressure as HTTP 429 with
    {"detail": {"message": ..., "try_after": <epoch>, "back_pressure_type": ...}}.
    Expected and transient under bulk load — wait until try_after, then retry."""
    if status != 429:
        return None
    try:
        d = json.loads(detail).get("detail", {})
        if isinstance(d, dict) and isinstance(d.get("try_after"), (int, float)):
            return {
                "try_after": d["try_after"],
                "kind": d.get("back_pressure_type", "unknown"),
                "message": d.get("message", ""),
            }
    except (json.JSONDecodeError, AttributeError):
        pass
    return None


def _request(
    method: str,
    url: str,
    headers: dict,
    body: Any = None,
    timeout: int = 120,
    max_retries: int = _MAX_RETRIES,
) -> Any:
    """HTTP with backpressure-aware retries. Returns parsed JSON (or None for 204).

    Backpressure 429s never count against max_retries — the platform is pacing
    a saturated ingest queue, which is expected during bulk load. We wait as
    told (capped 15 min/cycle, 24 h total per request) instead of failing."""
    attempt = 0
    bp_waited = 0.0
    while True:
        try:
            res = requests.request(
                method, url, headers=headers,
                json=body if body is not None else None,
                timeout=timeout,
            )
        except requests.RequestException as e:
            if attempt >= max_retries:
                raise AragError(0, url, f"network error: {e}") from e
            time.sleep(min(2 ** attempt, 60))
            attempt += 1
            continue

        if res.ok:
            if res.status_code == 204 or not res.content:
                return None
            try:
                return res.json()
            except json.JSONDecodeError:
                return res.text

        err = AragError(res.status_code, url, res.text)
        if err.backpressure and bp_waited < 86400:
            wait = max(5.0, min(err.backpressure["try_after"] - time.time(), 900))
            time.sleep(wait)
            bp_waited += wait
            continue
        if err.retryable and attempt < max_retries:
            time.sleep(min(2 ** attempt, 60))
            attempt += 1
            continue
        raise err


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


@dataclass
class AragConfig:
    zone: str
    account: str = ""
    nua_key: str = ""
    kb_id: str = ""
    kb_token: str = ""

    @classmethod
    def from_env(cls) -> "AragConfig":
        return cls(
            zone=os.environ.get("ARAG_ZONE", DEFAULT_ZONE).strip(),
            account=os.environ.get("ARAG_ACCOUNT", "").strip(),
            nua_key=os.environ.get("ARAG_NUA_KEY", "").strip(),
            kb_id=os.environ.get("ARAG_KB_ID", "").strip(),
            kb_token=os.environ.get("ARAG_KB_TOKEN", "").strip(),
        )

    @property
    def kb_configured(self) -> bool:
        return bool(self.kb_id and self.kb_token)


def load_dotenv(path: str = ".env") -> None:
    """Minimal .env loader (no dependency): KEY=VALUE lines into os.environ."""
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())


# ---------------------------------------------------------------------------
# Account-level client (NUA key)
# ---------------------------------------------------------------------------


class AccountClient:
    """Account ops via the NUA key. Only for KB lifecycle — never data ops."""

    def __init__(self, cfg: AragConfig):
        if not cfg.nua_key:
            raise ValueError("ARAG_NUA_KEY is not set")
        if not cfg.account:
            raise ValueError(
                "ARAG_ACCOUNT is not set (must be the account UUID; "
                "find it in the dashboard URL or ask the account owner)"
            )
        self.cfg = cfg
        self._headers = {
            "content-type": "application/json",
            "x-nuclia-nuakey": f"Bearer {cfg.nua_key}",
        }

    def _url(self, path: str) -> str:
        return f"{dp_base(self.cfg.zone)}/account/{self.cfg.account}{path}"

    def list_kbs(self) -> list[dict]:
        out = _request("GET", self._url("/kbs"), self._headers)
        return out if isinstance(out, list) else out.get("kbs", [])

    def create_kb(self, slug: str, title: str, description: str = "") -> str:
        """Create a KB (idempotent on slug); returns the KB id."""
        existing = next((k for k in self.list_kbs() if k.get("slug") == slug), None)
        if existing:
            return existing["id"]
        created = _request(
            "POST", self._url("/kbs"), self._headers,
            {"slug": slug, "title": title, "description": description, "zone": self.cfg.zone},
        )
        return created["id"]

    def delete_kb(self, kb_id: str) -> None:
        """Permanently delete a knowledge box and everything in it."""
        _request("DELETE", self._url(f"/kb/{kb_id}"), self._headers)

    def patch_kb(self, kb_id: str, body: dict) -> Any:
        return _request("PATCH", self._url(f"/kb/{kb_id}"), self._headers, body)

    def mint_kb_token(self, kb_id: str, sa_title: str = "opax-api") -> str:
        """Create (or reuse) a SOWNER service account on the KB and mint a token."""
        sa_path = f"/kb/{kb_id}/service_accounts"
        listed = _request("GET", self._url(sa_path), self._headers) or []
        sa_id = next((s["id"] for s in listed if s.get("title") == sa_title), None)
        if not sa_id:
            created = _request(
                "POST", self._url(sa_path), self._headers,
                {"title": sa_title, "role": "SOWNER"},
            )
            sa_id = created["id"]
        expires = int(time.time()) + 364 * 24 * 3600
        key = _request(
            "POST",
            self._url(f"/kb/{kb_id}/service_account/{sa_id}/keys"),
            self._headers,
            {"expires": expires},
        )
        return key["token"]


# ---------------------------------------------------------------------------
# KB-level client (service-account token)
# ---------------------------------------------------------------------------


class KbClient:
    """Data operations on one knowledge box using its service-account token."""

    def __init__(self, cfg: AragConfig):
        if not cfg.kb_configured:
            raise ValueError("ARAG_KB_ID / ARAG_KB_TOKEN are not set")
        self.cfg = cfg
        self._headers = {
            "content-type": "application/json",
            "x-nuclia-serviceaccount": f"Bearer {cfg.kb_token}",
        }

    # rag-host for data/retrieval; dp-host for DA tasks.
    def _rag(self, path: str) -> str:
        return f"{rag_base(self.cfg.zone)}/kb/{self.cfg.kb_id}{path}"

    def _dp(self, path: str) -> str:
        return f"{dp_base(self.cfg.zone)}/kb/{self.cfg.kb_id}{path}"

    # -- resources ---------------------------------------------------------

    def create_resource(self, body: dict, max_retries: int = _MAX_RETRIES) -> dict:
        """POST /resources. Body carries slug/title/texts/origin/usermetadata/extra.
        409 (slug exists) is surfaced as AragError for the caller to treat as done."""
        return _request(
            "POST", self._rag("/resources"), self._headers, body, max_retries=max_retries
        )

    def patch_resource_by_slug(self, slug: str, body: dict) -> Any:
        return _request("PATCH", self._rag(f"/slug/{slug}"), self._headers, body)

    def delete_resource_by_slug(self, slug: str) -> None:
        _request("DELETE", self._rag(f"/slug/{slug}"), self._headers)

    def get_resource_by_slug(self, slug: str, **params) -> dict:
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        return _request(
            "GET", self._rag(f"/slug/{slug}" + (f"?{qs}" if qs else "")), self._headers
        )

    def get_text_field_by_slug(self, slug: str, field_id: str) -> dict:
        """Fetch one text field without serializing the complete resource."""
        return _request(
            "GET", self._rag(f"/slug/{slug}/text/{field_id}"), self._headers
        )

    def counters(self) -> dict:
        return _request("GET", self._rag("/counters"), self._headers)

    def catalog(self, **params) -> dict:
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        return _request("GET", self._rag("/catalog" + (f"?{qs}" if qs else "")), self._headers)

    # -- retrieval ---------------------------------------------------------

    def find(self, query: str, *, top_k: int = 20, filter_expression: Optional[dict] = None,
             features: Optional[list[str]] = None,
             show: Optional[list[str]] = None) -> dict:
        body: dict[str, Any] = {
            "query": query,
            "top_k": top_k,
            # Platform default is already 'predict'; pin it so a future default
            # change cannot silently un-rerank this path.
            "reranker": "predict",
        }
        if show:
            # origin (speaker) and extra (date) aren't serialized by default.
            body["show"] = show
        if features:
            body["features"] = features
        if filter_expression:
            # NOTE: /find and /ask key this as {"field": ...}; /catalog as {"resource": ...}.
            body["filter_expression"] = filter_expression
        return _request("POST", self._rag("/find"), self._headers, body)

    def ask(self, query: str, *, filter_expression: Optional[dict] = None,
            citations: bool = True, answer_json_schema: Optional[dict] = None,
            prompt: Optional[str] = None, top_k: int = 20) -> dict:
        """Grounded, cited answer. HARD CONSTRAINT: never send citations=True
        together with answer_json_schema — it crashes the backend (500/503)."""
        if citations and answer_json_schema:
            raise ValueError("citations and answer_json_schema are mutually exclusive (platform bug)")
        body: dict[str, Any] = {
            "query": query,
            "citations": citations,
            "top_k": top_k,
            "reranker": "predict",
        }
        if answer_json_schema:
            body["answer_json_schema"] = answer_json_schema
        if prompt:
            body["prompt"] = {"user": prompt}
        if filter_expression:
            body["filter_expression"] = filter_expression
        headers = {**self._headers, "x-synchronous": "true"}
        return _request("POST", self._rag("/ask"), headers, body, timeout=300)

    # -- DA tasks (enrichment) — explicit start only, never from ingest ----

    def list_tasks(self) -> Any:
        return _request("GET", self._dp("/tasks"), self._headers)

    def start_task(self, name: str, parameters: dict, apply: str = "all",
                   enabled: bool = True) -> Any:
        """Start a Data-Augmentation task. COSTS PLATFORM TOKENS on the whole
        corpus — callers must gate this behind explicit human approval.
        Always pin parameters['llm']['model'] or the task 200s then fails silently."""
        return _request(
            "POST", self._dp("/task/start"), self._headers,
            {"name": name, "parameters": parameters, "apply": apply, "enabled": enabled},
        )

    def delete_task(self, task_id: str) -> None:
        """Remove a task config (also clears zombie labeler configs after a 422)."""
        _request("DELETE", self._dp(f"/task/{task_id}"), self._headers)
