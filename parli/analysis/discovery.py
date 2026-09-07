"""Evidence-backed discovery leads from independently aggregated source records.

These are descriptive patterns, not findings of influence or misconduct. SQL is
portable across SQLite and the project's PostgreSQL connection wrapper.
"""

import hashlib
from collections import defaultdict
from datetime import date
import re
import sqlite3
from urllib.parse import urlparse


CATEGORIES = (
    "donor_contract_overlap", "recipient_concentration", "procurement_concentration",
)
METHODOLOGY = [
    "Totals cover all available records, not a common reporting period or the full market.",
    "Only positive recorded amounts and nonblank names are included in signal totals.",
    "Names match only after trimming surrounding spaces and changing case; aliases and corporate groups are not resolved.",
    "Donation disclosures may overlap across sources. Records are not deduplicated because identical values can also be separate transactions.",
    "Contract values are recorded award values, not verified expenditure. Financial-year donation dates do not establish transaction timing.",
    "Evidence references are deterministic example records, not an exhaustive list of rows behind each aggregate.",
    "Signals are investigation leads and do not establish causation, improper conduct, or political influence.",
]


def _columns(db, table):
    if isinstance(db, sqlite3.Connection):
        return {r[1] for r in db.execute(f"PRAGMA table_info({table})")}
    return {r["column_name"] for r in db.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema = current_schema() AND table_name = ?", (table,)
    ).fetchall()}


def _metric(label, value, fmt="number"):
    return {"label": label, "value": round(float(value), 2), "format": fmt}


def _signal(category, entity, title, summary, metrics, evidence, caveats):
    digest = hashlib.sha256(f"{category}:{entity}".encode()).hexdigest()[:16]
    return {"id": f"{category}:{digest}", "category": category, "entity": entity,
            "title": title, "summary": summary, "metrics": metrics,
            "evidence": evidence, "caveats": caveats}


def _evidence(table, record_id):
    return [{"label": f"{'Donation' if table == 'donations' else 'Contract'} record {record_id}",
             "table": table, "record_id": str(record_id), "url": None}]


def _enrich_evidence(db, signals, columns):
    """Fetch readable examples by primary key, once per source after limiting."""
    for table in ("donations", "contracts"):
        evidence = [e for s in signals for e in s["evidence"] if e["table"] == table]
        ids = sorted({e["record_id"] for e in evidence})
        if not ids:
            continue
        donation = table == "donations"
        id_column = "donation_id" if donation else "contract_id"
        params = tuple(int(value) for value in ids) if donation else tuple(ids)
        fields = (["donor_name", "recipient", "financial_year", "source"] if donation else
                  ["supplier_name", "agency", "start_date", "source"])
        fields = [f for f in fields + ["source_url", "url"] if f in columns[table]]
        rows = db.execute(
            f"SELECT {id_column} AS record_id, amount, {', '.join(fields)} FROM {table} "
            f"WHERE {id_column} IN ({', '.join('?' for _ in ids)})", params
        ).fetchall()
        lookup = {str(r["record_id"]): dict(r) for r in rows}
        for item in evidence:
            row = lookup.get(item["record_id"])
            if row is None:
                continue
            amount = f"${float(row['amount']):,.2f}"
            if donation:
                detail = f"{row['donor_name']} → {row['recipient']}: {amount}"
                if row.get("financial_year"):
                    detail += f" · FY {row['financial_year']}"
            else:
                detail = f"{row['agency']} → {row['supplier_name']}: {amount}"
                if row.get("start_date"):
                    detail += f" · starts {row['start_date']}"
            if row.get("source"):
                detail += f" · {row['source']}"
            item["label"] = detail + f" · record {row['record_id']}"
            for field in ("source_url", "url"):
                url = str(row.get(field) or "").strip()
                try:
                    parsed = urlparse(url)
                    if parsed.scheme in {"https", "http"} and parsed.hostname and not parsed.username:
                        item["url"] = url
                        break
                except ValueError:
                    continue


