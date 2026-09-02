"""
parli.ingest.conduct_interests_qld -- Queensland Register of Members' Interests (prototype).

Source: one combined PDF for the whole Legislative Assembly, republished weekly by the
Clerk: https://documents.parliament.qld.gov.au/Assembly/Procedures/MembersRegister.pdf
(58th Parliament; "AS AT <date>" on page 1). Typed, single font, consistent two-column
layout: the left column carries the Parliament of Queensland Act s.7(5) subclause label and
its long description, the right column (x >= ~260pt) the member's declaration; entries
within a subclause are separated by semicolons. Member headers are bold 11pt
"SURNAME, Given Names (Electorate)". The documents host serves our research User-Agent.

Writes to the same NEW tables as the federal module (chamber='qld_la'); nothing existing
is touched. Rows carry the subclause code in fields_json['subclause'].

Usage
  python -m parli.ingest.conduct_interests_qld --pdf path/MembersRegister.pdf --export-jsonl qld.jsonl
  python -m parli.ingest.conduct_interests_qld --fetch --db ~/.cache/autoresearch/parli.db
"""

from __future__ import annotations

import argparse
import collections
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

from parli.ingest.conduct_interests_federal import (
    USER_AGENT, CACHE_DIR, InterestDocument, InterestRow, _finish, _iso, _norm_ws, _sha256,
    _normalize_name, _session,
)

QLD_URL = "https://documents.parliament.qld.gov.au/Assembly/Procedures/MembersRegister.pdf"
QLD_PARLIAMENT = 58
CONTENT_X = 255          # right column starts at x0 ~266; labels/descriptions at 53..250
HEADER_FONT_SIZE = 11    # member headers are the only 11pt bold text

# s.7(5) subclause -> (category, short title). Second (m) block (donations) handled by label text.
SUBCLAUSES = [
    ("7(5)(a)(i)", "shareholdings", "Shareholdings or controlling interests in companies"),
    ("7(5)(a)(ii)", "directorships", "Company officeholder"),
    ("7(5)(a)(iii) and (iv) A and B", "shareholdings", "Private company investments / beneficial interests"),
    ("7(5)(a)(iv) C and D", "shareholdings", "Investments of subsidiaries of private companies"),
    ("7(5)(b)(i) to (iii)", "trusts", "Family or business trusts / nominee companies"),
    ("7(5)(b)(iv)", "trusts", "Investments or beneficial interests of trusts"),
    ("7(5)(c)", "other_assets", "Trustee or director of private superannuation fund"),
    ("7(5)(d)(i) to (iii)", "partnerships", "Interests in partnerships"),
    ("7(5)(d)(iv)", "partnerships", "Assets or beneficial interests in partnerships"),
    ("7(5)(e)", "real_estate", "Interests in real estate"),
    ("7(5)(f)", "liabilities", "Liabilities over threshold"),
    ("7(5)(g)", "investments", "Debentures, managed funds or similar investments"),
    ("7(5)(h)", "savings", "Savings or investment accounts"),
    ("7(5)(i)", "gifts", "Gifts received over threshold"),
    ("7(5)(j)", "travel", "Sponsored travel or accommodation"),
    ("7(5)(k)", "income", "Other income over threshold"),
    ("7(5)(l)", "other_assets", "Other assets over threshold"),
    ("7(5)(m)", "memberships", "Memberships / office holder / donations"),
    ("7(5)(n)", "other", "Any other interest raising a conflict"),
]
SUBCLAUSE_RE = re.compile(r"^Subclause\s+(7\(5\)\([a-n]\)(?:\([iv]+\))?(?:\s+(?:and\s+\([iv]+\)\s+)?[A-D](?:\s+and\s+[A-D])?)?(?:\s+to\s+\([iv]+\))?)")
# 'BATES , Rosslyn Mary (Ros) (Mudgeeraba)', 'de BRENNI, Michael Christopher (Mick) (Springwood)',
# 'McCALLUM, Lance (Bundamba)': the electorate is always the LAST bracket; a preferred name may
# sit in an earlier one; surnames carry lowercase particles and Mc/Mac prefixes.
HEADER_RE = re.compile(r"^(?P<sur>[A-Za-z][A-Za-z'’\- ]*?[A-Za-z])\s*,\s+(?P<given>.+?)\s*\((?P<elec>[^()]+)\)\s*$")
AS_AT_RE = re.compile(r"AS\s+AT\s+(\d{1,2}\s+[A-Z][a-z]+\s+\d{4})", re.I)


def _surname_case(sur: str) -> str:
    """'BATES' -> 'Bates', 'de BRENNI' -> 'de Brenni', 'McCALLUM' -> 'McCallum', "O'SHEA" -> "O'Shea"."""
    out = []
    for tok in _norm_ws(sur).split(" "):
        if tok.isupper():
            tok = tok.capitalize()
            tok = re.sub(r"^(Mc|Mac|O['’]|D['’])(\w)", lambda m: m.group(1) + m.group(2).upper(), tok, flags=re.I)
            tok = re.sub(r"([-'’])(\w)", lambda m: m.group(1) + m.group(2).upper(), tok)
        elif re.match(r"^M[ac]+[A-Z]+$", tok):   # McCALLUM / MacDONALD as printed
            tok = re.sub(r"^(M[ac]+)([A-Z])([A-Z]+)$", lambda m: m.group(1) + m.group(2) + m.group(3).lower(), tok)
        out.append(tok)
    return " ".join(out)


