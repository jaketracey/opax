"""
parli.schema -- SQLite database schema and connection management for the
Australian Parliamentary Transparency Platform.

Design principles:
  - Single SQLite file (parli.db), portable, zero-config.
  - FTS5 virtual tables for full-text search over speeches.
  - Strict foreign keys for referential integrity.

Usage:
    from parli.schema import get_db, init_db
    db = get_db()
    init_db(db)

    # Or run directly to create the database and seed topics:
    python -m parli.schema
"""

import sqlite3
from pathlib import Path

DEFAULT_DB_PATH = Path("~/.cache/autoresearch/parli.db").expanduser()

SCHEMA_SQL = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Members of parliament
CREATE TABLE IF NOT EXISTS members (
    person_id TEXT PRIMARY KEY,
    first_name TEXT,
    last_name TEXT,
    full_name TEXT,
    party TEXT,
    electorate TEXT,
    chamber TEXT,  -- 'representatives' or 'senate'
    gender TEXT,
    entered_house TEXT,
    left_house TEXT,
    UNIQUE(person_id)
);

-- Bills / legislation
CREATE TABLE IF NOT EXISTS bills (
    bill_id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    status TEXT,  -- 'passed', 'rejected', 'lapsed', 'before_parliament'
    portfolio TEXT,
    introduced_date TEXT,
    house TEXT
);

-- Divisions (votes in parliament)
CREATE TABLE IF NOT EXISTS divisions (
    division_id INTEGER PRIMARY KEY,
    house TEXT NOT NULL,
    name TEXT,
    date TEXT NOT NULL,
    number INTEGER,
    aye_votes INTEGER,
    no_votes INTEGER,
    possible_turnout INTEGER,
    rebellions INTEGER,
    summary TEXT
);

-- Individual votes per division
CREATE TABLE IF NOT EXISTS votes (
    division_id INTEGER NOT NULL,
    person_id TEXT NOT NULL,
    vote TEXT NOT NULL,  -- 'aye', 'no', 'abstention', 'absent'
    PRIMARY KEY (division_id, person_id),
    FOREIGN KEY (division_id) REFERENCES divisions(division_id),
    FOREIGN KEY (person_id) REFERENCES members(person_id)
);

-- Speeches from Hansard
CREATE TABLE IF NOT EXISTS speeches (
    speech_id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id TEXT,
    speaker_name TEXT,
    party TEXT,
    electorate TEXT,
    chamber TEXT,
    date TEXT NOT NULL,
    topic TEXT,
    text TEXT NOT NULL,
    word_count INTEGER,
    source TEXT,  -- 'zenodo', 'openaustralia', 'wragge_xml', 'nsw_hansard'
    state TEXT DEFAULT 'federal',  -- 'federal', 'nsw', 'vic', 'qld', etc.
    FOREIGN KEY (person_id) REFERENCES members(person_id)
);

-- Full-text search on speeches
CREATE VIRTUAL TABLE IF NOT EXISTS speeches_fts USING fts5(
    speaker_name, topic, text, content=speeches, content_rowid=speech_id,
    tokenize='porter unicode61'
);

-- Donations
CREATE TABLE IF NOT EXISTS donations (
    donation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    donor_name TEXT NOT NULL,
    recipient TEXT NOT NULL,
    amount REAL,
    financial_year TEXT,
    donor_type TEXT,  -- 'individual', 'organisation', 'other'
    industry TEXT,  -- manually or automatically classified
    source TEXT,  -- 'aec_annual', 'aec_election', 'aec_referendum', 'nsw', 'vic', 'qld'
    donation_type TEXT DEFAULT 'direct'  -- 'direct', 'in_kind', 'other'
);