def _overlap(db, limit):
    rows = db.execute("""
        WITH d AS (
            SELECT UPPER(TRIM(donor_name)) AS name, MIN(TRIM(donor_name)) AS display,
                   SUM(amount) AS total, COUNT(*) AS records, MIN(donation_id) AS example_id
            FROM donations WHERE amount > 0 AND TRIM(donor_name) <> ''
            GROUP BY UPPER(TRIM(donor_name))
        ), c AS (
            SELECT UPPER(TRIM(supplier_name)) AS name, SUM(amount) AS total,
                   COUNT(*) AS records, MIN(contract_id) AS example_id
            FROM contracts WHERE amount > 0 AND TRIM(supplier_name) <> ''
            GROUP BY UPPER(TRIM(supplier_name))
        )
        SELECT d.name, d.display, d.total AS donated, d.records AS donations,
               c.total AS contracted, c.records AS contracts,
               d.example_id AS donation_example, c.example_id AS contract_example
        FROM d JOIN c ON d.name = c.name
        ORDER BY d.total DESC, c.total DESC, d.name LIMIT ?
    """, (limit,)).fetchall()
    return [_signal(
        CATEGORIES[0], r["display"], f"{r['display']} appears in donations and contracts",
        "An exact name match connects political donation disclosures with government contract awards.",
        [_metric("Recorded donations", r["donated"], "currency"),
         _metric("Recorded contract value", r["contracted"], "currency"),
         _metric("Donation records", r["donations"]), _metric("Contract records", r["contracts"])],
        _evidence("donations", r["donation_example"]) +
        _evidence("contracts", r["contract_example"]),
        ["Matching names are not verified legal identities; unrelated entities can share a name.",
         "The records can cover different years and jurisdictions. No sequence or causal link is inferred."]
    ) for r in rows]


def _concentration(db, table, group_column, name_column, category, limit):
    id_column = "donation_id" if table == "donations" else "contract_id"
    rows = db.execute(f"""
        WITH participants AS (
            SELECT UPPER(TRIM({group_column})) AS group_name,
                   MIN(TRIM({group_column})) AS group_display,
                   UPPER(TRIM({name_column})) AS name,
                   MIN(TRIM({name_column})) AS display,
                   SUM(amount) AS total, COUNT(*) AS records, MIN({id_column}) AS example_id
            FROM {table}
            WHERE amount > 0 AND TRIM({group_column}) <> '' AND TRIM({name_column}) <> ''
            GROUP BY UPPER(TRIM({group_column})), UPPER(TRIM({name_column}))
        ), totals AS (
            SELECT group_name, SUM(total) AS group_total, SUM(records) AS group_records,
                   COUNT(*) AS participants FROM participants GROUP BY group_name
        ), ranked AS (
            SELECT p.*, t.group_total, t.group_records, t.participants,
                   ROW_NUMBER() OVER (PARTITION BY p.group_name ORDER BY p.total DESC, p.name) AS rank
            FROM participants p JOIN totals t ON p.group_name = t.group_name
        )
        , selected AS (
            SELECT group_name, total AS leading_total FROM ranked
            WHERE rank = 1 AND group_records >= 2 AND total * 1.0 / group_total >= 0.25
            ORDER BY total DESC, group_name LIMIT ?
        )
        SELECT r.* FROM ranked r JOIN selected s ON s.group_name = r.group_name
        WHERE r.rank <= 5 ORDER BY s.leading_total DESC, r.group_name, r.rank
    """, (limit,)).fetchall()
    signals = []
    donor = table == "donations"
    noun = "donor" if donor else "supplier"
    groups = defaultdict(list)
    for row in rows:
        groups[row["group_name"]].append(row)
    for peers in groups.values():
        r = peers[0]
        share = 100 * float(r["total"]) / float(r["group_total"])
        signals.append(_signal(
            category, r["display"], f"{r['group_display']}: {share:.0f}% from one {noun}" if donor else
            f"{r['group_display']}: {share:.0f}% awarded to one supplier",
            f"{r['display']} accounts for {share:.1f}% of the positive recorded "
            f"{'donation' if donor else 'contract'} value for {r['group_display']}.",
            [_metric(f"Largest {noun} share", share, "percent"),
             _metric(f"Largest {noun} value", r["total"], "currency"),
             _metric("Total recorded value", r["group_total"], "currency"),
             _metric(f"Distinct {noun}s", r["participants"]),
             _metric("Records in comparison", r["group_records"])],
            _evidence(table, r["example_id"]),
            ["This share describes available records only; missing disclosures can materially change it.",
             "At least two positive records and a 25% share are required. A single reporting period is not imposed."]
        ))
        # The same donor/supplier can lead multiple distinct recipient/agency groups.
        signals[-1]["id"] = f"{category}:" + hashlib.sha256(
            f"{r['group_name']}:{r['name']}".encode()).hexdigest()[:16]
        group_total = round(float(r["group_total"]), 2)
        participants = [{"name": p["display"], "value": round(float(p["total"]), 2),
                         "share": round(100 * float(p["total"]) / float(r["group_total"]), 2),
                         "record_count": int(p["records"])} for p in peers]
        other_total = round(group_total - sum(p["value"] for p in participants), 2)
        signals[-1]["chart"] = {
            "type": "concentration", "group_label": r["group_display"],
            "group_total": group_total, "leading_name": r["display"],
            "participant_label": noun, "participant_count": int(r["participants"]),
            "record_count": int(r["group_records"]), "participants": participants,
            "other_total": other_total,
            "other_share": round(100 * other_total / group_total, 2),
            "other_count": int(r["participants"]) - len(participants), "period": None,
        }
        signals[-1]["_period_group"] = r["group_name"]
    return signals


