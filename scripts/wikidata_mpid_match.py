"""Match current federal members without a portrait to Wikidata by identifier, not by name.

Route: roster pid -> APH MP ID (the key of pay.json's Handbook records for that pid) -> the Wikidata item
whose "Parliament of Australia MP ID" (P10020) is that id -> its image (P18). When the item has no P18, the
lead image of the item's own English Wikipedia article is used, but only when Wikipedia reports it as freely
licensed (pageimages pilicense=free). Either way the Commons file's credit, author and description are read
from the Commons API, and a file sourced from aph.gov.au, ParlInfo or any Australian parliament's site is
refused: those are official portraits, whatever licence the Commons page carries. A surname or initials print
is never matched, and neither is a pid with no MP ID, or one MP ID on two items.

Output: scripts/_photos_work/wikidata_matches_new.json in the format fetch_commons_portraits.py --new and
recrop_commons_portraits.py --new read (also merged into wikidata_matches.json); an image recrop already
dropped as a group shot is not offered again. Also writes
scripts/_photos_work/mpid_report.json with one line per member: the match, or why there is none.
Honest UA (parli.ingest.http), one request a second."""

import html, json, re, sys, time
from pathlib import Path
from urllib.parse import quote, unquote

W = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(W))
from parli.ingest import http as source_http  # noqa: E402

SCR = W / "scripts" / "_photos_work"
H = {"User-Agent": source_http.USER_AGENT}


def plan(people, pm, pay):
    """(wanted, report): MP ID -> roster row for each current, full-named member with no portrait, and the
    reason for every member left out."""
    mpids = {}
    for mid, rec in pay.items():
        if rec.get("pid"):
            mpids.setdefault(str(rec["pid"]), []).append(mid)
    wanted, report = {}, {}
    for p in people:
        if not p.get("current") or p["name"].strip().lower() in pm:
            continue
        pid = str(p.get("pid") or "")
        if " " not in p["name"].strip():
            report[p["name"]] = "single-name print, left alone"
        elif pid not in mpids:
            report[p["name"]] = f"no APH MP ID for pid {pid or '(none)'}"
        elif len(mpids[pid]) != 1:
            report[p["name"]] = f"pid {pid} has several MP IDs {mpids[pid]}"
        else:
            wanted[mpids[pid][0]] = p
    return wanted, report


# Official portraits: the APH site (CC BY-NC-ND, whatever a Commons tag says), ParlInfo, the Parliamentary
# Education Office, Parliament@Work redistributions, and every state and territory parliament's site.
# docs/PHOTOS.md, Licence handling.
PARLIAMENT_HOST = re.compile(r"(?<![a-z0-9-])(?:[a-z0-9-]+\.)*(?:aph\.gov\.au|peo\.gov\.au|parlinfo\.[a-z.]+|"
                             r"parliament\.curriculum\.edu\.au|"
                             r"parliament\.(?:nsw|vic|qld|sa|wa|tas|nt|act)\.gov\.au|legassembly\.[a-z.]+)", re.I)
PARLIAMENT_NAME = re.compile(r"\bParlInfo\b|Parliament of (?:Australia|New South Wales|Victoria|Queensland|South Australia|"
                             r"Western Australia|Tasmania)|Australian Parliament House|Department of Parliamentary Services|"
                             r"\bParliament\s*@\s*Work\b|(?:Northern Territory|ACT) Legislative Assembly", re.I)
SOURCE_FIELDS = ("Credit", "Artist", "Attribution", "ImageDescription")
FREE_LICENCE = re.compile(r"CC0(?: 1\.0)?|CC BY(?:-SA)? (?:1\.0|2\.[05]|3\.0|4\.0)(?: AU|AT|DE|FR|IGO|NZ|UK|US)?|Public domain|GFDL(?: 1\.[123])?|OGL v[123]\.0|No restrictions|Copyrighted free use", re.I)


def free_licence(licence):
    """Allow explicit free licences, never an NC/ND suffix or a vague CC tag."""
    return bool(FREE_LICENCE.fullmatch(licence.strip()))


def parliament_source(extmetadata):
    """The parliament site or body a Commons file's credit, author or description names, or None. Raw values are
    checked, HTML and all, so a link's address counts as much as its text."""
    for field in SOURCE_FIELDS:
        value = html.unescape(str((extmetadata.get(field) or {}).get("value") or ""))
        hit = PARLIAMENT_HOST.search(value) or PARLIAMENT_NAME.search(re.sub(r"<[^>]+>", " ", value))
        if hit:
            return f"{field}: {hit.group(0)}"
    return None


def file_title(img_url):
    """http://commons.wikimedia.org/wiki/Special:FilePath/Some%20Name.jpg -> File:Some Name.jpg"""
    return "File:" + unquote(img_url.rsplit("/", 1)[-1]).replace("_", " ")


def commons_sources(titles):
    """File title -> extmetadata, from the Commons API, 50 titles a call."""
    out, titles = {}, sorted(set(titles))
    for i in range(0, len(titles), 50):
        r = source_http.get("https://commons.wikimedia.org/w/api.php", headers=H, timeout=60, params={
            "action": "query", "prop": "imageinfo", "iiprop": "extmetadata", "titles": "|".join(titles[i:i + 50]),
            "format": "json", "formatversion": "2"})
        r.raise_for_status(); time.sleep(1)
        js = r.json()["query"]
        back = {n["to"]: n["from"] for n in js.get("normalized", [])}
        for pg in js.get("pages", []):
            ext = ((pg.get("imageinfo") or [{}])[0]).get("extmetadata") or {}
            out[back.get(pg.get("title"), pg.get("title"))] = ext
    return out