-- Associated entities (party-linked organisations: clubs, unions, trusts, foundations)
-- Revenue/financial disclosures, NOT political donations. Separated to avoid inflating donation totals.
CREATE TABLE IF NOT EXISTS associated_entities (
    entity_record_id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_name TEXT NOT NULL,
    associated_party TEXT NOT NULL,
    amount REAL,
    financial_year TEXT,
    entity_type TEXT,  -- 'club', 'union', 'foundation', 'trust', 'holding_company', 'other'
    industry TEXT,
    source TEXT DEFAULT 'aec_assoc_entity',
    original_donation_id INTEGER,  -- reference to original donation_id for traceability
    donor_type TEXT,
    state TEXT
);

CREATE INDEX IF NOT EXISTS idx_assoc_entity_name ON associated_entities(entity_name);
CREATE INDEX IF NOT EXISTS idx_assoc_entity_party ON associated_entities(associated_party);
CREATE INDEX IF NOT EXISTS idx_assoc_entity_amount ON associated_entities(amount DESC);
CREATE INDEX IF NOT EXISTS idx_assoc_entity_fy ON associated_entities(financial_year);

-- Topics for classification
CREATE TABLE IF NOT EXISTS topics (
    topic_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    keywords TEXT  -- comma-separated keywords for matching
);

-- Speech-topic mapping
CREATE TABLE IF NOT EXISTS speech_topics (
    speech_id INTEGER NOT NULL,
    topic_id INTEGER NOT NULL,
    relevance REAL DEFAULT 1.0,
    PRIMARY KEY (speech_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_speech_topics_topic_id
    ON speech_topics(topic_id, speech_id);

-- Government contracts from AusTender
CREATE TABLE IF NOT EXISTS contracts (
    contract_id TEXT PRIMARY KEY,
    title TEXT,
    description TEXT,
    supplier_name TEXT,
    agency TEXT,
    amount REAL,
    start_date TEXT,
    end_date TEXT,
    procurement_method TEXT,
    source TEXT DEFAULT 'austender'
);

-- News articles (Guardian Australia, etc.)
CREATE TABLE IF NOT EXISTS news_articles (
    article_id TEXT PRIMARY KEY,
    title TEXT,
    date TEXT,
    section TEXT,
    url TEXT,
    body_text TEXT,
    source TEXT DEFAULT 'guardian'
);

-- Full-text search on news articles
CREATE VIRTUAL TABLE IF NOT EXISTS news_articles_fts USING fts5(
    title, body_text,
    content=news_articles, content_rowid=rowid,
    tokenize='porter unicode61'
);

-- Bill progress / lifecycle tracking
CREATE TABLE IF NOT EXISTS bill_progress (
    progress_id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id INTEGER,
    stage TEXT,  -- 'introduced', 'second_reading', 'committee', 'third_reading', 'passed', 'royal_assent'
    date TEXT,
    house TEXT,
    event_raw TEXT,
    FOREIGN KEY (bill_id) REFERENCES bills(bill_id)
);

-- MP disconnect scores (speech vs vote alignment)
CREATE TABLE IF NOT EXISTS mp_disconnect_scores (
    person_id TEXT NOT NULL,
    topic_id INTEGER NOT NULL,
    topic_name TEXT NOT NULL,
    speech_count INTEGER NOT NULL DEFAULT 0,
    pro_reform_speeches INTEGER NOT NULL DEFAULT 0,
    anti_reform_speeches INTEGER NOT NULL DEFAULT 0,
    relevant_divisions INTEGER NOT NULL DEFAULT 0,
    aligned_votes INTEGER NOT NULL DEFAULT 0,
    misaligned_votes INTEGER NOT NULL DEFAULT 0,
    vote_alignment REAL NOT NULL DEFAULT 0.0,
    disconnect_score REAL NOT NULL DEFAULT 0.0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (person_id, topic_id),
    FOREIGN KEY (person_id) REFERENCES members(person_id),
    FOREIGN KEY (topic_id) REFERENCES topics(topic_id)
);

CREATE INDEX IF NOT EXISTS idx_disconnect_score
    ON mp_disconnect_scores(disconnect_score DESC);
CREATE INDEX IF NOT EXISTS idx_disconnect_person
    ON mp_disconnect_scores(person_id);
CREATE INDEX IF NOT EXISTS idx_disconnect_topic
    ON mp_disconnect_scores(topic_id);

-- Contract-speech cross-reference links (pay-to-play detection)
CREATE TABLE IF NOT EXISTS contract_speech_links (
    link_id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id TEXT NOT NULL,
    speech_id INTEGER NOT NULL,
    person_id TEXT,
    company_name TEXT NOT NULL,
    supplier_name TEXT,
    donor_name TEXT,
    contract_amount REAL,
    donation_amount REAL,
    party TEXT,
    recipient_party TEXT,
    match_type TEXT NOT NULL,
    speech_date TEXT,
    speech_snippet TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(contract_id, speech_id)
);

CREATE INDEX IF NOT EXISTS idx_csl_company ON contract_speech_links(company_name);
CREATE INDEX IF NOT EXISTS idx_csl_party ON contract_speech_links(party);
CREATE INDEX IF NOT EXISTS idx_csl_person ON contract_speech_links(person_id);
CREATE INDEX IF NOT EXISTS idx_csl_match_type ON contract_speech_links(match_type);
CREATE INDEX IF NOT EXISTS idx_csl_contract_amount ON contract_speech_links(contract_amount DESC);

-- Donor-vote influence scores (party level)
CREATE TABLE IF NOT EXISTS donor_influence_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    party TEXT NOT NULL,
    industry TEXT NOT NULL,
    total_donated REAL,
    relevant_divisions INTEGER,
    divisions_with_votes INTEGER,
    total_votes_cast INTEGER,
    aye_count INTEGER,
    no_count INTEGER,
    favorable_vote_pct REAL,
    influence_score REAL,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(party, industry)
);

-- Donor-vote influence scores (per-MP level)
CREATE TABLE IF NOT EXISTS mp_donor_influence_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id TEXT NOT NULL,
    full_name TEXT,
    party TEXT NOT NULL,
    industry TEXT NOT NULL,
    party_donations_from_industry REAL,
    divisions_voted INTEGER,
    aye_count INTEGER,
    no_count INTEGER,
    favorable_vote_pct REAL,
    influence_score REAL,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(person_id, industry)
);