def _join(ws) -> str:
    """Words -> text; superscript words glue onto the word before them ('606m' + '2' -> '606m²')."""
    toks: list[str] = []
    for w in ws:
        if w.get("sup") and toks:
            toks[-1] += w["text"]
        else:
            toks.append(w["text"])
    text = " ".join(toks)
    text = re.sub(r"\s+([,;.])", r"\1", text)
    return re.sub(r"(\d)m2\b", "\\1m²", text)


def _lines(page):
    """Words grouped into visual lines; each line keeps left (label) and right (content) text.
    Superscripts ('606m²' prints as a raised '2') are folded into the line they decorate and
    the centred page number at the foot of the page is dropped."""
    words = page.extract_words(keep_blank_chars=False, extra_attrs=["size", "fontname"])
    normal = [w for w in words if w["size"] >= 8]
    small = [w for w in words if w["size"] < 8]
    rows = collections.defaultdict(list)
    for w in normal:
        rows[round(w["top"])].append(w)
    tops = sorted(rows)
    for w in small:
        near = min(tops, key=lambda t: abs(t - (w["top"] + 3)), default=None)
        if near is not None and abs(near - (w["top"] + 3)) <= 6:
            w = {**w, "x0": w["x0"] - 0.1, "sup": True}   # sorts right after the word it decorates
            rows[near].append(w)
    foot = page.height - 45
    out = []
    for top in sorted(rows):
        ws = sorted(rows[top], key=lambda w: w["x0"])
        if top > foot and len(ws) == 1 and re.fullmatch(r"\d+", ws[0]["text"]):
            continue
        left = _join([w for w in ws if w["x0"] < CONTENT_X])
        right = _join([w for w in ws if w["x0"] >= CONTENT_X])
        bold11 = any(round(w["size"]) >= HEADER_FONT_SIZE and "Bold" in w["fontname"] for w in ws)
        out.append({"top": top, "left": left, "right": right, "bold11": bold11, "text": _join(ws)})
    return out


def _subclause(label: str):
    m = SUBCLAUSE_RE.match(label)
    if not m:
        return None
    code = _norm_ws(m.group(1))
    for sc, cat, title in SUBCLAUSES:
        if code.startswith(sc.split(" ")[0]) and (code == sc or sc.startswith(code)):
            return sc, cat, title
    # fall back on the letter alone
    letter = re.search(r"\(([a-n])\)", code)
    if letter:
        for sc, cat, title in SUBCLAUSES:
            if f"({letter.group(1)})" in sc:
                return sc, cat, title
    return None


def _join_frags(frags: list[str]) -> str:
    """Rejoin wrapped lines; a line-end hyphen followed by a lowercase continuation is a
    hyphenated word ('brother-in-' + 'law'), not a space."""
    out = ""
    for t in frags:
        if out and out.endswith("-") and t[:1].islower():
            out += t
        else:
            out = f"{out} {t}" if out else t
    return out


def _split_entries(text: str) -> list[str]:
    parts = [p.strip(" ;:") for p in re.split(r";\s*", text) if p.strip(" ;:")]
    return parts or ([text.strip()] if text.strip() else [])


