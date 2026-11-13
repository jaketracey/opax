#!/usr/bin/env python3
"""
Build portal/public/pay-offices.json: what Commonwealth departmental secretaries,
statutory office holders and agency heads are paid, read from the Remuneration
Tribunal's own determinations on the Federal Register of Legislation.

  python3 scripts/build_pay_offices.py            # cached FRL reads, else fetch
  python3 scripts/build_pay_offices.py --refresh  # ask the FRL for the latest compilations again

Four determinations, each in its latest compilation:

  SECRETARIES   Remuneration Tribunal (Departmental Secretaries—Classification
                Structure and Terms and Conditions) Determination: Table 2A (levels and
                pay points) and Table 2B (which department sits at which level).
                Levels 1 and 2 (PM&C, Treasury) are fixed amounts. Levels 3 and 4 have
                two pay points each, and the Secretary of PM&C assigns each office to
                one by a separate instrument, so those offices are a range.
  FULL-TIME     Remuneration Tribunal (Remuneration and Allowances for Holders of
                Full-time Public Office) Determination: Table 2A (each office's total
                remuneration) and Table 2B (special provisions, some for a named holder).
  STATUTORY     Remuneration Tribunal (Specified Statutory Offices—Remuneration and
                Allowances) Determination: Table 2A (Chief of the Defence Force,
                Commissioner of Taxation, Auditor-General, Australian Statistician).
  PEO           Remuneration Tribunal (Principal Executive Offices—Classification
                Structure and Terms and Conditions) Determination: Table 2A (bands A to E
                and their ranges). The instrument does not list which office sits in which
                band (the Minister declares that separately), so only the bands are kept.

Every figure is "total remuneration": the Tribunal's own measure, the total cost
to the employer of salary, allowances, benefits and the employer superannuation
contribution. It is not comparable dollar for dollar with a parliamentarian's
salary in pay.json, which leaves superannuation out.

A holder is recorded only where the determination itself names one (a personal
rate, loading or superannuation salary for the current holder). Nobody is guessed.

The FRL is read through its public API with OPAX's User-Agent, at most one request
a second, and every response is cached under /tmp (never in the repo). If the
register refuses or rate-limits, the build stops and says so.

Output (whole dollars):

  {"meta": {"generated", "as_of", "jurisdiction": "federal", "sources": [{"id", "frl_id",
            "compilation_id", "compilation_no", "compilation_date", "registered", "title",
            "url", "publisher"}], "measure", "notes", "not_covered"},
   "offices": [{"id", "office", "body", "kind", "head", "amount" | null, "min", "max", "frl_id",
                "measure", "classification", "source", "clause", "aliases", "keys"?,
                "special"?, "holder"?: {"name", "amount"?, "text", "source", "clause",
                "url", "checked"}}]}

kind is one of: secretary, full_time_office, statutory_office, peo_band.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "portal" / "public" / "pay-offices.json"
API = "https://api.prod.legislation.gov.au/v1"
UA = json.loads((ROOT / "parli" / "ingest" / "user-agent.json").read_text())["user_agent"]
CACHE = Path("/tmp/opax-frl-pay-offices")

# Distinctive parts of each determination's title; the newest in-force principal
# determination (not an amendment) carrying it is the one read.
INSTRUMENTS = {
    "secretaries": "Departmental Secretaries—Classification Structure and Terms and Conditions) Determination",
    "full_time": "Holders of Full-time Public Office) Determination",
    "statutory": "Specified Statutory Offices—Remuneration and Allowances) Determination",
    "peo": "Principal Executive Offices—Classification Structure and Terms and Conditions) Determination",
}

MEASURE = ("Total remuneration: the Remuneration Tribunal's measure of the total cost to the employer of salary, "
           "allowances, benefits and the employer superannuation contribution, per year.")

# ----------------------------------------------------------------------------- fetching

_last = [0.0]


class RegisterRefused(RuntimeError):
    pass


def fetch(url: str, *, binary: bool = False, refresh: bool = False):
    """One FRL read, cached by URL. At most one request a second; a refusal stops the build."""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / hashlib.sha1(url.encode()).hexdigest()
    if path.exists() and not refresh:
        data = path.read_bytes()
    else:
        wait = 1.1 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                data = res.read()
        except urllib.error.HTTPError as err:
            if err.code in (403, 429, 503):
                raise RegisterRefused(f"The Federal Register of Legislation refused the request ({err.code}): {url}") from err
            raise
        finally:
            _last[0] = time.time()
        path.write_bytes(data)
    return data if binary else json.loads(data.decode("utf-8"))


def api(path: str, params: dict | None = None, refresh: bool = False):
    url = f"{API}/{path}" + ("?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote) if params else "")
    return fetch(url, refresh=refresh)


def current_instrument(key: str, refresh: bool) -> dict:
    """The newest in-force principal determination for this key, and its latest compilation."""
    needle = INSTRUMENTS[key].replace("'", "''")
    titles = api("titles", {"$filter": f"contains(name,'{needle}')", "$top": "100"}, refresh)["value"]
    principal = [t for t in titles if t.get("status") == "InForce" and t["id"].startswith("F")
                 and "Amendment" not in t["name"] and t.get("makingDate")]
    if not principal:
        raise SystemExit(f"No in-force determination found on the FRL for {key!r}")
    title = max(principal, key=lambda t: t["makingDate"])
    versions = api("versions", {"$filter": f"titleId eq '{title['id']}'", "$top": "100"}, refresh)["value"]
    latest = next((v for v in versions if v.get("isLatest")), None) or max(versions, key=lambda v: v["start"])
    start = latest["start"][:10]
    doc = (f"{API}/documents(titleId='{title['id']}',start={start}T00:00:00,retrospectiveStart="
           f"{latest['retrospectiveStart'][:10]}T00:00:00,rectificationVersionNumber=0,type='Primary',"
           f"uniqueTypeNumber=0,volumeNumber=0,format='Word')")
    return {
        "id": key, "frl_id": title["id"], "compilation_id": latest["registerId"],
        "compilation_no": int(latest.get("compilationNumber") or 0), "compilation_date": start,
        "registered": (latest.get("registeredAt") or "")[:10], "title": title["name"],
        "url": f"https://www.legislation.gov.au/{title['id']}/latest/text", "publisher": "Federal Register of Legislation",
        "_doc": doc,
    }


# ----------------------------------------------------------------------------- reading the text

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _text(el) -> str:
    out = []
    for node in el.iter():
        if node.tag == W + "t":
            out.append(node.text or "")
        elif node.tag == W + "noBreakHyphen":
            out.append("-")
        elif node.tag == W + "tab":
            out.append(" ")
    return re.sub(r"\s+", " ", "".join(out)).strip()


def docx_lines(data: bytes) -> list[str]:
    """Paragraphs as text, and each table row as 'ROW | cell | cell', in document order."""
    body = ET.fromstring(zipfile.ZipFile(BytesIO(data)).read("word/document.xml")).find(W + "body")
    lines: list[str] = []
    for el in body:
        if el.tag == W + "p":
            s = _text(el)
            if s:
                lines.append(s)
        elif el.tag == W + "tbl":
            for tr in el.iter(W + "tr"):
                lines.append("ROW | " + " | ".join(" ".join(_text(p) for p in tc.iter(W + "p")).strip() for tc in tr.findall(W + "tc")))
    return lines


MONEY = re.compile(r"\$([\d,]+)")


def money(s: str) -> int | None:
    m = MONEY.search(s or "")
    return int(m.group(1).replace(",", "")) if m else None


def table(lines: list[str], caption: str) -> list[list[str]]:
    """The data rows of the table whose first row starts with caption (header rows dropped)."""
    for i, line in enumerate(lines):
        if line.startswith("ROW | ") and line[6:].startswith(caption):
            rows = []
            for row in lines[i + 1:]:
                if not row.startswith("ROW | "):
                    break
                rows.append([c.strip() for c in row[6:].split(" | ")])
            # Header rows name their columns ("Column 1 Office", "Item", "Level").
            return [r for r in rows if not re.match(r"^(?:Column \d|Item$|Level$|Provision affected)", r[0])]
    raise ValueError(f"table not found: {caption}")


def compilation_date(lines: list[str]) -> str | None:
    for line in lines[:12]:
        m = re.match(r"Compilation date:\s*(\d{1,2} \w+ \d{4})", line)
        if m:
            return dt.datetime.strptime(m.group(1), "%d %B %Y").date().isoformat()
    return None


# ----------------------------------------------------------------------------- rows

def fold(s: str) -> str:
    """Lower case, apostrophes dropped, & as 'and', everything else not a letter or digit a space.
    portal/src/ask-pay-offices.ts folds questions the same way."""
    s = s.replace("’", "").replace("'", "").replace("&", " and ").lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def slug(s: str) -> str:
    return fold(s).replace(" ", "-")[:80]


# Acronyms and short names readers use for a body or office. Matching aids only:
# nothing here is a claim about the office, and every figure comes from the instrument.
ALIASES = {
    "Australian Prudential Regulation Authority": ["apra"],
    "Australian Competition and Consumer Commission": ["accc"],
    "Australian Securities and Investments Commission": ["asic"],
    "Australian Security Intelligence Organisation": ["asio"],
    "Australian Signals Directorate": ["asd"],
    "Office of National Intelligence": ["oni"],
    "National Disability Insurance Agency": ["ndia", "ndis"],
    "Australian Communications and Media Authority": ["acma"],
    "Australian Criminal Intelligence Commission": ["acic"],
    "Australian Transaction Reports and Analysis Centre": ["austrac"],
    "Australian Energy Regulator": ["aer"],
    "Bureau of Meteorology": ["bom", "weather bureau"],
    "National Health and Medical Research Council": ["nhmrc"],
    "Australian Research Council": ["arc"],
    "Fair Work Commission": ["fwc"],
    "Services Australia": ["centrelink"],
    "National Anti-Corruption Commission": ["nacc"],
    "Australian Human Rights Commission": ["ahrc"],
    "Australian Federal Police Commissioner": ["afp commissioner", "afp", "australian federal police"],
    "Commonwealth Ombudsman": ["ombudsman"],
    "Commissioner of Taxation": ["tax commissioner", "ato", "australian taxation office"],
    "Chief of the Defence Force": ["cdf", "defence chief"],
    "Auditor-General for Australia": ["auditor general", "anao", "australian national audit office"],
    "Australian Statistician": ["abs", "australian bureau of statistics", "statistician"],
    "Australian Public Service Commissioner": ["apsc", "public service commissioner"],
    "Australian Electoral Commissioner": ["aec", "electoral commissioner"],
    "Australian Border Force Commissioner": ["abf", "border force commissioner"],
    "Director of Public Prosecutions": ["cdpp", "dpp"],
    "National Anti-Corruption Commissioner": ["anti corruption commissioner"],
}

# Department name in Table 2B -> the full name and the words a reader would use for it.
def department(name: str) -> tuple[str, list[str]]:
    n = re.sub(r"^The\s+", "", name.strip())
    if n == "Prime Minister and Cabinet":
        return "Department of the Prime Minister and Cabinet", ["prime minister and cabinet", "pm and c", "pmc"]
    if n == "Treasury":
        return "Department of the Treasury", ["treasury"]
    if n.startswith("Attorney-General"):
        return "Attorney-General’s Department", ["attorney general", "attorney generals"]
    full = f"Department of {n}"
    first = re.split(r",| and ", n)[0]
    keys = [fold(n)] + ([fold(first)] if fold(first) != fold(n) else [])
    extra = {"Foreign Affairs and Trade": ["dfat", "foreign affairs"], "Veterans’ Affairs": ["veterans affairs", "veterans", "dva"],
             "Climate Change, Energy, the Environment and Water": ["dcceew", "environment", "energy"],
             "Home Affairs": ["home affairs"], "Social Services": ["social services", "dss"],
             "Defence": ["defence", "defense"], "Health, Disability and Ageing": ["health"],
             "Employment and Workplace Relations": ["employment", "dewr"],
             "Infrastructure, Transport, Regional Development, Communications, Sport and the Arts": ["infrastructure", "transport"],
             "Industry, Science and Resources": ["industry", "disr"], "Agriculture, Fisheries and Forestry": ["agriculture", "daff"]}
    for k in extra.get(n, []):
        if fold(k) not in keys:
            keys.append(fold(k))
    return full, keys


def parse_secretaries(lines: list[str], src: str) -> list[dict]:
    levels: dict[str, list[int]] = {}
    for row in table(lines, "Table 2A—Classification structure"):
        level = re.match(r"Level \d", row[0]).group(0)
        levels.setdefault(level, []).append(money(row[-1]))
    rows = []
    for level, depts in table(lines, "Table 2B—Classification of offices of Secretary"):
        names = re.findall(r"\([a-z]\)\s*([^;]+?)(?=;|$)", depts) or [depts]
        amounts = levels[level]
        for name in names:
            full, keys = department(name)
            fixed = len(amounts) == 1
            rows.append({
                "id": "secretary-" + slug(full.replace("Department of ", "")),
                "office": ("Secretary to the Treasury" if full == "Department of the Treasury" else f"Secretary of the {full}"),
                "body": full, "kind": "secretary", "head": True,
                "amount": amounts[0] if fixed else None,
                "min": min(amounts), "max": max(amounts), "measure": "total remuneration",
                "classification": level, "source": src,
                "clause": "s 11, Tables 2A and 2B" if fixed else "s 11, Tables 2A and 2B; pay point set under s 11(4)",
                "aliases": [], "keys": keys,
                **({} if fixed else {"special": f"{level} has {len(amounts)} pay points. The Secretary of the Department of the Prime Minister and Cabinet assigns each office to one by a separate pay point assignment (s 11(4)), so the rate is shown as the {level} range."}),
            })
    return rows


# Office titles that are not the head of a body: a deputy, a member of a commission
# someone else chairs, a service chief under the CDF, a state electoral officer.
# A reading of the title for "who heads what", not a legal category.
NOT_HEAD = re.compile(
    r"\b(?:Deputy|Vice|Associate|Second|Senior Member|(?<!Principal )Member|Examiner|Classifier|Complaints Commissioner|First Nations Commissioner)\b"
    r"|^(?:Chief of (?:Navy|Army|Air Force)|Australian Electoral Officer for|Commissioner, (?:Fair Work|Productivity|Repatriation) Commission"
    r"|(?:Aboriginal and Torres Strait Islander Social Justice|Age Discrimination|Disability Discrimination|Human Rights|National Children’s|Race Discrimination|Sex Discrimination) Commissioner"
    r"|Chief Executive Officer, (?:National Anti-Corruption Commission|Infrastructure Australia|Torres Strait Regional Authority))")


def split_office(title: str) -> tuple[str, str | None]:
    """'Chief Executive Officer, Services Australia' -> role and body; a title with no comma has no body."""
    if ", " in title:
        role, body = title.split(", ", 1)
        return role, body
    return title, None


def office_aliases(title: str, body: str | None) -> list[str]:
    out = []
    for key in (title, body):
        for alias in ALIASES.get(key or "", []):
            if fold(alias) not in out:
                out.append(fold(alias))
    return out


def parse_table_offices(lines: list[str], src: str, kind: str, caption: str, clause: str) -> list[dict]:
    rows = []
    for cells in table(lines, caption):
        title, amount = cells[0], money(cells[1])
        if amount is None:
            continue
        role, body = split_office(title)
        rows.append({
            "id": ("office-" if kind == "full_time_office" else "statutory-") + slug(title),
            "office": title, "body": body, "kind": kind, "head": not NOT_HEAD.search(title),
            "amount": amount, "min": amount, "max": amount, "measure": "total remuneration",
            "classification": None, "source": src, "clause": clause, "aliases": office_aliases(title, body),
            **({"special_ref": cells[2]} if len(cells) > 2 and cells[2] else {}),
        })
    return rows


HONORIFIC = r"(?:Mr|Ms|Mrs|Miss|Mx|Dr|Professor|Prof|Sir|Dame)"


def person_name(s: str) -> str | None:
    m = re.match(rf"^{HONORIFIC}\.?\s+(.+)$", s.strip())
    return m.group(1).strip() if m else None


def holders_full_time(lines: list[str], rows: list[dict], src: str, url: str, checked: str) -> None:
    """Holders the determination names: Table 2B (a personal rate or loading), Table 3B
    (a personal superannuation salary) and Table 5A (accommodation assistance)."""
    by_title = {r["office"]: r for r in rows}

    def attach(office: str, name: str, clause: str, text: str, amount: int | None = None):
        row = by_title.get(office.strip())
        if not row:
            return
        held = row.get("holder") or {"name": name, "text": "", "source": src, "clause": clause, "url": url, "checked": checked}
        if held["name"] != name:
            return
        if clause not in held["clause"]:
            held["clause"] = held["clause"] if held["clause"] == clause else f"{held['clause']}; {clause}"
        held["text"] = (held["text"] + " " + text).strip() if text not in held["text"] else held["text"]
        if amount is not None:
            held["amount"] = amount
        row["holder"] = held

    for cells in table(lines, "Table 2B—Special provisions"):
        item, office, text = cells[0], cells[1], cells[2]
        row = by_title.get(office)
        if row:
            row["special"] = text
            row["clause"] = f"{row['clause']}; s 11, Table 2B item {item}"
        m = re.search(rf"(?:for|for the holder,)\s+({HONORIFIC}\.?\s+[A-Z][^,]*?)\s+is\s+\$([\d,]+)", text)
        if m and row:
            attach(office, person_name(m.group(1)), f"s 11, Table 2B item {item}", text, int(m.group(2).replace(",", "")))
            continue
        m = re.search(rf"^({HONORIFIC}\.?\s+[A-Z][^,]*?)\s+will receive an? [\w ]*loading of \$([\d,]+) per year", text)
        if m and row:
            attach(office, person_name(m.group(1)), f"s 11, Table 2B item {item}", text, row["amount"] + int(m.group(2).replace(",", "")))
    for cells in table(lines, "Table 3B—Superannuation salary for specified office holders"):
        who = cells[1]
        name = person_name(who.split(", ", 1)[0])
        if name and ", " in who:
            attach(who.split(", ", 1)[1], name, f"s 15, Table 3B item {cells[0]}", f"Named in Table 3B (superannuation salary {cells[2]}).")
    try:
        accommodation = table(lines, "Table 5A—Accommodation assistance")
    except ValueError:
        accommodation = []
    for cells in accommodation:
        name = person_name(cells[1])
        office = re.sub(r"\s*\(.*$", "", cells[2])
        if name:
            attach(office, name, f"s 19, Table 5A item {cells[0]}", f"Named in Table 5A (accommodation assistance, {cells[3]} a year).")


def parse_peo(lines: list[str], src: str) -> list[dict]:
    rows = []
    for cells in table(lines, "Table 2A—Classification structure and remuneration ranges"):
        band, text = cells[0], cells[1]
        nums = [int(n.replace(",", "")) for n in MONEY.findall(text)]
        if text.lower().startswith("up to"):
            lo, hi = None, nums[0]
        elif text.lower().startswith("from"):
            lo, hi = nums[0], None
        else:
            lo, hi = nums[0], nums[1]
        rows.append({
            "id": "peo-" + slug(band), "office": f"Principal Executive Office, {band.replace('PEO ', '')}",
            "body": None, "kind": "peo_band", "head": False, "amount": None, "min": lo, "max": hi,
            "measure": "total remuneration range", "classification": band, "source": src, "clause": "s 12, Table 2A",
            "aliases": [fold(band), fold(band.replace("PEO ", "principal executive office "))],
            "special": "The employing body sets the PEO's total remuneration within the band (s 13); the Minister assigns each office to a band by declaration.",
        })
    return rows


def build(texts: dict[str, list[str]], sources: dict[str, dict], checked: str) -> dict:
    """Pure: instrument text in, pay-offices.json out. Tests call this with fixture text."""
    for key, lines in texts.items():
        stated = compilation_date(lines)
        if stated and sources[key].get("compilation_date") and stated != sources[key]["compilation_date"]:
            raise ValueError(f"{key}: the text says compilation date {stated}, the register says {sources[key]['compilation_date']}")
    offices: list[dict] = []
    if "secretaries" in texts:
        offices += parse_secretaries(texts["secretaries"], "secretaries")
    if "full_time" in texts:
        full = parse_table_offices(texts["full_time"], "full_time", "full_time_office", "Table 2A—Total remuneration", "s 10, Table 2A")
        holders_full_time(texts["full_time"], full, "full_time", sources["full_time"]["url"], checked)
        offices += full
    if "statutory" in texts:
        offices += parse_table_offices(texts["statutory"], "statutory", "statutory_office", "Table 2A—Total remuneration", "s 9, Table 2A")
    if "peo" in texts:
        offices += parse_peo(texts["peo"], "peo")
    for row in offices:
        row.pop("special_ref", None)
        # Each row names its instrument outright; title and compilation are in meta.sources.
        row["frl_id"] = sources.get(row["source"], {}).get("frl_id")
    order = {"secretary": 0, "statutory_office": 1, "full_time_office": 2, "peo_band": 3}
    offices.sort(key=lambda r: (r["kind"] == "peo_band", r["classification"] if r["kind"] == "peo_band" else "", -(r["amount"] or r["max"] or 0), order[r["kind"]], r["office"]))
    ids = [r["id"] for r in offices]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        raise ValueError(f"duplicate office ids: {sorted(dupes)}")
    public_sources = [{k: v for k, v in sources[k].items() if not k.startswith("_")} for k in INSTRUMENTS if k in sources]
    as_of = max(s["compilation_date"] for s in public_sources) if public_sources else checked
    return {
        "meta": {
            "generated": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
            "as_of": as_of, "checked": checked, "jurisdiction": "federal", "sources": public_sources,
            "measure": MEASURE,
            "notes": [
                "Every amount is total remuneration per year, which includes the employer superannuation contribution and benefits; a parliamentarian's salary (pay.json) does not include superannuation.",
                "Secretaries at levels 3 and 4 are assigned to a pay point by the Secretary of the Department of the Prime Minister and Cabinet, so their rate is shown as the level's range.",
                "A Principal Executive Office band is a range: the employing body sets the holder's pay within it, and band E has no upper limit.",
                "Actual pay, including any performance pay and leave paid out, is reported in each body's annual report.",
            ],
            "not_covered": [
                "Which office sits in which Principal Executive Office band (set by ministerial declaration, not in the determination).",
                "Judges and judicial offices, the Governor-General, and bodies that set their own executive pay outside the Tribunal (such as the Reserve Bank).",
                "Who holds each office, except where the determination itself names the holder.",
            ],
        },
        "offices": offices,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--refresh", action="store_true", help="ask the FRL for the latest compilations again (documents stay cached by URL)")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args(argv)
    checked = dt.date.today().isoformat()
    sources, texts = {}, {}
    try:
        for key in INSTRUMENTS:
            src = current_instrument(key, args.refresh)
            sources[key] = src
            texts[key] = docx_lines(fetch(src["_doc"], binary=True))
            print(f"{key}: {src['frl_id']} compilation {src['compilation_no']} ({src['compilation_id']}), {src['compilation_date']}", file=sys.stderr)
    except RegisterRefused as err:
        print(str(err), file=sys.stderr)
        return 3
    data = build(texts, sources, checked)
    Path(args.out).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    counts: dict[str, int] = {}
    for row in data["offices"]:
        counts[row["kind"]] = counts.get(row["kind"], 0) + 1
    print(f"{len(data['offices'])} rows -> {args.out}: " + ", ".join(f"{k} {v}" for k, v in counts.items()), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
