"""Create the four bills tables. Additive only: nothing existing is touched.

Run on desktop:  python3 bills_schema.py
"""

import bills_common as bc

DDL = [
    """CREATE TABLE IF NOT EXISTS bills_v2 (
        bill_key          TEXT PRIMARY KEY,
        jurisdiction      TEXT NOT NULL,        -- 'federal'
        source_system     TEXT,                 -- 'parlinfo' | 'alrc'
        source_id         TEXT,                 -- legislation/billhome/r7531
        parliament        INTEGER,
        session           TEXT,
        title             TEXT NOT NULL,
        short_title       TEXT,
        aliases_json      TEXT,
        introduced_date   TEXT,
        originating_house TEXT,                 -- representatives | senate
        sponsor_name      TEXT,
        sponsor_person_id TEXT,
        portfolio         TEXT,
        status            TEXT,                 -- passed|lapsed|before_parliament|unknown
        status_raw        TEXT,
        status_as_of      TEXT,
        legacy_bill_id    INTEGER,              -- bills.bill_id when reconciled
        updated_at        TEXT
    )""",
    "CREATE INDEX IF NOT EXISTS ix_bills_v2_intro ON bills_v2(introduced_date)",
    "CREATE INDEX IF NOT EXISTS ix_bills_v2_parl ON bills_v2(parliament)",
    "CREATE INDEX IF NOT EXISTS ix_bills_v2_legacy ON bills_v2(legacy_bill_id)",

    """CREATE TABLE IF NOT EXISTS bill_events (
        bill_key   TEXT NOT NULL,
        stage      TEXT,
        date       TEXT,
        house      TEXT,
        event_raw  TEXT,
        source_url TEXT,
        PRIMARY KEY (bill_key, house, date, event_raw)
    )""",
    "CREATE INDEX IF NOT EXISTS ix_bill_events_key ON bill_events(bill_key)",

    """CREATE TABLE IF NOT EXISTS bill_sources (
        bill_key      TEXT NOT NULL,
        kind          TEXT NOT NULL,   -- billhome|text|em|em_revised|em_supp|digest|frl_act
        source_id     TEXT,
        url           TEXT,
        document_date TEXT,
        fetched_at    TEXT,
        licence       TEXT,
        content_hash  TEXT,
        cache_path    TEXT,
        outline_text  TEXT,
        PRIMARY KEY (bill_key, kind, source_id)
    )""",
    "CREATE INDEX IF NOT EXISTS ix_bill_sources_key ON bill_sources(bill_key)",
    "CREATE INDEX IF NOT EXISTS ix_bill_sources_kind ON bill_sources(kind)",

    """CREATE TABLE IF NOT EXISTS bill_links (
        bill_key      TEXT NOT NULL,
        kind          TEXT NOT NULL,   -- division | speech | act
        target_key    TEXT NOT NULL,
        rule          TEXT,
        confidence    REAL,
        evidence_json TEXT,
        audited       TEXT DEFAULT '',
        PRIMARY KEY (bill_key, kind, target_key)
    )""",
    "CREATE INDEX IF NOT EXISTS ix_bill_links_key ON bill_links(bill_key)",
    "CREATE INDEX IF NOT EXISTS ix_bill_links_target ON bill_links(kind, target_key)",
]

if __name__ == "__main__":
    db = bc.connect_rw()
    for stmt in DDL:
        db.execute(stmt)
    db.commit()
    for t in ("bills_v2", "bill_events", "bill_sources", "bill_links"):
        n = db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"{t}: {n} rows")
    db.close()