def parse_qld_register(pdf_path: Path, source_url: str = QLD_URL) -> list[InterestDocument]:
    import pdfplumber
    docs: list[InterestDocument] = []
    as_at = None
    fetched_at = datetime.fromtimestamp(pdf_path.stat().st_mtime, tz=timezone.utc).isoformat(timespec="seconds")
    sha = _sha256(pdf_path)
    with pdfplumber.open(pdf_path) as pdf:
        first = _norm_ws(pdf.pages[0].extract_text() or "")
        # the title is set in small caps, which extract as '28 A 2026 AS AT UGUST' (initial
        # capital on one line, the rest of the month on the next)
        m = re.search(r"(\d{1,2})\s+([A-Z])\s+(\d{4})\s+AS\s+AT\s+([A-Z]{2,9})\b", first)
        if m:
            as_at = _iso(f"{m.group(1)} {m.group(2)}{m.group(4).lower()} {m.group(3)}")
        else:
            m = AS_AT_RE.search(first)
            as_at = _iso(m.group(1).title()) if m else None
        current: InterestDocument | None = None
        cur_sub = None       # (code, cat, title)
        cur_label_desc = ""  # accumulated left-column description (for the (m) donation variant)
        buf: list[tuple] = []  # (page, top, text) right-column fragments for the open subclause

        def flush():
            """Entries are semicolon-separated, but members also start a new item on a new
            line after a colon/full stop, or as a new paragraph (line pitch is 11-12pt for
            both wraps and semicolon lists; a paragraph gap is ~24pt). Page = where the
            entry starts."""
            nonlocal buf, cur_sub, cur_label_desc
            if current is not None and cur_sub is not None and buf:
                sub = "donation" if "donation" in cur_label_desc.lower() else None
                segs: list[tuple] = []          # (page, text)
                cur: list[str] = []; cur_page = buf[0][0]
                prev = None
                for pg, top, text in buf:
                    hard = False
                    if prev is not None:
                        ppg, ptop, ptext = prev
                        pt = ptext.rstrip()
                        hard = (pg == ppg and top - ptop >= 18) or pt.endswith(":") or (pt.endswith(".") and text[:1].isupper())
                    if hard and cur:
                        segs.append((cur_page, _join_frags(cur))); cur = []; cur_page = pg
                    cur.append(text); prev = (pg, top, text)
                if cur:
                    segs.append((cur_page, _join_frags(cur)))
                for pg, seg in segs:
                    for entry in _split_entries(_norm_ws(seg)):
                        current.rows.append(InterestRow(
                            holder="unspecified", section_code=None, category=cur_sub[1], kind="statement",
                            fields={"subclause": cur_sub[0], "text": entry}, description=entry,
                            date_declared=as_at, page=pg, subsection=sub, notes=cur_sub[2]))
            buf = []

        page_no = 1
        for page_no, page in enumerate(pdf.pages[1:], start=2):
            for ln in _lines(page):
                h = HEADER_RE.match(ln["text"]) if ln["bold11"] else None
                if h and re.search(r"[A-Z]{2}", h.group("sur")):
                    sur, given, elec = _surname_case(h.group("sur")), _norm_ws(h.group("given")), _norm_ws(h.group("elec"))
                    key = re.sub(r"[^a-z0-9]+", "-", f"{sur}-{elec}".lower()).strip("-")
                    doc_id = f"qld-{QLD_PARLIAMENT}-{key}"
                    if current is not None and current.doc_id == doc_id:
                        continue     # header repeated at the top of a continuation page: same member
                    flush()
                    cur_sub = None; cur_label_desc = ""
                    # 'Rosslyn Mary (Ros)' -> Hansard knows her as Ros Bates: prefer the bracketed name,
                    # else the first given name; middle names never reach the corpus speaker form.
                    pref = re.search(r"\(([^)]+)\)", given)
                    given_clean = _norm_ws(re.sub(r"\s*\([^)]*\)", "", given))
                    first = pref.group(1).strip() if pref else (given_clean.split(" ")[0] if given_clean else "")
                    current = InterestDocument(
                        doc_id=doc_id, chamber="qld_la", parliament=QLD_PARLIAMENT,
                        member_name_raw=ln["text"], member_name=_normalize_name(f"{sur}, {first}"),
                        electorate=elec, state="QLD", party=None, source_url=source_url, source_rev=as_at,
                        file_sha256=sha, pages=None, ocr_pages=0, last_updated=as_at, statement_date=as_at,
                        fetched_at=fetched_at)
                    docs.append(current)
                    continue
                if current is None:
                    continue
                if ln["left"].startswith("Subclause"):
                    flush()
                    cur_sub = _subclause(ln["left"])
                    cur_label_desc = ln["left"]
                    if cur_sub is None:
                        current.warnings.append(f"p{page_no}: unknown subclause label '{ln['left'][:60]}'")
                elif ln["left"] and re.fullmatch(r"\d+", ln["left"].strip()):
                    continue  # page number
                elif ln["left"] and not ln["right"] and cur_sub is None:
                    continue  # stray page furniture
                else:
                    cur_label_desc += " " + ln["left"]
                if ln["right"]:
                    buf.append((page_no, ln["top"], ln["right"]))
        flush()
    for d in docs:
        d.pages = None
    return docs


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pdf", help="local copy of MembersRegister.pdf")
    p.add_argument("--fetch", action="store_true", help="download the current register to the cache")
    p.add_argument("--db"); p.add_argument("--dry-run", action="store_true")
    p.add_argument("--export-jsonl"); p.add_argument("--limit", type=int)
    p.add_argument("--browser-ua", action="store_true", help=argparse.SUPPRESS)
    args = p.parse_args(argv)
    if args.fetch:
        dest = CACHE_DIR.parent / "qld"
        dest.mkdir(parents=True, exist_ok=True)
        r = _session(False).get(QLD_URL, timeout=120); r.raise_for_status()
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
        path = dest / f"MembersRegister_{stamp}.pdf"
        path.write_bytes(r.content)
        print(f"[fetch] {len(r.content)//1024} KB -> {path}")
        args.pdf = str(path)
        time.sleep(0.5)
    if not args.pdf:
        p.error("--pdf or --fetch required")
    docs = parse_qld_register(Path(args.pdf))
    if args.limit:
        docs = docs[:args.limit]
    print(f"[qld] {len(docs)} members, {sum(len(d.rows) for d in docs)} rows, as at {docs[0].last_updated if docs else '?'}")
    cats = collections.Counter(r.category for d in docs for r in d.rows)
    print("  categories:", dict(cats.most_common()))
    warn = [w for d in docs for w in d.warnings]
    if warn:
        print(f"  warnings: {len(warn)} e.g. {warn[:3]}")
    _finish(docs, args)


if __name__ == "__main__":
    main()
