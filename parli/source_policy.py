"""Source policy: how each source's text may be used, and the withheld list.

One file, ``parli/ingest/source_policy.json``, read here for Python and by
``parli/ingest/source_policy.mjs`` for the Workers and the Node builds. The two loaders
apply the same rules and are tested against each other.

``sources`` maps a source id (a commission id such as ``vic-major-infrastructure``, a knowledge
base ``source`` label or origin source id) to its record. ``use`` is one of four tiers:

  documents_only  listed and linked; no text is indexed, quoted, excerpted or summarised
  search_only     text may be indexed privately to point to a hearing and page; it is never
                  sent to a language model and never excerpted
  quote_and_cite  Ask may find and show short attributed quotations with their citations; no
                  model writes its own account of the text
  full            indexed; Ask may research it and quote it

``CAPABILITIES`` is the one table of what each tier allows. Two flags are off unless the
record says ``"allowed"``, and both need the full tier:

  summaries      machine summaries and topic labels (enrichment, report summaries)
  kb_generation  text may reach a path where the knowledge base itself generates an answer

``hosts`` and ``names`` let the Worker recognise a record, fact or link as the source's. A key
may also be a document id (a knowledge base slug such as ``speech-123``, or
``<source id>/<document key>``) holding only ``use``, which overrides its source. A source that
is not listed is governed by its own pipeline's rules and is treated as full with both flags on;
hearing transcript text is published only for a source listed as full.

The withheld list (the takedown list) is never in this repository: an entry, or an id that
resolves to a document, can itself disclose that an order exists. ``withheld.example.json``
is its empty shape. Python reads the real list from a private store on the machine that runs
it: the ``OPAX_WITHHELD_JSON`` environment variable, else the file named by
``OPAX_WITHHELD_FILE``, else ``~/.config/opax/withheld.json``, which must be readable by its
owner only (mode 600). No store is "nothing withheld". A store that is there and cannot be
read or validated is an error, and the job stops rather than push.

Each entry names one source or one document, a reason class, the date and an optional
``mode`` (``list_only``, the default, or ``hide``), and nothing else. Only the mode ever
leaves this loader. No message, log line or exception here repeats an entry.
"""
from __future__ import annotations

from datetime import date
import hashlib
import json
import os
from pathlib import Path
import re

PATH = Path(__file__).resolve().parent / "ingest" / "source_policy.json"
SCHEMA = 2
USES = ("documents_only", "search_only", "quote_and_cite", "full")
# index: held in an index to locate a hearing and page. quote: a tool may return a short attributed
# quotation. narrative: a model may write its own sentences from the text. kb: may be pushed to the
# knowledge base.
CAPABILITIES = {
    "documents_only": [],
    "search_only": ["index"],
    "quote_and_cite": ["index", "quote"],
    "full": ["index", "quote", "narrative", "kb"],
}
# Never sent on a path where the knowledge base generates text, whatever its tier or flags say.
KB_GENERATION_NEVER = ("vic-major-infrastructure",)
REASONS = ("publisher_request", "legal_order", "withdrawn", "amended_pending")
MODES = ("list_only", "hide")
# The only wording a reader sees for a withheld item, whatever the reason.
NOTICE = "Not available on OPAX. Open the publisher's copy."
PRIVATE_SCHEMA = 1
SOURCE_ID = re.compile(r"^[a-z0-9][a-z0-9._-]{0,199}$")
DOCUMENT_ID = re.compile(r"^[a-z0-9][a-z0-9._-]{0,199}(?:/[a-z0-9][a-z0-9._-]{0,199})?$")
HOST = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$")
SOURCE_KEYS = ("use", "summaries", "kb_generation", "hosts", "names")

def allows(use, capability) -> bool:
    return capability in CAPABILITIES.get(use, [])


class PolicyError(ValueError):
    """The policy file is malformed. Every reader fails closed on it."""


class Withheld(ValueError):
    """A write was refused because the source or document is withheld or its tier does not allow it."""


