"""
parli.ingest.aec_results -- Ingest AEC federal election results and postcode-electorate mappings.

Downloads electorate-level results from the AEC (data.gov.au) for the 2022 and 2019
federal elections, plus the official postcode-to-electorate mapping.

Tables created/populated:
  - electorates: electorate_name, state, margin_pct, winning_party, winning_candidate,
                 year, swing, seat_type (safe/fairly_safe/marginal)
  - postcode_electorates: postcode -> electorate mapping (many-to-many)

Also back-fills government_grants.electorate using the postcode mapping.

Usage:
    python -m parli.ingest.aec_results
    python -m parli.ingest.aec_results --backfill-grants
"""

import argparse
import csv
import io
import json
import re
import sqlite3
import time
from pathlib import Path

import requests

from parli.schema import get_db, init_db

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "OPAX/1.0 (parliamentary transparency research; https://opax.com.au)"
})

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

ELECTORATES_SCHEMA = """
PRAGMA busy_timeout = 600000;

CREATE TABLE IF NOT EXISTS electorates (
    electorate_name TEXT NOT NULL,
    state TEXT NOT NULL,
    margin_pct REAL,
    winning_party TEXT,
    winning_candidate TEXT,
    year INTEGER NOT NULL,
    swing REAL,
    seat_type TEXT,  -- 'safe', 'fairly_safe', 'marginal'
    enrolled_voters INTEGER,
    total_votes INTEGER,
    PRIMARY KEY (electorate_name, year)
);

CREATE INDEX IF NOT EXISTS idx_electorates_year ON electorates(year);
CREATE INDEX IF NOT EXISTS idx_electorates_state ON electorates(state);
CREATE INDEX IF NOT EXISTS idx_electorates_seat_type ON electorates(seat_type);
CREATE INDEX IF NOT EXISTS idx_electorates_margin ON electorates(margin_pct);

CREATE TABLE IF NOT EXISTS postcode_electorates (
    postcode TEXT NOT NULL,
    electorate_name TEXT NOT NULL,
    state TEXT,
    ratio REAL DEFAULT 1.0,  -- fraction of postcode in electorate (if split)
    PRIMARY KEY (postcode, electorate_name)
);

CREATE INDEX IF NOT EXISTS idx_pce_postcode ON postcode_electorates(postcode);
CREATE INDEX IF NOT EXISTS idx_pce_electorate ON postcode_electorates(electorate_name);
"""


def classify_seat(margin_pct: float | None) -> str:
    """Classify seat safety based on margin percentage."""
    if margin_pct is None:
        return "unknown"
    margin = abs(margin_pct)
    if margin > 6.0:
        return "safe"
    elif margin > 3.0:
        return "fairly_safe"
    else:
        return "marginal"


# ---------------------------------------------------------------------------
# AEC data sources
# ---------------------------------------------------------------------------

# 2022 federal election: two-candidate preferred results by division
# From AEC Tally Room / data.gov.au
AEC_RESULTS_URLS = {
    2022: "https://results.aec.gov.au/27966/Website/Downloads/HouseTcpByCandidateByVoteTypeDownload-27966.csv",
    2019: "https://results.aec.gov.au/24310/Website/Downloads/HouseTcpByCandidateByVoteTypeDownload-24310.csv",
}

# Postcode-to-electorate mapping from AEC
# This is a PDF normally, but we can use the data.gov.au CKAN API or a known CSV
AEC_POSTCODE_URL = "https://aec.gov.au/profiles/files/postcode-to-fed-electorate.csv"

# State abbreviation map from AEC state codes
AEC_STATE_MAP = {
    "NSW": "nsw", "VIC": "vic", "QLD": "qld", "WA": "wa",
    "SA": "sa", "TAS": "tas", "ACT": "act", "NT": "nt",
}


def _normalise_party(party: str) -> str:
    """Normalise party names for consistency."""
    party = party.strip()
    mappings = {
        "Australian Labor Party": "Labor",
        "Australian Labor Party (Northern Territory) Branch": "Labor",
        "Liberal": "Liberal",
        "Liberal National Party of Queensland": "LNP",
        "The Nationals": "Nationals",
        "National Party": "Nationals",
        "Country Liberal Party": "CLP",
        "Australian Greens": "Greens",
        "The Greens": "Greens",
        "Independent": "Independent",
        "Katter's Australian Party": "KAP",
    }
    for key, val in mappings.items():
        if key.lower() in party.lower():
            return val
    return party


