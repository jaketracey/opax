"""Integrity commission hearing transcripts supplied by the OPAX maintainer (documents only).

    python -m parli.ingest.integrity.transcripts build --intake <dir>

The 12 November 2026 intake holds publisher PDFs of public hearing transcripts from the NSW ICAC
and LECC, the Queensland CCC, the ACT Integrity Commission, the WA CCC, SA ICAC and IBAC, with a
manifest (publisher URL, sha256, bytes, page count, rights and orders). ``build`` checks every
file against the manifest, copies it into ``<cache>/manual/transcripts/`` (outside git), checks
the hearing date against the transcript's own first pages, and writes the committed registry
``parli/ingest/integrity/transcripts.json``: metadata, citations and rights only. No transcript
text is committed or published by this module.

A transcript is evidence given in a hearing, not a finding. Witness names are not recorded as
fields; titles are the publisher's own.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from collections import Counter
from pathlib import Path

from parli.ingest.integrity import common

REGISTRY = Path(__file__).with_name("transcripts.json")
ACQUISITION = "manual publisher download supplied by the OPAX maintainer, 12 Nov 2026"
LABEL = "Hearing transcript: evidence, not findings"
BODIES = {
    "NSW Independent Commission Against Corruption": ("nsw_icac", "NSW ICAC", "NSW"),
    "NSW Law Enforcement Conduct Commission": ("nsw_lecc", "NSW LECC", "NSW"),
    "Crime and Corruption Commission": ("qld_ccc", "Qld CCC", "Qld"),
    "ACT Integrity Commission": ("act_ic", "ACT Integrity Commission", "ACT"),
    "Corruption and Crime Commission": ("wa_ccc", "WA CCC", "WA"),
    "Independent Commissioner Against Corruption (South Australia)": ("sa_icac", "SA ICAC", "SA"),
    "Independent Broad-based Anti-corruption Commission": ("vic_ibac", "IBAC", "Vic"),
}
# The intake manifest's rights, notes and gap notes are written for the intake reviewer. Pages show these
# reader-facing versions instead (same facts, no review instructions). A manifest wording with no entry here
# stops the build, so internal wording never reaches a page.
PUBLIC = {
    "NSW ICAC copyright notice reserves rights. Check the permitted use or permission before any public full-text projection.":
        "NSW ICAC copyright: the Commission's copyright notice reserves its rights. OPAX links to the publisher's copy.",
    "Published public hearing copies, subject to document-specific notices and current publication orders. Some covers prohibit copying or distribution except in accordance with the presiding officer's order. The general site CC BY licence does not override those notices.":
        "Public hearing copies published by the Commission, subject to the notices on each document and to current publication orders. Some covers prohibit copying or distribution except as the presiding officer orders, and the website's general CC BY licence does not override those notices. OPAX links to the publisher's copy.",
    "Transcript front matter warns against publication identifying protected participants. Preserve the original public version and check current orders before any downstream republication.":
        "The transcript's front matter warns against publishing anything that identifies protected participants, and current publication orders apply. OPAX links to the publisher's copy.",
    "NSW LECC attribution required. Check its permission conditions for modification or commercial reuse.":
        "Published by the NSW Law Enforcement Conduct Commission, which requires attribution and sets conditions for modification and commercial reuse. OPAX links to the publisher's copy.",
    "Publisher authorises viewing only and prohibits alteration. Use the official link for discovery and keep the original out of downstream copying, processing or public indexing until permission is confirmed.":
        "The publisher authorises viewing only and prohibits alteration, so OPAX lists the hearing and links to the publisher's copy.",
    "Publisher-released public copies, including its redactions. The transcript notices reserve Crown copyright and require the Attorney-General's prior written consent for reproduction. Preserve publication orders and use the source links for any outward-facing index pending rights clearance.":
        "Public copies released by the Commission, including its redactions. The transcript notices reserve Crown copyright and require the Attorney-General's prior written consent for reproduction, and publication orders apply. OPAX links to the publisher's copy.",
    "Published original. IBAC reserves copyright and commercial reuse. Review the publisher’s terms, transcript restrictions and suppression order before any public text projection.":
        "Published by IBAC, which reserves copyright and commercial reuse. Transcript restrictions and a suppression order apply. OPAX links to the publisher's copy.",
    "Published public examinations. The transcript notices reserve Crown copyright and state that reproduction requires prior written consent of the Commissioner. Stage as source evidence only and use source links for outward-facing indexing pending clearance.":
        "Public examinations published by the Commission. The transcript notices reserve Crown copyright and state that reproduction requires the Commissioner's prior written consent. OPAX links to the publisher's copy.",
    "SA ICAC publisher material carries copyright. Use original source links for publication pending rights clearance. This was a public legislative review hearing; SA ICAC corruption investigation examinations are conducted privately.":
        "SA ICAC material carries copyright. This was a public legislative review hearing; SA ICAC conducts its corruption investigation examinations in private. OPAX links to the publisher's copy.",
    "Hearing date taken from transcript cover, which differs from the publisher filename or link label.":
        "The hearing date is the one printed on the transcript's cover; the publisher's file name or link label gives a different date.",
    "The publisher-supplied PDF has a different physical page count from the listed transcript folio range. The file is preserved as published.":
        "The publisher's PDF has a different number of pages from the transcript page range it lists; OPAX links to the file as published.",
    "Official catalogue link contained an escaped apostrophe. This is the indexed original on the same publisher host.":
        "The publisher's catalogue link to this file is malformed; this link goes to the same file on the publisher's site.",
    "Publisher’s current investigations index is the bounded initial scope. Earlier archived cases and sessions not publicly published are outside this snapshot.":
        "OPAX holds the transcripts listed in the Commission's current investigations index. Transcripts of earlier archived cases, and sessions the Commission has not published, are not included.",
    "The Operation Makalu PDF is the public opening address transcript; the collection records that document type.":
        "The Operation Makalu document is the transcript of the public opening address.",
}
_FOLIOS = re.compile(r"^(The publisher-supplied PDF .*? preserved as published\.) The first and last PDF folios are (\d+) and (\d+)\.$")
INTERNAL = re.compile(r"\b(?:Check|Review the|before any|pending|Stage as|Preserve|downstream|bounded|snapshot|projection|"
                      r"rights review|taken from transcript)\b", re.I)


def public(text):
    """Reader-facing wording for a manifest rights statement, note or gap note."""
    if text is None:
        return None
    text = common.clean(text)
    m = _FOLIOS.match(text)
    if m:
        return f"{PUBLIC[m.group(1)]} Its transcript pages run from {m.group(2)} to {m.group(3)}."
    out = PUBLIC.get(text, text)
    if INTERNAL.search(out):
        raise common.Held(f"no reader-facing wording for: {text!r}")
    return out


MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
          "november", "december"]


def date_forms(iso: str) -> list[re.Pattern]:
    """Ways a transcript prints its hearing date: 29 JULY, 2026; 29th July 2026; 29/07/2026; 13.02.24; 29/7/26."""
    y, m, d = (int(x) for x in iso.split("-"))
    month = MONTHS[m - 1]
    return [
        re.compile(rf"\b0?{d}(?:st|nd|rd|th)?\s+(?:day\s+of\s+)?{month}[,\s]+{y}\b", re.I),
        re.compile(rf"\b{month}\s+0?{d}(?:st|nd|rd|th)?,?\s+{y}\b", re.I),
        re.compile(rf"(?<!\d)0?{d}[/.]0?{m}[/.](?:{y}|{y % 100:02d})(?!\d)"),
    ]


def find_date(iso: str, pages: list[str], first: int = 3):
    """The first quote of the hearing date on the transcript's first pages, with its page."""
    for n, text in enumerate(pages[:first], 1):
        flat = re.sub(r"\s+", " ", text)
        for form in date_forms(iso):
            m = form.search(flat)
            if m:
                return m.group(0), n
    return None, None