def _real_date(value) -> bool:
    try:
        return isinstance(value, str) and date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False


def _source_of(document):
    return document.split("/", 1)[0] if isinstance(document, str) and "/" in document else None


class Policy:
    def __init__(self, data, withheld=()):
        if not isinstance(data, dict) or set(data) != {"schema", "sources"} or data["schema"] != SCHEMA:
            raise PolicyError("source policy must hold exactly schema and sources")
        if not isinstance(data["sources"], dict) or not isinstance(withheld, (list, tuple)):
            raise PolicyError("source policy sources must be an object and withheld a list")
        self._records = {}
        for key, record in data["sources"].items():
            if not isinstance(key, str) or not DOCUMENT_ID.match(key) or not isinstance(record, dict) or record.get("use") not in USES:
                raise PolicyError(f"source entry {key!r} is not a source or document id with a known use")
            if any(k not in SOURCE_KEYS for k in record) or ("/" in key and set(record) != {"use"}):
                raise PolicyError(f"source entry {key!r} holds a field that is not allowed")
            for flag in ("summaries", "kb_generation"):
                if flag in record and record[flag] != "allowed":
                    raise PolicyError(f'{flag} may only be "allowed"')
            # Both flags let a model write from the text, so they need the tier that allows it.
            if (record.get("summaries") or record.get("kb_generation")) and not allows(record["use"], "narrative"):
                raise PolicyError("summaries and kb_generation need the full tier")
            if record.get("kb_generation") and key in KB_GENERATION_NEVER:
                raise PolicyError("this source may never be sent to knowledge base generation")
            hosts, names = record.get("hosts"), record.get("names")
            if "hosts" in record and not (isinstance(hosts, list) and hosts and all(isinstance(h, str) and HOST.match(h) for h in hosts)):
                raise PolicyError("hosts must be host names")
            if "names" in record and not (isinstance(names, list) and names and all(isinstance(n, str) and 8 <= len(n) <= 200 for n in names)):
                raise PolicyError("names must be the source's own names")
            if record["use"] == "quote_and_cite" and not hosts and not names:
                raise PolicyError("a quote_and_cite source needs hosts or names")
            self._records[key] = dict(record)
        self._sources, self._documents = {}, {}
        self._entries = [dict(e) for e in withheld if isinstance(e, dict)]
        # Messages here never repeat an entry: an error line must not name what is withheld.
        for entry in withheld:
            if not isinstance(entry, dict) or set(entry) - {"mode"} not in ({"source", "reason", "date"}, {"document", "reason", "date"}):
                raise PolicyError("a withheld entry holds exactly source or document, reason, date and an optional mode")
            if entry["reason"] not in REASONS or not _real_date(entry["date"]) or entry.get("mode", "list_only") not in MODES:
                raise PolicyError("a withheld entry needs a known reason class, an ISO date and a known mode")
            kind = "source" if "source" in entry else "document"
            ident = entry[kind]
            if not isinstance(ident, str) or not (SOURCE_ID if kind == "source" else DOCUMENT_ID).match(ident):
                raise PolicyError("a withheld id is not well formed")
            held = self._sources if kind == "source" else self._documents
            if ident in held:
                raise PolicyError("a withheld id is listed twice")
            # Only the mode leaves this loader. The reason and date stay in the private store.
            held[ident] = {"mode": entry.get("mode", "list_only")}

    @property
    def withheld_sources(self):
        return dict(self._sources)

    @property
    def withheld_documents(self):
        return dict(self._documents)

    def listed(self, source) -> bool:
        return source in self._records

    def use(self, source, document=None) -> str:
        """The tier recorded for a document, else its source, else full."""
        if document is not None and document in self._records:
            return self._records[document]["use"]
        return self._records.get(source, {}).get("use", "full")

    def withheld(self, sources=(), documents=()):
        """How any of these ids is withheld ({"mode": "list_only" | "hide"}), or None."""
        for ident in documents:
            if ident in self._documents:
                return dict(self._documents[ident])
            # "<source>/<key>" is also covered by its source.
            if _source_of(ident) in self._sources:
                return dict(self._sources[_source_of(ident)])
        for ident in sources:
            if ident in self._sources:
                return dict(self._sources[ident])
        return None

    def can(self, capability, sources=(), documents=()) -> bool:
        """True when every id given is open for this capability and nothing is withheld."""
        if self.withheld(sources, documents):
            return False
        uses = [self.use(s) for s in sources] + [self.use(_source_of(d), d) for d in documents]
        return all(allows(u, capability) for u in uses)

    def _flag(self, name, ident) -> bool:
        return ident not in self._records or self._records[ident].get(name) == "allowed"

    def summaries(self, sources=(), documents=()) -> bool:
        """Machine summaries and topic labels: off for a listed source unless its record allows them."""
        owners = list(sources) + [s for s in map(_source_of, documents) if s]
        return self.can("narrative", sources, documents) and all(self._flag("summaries", s) for s in owners)

    def kb_generation(self, source) -> bool:
        """Paths where the knowledge base itself generates text: only a full source that allows it."""
        return (source not in KB_GENERATION_NEVER and source not in self._sources
                and allows(self.use(source), "narrative") and self._flag("kb_generation", source))

    def kb_refusal(self, body) -> str | None:
        """Why a knowledge base resource may not be pushed or changed: "withheld", "tier", or None when it may."""
        sources, documents = kb_ids(body)
        if self.withheld(sources, documents):
            return "withheld"
        return None if self.can("kb", sources, documents) else "tier"

    def digest(self) -> str:
        """A short digest of the withheld entries, the same as withheldDigest() in the JavaScript loader, so
        the copies held by the Workers, the build and this machine can be compared without showing one."""
        canonical = sorted(json.dumps({"mode": "list_only", **e}, sort_keys=True, separators=(",", ":"), ensure_ascii=False) for e in self._entries)
        return hashlib.sha256(("[" + ",".join(canonical) + "]").encode()).hexdigest()[:16]