CREATE INDEX IF NOT EXISTS idx_donor_influence_party
    ON donor_influence_scores(party);
CREATE INDEX IF NOT EXISTS idx_donor_influence_industry
    ON donor_influence_scores(industry);
CREATE INDEX IF NOT EXISTS idx_donor_influence_score
    ON donor_influence_scores(influence_score DESC);
CREATE INDEX IF NOT EXISTS idx_mp_donor_influence_person
    ON mp_donor_influence_scores(person_id);
CREATE INDEX IF NOT EXISTS idx_mp_donor_influence_score
    ON mp_donor_influence_scores(influence_score DESC);

-- MP Register of Interests: general interests
CREATE TABLE IF NOT EXISTS mp_interests (
    interest_id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id TEXT,
    interest_type TEXT NOT NULL,  -- 'shareholding','property','directorship','gift','travel','liability','trust','partnership','bond','savings','income','other'
    entity_name TEXT,
    description TEXT,
    declared_date TEXT,
    parliament_number INTEGER,
    raw_text TEXT,
    source_url TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (person_id) REFERENCES members(person_id)
);

CREATE INDEX IF NOT EXISTS idx_mp_interests_person ON mp_interests(person_id);
CREATE INDEX IF NOT EXISTS idx_mp_interests_type ON mp_interests(interest_type);

-- MP Register of Interests: shareholdings detail
CREATE TABLE IF NOT EXISTS mp_shareholdings (
    shareholding_id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id TEXT,
    company_name TEXT NOT NULL,
    share_type TEXT,  -- 'ordinary', 'preference', 'other'
    declared_date TEXT,
    FOREIGN KEY (person_id) REFERENCES members(person_id)
);