def nearby_date(iso: str, pages: list[str], days: int = 3):
    """A full date printed on page 1 within a few days of the listed one (a listing that differs from the cover)."""
    from datetime import date
    listed = date.fromisoformat(iso)
    flat = re.sub(r"\s+", " ", pages[0] if pages else "")
    for m in re.finditer(r"\b(\d{1,2})\s+(" + "|".join(MONTHS) + r"),?\s+(\d{4})\b", flat, re.I):
        try:
            found = date(int(m.group(3)), MONTHS.index(m.group(2).lower()) + 1, int(m.group(1)))
        except ValueError:
            continue
        if found != listed and abs((found - listed).days) <= days:
            return found.isoformat(), m.group(0)
    return None, None


def listed_label(d: dict) -> str | None:
    raw = d.get("publisher_title") or d.get("title_as_listed") or d.get("title") or ""
    return re.sub(r"\s+\d+(?:\.\d+)?\s*[KM]B\s*$", "", common.clean(raw) or "").strip() or None


def title_of(d: dict, case: str, hearing_date: str) -> str:
    """A neutral title: case, document type and date. The publisher's own link label (which can name a
    witness) is kept separately as title_as_listed and is never a search field."""
    kind = "public inquiry transcript" if d["publisher"] == "NSW Independent Commission Against Corruption" else "hearing transcript"
    if "opening address" in (d.get("document_type") or "").lower():
        kind = "opening address transcript"
    rng = f", transcript pages {d['published_page_range']}" if d.get("published_page_range") else ""
    return f"{case} {kind}, {human(hearing_date)}{rng}"