def sparql(q):
    r = source_http.get("https://query.wikidata.org/sparql", params={"query": q, "format": "json"}, headers=H, timeout=120)
    r.raise_for_status()
    time.sleep(1)
    return r.json()["results"]["bindings"]


def main():
    people = json.load(open(W / "portal/public/parliamentarians.json"))["people"]
    pm = json.load(open(W / "portal/public/photos/people.json"))
    pay = json.load(open(W / "portal/public/pay.json"))["people"]
    wanted, report = plan(people, pm, pay)
    if not wanted:
        print("nothing to match"); return
    rows = sparql("""SELECT ?id ?person ?label ?img ?art WHERE { VALUES ?id { %s } ?person wdt:P10020 ?id .
      OPTIONAL { ?person rdfs:label ?label FILTER(lang(?label) IN ('en','mul')) } OPTIONAL { ?person wdt:P18 ?img }
      OPTIONAL { ?art schema:about ?person ; schema:isPartOf <https://en.wikipedia.org/> } }"""
                  % " ".join(json.dumps(k) for k in wanted))
    by = {}
    for b in rows:
        by.setdefault(b["id"]["value"], []).append({k: v["value"] for k, v in b.items()})
    found, need_page = {}, {}
    for mid, p in wanted.items():
        bs = by.get(mid, [])
        qids = {b["person"].rsplit("/", 1)[-1] for b in bs}
        if not bs:
            report[p["name"]] = f"no Wikidata item with APH MP ID {mid}"; continue
        if len(qids) > 1:
            report[p["name"]] = f"MP ID {mid} is on several items {sorted(qids)}"; continue
        qid = qids.pop(); label = next((b["label"] for b in bs if b.get("label")), p["name"])
        imgs = sorted({b["img"] for b in bs if b.get("img")})
        found[p["name"]] = {"qid": qid, "label": label, "img": imgs[0] if imgs else None, "mpid": mid, "pid": p.get("pid"),
                            "chamber": (p.get("chambers") or [""])[0], "kind": "aph-mpid", "born": None, "ours": (p.get("first"), p.get("last"))}
        art = next((b["art"] for b in bs if b.get("art")), None)
        if not imgs and art:
            need_page[unquote(art.rsplit("/", 1)[-1]).replace("_", " ")] = p["name"]
    titles = list(need_page)
    for i in range(0, len(titles), 40):
        r = source_http.get("https://en.wikipedia.org/w/api.php", headers=H, timeout=60, params={
            "action": "query", "prop": "pageimages|pageprops", "piprop": "name", "pilicense": "free",
            "titles": "|".join(titles[i:i + 40]), "format": "json", "formatversion": "2"})
        r.raise_for_status(); time.sleep(1)
        for pg in r.json()["query"]["pages"]:
            name = need_page.get(pg.get("title"))
            m = found.get(name)
            if m and pg.get("pageimage") and (pg.get("pageprops") or {}).get("wikibase_item") == m["qid"]:
                m["img"] = "http://commons.wikimedia.org/wiki/Special:FilePath/" + quote(pg["pageimage"].replace("_", " "))
                m["kind"] = "aph-mpid+enwiki-lead-image"
    SCR.mkdir(exist_ok=True)
    allm = json.load(open(SCR / "wikidata_matches.json")) if (SCR / "wikidata_matches.json").exists() else {}
    rlog = json.load(open(SCR / "recrop_log.json")) if (SCR / "recrop_log.json").exists() else {}
    group = {m["img"] for m in allm.values() if rlog.get(f"wd-{m['qid']}") == "group"}
    sources = commons_sources(file_title(m["img"]) for m in found.values() if m["img"] and m["img"] not in group)
    out = {}
    for name, m in found.items():
        official = m["img"] and parliament_source(sources.get(file_title(m["img"])) or {})
        if m["img"] in group:
            report[name] = f"Wikidata {m['qid']} (MP ID {m['mpid']}): the only image is a group shot, dropped by recrop"
        elif official:
            report[name] = f"Wikidata {m['qid']} (MP ID {m['mpid']}): the only image is an official parliament portrait ({official})"
        elif m["img"] and file_title(m["img"]) not in sources:
            report[name] = f"Wikidata {m['qid']} (MP ID {m['mpid']}): Commons gave no source for {file_title(m['img'])}; not used"
        elif m["img"]:
            out[name] = m; report[name] = f"match {m['qid']} via MP ID {m['mpid']} ({m['kind']})"
        else:
            report[name] = f"Wikidata {m['qid']} (MP ID {m['mpid']}) has no image and no free article image"
    allm.update(out)
    json.dump(allm, open(SCR / "wikidata_matches.json", "w"), indent=1, ensure_ascii=False)
    json.dump(out, open(SCR / "wikidata_matches_new.json", "w"), indent=1, ensure_ascii=False)
    json.dump(report, open(SCR / "mpid_report.json", "w"), indent=1, ensure_ascii=False)
    for n, why in sorted(report.items()):
        print(f"{n}: {why}")
    print(f"{len(out)} matches of {len(wanted)} members with an MP ID")


if __name__ == "__main__":
    main()