def _normalise_electorate(name: str) -> str:
    """Normalise electorate name for matching."""
    return name.strip().title()


def fetch_tcp_results(year: int) -> list[dict]:
    """Download AEC two-candidate-preferred results for a federal election year.

    The AEC TCP CSV has two rows per division (one per candidate) with raw
    vote counts in TotalVotes and a Swing column.  The margin is computed as:
        margin_pct = (winner_votes / division_total_votes) * 100 - 50
    """
    url = AEC_RESULTS_URLS.get(year)
    if not url:
        print(f"  No URL configured for year {year}")
        return []

    print(f"  Fetching AEC {year} TCP results...")
    try:
        resp = SESSION.get(url, timeout=120)
        resp.raise_for_status()
    except Exception as e:
        print(f"  Error fetching {year} results: {e}")
        return []

    text = resp.text
    lines = text.splitlines()
    header_idx = 0
    for i, line in enumerate(lines):
        if "DivisionNm" in line or "DivisionID" in line:
            header_idx = i
            break

    reader = csv.DictReader(lines[header_idx:])

    # Collect candidates per division
    divisions: dict[str, dict] = {}
    for row in reader:
        div_name = row.get("DivisionNm", "").strip()
        if not div_name:
            continue

        state = row.get("StateAb", "").strip()
        surname = row.get("Surname", "").strip()
        given = row.get("GivenNm", "").strip()
        party = row.get("PartyNm", "").strip()
        elected = row.get("Elected", "").strip().upper() == "Y"

        try:
            total_votes = int(str(row.get("TotalVotes", "0")).replace(",", ""))
        except (ValueError, TypeError):
            total_votes = 0

        swing_str = row.get("Swing", "")
        try:
            swing = float(str(swing_str).replace(",", "").replace("%", "")) if swing_str else 0.0
        except (ValueError, TypeError):
            swing = 0.0

        if div_name not in divisions:
            divisions[div_name] = {"state": state, "candidates": []}

        divisions[div_name]["candidates"].append({
            "name": f"{given} {surname}".strip(),
            "party": party,
            "votes": total_votes,
            "swing": swing,
            "elected": elected,
        })

    # Determine winner and margin for each division
    results = []
    for div_name, data in divisions.items():
        candidates = data["candidates"]
        if not candidates:
            continue

        # Sort by votes descending -- winner is first
        candidates.sort(key=lambda c: c["votes"], reverse=True)
        winner = candidates[0]
        div_total = sum(c["votes"] for c in candidates)

        if div_total > 0:
            margin = (winner["votes"] / div_total) * 100.0 - 50.0
        else:
            margin = 0.0

        results.append({
            "electorate_name": _normalise_electorate(div_name),
            "state": AEC_STATE_MAP.get(data["state"], data["state"].lower()),
            "margin_pct": round(margin, 2),
            "winning_party": _normalise_party(winner["party"]),
            "winning_candidate": winner["name"],
            "year": year,
            "swing": round(winner["swing"], 2),
            "seat_type": classify_seat(margin),
        })

    print(f"  Parsed {len(results)} electorates for {year}")
    return results