def human(iso: str) -> str:
    y, m, d = (int(x) for x in iso.split("-"))
    return f"{d} {MONTHS[m - 1].capitalize()} {y}"


def case_name(d: dict) -> str:
    c = common.clean(d["case"])
    if d["publisher"] in ("NSW Independent Commission Against Corruption", "NSW Law Enforcement Conduct Commission") and not c.lower().startswith("operation"):
        c = "Operation " + c
    return re.sub(r":\s*Transcripts$", "", c)


def redacted(d: dict) -> bool:
    return bool(d.get("publisher_redacted_filename")) or "redact" in d["source_url"].lower()


def build(intake: Path, cache: Path = common.CACHE, registry: Path = REGISTRY):
    manifest_path = intake / "manifest.json"
    raw = manifest_path.read_bytes()
    m = json.loads(raw)
    docs = [d for d in m["documents"] if d.get("publisher") in BODIES]
    out, held = [], []
    store = cache / "manual" / "transcripts"
    store.mkdir(parents=True, exist_ok=True)
    for d in docs:
        path = Path(d["path"])
        data = path.read_bytes() if path.exists() else b""
        if hashlib.sha256(data).hexdigest() != d["sha256"] or len(data) != d["bytes"]:
            held.append((d["source_url"], "file differs from its manifest hash or size"))
            continue
        pages = common.pdf_pages(data, cache)
        if len(pages) != d["pages"]:
            held.append((d["source_url"], f"{len(pages)} pages, manifest says {d['pages']}"))
            continue
        if not d["source_url"].startswith("https://"):
            held.append((d["source_url"], "publisher URL is not https"))
            continue
        target = store / (d["sha256"] + ".pdf")
        if not target.exists():
            shutil.copyfile(path, target)
        code, short, jurisdiction = BODIES[d["publisher"]]
        hearing_date = d["hearing_date"]
        quote, page = find_date(hearing_date, pages)
        notes = [public(n) for n in (d.get("date_note"), d.get("coverage_note"), d.get("source_note")) if n]
        if not quote:
            printed, q = nearby_date(hearing_date, pages)
            if printed:
                notes.append(f"The publisher lists this transcript under {human(hearing_date)}; the transcript itself is dated {human(printed)}, which OPAX uses.")
                hearing_date, quote, page = printed, q, 1
        orders = [u for u in (d.get("suppression_order_url"),) if u]
        out.append({
            "id": f"{code}-{hearing_date}-{d['sha256'][:12]}", "body": code, "jurisdiction": jurisdiction,
            "case": case_name(d), "title": title_of(d, case_name(d), hearing_date), "title_as_listed": listed_label(d),
            "label": LABEL, "kind": "hearing_transcript",
            "document_type": common.clean(d.get("document_type") or d.get("document_kind") or "public hearing transcript"),
            "hearing_date": hearing_date,
            "date_basis": "stated" if quote else "publisher_listing",
            **({"date_quote": quote, "date_page": page} if quote else {}),
            **({"session_time": d["published_session_time"]} if d.get("published_session_time") else {}),
            **({"transcript_pages": d["published_page_range"]} if d.get("published_page_range") else {}),
            "url": d["source_url"],
            "page_url": d.get("source_index_url") or d.get("source_catalogue_url") or d.get("index_url") or d.get("publisher_item_url"),
            "pages": d["pages"], "bytes": d["bytes"], "sha256": d["sha256"],
            "publisher_redacted": redacted(d), "rights": public(d["rights"]),
            **({"reuse_status": d["reuse_status"]} if d.get("reuse_status") else {}),
            **({"copyright_url": d["copyright_url"]} if d.get("copyright_url") else {}),
            **({"terms_url": d["publisher_terms_url"]} if d.get("publisher_terms_url") else {}),
            **({"orders": orders} if orders else {}),
            **({"notes": notes} if notes else {}),
            "text_layer": any(len(p.strip()) > 40 for p in pages[:3]),
            "acquisition": ACQUISITION,
        })
    if held:
        for url, why in held:
            print(f"[integrity.transcripts] held {url}: {why}", flush=True)
        raise common.Held(f"{len(held)} transcripts differ from the intake manifest")
    out.sort(key=lambda r: (r["body"], r["case"], r["hearing_date"], r.get("transcript_pages", ""), r.get("session_time", ""), r["url"]))
    same = Counter(r["title"] for r in out)
    seen = Counter()
    for r in out:  # several documents for one hearing day (sessions or witnesses): numbered in publisher order
        if same[r["title"]] > 1:
            seen[r["title"]] += 1
            r["title"] = f"{r['title']} (part {seen[r['title']]} of {same[r['title']]})"
    if len({r["id"] for r in out}) != len(out):
        raise common.Held("duplicate transcript id")
    view_only = [{
        "body": BODIES[v["publisher"]][0], "case": case_name(v), "title": common.clean(v.get("title_as_listed") or ""),
        "hearing_date": v["hearing_date"], "url": v["source_url"], "page_url": v.get("source_catalogue_url"),
        "pages": v.get("pages"), "rights": public(v["rights"]), "availability": "publisher_view_only",
    } for v in m.get("publisher_view_only", []) if v.get("publisher") in BODIES]
    gaps = []
    for c in m.get("collections", []):
        cm = json.loads(Path(c["manifest_path"]).read_text())
        for g in cm.get("known_coverage_gaps", []) or cm.get("gaps", []) or []:
            if isinstance(g, dict) and g.get("note"):
                gaps.append({k: public(g[k]) if k == "note" else g[k] for k in ("agency", "note", "url") if g.get(k)})
    reg = {"schema": common.SCHEMA, "built_at": common.now(), "label": LABEL,
           "intake": {"snapshot_at": m.get("snapshot_at"), "manifest_sha256": hashlib.sha256(raw).hexdigest()},
           "counts": dict(sorted(Counter(r["body"] for r in out).items())),
           "transcripts": out, "publisher_view_only": view_only, "gaps": gaps}
    registry.write_text(json.dumps(reg, ensure_ascii=False, indent=1) + "\n")
    stated = sum(r["date_basis"] == "stated" for r in out)
    print(f"[integrity.transcripts] {len(out)} transcripts ({stated} dates read on the transcript), "
          f"{len(view_only)} view-only links -> {registry}", flush=True)
    return reg


def load(path: Path = REGISTRY) -> dict:
    if not path.exists():
        return {"transcripts": [], "publisher_view_only": [], "gaps": []}
    data = json.loads(path.read_text())
    if data.get("schema") != common.SCHEMA:
        raise common.Held(f"transcripts registry schema {data.get('schema')!r}")
    return data


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("cmd", choices=["build"])
    ap.add_argument("--intake", type=Path, required=True)
    args = ap.parse_args(argv)
    build(args.intake)


if __name__ == "__main__":
    main()
