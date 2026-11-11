"""Manual publisher-download supplement for bodies whose hosts do not answer the agent.

On 11 November 2026 the OPAX maintainer downloaded a small set of reports in a browser from
the publishers' own sites and supplied byte-identical copies with a manifest (source URL,
sha256, page count, reuse terms). This module turns those copies into records with the same
schema and the same verbatim rule as the adapters:

    python -m parli.ingest.integrity.manual build --intake <dir>

``build`` checks every file against its manifest sha256, copies it into the raw cache
(``<cache>/manual/<body>/``, outside git), reads the text, and writes the curated records to
``parli/ingest/integrity/manual-supplement.json`` (committed; it holds extracted text and
citations, never the PDFs). Every finding and recommendation is cut from the page text by
anchors and must appear verbatim on the cited page, or the build fails.

The refresh runner (``run.py``) merges these records into the body's snapshot on every run,
so the weekly refresh never needs the files and never fetches the refusing hosts by any other
route. Source access settings are unchanged: the adapters still report their gaps.

Provenance is recorded on each record and document as ``acquisition``. Citations point at the
publisher's own URL for the document.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path

from parli.ingest.integrity import common

SUPPLEMENT = Path(__file__).with_name("manual-supplement.json")
ACQUISITION = "manual publisher download supplied by the OPAX maintainer, 11 Nov 2026"
CAPTURED = "2026-11-11"


def load(code: str, path: Path = SUPPLEMENT) -> list[dict]:
    """Supplement records for one body (empty when there are none)."""
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    if data.get("schema") != common.SCHEMA:
        raise common.Held(f"manual supplement schema {data.get('schema')!r}")
    return [dict(r) for r in data.get("records", {}).get(code, [])]


def merge(records: list[dict], supplement: list[dict]) -> list[dict]:
    """Adapter records first. A supplement record whose document matches an adapter document
    (same sha256 or same URL) is dropped and the match is noted on the adapter record."""
    out = [dict(r) for r in records]
    for s in supplement:
        s_docs = s.get("documents") or []
        s_hash = {d.get("sha256") for d in s_docs if d.get("sha256")}
        s_url = {d.get("url") for d in s_docs if d.get("url")} | {s.get("pdf_url")}
        match = None
        for r in out:
            docs = r.get("documents") or []
            if ({d.get("sha256") for d in docs} & s_hash) or (({d.get("url") for d in docs} | {r.get("pdf_url")}) & s_url - {None}):
                match = r
                break
        if match is None:
            out.append(s)
            continue
        same = bool({d.get("sha256") for d in match.get("documents") or []} & s_hash)
        note = ("The same file (byte-identical) was also supplied as a " if same else
                "A copy of this document was also supplied as a ") + ACQUISITION + "; the adapter record is kept."
        match["notes"] = list(match.get("notes") or []) + [note]
    return out


# ---- build ------------------------------------------------------------------------------

def _pages(path: Path) -> list[str]:
    return common.pdf_pages(path.read_bytes())


def _strip_running(text: str) -> str:
    return re.sub(r"(?m)^\s*Page \d+ of \d+\s*$", "", text)


def _grab(page_text: str, start: str, end: str) -> str:
    t = common.flat(page_text)
    i = t.find(start)
    if i < 0:
        raise ValueError(f"start anchor not found: {start[:60]!r}")
    j = t.find(end, i)
    if j < 0:
        raise ValueError(f"end anchor not found after start: {end[:60]!r}")
    return t[i:j + len(end)]


def _on_page(name: str, page_text: str) -> str:
    if not common.verbatim(name, page_text):
        raise ValueError(f"subject wording not on the cited page: {name!r}")
    return name


def _doc(role, title, url, data, pages, item):
    d = common.document(role, title, url, data, pages)
    d["acquisition"] = ACQUISITION
    d["captured"] = CAPTURED
    if item.get("reuse_terms_url"):
        d["reuse_terms_url"] = item["reuse_terms_url"]
    return d


GLYPHS = {"\uf071": "•", "\uf073": "•", "\uf0b7": "•", "\uf0a7": "•"}  # symbol-font bullets in the text layer


def _finish(rec, item, rights):
    # after the verbatim checks: symbol-font bullet code points become a plain bullet
    for part in ("findings", "recommendations", "responses"):
        for x in rec[part]:
            if x.get("text"):
                x["text"] = re.sub(r"\s+", " ", "".join(GLYPHS.get(ch, ch) for ch in x["text"])).strip()
    rec["acquisition"] = ACQUISITION
    rec["rights"] = rights
    rec["notes"] = [f"Source document supplied as a {ACQUISITION}, from the publisher URL cited."] + rec["notes"]
    return rec


def _copy(item: dict, code: str, cache: Path) -> tuple[Path, bytes]:
    src = Path(item["path"])
    data = src.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != item["sha256"]:
        raise common.Held(f"{src.name}: sha256 {digest} does not match the manifest")
    dest = cache / "manual" / code / f"{digest}.pdf"
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists():
        shutil.copyfile(src, dest)
    return dest, data


# NACC: (operation, signed date as printed, ISO date or None, report cover subjects, findings, recommendations)
# Findings: (page, start anchor, end anchor, label, kind). Each is the Commissioner's own conclusion.
NACC = {
    "Bannister": {
        "date": "2024-10-09", "subjects": [(1, "former Home Affairs employee", "public_role"),
                                           (21, "Department of Home Affairs", "body")],
        "findings": [(21, "The allegation that Ms Brown abused her office", "is unsubstantiated.", "Findings and conclusion", "no_finding")],
        "pseudonym": "The report states that Ms Anne Brown is a pseudonym (page 8).",
    },
    "Elektra": {
        "date": "2025-06-11", "subjects": [(1, "Serco officers", "public_role")],
        "findings": [(4, "Both Officer 1 and Officer 2 engaged in corrupt conduct", "‘abuse of office’.", "Findings", "finding"),
                     (4, "No finding is made in relation to Officer 3.", "Officer 3.", "Findings", "no_finding")],
        "pseudonym": "The report refers to the officers as Officer 1, Officer 2 and Officer 3.",
    },
    "Kingscliff": {
        "date": "2025-06-30", "subjects": [(5, "Senior Executive Service staff member in the Department of Home Affairs", "public_role"),
                                           (5, "Department of Home Affairs", "body")],
        "findings": [(5, "The findings that the official engaged in conduct", "was systemic.", "Executive summary", "finding"),
                     (5, "The Commission did not find that the official’s sister", "corrupt conduct.", "Executive summary", "no_finding")],
        "recommendations": [(30, "1", "Reduce the risk of undisclosed conflicts of interest", "delegates in recruitment processes."),
                            (30, "2", "Mitigate the risk of improper disclosure", "with a legitimate need to know."),
                            (30, "3", "In relation to specific Home Affairs policies:", "for other recruitment processes.")],
        "pseudonym": "The report states that it uses pseudonyms for the protagonists and for witnesses (page 6).",
    },
    "Myrtleford": {
        "date": None, "subjects": [(1, "the 6 persons referred by the Royal Commission into the Robodebt Scheme", "public_role")],
        "findings": [(440, "With respect to the referral made by the Royal Commission in relation to Mr Withnell", "of the NACC Act.", "Determination", "finding"),
                     (440, "With respect to the referral made by the Royal Commission in relation to Ms Wilson", "of the NACC Act.", "Determination", "finding"),
                     (440, "With respect to the referral made by the Royal Commission in relation to Ms Halbert", "did not engage in corrupt conduct.", "Determination", "no_finding"),
                     (440, "With respect the referral made by the Royal Commission in relation to Ms Musolino", "did not engage in corrupt conduct.", "Determination", "no_finding"),
                     (440, "With respect to the referral made by the Royal Commission in relation to Ms Campbell", "did not engage in corrupt conduct.", "Determination", "no_finding"),
                     (440, "With respect to the referral made by the Royal Commission in relation to Mr Morrison", "did not engage in corrupt conduct.", "Determination", "no_finding")],
        "recs_none": (8, "it has not made recommendations in this report."),
        "undated": "No signature date was found in the report text, so the record is undated.",
    },
    "Pelican": {
        "date": "2026-04-08", "subjects": [(1, "an employee of a Commonwealth company", "public_role")],
        "findings": [(22, "Mr Erasery thereby engaged in conduct which was an abuse of his office", "thus engaged in corrupt conduct.", "Findings", "finding"),
                     (22, "Accordingly, for the purposes of subsection 149(3)", "corrupt conduct of a serious nature.", "Findings", "finding")],
        "recommendations": [(28, None, "The Attorney General’s Department should give consideration", "under Commonwealth law.")],
        "pseudonym": "Apart from Mr Erasery and WSA, the report states that it uses pseudonyms (page 4).",
    },
    "Pentecost": {
        "date": "2026-05-13", "subjects": [(1, "former Australian Federal Police appointee", "public_role")],
        "findings": [(47, "Nonetheless, by disclosing to Mr Dalloway", "therefore in corrupt conduct.", "Findings", "finding"),
                     (46, "The evidence does not, however, establish that Mr Harbani received", "30 May 2021.", "Findings", "no_finding")],
        "recs_note": "The Recommendations section (page 48) makes no recommendation because the appointee had already resigned; recorded as not extracted.",
        "pseudonym": "The report states that it uses pseudonyms (Use of pseudonyms, page 7).",
    },
    "Wilson": {
        "date": "2025-02-12", "subjects": [(1, "Australian Border Force officer", "public_role")],
        "findings": [(24, "Accordingly, I am satisfied that Mr Hsu has engaged in corrupt conduct", "performance of his official duties.", "Consideration", "finding")],
        "pseudonym": "The report marks Mr Jonah Hsu as a pseudonym (page 5, footnote 1).",
    },
    "Young": {
        "date": "2026-05-11", "subjects": [(1, "Australian Border Force officer", "public_role")],
        "findings": [(37, "It follows that Mr Andreopoulos engaged in an abuse of office", "thereby engaged in corrupt conduct.", "Consideration", "finding"),
                     (39, "It is therefore not established that Mr Collins", "corrupt conduct.", "Consideration", "no_finding"),
                     (39, "It is therefore not established that Mr Kalam", "corrupt conduct.", "Consideration", "no_finding")],
        "pseudonym": "Apart from Mr Andreopoulos, Mr Collins, Mr Kalam and their businesses, the report states that it uses pseudonyms (page 5).",
    },
}


def build_nacc(intake: Path, cache: Path) -> list[dict]:
    from parli.ingest.integrity import nacc
    manifest = json.loads((intake / "nacc" / "manifest.json").read_text())
    out = []
    for item in manifest["reports"]:
        op = re.search(r"Operation (\w+)", item["title"]).group(1)
        spec = NACC[op]
        path, data = _copy(item, "nacc", cache)
        pages = _pages(path)
        if len(pages) != item["pages"]:
            raise common.Held(f"NACC {op}: {len(pages)} pages, manifest says {item['pages']}")
        url = item["source_url"]
        title = f"Operation {op} investigation report"
        doc = f"Operation {op} Investigation Report"
        imprint = common.flat(pages[1])
        if "Creative Commons Attribution" not in imprint:
            raise ValueError(f"NACC {op}: licence statement not on page 2")
        findings = []
        for page, start, end, label, kind in spec["findings"]:
            text = _grab(pages[page - 1], start, end)
            findings.append(common.finding(label, kind, text, common.cite(url, doc, page, label), pages[page - 1]))
        recs = []
        for page, number, start, end in spec.get("recommendations", []):
            text = _grab(pages[page - 1], start, end)
            recs.append(common.recommendation(number, text, common.cite(url, doc, page, "Recommendations"), pages[page - 1]))
        notes = []
        rec_status = "extracted" if recs else "not_extracted"
        if "recs_none" in spec:
            page, phrase = spec["recs_none"]
            if not common.verbatim(phrase, pages[page - 1]):
                raise ValueError(f"NACC {op}: stated-none wording not on page {page}")
            rec_status = "stated_none"
            notes.append(f"The report states that the Commission has not made recommendations in this report (page {page}).")
        elif not recs:
            notes.append(spec.get("recs_note") or "No numbered recommendations were found in the report text; recorded as not extracted, not as none.")
        for key in ("pseudonym", "undated"):
            if spec.get(key):
                notes.append(spec[key])
        subjects = [common.subject(_on_page(name, pages[pg - 1]), kind, common.cite(url, doc, pg))
                    for pg, name, kind in spec["subjects"]]
        rec = common.report_record(
            nacc.BODY, title=title, page_url=url, report_type="investigation_report",
            date=spec["date"], date_basis="dated" if spec["date"] else None, operation=f"Operation {op}",
            type_as_published="Investigation Report", pdf_url=url,
            documents=[_doc("report", title, url, data, len(pages), item)], subjects=subjects,
            findings=findings, findings_status="extracted", recommendations=recs, recommendations_status=rec_status,
            responses_status="not_checked", notes=notes, key=f"operation-{op}",
        )
        out.append(_finish(rec, item, {
            "statement": "Copyright Commonwealth of Australia; licensed under Creative Commons Attribution 4.0 International, "
                         "except the Commonwealth Coat of Arms, the Commission's logo, third-party material, trade marks and images (report page 2).",
            "licence": "CC BY 4.0", "attribution": "National Anti-Corruption Commission",
        }))
    return out


def _karamu_findings(pages, url, doc):
    """Paragraphs under each 'Findings and recommendations' / 'Findings' heading, up to the
    'Recommendations' heading or the first blank line. One paragraph per finding."""
    out = []
    for i, raw in enumerate(pages):
        lines = raw.split("\n")
        for j, line in enumerate(lines):
            if line.strip() != "Findings" or j == 0 or lines[j - 1].strip() != "Findings and recommendations":
                continue
            block, page_no = [], i + 1
            k, src_lines, cur_page = j + 1, lines, i
            while True:
                if k >= len(src_lines):
                    cur_page += 1
                    if cur_page >= len(pages):
                        break
                    src_lines = _strip_running(pages[cur_page]).split("\n")
                    k = 0
                    continue
                ln = src_lines[k].strip()
                if ln == "Recommendations" or (not ln and block):
                    break
                if ln:
                    block.append(ln)
                k += 1
            paras, cur = [], []
            for ln in block:
                cur.append(ln)
                if ln.endswith("."):
                    paras.append(common.flat("\n".join(cur)))
                    cur = []
            if cur:
                raise ValueError(f"Karamu page {page_no}: findings block ends mid-sentence: {' '.join(cur)[:80]!r}")
            source = _strip_running(pages[i]) + "\n" + (_strip_running(pages[i + 1]) if i + 1 < len(pages) else "")
            for p in paras:
                out.append(common.finding("Findings", "finding", p, common.cite(url, doc, page_no, "Findings and recommendations"), source))
    return out


def _karamu_recommendations(pages, url, doc, first, last):
    """Appendix 2: each recommendation is a line 'N.' followed by its text."""
    lines = []
    for pg in range(first, last + 1):
        for ln in _strip_running(pages[pg - 1]).split("\n"):
            lines.append((pg, ln))
    recs, cur = [], None
    for idx, (pg, ln) in enumerate(lines):
        s = ln.strip()
        m = re.fullmatch(r"(\d{1,3})\.(?:\s+(.*))?", s)
        if m and (cur is None or int(m.group(1)) == int(cur["n"]) + 1):
            if cur:
                recs.append(cur)
            cur = {"n": m.group(1), "page": pg, "lines": [m.group(2)] if m.group(2) else []}
            continue
        if cur is None or not s:
            continue
        # a sub-heading: a short line with no closing punctuation directly before the next number
        nxt = next((l2.strip() for _, l2 in lines[idx + 1:] if l2.strip()), "")
        if re.fullmatch(r"\d{1,3}\.(?:\s.*)?", nxt) and not re.search(r"[.:;,]$", s) and len(s) < 80 and s[:1].isupper() and cur["lines"] and cur["lines"][-1].rstrip().endswith(".") \
                and not re.fullmatch(r"\d{1,3}\.", cur["lines"][-1].strip()):
            continue
        cur["lines"].append(s)
    if cur:
        recs.append(cur)
    out = []
    for r in recs:
        text = common.flat("\n".join(r["lines"]))
        source = "\n".join(_strip_running(pages[p - 1]) for p in range(r["page"], min(r["page"] + 2, len(pages) + 1)))
        out.append(common.recommendation(r["n"], text, common.cite(url, doc, r["page"], "Appendix 2. Recommendations"), source))
    nums = [int(r["number"]) for r in out]
    if nums != list(range(1, len(nums) + 1)):
        raise ValueError(f"Karamu recommendations not consecutive: {nums}")
    return out


def build_state(intake: Path, cache: Path) -> dict[str, list[dict]]:
    from parli.ingest.integrity import nt_icac, tas_ic
    manifest = json.loads((intake / "state-integrity" / "manifest.json").read_text())
    by_title = {r["title"]: r for r in manifest["reports"]}
    out = {"tas_ic": [], "nt_icac": []}
    tas_rights = {"statement": "The Integrity Commission's reports point to the Tasmanian Government copyright and disclaimer terms.",
                  "terms_url": "https://www.tas.gov.au/codi", "attribution": "Integrity Commission Tasmania"}

    # Karamu
    item = next(r for t, r in by_title.items() if "Karamu" in t)
    path, data = _copy(item, "tas_ic", cache)
    pages = _pages(path)
    url, doc = item["source_url"], "Report of the Integrity Commission No. 1 of 2025 (Karamu)"
    first = next(i + 1 for i, t in enumerate(pages) if i > 100 and "Appendix 2. Recommendations" in common.flat(t))
    last = next(i for i, t in enumerate(pages) if i + 1 > first and re.search(r"(?m)^\s*References\s*$", t))
    findings = _karamu_findings(pages[:first - 1], url, doc)
    recs = _karamu_recommendations(pages, url, doc, first, last)
    resp_page = 10
    resp_text = _grab(pages[resp_page - 1], "On 14 December 2024, the Secretary of the Department of Justice responded", "accepting all recommendations")
    appx1 = next(i + 1 for i, t in enumerate(pages) if "Appendix 1. Response to draft report from Department of Justice" in common.flat(t) and i > 100)
    title = (
        "Own-Motion Investigation Karamu: A report of an own-motion investigation into the management of the alleged misuse "
        "of force against prisoners at the Risdon Prison Complex, Mary Hutchinson Women’s Prison and Hobart Reception Centre "
        "between 1 July and 31 December 2023")
    if not common.verbatim(title, pages[0]):
        raise ValueError("Karamu title not on page 1")
    if not common.verbatim("Report of the Integrity Commission No. 1 of 2025, 2 December 2025", pages[0]):
        raise ValueError("Karamu report number and date not on page 1")
    rec = common.report_record(
        tas_ic.BODY, title=title, page_url=url, report_type="investigation_report", date="2025-12-02", date_basis="dated",
        operation="Own-Motion Investigation Karamu", type_as_published="Report of the Integrity Commission No. 1 of 2025 (own-motion investigation)",
        pdf_url=url, documents=[_doc("report", "Report of the Integrity Commission No. 1 of 2025", url, data, len(pages), item)],
        subjects=[common.subject(_on_page("Tasmania Prison Service", pages[8]), "body", common.cite(url, doc, 9, "Executive summary")),
                  common.subject(_on_page("Department of Justice", pages[8]), "body", common.cite(url, doc, 9, "Executive summary"))],
        findings=findings, findings_status="extracted", recommendations=recs, recommendations_status="extracted",
        responses=[common.response("agency_response", "Response to draft report from Department of Justice (Appendix 1)",
                                   f"{url}#page={appx1}", date="2024-12-14", status_as_published="accepting all recommendations",
                                   text=resp_text, citation=common.cite(url, doc, resp_page, "Executive summary"))],
        responses_status="published",
        notes=["The findings are systemic. The report states that the investigator did not examine or make findings relating "
               "to any potential individual misconduct (page 9).",
               f"The Department of Justice response is reproduced as Appendix 1 (PDF page {appx1}) as an image without a text layer; "
               "its text is not extracted.",
               "The date is the date printed on the report cover (2 December 2025)."],
        key="karamu",
    )
    out["tas_ic"].append(_finish(rec, item, tas_rights))

    # Tasmanian annual report: not an investigation report, no findings
    item = next(r for t, r in by_title.items() if "Annual Report" in t and r["jurisdiction"] == "TAS")
    path, data = _copy(item, "tas_ic", cache)
    pages = _pages(path)
    url = item["source_url"]
    if not common.verbatim("Annual report for 1 July 2025 to 30 June 2026", pages[2]):
        raise ValueError("Tas annual report period not on page 3")
    if not common.verbatim("29 October 2026", pages[2]):
        raise ValueError("Tas annual report letter date not on page 3")
    rec = common.report_record(
        tas_ic.BODY, title=item["title"], page_url=url, report_type="other", date="2026-10-29", date_basis="dated",
        type_as_published="Annual report", pdf_url=url,
        documents=[_doc("report", item["title"], url, data, len(pages), item)],
        notes=["An annual report on the Commission's activities for 1 July 2025 to 30 June 2026. It is not an investigation "
               "report and no findings or recommendations are recorded from it.",
               "The date is the date of the letters of transmittal to the presiding officers (page 3)."],
        key="annual-report-2025-26",
    )
    out["tas_ic"].append(_finish(rec, item, tas_rights))

    # NT annual report: a scan with no text layer; OCR the first pages only to confirm what it is
    item = next(r for t, r in by_title.items() if r["jurisdiction"] == "NT")
    path, data = _copy(item, "nt_icac", cache)
    cover = "\n".join(_ocr_page(path, n, cache) for n in (1, 2, 3))
    if "128" not in cover or not re.search(r"annual\s+report", cover, re.I):
        raise ValueError("NT annual report: OCR of the cover did not confirm an annual report under section 128")
    url = item["source_url"]
    rec = common.report_record(
        nt_icac.BODY, title=item["title"], page_url=item["citation_url"], report_type="other",
        date=item["tabled_date"], date_basis="tabled", type_as_published="Annual report (Tabled Paper 877)", pdf_url=url,
        documents=[_doc("report", "Tabled Paper 877: Annual Report 2025-26, Independent Commissioner Against Corruption", url, data, item["pages"], item)],
        notes=["An annual report under section 128 of the Independent Commissioner Against Corruption Act 2017 (NT). It is not an "
               "investigation report and no findings or recommendations are recorded from it.",
               "The file is a scan with no text layer. Only the first three pages were read (by OCR) to confirm the document.",
               "The tabled date is the date in the Territory Stories catalogue record for Tabled Paper 877.",
               "Attribution: Library & Archives NT, Territory Stories, https://hdl.handle.net/10070/1052273."],
        key="annual-report-2025-26",
    )
    out["nt_icac"].append(_finish(rec, item, {
        "statement": item["rights_note"], "terms_url": item["reuse_terms_url"], "attribution": item["attribution"],
    }))
    return out


def _ocr_page(pdf: Path, page: int, cache: Path) -> str:
    digest = hashlib.sha256(pdf.read_bytes()).hexdigest()
    out = cache / "text" / f"{digest}-ocr-p{page}.txt"
    if out.exists():
        return out.read_text()
    import pymupdf
    with pymupdf.open(pdf) as doc:
        pix = doc[page - 1].get_pixmap(dpi=200)
        png = out.with_suffix(".png")
        png.parent.mkdir(parents=True, exist_ok=True)
        pix.save(png)
    res = subprocess.run(["tesseract", str(png), "-", "-l", "eng"], capture_output=True, text=True, timeout=300)
    png.unlink(missing_ok=True)
    if res.returncode != 0:
        raise common.Held(f"tesseract failed: {res.stderr[:200]}")
    out.write_text(res.stdout)
    return res.stdout


def build(intake: Path, cache: Path = common.CACHE, dest: Path = SUPPLEMENT) -> dict:
    records = {"nacc": build_nacc(intake, cache)}
    records.update(build_state(intake, cache))
    data = {"schema": common.SCHEMA, "acquisition": ACQUISITION, "captured": CAPTURED, "built_at": common.now(),
            "note": "Records built from publisher PDFs the OPAX maintainer downloaded in a browser. The PDFs stay in the "
                    "raw cache outside git; citations point at the publisher URLs.",
            "records": records}
    common.atomic_json(dest, data, indent=1)
    print(json.dumps({k: {"records": len(v), "findings": sum(len(r["findings"]) for r in v),
                          "recommendations": sum(len(r["recommendations"]) for r in v)} for k, v in records.items()}))
    return data


def main(argv=None):
    ap = argparse.ArgumentParser(description="Build the manual publisher-download supplement")
    ap.add_argument("cmd", choices=["build"])
    ap.add_argument("--intake", required=True, type=Path)
    args = ap.parse_args(argv)
    build(args.intake)


if __name__ == "__main__":
    main()