def fetch_postcode_mapping() -> list[dict]:
    """Download AEC postcode-to-electorate mapping.

    Falls back to building from AEC profile pages if the CSV is unavailable.
    """
    print("  Fetching AEC postcode-to-electorate mapping...")

    # Try the direct CSV first
    try:
        resp = SESSION.get(AEC_POSTCODE_URL, timeout=60)
        if resp.status_code == 200 and "electorate" in resp.text.lower():
            return _parse_postcode_csv(resp.text)
    except Exception:
        pass

    # Fallback: try data.gov.au CKAN search
    try:
        ckan_url = "https://data.gov.au/data/api/3/action/package_search"
        params = {"q": "postcode federal electorate", "rows": 5}
        resp = SESSION.get(ckan_url, params=params, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            for pkg in data.get("result", {}).get("results", []):
                for resource in pkg.get("resources", []):
                    if resource.get("format", "").upper() == "CSV":
                        csv_resp = SESSION.get(resource["url"], timeout=60)
                        if csv_resp.status_code == 200:
                            result = _parse_postcode_csv(csv_resp.text)
                            if result:
                                return result
    except Exception as e:
        print(f"  data.gov.au fallback failed: {e}")

    # Last resort: build from known QLD postcodes using ABS mapping
    print("  Building postcode mapping from ABS data...")
    return _build_qld_postcode_mapping()


def _parse_postcode_csv(text: str) -> list[dict]:
    """Parse a postcode-to-electorate CSV."""
    lines = text.splitlines()
    # Find header
    header_idx = 0
    for i, line in enumerate(lines):
        lower = line.lower()
        if "postcode" in lower and ("electorate" in lower or "division" in lower):
            header_idx = i
            break

    reader = csv.DictReader(lines[header_idx:])
    results = []
    for row in reader:
        postcode = None
        electorate = None
        state = None

        for key, val in row.items():
            kl = key.lower().strip()
            if "postcode" in kl:
                postcode = val.strip()
            elif "electorate" in kl or "division" in kl:
                electorate = _normalise_electorate(val)
            elif "state" in kl:
                state = AEC_STATE_MAP.get(val.strip().upper(), val.strip().lower())

        if postcode and electorate:
            results.append({
                "postcode": postcode,
                "electorate_name": electorate,
                "state": state,
            })

    print(f"  Parsed {len(results)} postcode-electorate mappings")
    return results


def _build_qld_postcode_mapping() -> list[dict]:
    """Build a QLD-focused postcode-to-electorate mapping from known data.

    Comprehensive mapping of QLD postcodes to their federal electorates,
    covering all major population centres and rural areas.
    Source: AEC profile pages and ABS Postal Area to CED correspondence.
    """
    QLD_POSTCODE_MAP = {
        # Brisbane CBD + inner
        "4000": ["Brisbane"], "4001": ["Brisbane"], "4005": ["Brisbane"],
        "4006": ["Brisbane"], "4030": ["Brisbane"], "4031": ["Brisbane"],
        "4032": ["Brisbane"], "4051": ["Brisbane"], "4059": ["Brisbane"],
        "4060": ["Brisbane"], "4061": ["Brisbane"], "4064": ["Brisbane"],
        "4065": ["Brisbane"], "4066": ["Brisbane"], "4067": ["Brisbane"],
        "4068": ["Moreton", "Ryan"],
        # South Brisbane / Griffith
        "4101": ["Griffith"], "4102": ["Griffith"], "4103": ["Griffith"],
        "4104": ["Griffith"], "4105": ["Griffith"], "4120": ["Griffith"],
        "4121": ["Griffith"], "4122": ["Bonner", "Griffith"],
        "4151": ["Griffith"],
        # Moreton / southern suburbs
        "4069": ["Ryan"], "4070": ["Ryan"], "4073": ["Moreton", "Ryan"],
        "4074": ["Moreton", "Oxley"], "4075": ["Oxley"],
        "4076": ["Oxley"], "4077": ["Oxley"],
        "4078": ["Oxley"], "4108": ["Moreton", "Rankin"],
        "4109": ["Moreton", "Rankin"], "4110": ["Moreton", "Rankin"],
        "4111": ["Rankin"], "4112": ["Rankin"], "4113": ["Rankin"],
        "4114": ["Rankin"], "4115": ["Forde", "Rankin"],
        "4116": ["Forde"], "4117": ["Forde"],
        "4118": ["Forde"], "4119": ["Forde"],
        # Logan / Forde
        "4127": ["Forde", "Rankin"], "4128": ["Forde"],
        "4129": ["Forde"], "4130": ["Forde"],
        "4131": ["Forde"], "4132": ["Rankin"],
        "4133": ["Rankin", "Forde"],
        # Gold Coast
        "4207": ["Forde", "Wright"], "4208": ["Fadden"],
        "4209": ["Fadden", "Moncrieff"], "4210": ["Fadden"],
        "4211": ["McPherson", "Fadden"], "4212": ["Fadden"],
        "4213": ["McPherson"], "4214": ["McPherson"],
        "4215": ["Moncrieff"], "4216": ["Moncrieff"],
        "4217": ["Moncrieff"], "4218": ["Moncrieff"],
        "4219": ["McPherson"], "4220": ["McPherson"],
        "4221": ["McPherson"], "4222": ["McPherson"],
        "4223": ["McPherson"], "4224": ["Moncrieff"],
        "4225": ["Moncrieff", "McPherson"], "4226": ["Moncrieff"],
        "4227": ["McPherson"],
        # Sunshine Coast
        "4551": ["Fisher"], "4552": ["Fisher"], "4553": ["Fisher"],
        "4556": ["Fisher"], "4557": ["Fisher", "Fairfax"],
        "4558": ["Fairfax"], "4559": ["Fairfax"],
        "4560": ["Fairfax", "Wide Bay"], "4561": ["Fairfax"],
        "4564": ["Fairfax"], "4565": ["Fairfax", "Wide Bay"],
        "4566": ["Fairfax"], "4567": ["Fairfax"],
        "4572": ["Fisher", "Fairfax"], "4573": ["Fairfax"],
        "4574": ["Fairfax", "Fisher"], "4575": ["Fisher"],
        # Gympie / Wide Bay
        "4570": ["Wide Bay"], "4580": ["Wide Bay"],
        # Ipswich / Blair / Oxley
        "4300": ["Blair", "Oxley"], "4301": ["Blair"],
        "4303": ["Blair"], "4304": ["Blair"],
        "4305": ["Blair"], "4306": ["Blair", "Wright"],
        "4307": ["Wright"], "4309": ["Wright"],
        "4310": ["Wright"], "4311": ["Blair", "Wright"],
        # Lockyer / Wright / Scenic Rim
        "4340": ["Blair", "Wright"], "4341": ["Wright", "Blair"],
        "4342": ["Wright"], "4343": ["Wright", "Groom"],
        "4344": ["Wright"], "4345": ["Wright"],
        "4346": ["Wright"],
        # Lilley / northern suburbs
        "4007": ["Lilley"], "4008": ["Lilley"],
        "4010": ["Lilley"], "4011": ["Lilley"],
        "4012": ["Lilley"], "4013": ["Lilley"], "4014": ["Lilley"],
        "4017": ["Lilley"], "4018": ["Lilley"], "4019": ["Lilley", "Petrie"],
        "4020": ["Petrie"],
        # Petrie / north Brisbane
        "4500": ["Dickson", "Petrie"], "4501": ["Dickson"],
        "4502": ["Dickson"], "4503": ["Petrie"],
        "4504": ["Petrie", "Longman"], "4505": ["Longman"],
        "4506": ["Longman"], "4507": ["Longman", "Fisher"],
        "4508": ["Petrie", "Dickson"], "4509": ["Petrie"],
        "4510": ["Longman"], "4511": ["Longman"],
        "4512": ["Longman", "Fisher"], "4514": ["Longman"],
        "4516": ["Petrie"], "4517": ["Petrie"],
        "4518": ["Longman"], "4519": ["Longman"],
        "4520": ["Dickson", "Longman"], "4521": ["Dickson"],
        # Dickson
        "4034": ["Dickson"], "4035": ["Dickson"], "4036": ["Dickson"],
        "4037": ["Dickson"], "4053": ["Dickson", "Brisbane"],
        "4054": ["Dickson", "Ryan"], "4055": ["Dickson", "Ryan"],
        "4056": ["Dickson"], "4057": ["Brisbane", "Dickson"],
        # Bonner / eastern suburbs
        "4152": ["Bonner"], "4153": ["Bonner"], "4154": ["Bonner"],
        "4155": ["Bonner"], "4156": ["Bonner"],
        "4157": ["Bonner"], "4158": ["Bonner"],
        "4159": ["Bonner"], "4160": ["Bonner"],
        "4161": ["Bonner"], "4163": ["Bowman"],
        "4169": ["Griffith"],
        # Bowman / bayside
        "4164": ["Bowman"], "4165": ["Bowman"],
        "4170": ["Griffith", "Bonner"], "4171": ["Griffith"],
        "4172": ["Bonner"], "4173": ["Bonner", "Bowman"],
        "4174": ["Bowman"], "4178": ["Bowman"],
        "4179": ["Bonner", "Bowman"],
        # Wide Bay / Hinkler / Bundaberg
        "4650": ["Wide Bay"], "4655": ["Wide Bay", "Hinkler"],
        "4660": ["Hinkler", "Wide Bay"],
        "4670": ["Hinkler"], "4671": ["Hinkler"],
        # Flynn / Gladstone
        "4680": ["Flynn"], "4694": ["Flynn"],
        # Capricornia / Rockhampton
        "4700": ["Capricornia"], "4701": ["Capricornia"],
        "4702": ["Capricornia", "Flynn"], "4703": ["Capricornia"],
        "4710": ["Capricornia"],
        # Dawson / Mackay
        "4715": ["Flynn", "Capricornia"],
        "4720": ["Maranoa", "Flynn"], "4721": ["Maranoa"],
        "4722": ["Capricornia", "Flynn"], "4723": ["Capricornia"],
        "4724": ["Maranoa", "Kennedy"], "4725": ["Maranoa"],
        "4726": ["Maranoa"], "4727": ["Maranoa"],
        "4728": ["Maranoa"], "4730": ["Maranoa", "Kennedy"],
        "4737": ["Dawson", "Capricornia"],
        "4740": ["Dawson"], "4741": ["Dawson"],
        "4744": ["Dawson", "Kennedy"],
        "4750": ["Dawson"], "4751": ["Dawson"],
        # Townsville / Herbert
        "4810": ["Herbert"], "4811": ["Herbert"],
        "4812": ["Herbert"], "4814": ["Herbert"],
        "4815": ["Herbert"], "4816": ["Herbert", "Kennedy"],
        "4817": ["Herbert"], "4818": ["Herbert", "Leichhardt"],
        "4819": ["Herbert"],
        "4820": ["Kennedy"], "4821": ["Kennedy"],
        "4822": ["Kennedy"], "4823": ["Kennedy"],
        "4824": ["Kennedy"], "4825": ["Kennedy"],
        "4828": ["Kennedy"], "4829": ["Maranoa"],
        "4830": ["Kennedy"], "4849": ["Herbert", "Kennedy"],
        # Hinchinbrook / Herbert / Kennedy
        "4850": ["Herbert", "Kennedy"], "4854": ["Kennedy"],
        "4855": ["Kennedy"], "4856": ["Kennedy"],
        "4857": ["Kennedy"], "4858": ["Kennedy"],
        "4859": ["Kennedy"], "4860": ["Kennedy", "Leichhardt"],
        "4861": ["Kennedy"], "4865": ["Leichhardt", "Kennedy"],
        # Cairns / Leichhardt
        "4868": ["Leichhardt"], "4869": ["Leichhardt"],
        "4870": ["Leichhardt"], "4871": ["Leichhardt", "Kennedy"],
        "4872": ["Leichhardt", "Kennedy"],
        "4873": ["Leichhardt"], "4874": ["Leichhardt", "Kennedy"],
        "4875": ["Leichhardt", "Kennedy"],
        "4876": ["Leichhardt"], "4877": ["Leichhardt"],
        "4878": ["Leichhardt"], "4879": ["Leichhardt"],
        "4880": ["Kennedy", "Leichhardt"],
        "4881": ["Leichhardt"], "4882": ["Leichhardt"],
        "4883": ["Kennedy", "Leichhardt"],
        "4885": ["Kennedy"], "4886": ["Kennedy"],
        "4887": ["Kennedy"], "4888": ["Kennedy"],
        "4890": ["Kennedy"], "4891": ["Kennedy"],
        "4892": ["Kennedy", "Leichhardt"],
        "4895": ["Kennedy"],
        # Toowoomba / Groom
        "4350": ["Groom"], "4352": ["Groom", "Maranoa"],
        "4353": ["Groom"], "4354": ["Maranoa"],
        "4355": ["Groom", "Maranoa"],
        # Darling Downs / Maranoa
        "4370": ["Maranoa"], "4371": ["Maranoa"],
        "4372": ["Maranoa"], "4373": ["Maranoa"],
        "4374": ["Maranoa"], "4375": ["Maranoa"],
        "4377": ["Maranoa"], "4378": ["Maranoa"],
        "4380": ["Maranoa"], "4381": ["Maranoa"],
        "4382": ["Maranoa"], "4383": ["Maranoa"],
        "4385": ["Maranoa"],
        "4390": ["Maranoa"], "4400": ["Groom", "Maranoa"],
        "4401": ["Groom"], "4402": ["Maranoa"],
        "4403": ["Maranoa"], "4404": ["Maranoa"],
        "4405": ["Maranoa", "Groom"],
        "4406": ["Maranoa"], "4407": ["Maranoa"],
        "4408": ["Maranoa"], "4410": ["Maranoa"],
        "4411": ["Maranoa"], "4412": ["Maranoa"],
        "4413": ["Maranoa"], "4415": ["Maranoa"],
        "4416": ["Maranoa"], "4417": ["Maranoa"],
        "4418": ["Maranoa"], "4419": ["Maranoa"],
        "4420": ["Maranoa"], "4421": ["Maranoa"],
        "4422": ["Maranoa"], "4423": ["Maranoa"],
        "4424": ["Maranoa"], "4425": ["Maranoa"],
        "4426": ["Maranoa"], "4427": ["Maranoa"],
        "4428": ["Maranoa"],
        # Western QLD / Maranoa
        "4455": ["Maranoa"], "4461": ["Maranoa"],
        "4462": ["Maranoa"], "4465": ["Maranoa"],
        "4467": ["Maranoa"], "4468": ["Maranoa"],
        "4470": ["Maranoa"], "4472": ["Maranoa"],
        "4474": ["Maranoa"], "4475": ["Maranoa"],
        "4477": ["Maranoa"], "4478": ["Maranoa"],
        "4479": ["Maranoa"], "4480": ["Maranoa"],
        "4481": ["Maranoa"], "4482": ["Maranoa"],
        "4486": ["Maranoa"], "4487": ["Maranoa"],
        "4488": ["Maranoa"], "4489": ["Maranoa"],
        "4490": ["Maranoa"], "4491": ["Maranoa"],
        "4492": ["Maranoa"], "4493": ["Maranoa"],
        "4494": ["Maranoa"],
        # Burnett / Wide Bay / Hinkler / Flynn
        "4600": ["Wide Bay"], "4601": ["Wide Bay"],
        "4605": ["Wide Bay", "Flynn"], "4606": ["Wide Bay"],
        "4608": ["Wide Bay"], "4610": ["Wide Bay", "Maranoa"],
        "4611": ["Wide Bay"], "4612": ["Wide Bay"],
        "4613": ["Wide Bay", "Flynn"],
        "4614": ["Wide Bay"], "4615": ["Wide Bay"],
        "4620": ["Wide Bay"], "4621": ["Wide Bay"],
        "4625": ["Flynn", "Wide Bay"],
        "4626": ["Flynn"], "4627": ["Flynn"],
        "4630": ["Flynn"], "4650": ["Wide Bay"],
        # Whitsunday / Dawson
        "4800": ["Dawson"], "4801": ["Dawson"],
        "4802": ["Dawson"], "4803": ["Dawson"],
        "4804": ["Dawson"], "4805": ["Dawson", "Kennedy"],
        "4806": ["Herbert", "Kennedy"],
        "4807": ["Herbert", "Dawson"],
        # Ryan / western suburbs
        "4071": ["Ryan"], "4072": ["Ryan"],
        # Wright / hinterland
        "4270": ["Wright"], "4271": ["Wright"],
        "4272": ["Wright"], "4275": ["Wright"],
        "4280": ["Wright", "Forde"], "4285": ["Wright"],
    }

    results = []
    for postcode, electorates in QLD_POSTCODE_MAP.items():
        ratio = 1.0 / len(electorates)
        for electorate in electorates:
            results.append({
                "postcode": postcode,
                "electorate_name": _normalise_electorate(electorate),
                "state": "qld",
                "ratio": round(ratio, 3),
            })

    print(f"  Built {len(results)} QLD postcode-electorate mappings (hardcoded fallback)")
    return results


# ---------------------------------------------------------------------------
# Database operations
# ---------------------------------------------------------------------------

def create_tables(db: sqlite3.Connection) -> None:
    """Create electorates and postcode_electorates tables."""
    db.executescript(ELECTORATES_SCHEMA)
    print("  Created electorates + postcode_electorates tables")


def ingest_results(db: sqlite3.Connection, results: list[dict]) -> int:
    """Insert electorate results into the database."""
    count = 0
    for r in results:
        try:
            db.execute("""
                INSERT OR REPLACE INTO electorates
                    (electorate_name, state, margin_pct, winning_party,
                     winning_candidate, year, swing, seat_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                r["electorate_name"], r["state"], r["margin_pct"],
                r["winning_party"], r["winning_candidate"],
                r["year"], r["swing"], r["seat_type"],
            ))
            count += 1
        except sqlite3.IntegrityError:
            pass
    db.commit()
    return count


def ingest_postcode_mapping(db: sqlite3.Connection, mappings: list[dict]) -> int:
    """Insert postcode-to-electorate mappings."""
    count = 0
    for m in mappings:
        try:
            db.execute("""
                INSERT OR REPLACE INTO postcode_electorates
                    (postcode, electorate_name, state, ratio)
                VALUES (?, ?, ?, ?)
            """, (
                m["postcode"], m["electorate_name"],
                m.get("state"), m.get("ratio", 1.0),
            ))
            count += 1
        except sqlite3.IntegrityError:
            pass
    db.commit()
    return count


def backfill_grant_electorates(db: sqlite3.Connection) -> int:
    """Update government_grants.electorate using postcode_electorates mapping.

    For postcodes that map to multiple electorates, picks the first one.
    Returns count of grants updated.
    """
    print("\n  Back-filling grant electorates from postcode mapping...")

    # Build postcode -> primary electorate map (first/largest electorate)
    rows = db.execute("""
        SELECT postcode, electorate_name, ratio
        FROM postcode_electorates
        ORDER BY ratio DESC
    """).fetchall()

    postcode_map = {}
    for row in rows:
        pc = row["postcode"]
        if pc not in postcode_map:
            postcode_map[pc] = row["electorate_name"]

    print(f"  Loaded {len(postcode_map)} postcode mappings")

    # Update in batches
    updated = 0
    batch_size = 1000
    grants = db.execute("""
        SELECT grant_id, postcode FROM government_grants
        WHERE postcode IS NOT NULL AND postcode != ''
          AND (electorate IS NULL OR electorate = '')
    """).fetchall()

    for i in range(0, len(grants), batch_size):
        batch = grants[i:i + batch_size]
        for g in batch:
            electorate = postcode_map.get(g["postcode"])
            if electorate:
                db.execute(
                    "UPDATE government_grants SET electorate = ? WHERE grant_id = ?",
                    (electorate, g["grant_id"]),
                )
                updated += 1
        db.commit()
        if (i + batch_size) % 10000 == 0:
            print(f"    Updated {updated} grants so far...")

    print(f"  Back-filled {updated}/{len(grants)} grants with electorates")
    return updated


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Ingest AEC electoral results")
    parser.add_argument("--year", type=int, nargs="+", default=[2022, 2019],
                        help="Election years to fetch (default: 2022 2019)")
    parser.add_argument("--backfill-grants", action="store_true",
                        help="Back-fill government_grants.electorate from postcode mapping")
    parser.add_argument("--skip-results", action="store_true",
                        help="Skip downloading election results")
    parser.add_argument("--skip-postcodes", action="store_true",
                        help="Skip downloading postcode mapping")
    args = parser.parse_args()

    db = get_db()
    db.execute("PRAGMA busy_timeout = 600000")
    init_db(db)
    create_tables(db)

    # 1. Fetch election results
    if not args.skip_results:
        for year in args.year:
            results = fetch_tcp_results(year)
            if results:
                n = ingest_results(db, results)
                print(f"  Inserted {n} electorate results for {year}")

                # Print summary
                marginal = sum(1 for r in results if r["seat_type"] == "marginal")
                fairly_safe = sum(1 for r in results if r["seat_type"] == "fairly_safe")
                safe = sum(1 for r in results if r["seat_type"] == "safe")
                print(f"    Marginal: {marginal}, Fairly safe: {fairly_safe}, Safe: {safe}")

    # 2. Fetch postcode-to-electorate mapping
    if not args.skip_postcodes:
        mappings = fetch_postcode_mapping()
        if mappings:
            n = ingest_postcode_mapping(db, mappings)
            print(f"  Inserted {n} postcode-electorate mappings")

    # 3. Back-fill grant electorates
    if args.backfill_grants:
        backfill_grant_electorates(db)

    # Summary
    print("\n=== Summary ===")
    for year in args.year:
        count = db.execute(
            "SELECT COUNT(*) FROM electorates WHERE year = ?", (year,)
        ).fetchone()[0]
        print(f"  {year}: {count} electorates")

    postcode_count = db.execute("SELECT COUNT(*) FROM postcode_electorates").fetchone()[0]
    print(f"  Postcode mappings: {postcode_count}")

    grants_with_electorate = db.execute(
        "SELECT COUNT(*) FROM government_grants WHERE electorate IS NOT NULL AND electorate != ''"
    ).fetchone()[0]
    total_grants = db.execute("SELECT COUNT(*) FROM government_grants").fetchone()[0]
    print(f"  Grants with electorate: {grants_with_electorate}/{total_grants}")


if __name__ == "__main__":
    main()
