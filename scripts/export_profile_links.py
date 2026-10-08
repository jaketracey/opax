#!/usr/bin/env python3
"""Export verified APH identities for JSON-LD, using pinned OpenAustralia records.

OpenAustralia's lib/person.rb explicitly defines its person id as 10000 plus
the CSV person count. That id is different from the APH MPID in column two.
Both the verified roster id and an agreeing source name are required here.
No remote database or API key is required. All network access is a public GET.
"""

import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import unicodedata
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
SOURCE_COMMIT = "061ec16fdc68ef52544a35d8c4f6413e4622e6cb"
SOURCE_BASE = f"https://raw.githubusercontent.com/openaustralia/openaustralia-parser/{SOURCE_COMMIT}"
SOURCE_URL = f"{SOURCE_BASE}/data/people.csv"
ID_SOURCE_URL = f"{SOURCE_BASE}/lib/person.rb"
SOURCE_SHA256 = "42e310b1a1e8b63243e6027f0c07303bf068c1ef9db5d9fc9744880d93ed007f"


def name_key(value):
    value = unicodedata.normalize("NFKD", value or "")
    words = re.findall(r"[a-z]+", value.lower())
    while words and words[0] in {"the", "hon", "honourable", "mr", "mrs", "ms", "dr", "sen", "senator", "sir"}:
        words.pop(0)
    return " ".join(words)


def names_agree(name, source_names):
    key = name_key(name)
    if len(key.split()) < 2:
        return False
    for source in source_names:
        source_key = name_key(source)
        if key == source_key:
            return True
        # Middle names are omitted from the client directory. Initials-only
        # prints, nicknames and surname-only prints never pass this shortcut.
        first_last = lambda text: (text.split()[0], text.split()[-1])
        if len(source_key.split()) >= 2 and len(key.split()[0]) > 1 and first_last(key) == first_last(source_key):
            return True
    return False


def build_profile_links(csv_text, roster, photos, credits):
    sources = {}
    for row in csv.reader(io.StringIO(csv_text)):
        if len(row) < 3 or not row[0].strip().isdigit() or not re.fullmatch(r"[A-Za-z0-9]+", row[1].strip()):
            continue
        pid = str(10000 + int(row[0]))
        sources[pid] = {"aphMpid": row[1].strip(), "name": row[2].strip(),
                        "names": [row[2].strip(), *[name.strip() for name in row[4:] if name.strip()]]}
    people, by_name, rejected = {}, {}, 0
    for person in roster["people"]:
        names = [person["name"], person.get("full") or person["name"]]
        pid = str(person.get("pid") or "")
        source = sources.get(pid)
        record = {}
        if source:
            if any(names_agree(name, source["names"]) for name in names):
                record = {"name": source["name"], "aphMpid": source["aphMpid"],
                          "aphProfileUrl": f"https://www.aph.gov.au/Senators_and_Members/Parliamentarian?MPID={source['aphMpid']}"}
                people[pid] = record.copy()
            else:
                rejected += 1
        for name in names:
            photo = photos.get(name.strip().lower(), "")
            qid = credits.get(photo, {}).get("wikidata") or (photo[3:] if photo.startswith("wd-") else "")
            known = dict(record)
            if re.fullmatch(r"Q[1-9][0-9]*", qid):
                known["wikidata"] = qid
            if known:
                by_name[name.strip().lower()] = known
    return {
        "meta": {
            "source_url": SOURCE_URL, "source_commit": SOURCE_COMMIT, "person_id_source_url": ID_SOURCE_URL,
            "source_sha256": hashlib.sha256(csv_text.encode()).hexdigest(),
            "roster_generated": roster.get("meta", {}).get("generated"),
            "join": "Verified roster OpenAustralia pid and an agreeing full or alternate name; no surname-only joins.",
            "aph_people": len(people), "named_profiles": len(by_name), "identity_mismatches_omitted": rejected,
            "wikidata_source": "/photos/people.json and /photos/credits.json",
        },
        "people": dict(sorted(people.items())),
        "by_name": dict(sorted(by_name.items())),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--people-csv", type=Path, help="An already downloaded copy of the pinned source CSV")
    parser.add_argument("--output", type=Path, default=ROOT / "portal/public/profile-links.json")
    args = parser.parse_args()
    if args.people_csv:
        csv_text = args.people_csv.read_text()
    else:
        with urlopen(SOURCE_URL, timeout=30) as response:
            csv_text = response.read().decode("utf-8")
    if hashlib.sha256(csv_text.encode()).hexdigest() != SOURCE_SHA256:
        raise ValueError("The profile source CSV does not match the pinned source digest.")
    public = ROOT / "portal/public"
    read = lambda path: json.loads((public / path).read_text())
    result = build_profile_links(csv_text, read("parliamentarians.json"), read("photos/people.json"), read("photos/credits.json"))
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(f"Exported {result['meta']['aph_people']} verified APH identities and {result['meta']['named_profiles']} named profiles.")


if __name__ == "__main__":
    main()
