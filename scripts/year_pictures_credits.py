"""Normalise the photo credits in portal/public/years/pictures.json.

The year-in-pictures manifest records each photograph's Wikimedia Commons
metadata. Commons' ``Credit`` field is free text, and for some files it is only
the address of the archive the photograph came from (a Flickr page, a DVIDS
record, a government gallery). A credit like that names nobody, so readers who
see it learn nothing about who took the photograph, and CC BY and CC BY-SA
attribution needs a name.

This script rewrites those credits from metadata the manifest already holds,
without calling Commons:

* the credit becomes the ``author`` (HTML stripped, entities decoded, spaces
  collapsed) unless the author is blank or a placeholder such as "Unknown";
* otherwise it becomes the archive's name, taken from the address's host;
* the address itself moves to ``credit_url`` so the link and the audit trail
  are kept.

Credits that already name a person or archive are left alone.

Usage (from the repo root):

    python3 scripts/year_pictures_credits.py           # rewrite in place
    python3 scripts/year_pictures_credits.py --check   # exit 1 if a rewrite is due
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "portal" / "public" / "years" / "pictures.json"

# One or more bare http(s) addresses and nothing else.
_URL = r"https?://[^\s<>\"]+"
BARE_URLS = re.compile(rf"^\s*{_URL}(?:\s+{_URL})*\s*$", re.I)
FIRST_URL = re.compile(_URL, re.I)
TAG = re.compile(r"<[^>]*>")
PLACEHOLDER_AUTHOR = re.compile(r"^(?:unknown|anonymous|own work|n/?a|none)\.?$", re.I)

# Archive names for the hosts the manifest's credits point at. Used only when
# a picture has no usable author; the host itself is the last resort.
ARCHIVES = {
    "flickr.com": "Flickr",
    "catalog.archives.gov": "US National Archives",
    "dvidshub.net": "DVIDS",
    "defenseimagery.mil": "US Defense Imagery",
    "audiovisual.ec.europa.eu": "European Commission Audiovisual Service",
    "obamawhitehouse.archives.gov": "The Obama White House archive",
    "scienceimage.csiro.au": "CSIRO ScienceImage",
    "gg.gov.au": "Governor-General of Australia",
    "aec.gov.au": "Australian Electoral Commission",
    "pmc.gov.au": "Department of the Prime Minister and Cabinet",
    "foreignminister.gov.au": "Minister for Foreign Affairs",
    "trademinister.gov.au": "Minister for Trade and Investment",
    "presidenri.go.id": "Presidential Secretariat of Indonesia",
    "pco.gov.ph": "Presidential Communications Office (Philippines)",
    "kremlin.ru": "Presidential Press and Information Office (Russia)",
    "greenlivingpedia.org": "Greenlivingpedia",
}


def is_bare_url(credit: object) -> bool:
    """True when a credit is only one or more web addresses."""
    return isinstance(credit, str) and bool(BARE_URLS.match(credit))


def clean_text(value: object) -> str:
    """Author text with HTML tags removed, entities decoded and spaces collapsed."""
    if not isinstance(value, str):
        return ""
    text = html.unescape(TAG.sub(" ", value))
    return re.sub(r"\s+", " ", text).strip()


def archive_name(url: str) -> str:
    """The archive a credit address points at, by its host."""
    host = (urlsplit(url).hostname or "").lower()
    host = re.sub(r"^www\.", "", host)
    for known, name in ARCHIVES.items():
        if host == known or host.endswith("." + known):
            return name
    return host


def credit_for(picture: dict) -> tuple[str, str | None]:
    """The credit text and link for one manifest entry.

    Returns ``(credit, credit_url)``; ``credit_url`` is None when the credit
    was not a bare address and so is kept as it stands.
    """
    credit = picture.get("credit")
    if not is_bare_url(credit):
        return credit, None
    url = html.unescape(FIRST_URL.search(credit).group(0))
    author = clean_text(picture.get("author"))
    if author and not PLACEHOLDER_AUTHOR.match(author):
        return author, url
    return archive_name(url), url


def normalise(manifest: dict) -> list[dict]:
    """Rewrite bare-address credits in place; return what changed."""
    changes = []
    for year, pictures in manifest.items():
        for picture in pictures:
            old = picture.get("credit")
            new, url = credit_for(picture)
            if url is None:
                continue
            # Rebuild so credit_url sits beside credit and the rest keeps its order.
            rebuilt = {}
            for key, value in picture.items():
                if key == "credit_url":
                    continue
                rebuilt[key] = new if key == "credit" else value
                if key == "credit":
                    rebuilt["credit_url"] = url
            picture.clear()
            picture.update(rebuilt)
            changes.append({"year": year, "file": picture.get("file"), "old": old, "new": new, "credit_url": url})
    return changes


def dump(manifest: dict) -> str:
    return json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--check", action="store_true", help="exit 1 if a credit is still a bare address")
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    args = parser.parse_args(argv)

    raw = args.manifest.read_text(encoding="utf-8")
    manifest = json.loads(raw)
    changes = normalise(manifest)
    if args.check:
        for c in changes:
            print(f"{c['year']} {c['file']}: credit is an address: {c['old']}", file=sys.stderr)
        return 1 if changes else 0
    for c in changes:
        print(f"{c['year']}\t{c['file']}\t{c['old']}\t=> {c['new']}")
    if changes:
        args.manifest.write_text(dump(manifest), encoding="utf-8")
    print(f"{len(changes)} credits rewritten", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
