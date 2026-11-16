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

``withheld`` is the takedown list. Each entry names one source or one document, a reason
class and the date it was withheld, and nothing else: no free text, so the list cannot
itself disclose what was suppressed. A withheld document is a listing row with its label
and a link to the publisher; it is never pushed to the knowledge base, indexed, quoted,
excerpted, summarised or labelled.
"""
from __future__ import annotations

from datetime import date
import json
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
LABELS = {
    "publisher_request": "Withheld at the publisher's request",
    "legal_order": "Withheld: subject to a legal order",
    "withdrawn": "Withheld: withdrawn by the publisher",
    "amended_pending": "Withheld: an amended version is pending",
}
SOURCE_ID = re.compile(r"^[a-z0-9][a-z0-9._-]{0,199}$")
DOCUMENT_ID = re.compile(r"^[a-z0-9][a-z0-9._-]{0,199}(?:/[a-z0-9][a-z0-9._-]{0,199})?$")
HOST = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$")
SOURCE_KEYS = ("use", "summaries", "kb_generation", "hosts", "names")
# What a document whose tier allows no quotation may never carry in a public record.
TEXT_KEYS = ("date_quote", "full_text")


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
    def __init__(self, data):
        if not isinstance(data, dict) or set(data) != {"schema", "sources", "withheld"} or data["schema"] != SCHEMA:
            raise PolicyError("source policy must hold exactly schema, sources and withheld")
        if not isinstance(data["sources"], dict) or not isinstance(data["withheld"], list):
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
        for entry in data["withheld"]:
            if not isinstance(entry, dict) or set(entry) not in ({"source", "reason", "date"}, {"document", "reason", "date"}):
                raise PolicyError("a withheld entry holds exactly source or document, reason and date")
            if entry["reason"] not in REASONS or not _real_date(entry["date"]):
                raise PolicyError("a withheld entry needs a known reason class and an ISO date")
            kind = "source" if "source" in entry else "document"
            ident = entry[kind]
            if not isinstance(ident, str) or not (SOURCE_ID if kind == "source" else DOCUMENT_ID).match(ident):
                raise PolicyError(f"a withheld {kind} id is not well formed")
            held = self._sources if kind == "source" else self._documents
            if ident in held:
                raise PolicyError(f"withheld {kind} {ident} is listed twice")
            held[ident] = {"reason": entry["reason"], "date": entry["date"], "label": LABELS[entry["reason"]]}

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
        """The withheld entry ({reason, date, label}) covering any of these ids, or None."""
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
        """Why a knowledge base resource may not be pushed or changed, or None when it may."""
        sources, documents = kb_ids(body)
        entry = self.withheld(sources, documents)
        if entry:
            return entry["label"]
        if not self.can("kb", sources, documents):
            return "the source's tier does not allow its text in the knowledge base"
        return None


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


def load(path: Path = PATH) -> Policy:
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise PolicyError(f"source policy unreadable: {exc}") from exc
    return Policy(data)


def listing_row(commission, doc, entry):
    """What a withheld document shows: title, date, its label and the publisher's page."""
    # The publisher's own page for the document; never the file itself where a page or the site is known.
    files = {f.get("url") for f in doc.get("files") or []}
    page = next((u for u in (doc.get("page_url"), commission.get("site")) if u and u not in files), None) or doc.get("page_url")
    return {"key": doc["key"], "kind": doc["kind"], "title": doc["title"], "date": doc.get("date"),
            "date_basis": doc.get("date_basis"), "page_url": page, "files": [],
            "cite": {"url": page, "document": doc["title"]}, "acquisition": doc.get("acquisition"),
            "withheld": entry}


def redact_commission(c, policy: Policy):
    """One commission's public record with the policy applied (same rules as redactCommission in
    parli/ingest/source_policy.mjs). Withheld documents become listing rows; a document whose
    tier allows no quotation carries no quotation or text pointer; recommendations and court context drawn from
    either are removed, and so is a fact read from a withheld document."""
    cid, out = c["id"], dict(c)
    quotable = lambda key: allows(policy.use(cid, f"{cid}/{key}"), "quote")  # noqa: E731
    source_entry = policy.withheld(sources=[cid])
    withheld_keys, withheld_urls, held_urls = set(), set(), set()
    for group in ("reports", "responses", "transcripts"):
        rows = []
        for d in c.get(group) or []:
            ident = f"{cid}/{d['key']}"
            entry = policy.withheld(sources=[cid], documents=[ident])
            if entry:
                withheld_keys.add(d["key"])
                withheld_urls.update(f.get("url") for f in d.get("files") or [])
                rows.append(listing_row(c, d, entry))
            elif not quotable(d["key"]):
                held_urls.update(f.get("url") for f in d.get("files") or [])
                rows.append({k: v for k, v in d.items() if k not in TEXT_KEYS})
            else:
                rows.append(d)
        out[group] = rows
    out["recommendations"] = [r for r in c.get("recommendations") or []
                              if r.get("report") not in withheld_keys and quotable(r.get("report"))]
    out["court_context"] = [x for x in c.get("court_context") or [] if x.get("applies_to") not in withheld_keys]

    def fact(f):
        """A fact read from a withheld document goes; one read from a document that is not quotable keeps
        its value and page and loses its quotation."""
        url = ((f or {}).get("cite") or {}).get("url")
        if not f or url in withheld_urls or (source_entry and "quote" in f):
            return None
        return {k: v for k, v in f.items() if k != "quote"} if url in held_urls else f

    out["established"] = fact(c.get("established"))
    out["commissioners"] = [f for f in map(fact, c.get("commissioners") or []) if f]
    if policy.listed(cid):
        out["use"] = policy.use(cid)
    if source_entry:
        out["notes"] = []
        out["withheld"] = source_entry
    return out