def _enrich_chart_periods(db, signals, columns):
    """Attach validated recorded spans without inferring transaction dates."""
    for table, category, group_column, name_column, period_column, kind in (
        ("donations", CATEGORIES[1], "recipient", "donor_name", "financial_year", "financial_year"),
        ("contracts", CATEGORIES[2], "agency", "supplier_name", "start_date", "contract_start_date"),
    ):
        selected = {s["_period_group"]: s for s in signals if s["category"] == category}
        if not selected or period_column not in columns[table]:
            continue
        rows = db.execute(
            f"SELECT UPPER(TRIM({group_column})) AS group_name, {period_column} AS period, COUNT(*) AS records "
            f"FROM {table} WHERE amount > 0 AND TRIM({name_column}) <> '' "
            f"AND UPPER(TRIM({group_column})) IN ({', '.join('?' for _ in selected)}) "
            f"GROUP BY UPPER(TRIM({group_column})), {period_column}", tuple(selected)
        ).fetchall()
        periods = {key: {"values": [], "undated": 0, "invalid": 0} for key in selected}
        for row in rows:
            raw = str(row["period"] or "").strip()
            info = periods[row["group_name"]]
            if not raw:
                info["undated"] += row["records"]
                continue
            valid = False
            if kind == "financial_year":
                match = re.fullmatch(r"((?:19|20)\d{2})-(\d{2}|\d{4})", raw)
                if match:
                    start, end = int(match[1]), int(match[2])
                    valid = (start + 1) % (100 if len(match[2]) == 2 else 10000) == end
                    if valid:
                        raw = f"{start}-{(start + 1) % 100:02d}"
            else:
                try:
                    parsed = date.fromisoformat(raw)
                    valid = 1900 <= parsed.year <= 2099
                    raw = parsed.isoformat()
                except ValueError:
                    pass
            if valid:
                info["values"].append(raw)
            else:
                info["invalid"] += row["records"]
        for key, signal in selected.items():
            info = periods[key]
            signal["chart"]["period"] = {
                "kind": kind, "from": min(info["values"], default=None),
                "to": max(info["values"], default=None),
                "undated_records": int(info["undated"]),
                "invalid_date_records": int(info["invalid"]),
            }
    for signal in signals:
        signal.pop("_period_group", None)


def build_discoveries(db, limit=30):
    """Return balanced, deterministic discovery cards and explicit source coverage.

    Missing tables disable dependent signal families. Query failures propagate
    instead of being presented as an apparently successful empty discovery run.
    """
    limit = max(1, min(int(limit), 100))
    required = {
        "donations": {"donation_id", "donor_name", "recipient", "amount"},
        "contracts": {"contract_id", "supplier_name", "agency", "amount"},
    }
    columns = {t: _columns(db, t) for t in required}
    ready = {t: expected <= columns[t] for t, expected in required.items()}
    coverage = {t: int(db.execute(f"SELECT COUNT(*) AS count FROM {t}").fetchone()["count"])
                if ready[t] else 0 for t in required}
    families = {}
    if ready["donations"] and ready["contracts"]:
        families[CATEGORIES[0]] = _overlap(db, limit)
    if ready["donations"]:
        families[CATEGORIES[1]] = _concentration(
            db, "donations", "recipient", "donor_name", CATEGORIES[1], limit)
    if ready["contracts"]:
        families[CATEGORIES[2]] = _concentration(
            db, "contracts", "agency", "supplier_name", CATEGORIES[2], limit)
    coverage["available_categories"] = list(families)
    coverage["unavailable_categories"] = [c for c in CATEGORIES if c not in families]
    # Round-robin avoids one high-volume family hiding other kinds of discovery.
    signals = [cards[i] for i in range(limit) for cards in families.values() if i < len(cards)][:limit]
    _enrich_evidence(db, signals, columns)
    _enrich_chart_periods(db, signals, columns)
    return {"signals": signals, "coverage": coverage, "methodology": METHODOLOGY.copy()}