CREATE INDEX IF NOT EXISTS idx_mp_shareholdings_person ON mp_shareholdings(person_id);
CREATE INDEX IF NOT EXISTS idx_mp_shareholdings_company ON mp_shareholdings(company_name);

-- MP Register of Interests: real estate detail
CREATE TABLE IF NOT EXISTS mp_properties (
    property_id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id TEXT,
    property_description TEXT,
    location TEXT,
    purpose TEXT,  -- 'residential', 'investment', 'commercial', 'rural', 'other'
    declared_date TEXT,
    FOREIGN KEY (person_id) REFERENCES members(person_id)
);

CREATE INDEX IF NOT EXISTS idx_mp_properties_person ON mp_properties(person_id);

-- MP Register of Interests: directorships detail
CREATE TABLE IF NOT EXISTS mp_directorships (
    directorship_id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id TEXT,
    company_name TEXT NOT NULL,
    role TEXT,  -- 'director', 'chair', 'non-executive director', etc.
    declared_date TEXT,
    FOREIGN KEY (person_id) REFERENCES members(person_id)
);

CREATE INDEX IF NOT EXISTS idx_mp_directorships_person ON mp_directorships(person_id);
CREATE INDEX IF NOT EXISTS idx_mp_directorships_company ON mp_directorships(company_name);

-- Ministerial meetings (diary disclosures)
CREATE TABLE IF NOT EXISTS ministerial_meetings (
    meeting_id INTEGER PRIMARY KEY AUTOINCREMENT,
    minister_name TEXT NOT NULL,
    person_id TEXT,           -- FK to members if matched
    meeting_date TEXT NOT NULL,
    organisation TEXT,        -- organisation or person met
    attendee_name TEXT,       -- specific attendees listed
    purpose TEXT,             -- purpose/subject of meeting
    portfolio TEXT,           -- minister's portfolio
    state TEXT DEFAULT 'qld', -- 'federal', 'nsw', 'qld', 'vic'
    source_url TEXT,          -- URL of the diary PDF/page
    FOREIGN KEY (person_id) REFERENCES members(person_id)
);

CREATE INDEX IF NOT EXISTS idx_mm_minister ON ministerial_meetings(minister_name);
CREATE INDEX IF NOT EXISTS idx_mm_date ON ministerial_meetings(meeting_date);
CREATE INDEX IF NOT EXISTS idx_mm_organisation ON ministerial_meetings(organisation);
CREATE INDEX IF NOT EXISTS idx_mm_state ON ministerial_meetings(state);
CREATE INDEX IF NOT EXISTS idx_mm_person ON ministerial_meetings(person_id);

-- Electorate demographics (ABS Census profiles)
CREATE TABLE IF NOT EXISTS electorate_demographics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    electorate_name TEXT NOT NULL,
    state TEXT,
    population INTEGER,
    median_income REAL,        -- median total personal income (weekly $)
    median_age REAL,
    unemployment_rate REAL,    -- percentage
    homeownership_pct REAL,    -- owned outright + mortgage as % of total dwellings
    rental_pct REAL,           -- rented as % of total dwellings
    born_overseas_pct REAL,    -- born elsewhere as % of total persons
    university_pct REAL,       -- bachelor degree or higher as % of persons 15+
    indigenous_pct REAL,       -- indigenous persons as % of total persons
    median_rent_weekly REAL,
    median_mortgage_monthly REAL,
    median_household_income_weekly REAL,
    average_household_size REAL,
    labour_force_participation REAL,  -- percentage
    year INTEGER NOT NULL DEFAULT 2021,
    source TEXT DEFAULT 'abs_census_2021',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(electorate_name, year)
);

CREATE INDEX IF NOT EXISTS idx_electorate_demo_name ON electorate_demographics(electorate_name);
CREATE INDEX IF NOT EXISTS idx_electorate_demo_state ON electorate_demographics(state);
CREATE INDEX IF NOT EXISTS idx_electorate_demo_income ON electorate_demographics(median_income);
CREATE INDEX IF NOT EXISTS idx_electorate_demo_unemployment ON electorate_demographics(unemployment_rate DESC);