def kb_ids(body) -> tuple[list[str], list[str]]:
    """(source ids, document ids) of a knowledge base resource or push body."""
    body = body or {}
    labels = (body.get("usermetadata") or {}).get("classifications") or []
    sources = [str(c.get("label")) for c in labels if c.get("labelset") == "source" and c.get("label")]
    origin = (body.get("origin") or {}).get("source_id")
    if origin:
        sources.append(str(origin))
    slug = body.get("slug")
    return sources, [str(slug)] if slug else []


def private_entries() -> list:
    """The withheld entries from this machine's private store; [] when there is none."""
    raw = os.environ.get("OPAX_WITHHELD_JSON", "").strip()
    if not raw:
        path = Path(os.environ.get("OPAX_WITHHELD_FILE") or "~/.config/opax/withheld.json").expanduser()
        if not path.exists():
            return []
        try:
            if path.stat().st_mode & 0o077:
                raise PolicyError("the withheld store must be readable by its owner only (chmod 600)")
            raw = path.read_text(encoding="utf-8").strip()
        except OSError as exc:
            raise PolicyError("the withheld store is unreadable") from exc
        if not raw:
            return []
    try:
        store = json.loads(raw)
    except ValueError:
        raise PolicyError("the withheld store is unreadable") from None
    if not isinstance(store, dict) or set(store) != {"schema", "withheld"} or store["schema"] != PRIVATE_SCHEMA or not isinstance(store["withheld"], list):
        raise PolicyError("the withheld store is unreadable")
    return store["withheld"]


def load(path: Path = PATH, private: bool = True) -> Policy:
    """The public tiers with this machine's private withheld list (private=False: the tiers alone)."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise PolicyError(f"source policy unreadable: {exc}") from exc
    return Policy(data, private_entries() if private else ())


if __name__ == "__main__":
    # The digest only: compare it with the Workers' and the build's. Never prints an entry or a count.
    print(load().digest())