-- Precomputed analysis cache
CREATE TABLE IF NOT EXISTS analysis_cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,  -- JSON blob
    updated_at TEXT DEFAULT (datetime('now'))
);

-- ANAO audit reports
CREATE TABLE IF NOT EXISTS audit_reports (
    audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    report_number TEXT,          -- e.g. 'No. 25 of 2025-26'
    audit_type TEXT,             -- 'performance', 'financial', 'compliance'
    agency_audited TEXT,
    date_tabled TEXT,
    summary TEXT,
    findings_count INTEGER DEFAULT 0,
    recommendations_count INTEGER DEFAULT 0,
    url TEXT UNIQUE,
    full_text TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_reports_agency ON audit_reports(agency_audited);
CREATE INDEX IF NOT EXISTS idx_audit_reports_type ON audit_reports(audit_type);
CREATE INDEX IF NOT EXISTS idx_audit_reports_date ON audit_reports(date_tabled);

-- Government grants (GrantConnect, state open data, manual imports)
CREATE TABLE IF NOT EXISTS government_grants (
    grant_id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    recipient TEXT,
    recipient_abn TEXT,
    amount REAL,
    agency TEXT,
    program TEXT,
    electorate TEXT,
    state TEXT,  -- 'federal', 'qld', 'nsw', 'vic', etc.
    start_date TEXT,
    end_date TEXT,
    grant_type TEXT,  -- 'discretionary', 'ad_hoc', 'one_off', 'multi_year', 'formula'
    source_url TEXT,
    suburb TEXT,
    postcode TEXT,
    category TEXT,
    recipient_type TEXT,  -- 'local_government', 'nfp', 'business', 'individual'
    financial_year TEXT,
    source TEXT DEFAULT 'data_gov_au',  -- 'grantconnect', 'qld_expenditure', 'data_gov_au', 'manual'
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(recipient_abn, program, amount, start_date)
);

CREATE INDEX IF NOT EXISTS idx_grants_recipient ON government_grants(recipient);
CREATE INDEX IF NOT EXISTS idx_grants_agency ON government_grants(agency);
CREATE INDEX IF NOT EXISTS idx_grants_electorate ON government_grants(electorate);
CREATE INDEX IF NOT EXISTS idx_grants_state ON government_grants(state);
CREATE INDEX IF NOT EXISTS idx_grants_amount ON government_grants(amount DESC);
CREATE INDEX IF NOT EXISTS idx_grants_program ON government_grants(program);
CREATE INDEX IF NOT EXISTS idx_grants_abn ON government_grants(recipient_abn);
CREATE INDEX IF NOT EXISTS idx_grants_type ON government_grants(grant_type);

-- Government board appointments (patronage/corruption tracking)
CREATE TABLE IF NOT EXISTS board_appointments (
    appointment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_name TEXT,
    board_name TEXT NOT NULL,
    agency TEXT,              -- parent department/portfolio
    role TEXT,                -- 'chair', 'member', 'deputy chair', 'ceo', 'commissioner'
    start_date TEXT,
    end_date TEXT,
    remuneration TEXT,        -- pay info if available, or 'paid'/'unpaid'
    appointment_type TEXT,    -- 'ministerial', 'merit', 'ex-officio', 'elected', 'unknown'
    source_url TEXT,
    body_type TEXT,           -- 'non-corporate_entity', 'corporate_entity', 'company', 'board', 'committee'
    classification TEXT,      -- AGOR classification (A/B/C etc)
    established_by TEXT,      -- act/regulation that created the body
    matched_person_id TEXT,   -- FK to members if this person is a former MP
    matched_donor_name TEXT,  -- matched donor name from donations table
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (matched_person_id) REFERENCES members(person_id)
);

CREATE INDEX IF NOT EXISTS idx_board_person ON board_appointments(person_name);
CREATE INDEX IF NOT EXISTS idx_board_name ON board_appointments(board_name);
CREATE INDEX IF NOT EXISTS idx_board_agency ON board_appointments(agency);
CREATE INDEX IF NOT EXISTS idx_board_matched_mp ON board_appointments(matched_person_id);
CREATE INDEX IF NOT EXISTS idx_board_matched_donor ON board_appointments(matched_donor_name);

-- Legal documents from the Open Australian Legal Corpus
CREATE TABLE IF NOT EXISTS legal_documents (
    doc_id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id TEXT UNIQUE,
    title TEXT,
    jurisdiction TEXT,       -- 'commonwealth', 'nsw', 'vic', 'qld', etc.
    doc_type TEXT,            -- 'legislation', 'court_decision', 'regulation'
    date TEXT,
    citation TEXT,
    url TEXT,
    text TEXT,
    source TEXT DEFAULT 'open_australian_legal_corpus'
);

-- Full-text search on legal documents
CREATE VIRTUAL TABLE IF NOT EXISTS legal_documents_fts USING fts5(
    title, citation, text,
    content=legal_documents, content_rowid=doc_id,
    tokenize='porter unicode61'
);

-- Federal lobbyist register (Attorney-General's Dept)
CREATE TABLE IF NOT EXISTS federal_lobbyists (
    lobbyist_id TEXT PRIMARY KEY,
    trading_name TEXT NOT NULL,
    abn TEXT,
    business_entity TEXT,
    former_govt_role TEXT,
    registration_date TEXT,
    status TEXT  -- 'active', 'suspended', 'deregistered'
);

CREATE INDEX IF NOT EXISTS idx_fed_lob_name ON federal_lobbyists(trading_name);
CREATE INDEX IF NOT EXISTS idx_fed_lob_status ON federal_lobbyists(status);
CREATE INDEX IF NOT EXISTS idx_fed_lob_abn ON federal_lobbyists(abn);

-- Clients represented by federal lobbyists
CREATE TABLE IF NOT EXISTS federal_lobbyist_clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lobbyist_id TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_abn TEXT,
    FOREIGN KEY (lobbyist_id) REFERENCES federal_lobbyists(lobbyist_id),
    UNIQUE(lobbyist_id, client_name)
);

CREATE INDEX IF NOT EXISTS idx_fed_lob_client_name ON federal_lobbyist_clients(client_name);
CREATE INDEX IF NOT EXISTS idx_fed_lob_client_lobbyist ON federal_lobbyist_clients(lobbyist_id);
"""

# Seed topics with relevant keywords for classification
SEED_TOPICS = {
    "gambling": "gambling,poker machines,pokies,betting,wagering,casino,lotteries,gaming",
    "housing": "housing,rent,mortgage,affordable housing,homelessness,property,tenants,real estate,first home",
    "climate": "climate,emissions,carbon,renewable,solar,wind energy,global warming,net zero,paris agreement",
    "immigration": "immigration,visa,migration,refugees,asylum,border,citizenship,multicultural,deportation",
    "health": "health,hospital,medicare,medical,pharmaceutical,mental health,aged care,disability,ndis,pandemic",
    "education": "education,school,university,students,teachers,curriculum,tafe,vocational,childcare,preschool",
    "economy": "economy,budget,gdp,inflation,interest rates,employment,unemployment,jobs,wages,productivity,reserve bank",
    "defence": "defence,military,army,navy,air force,aukus,veterans,national security,intelligence,cyber",
    "indigenous_affairs": "indigenous,aboriginal,torres strait,first nations,closing the gap,native title,uluru statement,reconciliation,voice",
    "corruption": "corruption,integrity,icac,nacc,transparency,whistleblower,lobbying,accountability,misconduct",
    "media": "media,broadcasting,press,journalism,social media,misinformation,abc,sbs,news,digital platforms",
    "environment": "environment,biodiversity,conservation,water,pollution,national parks,threatened species,deforestation,reef",
    "taxation": "taxation,tax,gst,income tax,capital gains,superannuation,franking credits,tax reform,revenue",
    "infrastructure": "infrastructure,roads,rail,transport,broadband,nbn,airports,ports,construction,urban planning",
    "foreign_affairs": "foreign affairs,diplomacy,trade,china,united states,pacific,sanctions,aid,international,treaty",
    "cost_of_living": "cost of living,grocery,energy prices,fuel,electricity,gas,household budget,wages,affordability,essentials",
}


def migrate_add_state_column(db: sqlite3.Connection) -> None:
    """Add 'state' column to tables if not present (for existing databases)."""
    tables_to_migrate = ["speeches", "divisions", "members"]
    for table in tables_to_migrate:
        # Check if column exists
        cols = {row[1] for row in db.execute(f"PRAGMA table_info({table})").fetchall()}
        if "state" not in cols:
            default = "'federal'" if table in ("speeches", "divisions", "members") else "NULL"
            try:
                db.execute(f"ALTER TABLE {table} ADD COLUMN state TEXT DEFAULT {default}")
                print(f"  Added 'state' column to {table}")
            except sqlite3.OperationalError as e:
                if "duplicate column" in str(e).lower():
                    pass  # Already exists, race condition
                else:
                    raise
    # Add source column to donations if missing
    don_cols = {row[1] for row in db.execute("PRAGMA table_info(donations)").fetchall()}
    if "source" not in don_cols:
        try:
            db.execute("ALTER TABLE donations ADD COLUMN source TEXT")
            print("  Added 'source' column to donations")
        except sqlite3.OperationalError as e:
            if "duplicate column" not in str(e).lower():
                raise

    # Add donation_type column to donations if missing
    don_cols = {row[1] for row in db.execute("PRAGMA table_info(donations)").fetchall()}
    if "donation_type" not in don_cols:
        try:
            db.execute("ALTER TABLE donations ADD COLUMN donation_type TEXT DEFAULT 'direct'")
            print("  Added 'donation_type' column to donations")
        except sqlite3.OperationalError as e:
            if "duplicate column" not in str(e).lower():
                raise

    try:
        db.commit()
    except sqlite3.OperationalError:
        pass  # DB may be locked; column was added anyway


def get_db(path: str | Path | None = None) -> sqlite3.Connection:
    """Open (or create) the parli database and return a connection."""
    path = Path(path) if path else DEFAULT_DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(path), timeout=300)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode = WAL")
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA busy_timeout = 600000")   # 10 min wait for locks
    db.execute("PRAGMA wal_autocheckpoint = 1000")  # checkpoint every 1000 pages
    db.execute("PRAGMA synchronous = NORMAL")     # faster writes, still safe with WAL
    db.execute("PRAGMA cache_size = -64000")       # 64MB page cache
    return db


def init_db(db: sqlite3.Connection) -> None:
    """Create all tables if they don't exist, and run migrations."""
    db.executescript(SCHEMA_SQL)
    migrate_add_state_column(db)


def seed_topics(db: sqlite3.Connection) -> int:
    """Insert initial topics with keywords. Returns count of topics inserted."""
    count = 0
    for name, keywords in SEED_TOPICS.items():
        try:
            db.execute(
                "INSERT OR IGNORE INTO topics (name, keywords) VALUES (?, ?)",
                (name, keywords),
            )
            count += 1
        except Exception:
            pass
    db.commit()
    return count


if __name__ == "__main__":
    db = get_db()
    init_db(db)
    print(f"Database initialized at {DEFAULT_DB_PATH}")

    n = seed_topics(db)
    print(f"Seeded {n} topics")

    # Print table summary
    tables = db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).fetchall()
    for t in tables:
        count = db.execute(f"SELECT COUNT(*) FROM [{t['name']}]").fetchone()[0]
        print(f"  {t['name']}: {count} rows")
