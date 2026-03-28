-- =============================================================================
-- OPAX PostgreSQL Schema
-- Translated from parli/schema.py SQLite schema.
--
-- Usage:
--   psql -d opax -f parli/pg_schema.sql
--
-- Prerequisites:
--   CREATE DATABASE opax;
--   CREATE USER opax WITH PASSWORD 'opax';
--   GRANT ALL PRIVILEGES ON DATABASE opax TO opax;
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;    -- pgvector for embeddings
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- trigram similarity (fuzzy matching)

-- ---------------------------------------------------------------------------
-- Members of parliament
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
    person_id    TEXT PRIMARY KEY,
    first_name   TEXT,
    last_name    TEXT,
    full_name    TEXT,
    party        TEXT,
    electorate   TEXT,
    chamber      TEXT,          -- 'representatives' or 'senate'
    gender       TEXT,
    entered_house DATE,
    left_house    DATE,
    state        TEXT DEFAULT 'federal'
);

-- ---------------------------------------------------------------------------
-- Bills / legislation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bills (
    bill_id          SERIAL PRIMARY KEY,
    title            TEXT NOT NULL,
    status           TEXT,        -- 'passed', 'rejected', 'lapsed', 'before_parliament'
    portfolio        TEXT,
    introduced_date  DATE,
    house            TEXT
);

-- ---------------------------------------------------------------------------
-- Divisions (votes in parliament)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS divisions (
    division_id       INTEGER PRIMARY KEY,
    house             TEXT NOT NULL,
    name              TEXT,
    date              DATE NOT NULL,
    number            INTEGER,
    aye_votes         INTEGER,
    no_votes          INTEGER,
    possible_turnout  INTEGER,
    rebellions        INTEGER,
    summary           TEXT,
    state             TEXT DEFAULT 'federal'
);

-- ---------------------------------------------------------------------------
-- Individual votes per division
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS votes (
    division_id  INTEGER NOT NULL REFERENCES divisions(division_id),
    person_id    TEXT NOT NULL REFERENCES members(person_id),
    vote         TEXT NOT NULL,   -- 'aye', 'no', 'abstention', 'absent'
    PRIMARY KEY (division_id, person_id)
);

-- ---------------------------------------------------------------------------
-- Speeches from Hansard
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS speeches (
    speech_id      BIGSERIAL PRIMARY KEY,
    person_id      TEXT REFERENCES members(person_id),
    speaker_name   TEXT,
    party          TEXT,
    electorate     TEXT,
    chamber        TEXT,
    date           DATE NOT NULL,
    topic          TEXT,
    text           TEXT NOT NULL,
    word_count     INTEGER,
    source         TEXT,          -- 'zenodo', 'openaustralia', 'wragge_xml', 'nsw_hansard'
    state          TEXT DEFAULT 'federal',
    -- Full-text search vector (replaces FTS5 virtual table)
    search_vector  tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(speaker_name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(topic, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(text, '')), 'C')
    ) STORED,
    -- pgvector embedding column (384-dim for all-MiniLM-L6-v2)
    embedding      vector(384)
);

CREATE INDEX IF NOT EXISTS idx_speeches_person_id ON speeches(person_id);
CREATE INDEX IF NOT EXISTS idx_speeches_date ON speeches(date);
CREATE INDEX IF NOT EXISTS idx_speeches_party ON speeches(party);
CREATE INDEX IF NOT EXISTS idx_speeches_state ON speeches(state);
CREATE INDEX IF NOT EXISTS idx_speeches_source ON speeches(source);
-- GIN index for full-text search (replaces FTS5)
CREATE INDEX IF NOT EXISTS idx_speeches_search_vector ON speeches USING GIN(search_vector);
-- HNSW index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_speeches_embedding ON speeches USING hnsw(embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ---------------------------------------------------------------------------
-- Donations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS donations (
    donation_id     BIGSERIAL PRIMARY KEY,
    donor_name      TEXT NOT NULL,
    recipient       TEXT NOT NULL,
    amount          NUMERIC,
    financial_year  TEXT,
    donor_type      TEXT,         -- 'individual', 'organisation', 'other'
    industry        TEXT,
    source          TEXT,         -- 'aec_annual', 'aec_election', 'aec_referendum', 'nsw', 'vic', 'qld'
    donation_type   TEXT DEFAULT 'direct'  -- 'direct', 'in_kind', 'other'
);

CREATE INDEX IF NOT EXISTS idx_donations_donor ON donations(donor_name);
CREATE INDEX IF NOT EXISTS idx_donations_recipient ON donations(recipient);
CREATE INDEX IF NOT EXISTS idx_donations_amount ON donations(amount DESC);
CREATE INDEX IF NOT EXISTS idx_donations_fy ON donations(financial_year);

-- ---------------------------------------------------------------------------
-- Associated entities (party-linked organisations)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS associated_entities (
    entity_record_id     BIGSERIAL PRIMARY KEY,
    entity_name          TEXT NOT NULL,
    associated_party     TEXT NOT NULL,
    amount               NUMERIC,
    financial_year       TEXT,
    entity_type          TEXT,
    industry             TEXT,
    source               TEXT DEFAULT 'aec_assoc_entity',
    original_donation_id INTEGER,
    donor_type           TEXT,
    state                TEXT
);

CREATE INDEX IF NOT EXISTS idx_assoc_entity_name ON associated_entities(entity_name);
CREATE INDEX IF NOT EXISTS idx_assoc_entity_party ON associated_entities(associated_party);
CREATE INDEX IF NOT EXISTS idx_assoc_entity_amount ON associated_entities(amount DESC);
CREATE INDEX IF NOT EXISTS idx_assoc_entity_fy ON associated_entities(financial_year);

-- ---------------------------------------------------------------------------
-- Topics for classification
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS topics (
    topic_id   SERIAL PRIMARY KEY,
    name       TEXT UNIQUE NOT NULL,
    keywords   TEXT           -- comma-separated keywords for matching
);

-- ---------------------------------------------------------------------------
-- Speech-topic mapping
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS speech_topics (
    speech_id   BIGINT NOT NULL,
    topic_id    INTEGER NOT NULL,
    relevance   DOUBLE PRECISION DEFAULT 1.0,
    PRIMARY KEY (speech_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_speech_topics_topic_id ON speech_topics(topic_id, speech_id);

-- ---------------------------------------------------------------------------
-- Government contracts from AusTender
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contracts (
    contract_id         TEXT PRIMARY KEY,
    title               TEXT,
    description         TEXT,
    supplier_name       TEXT,
    agency              TEXT,
    amount              NUMERIC,
    start_date          DATE,
    end_date            DATE,
    procurement_method  TEXT,
    source              TEXT DEFAULT 'austender'
);

CREATE INDEX IF NOT EXISTS idx_contracts_supplier ON contracts(supplier_name);
CREATE INDEX IF NOT EXISTS idx_contracts_agency ON contracts(agency);
CREATE INDEX IF NOT EXISTS idx_contracts_amount ON contracts(amount DESC);

-- ---------------------------------------------------------------------------
-- News articles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS news_articles (
    article_id   TEXT PRIMARY KEY,
    title        TEXT,
    date         DATE,
    section      TEXT,
    url          TEXT,
    body_text    TEXT,
    source       TEXT DEFAULT 'guardian',
    -- Full-text search vector
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(body_text, '')), 'C')
    ) STORED
);

CREATE INDEX IF NOT EXISTS idx_news_articles_search_vector ON news_articles USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_news_articles_date ON news_articles(date);

-- ---------------------------------------------------------------------------
-- Bill progress / lifecycle tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bill_progress (
    progress_id  SERIAL PRIMARY KEY,
    bill_id      INTEGER REFERENCES bills(bill_id),
    stage        TEXT,
    date         DATE,
    house        TEXT,
    event_raw    TEXT
);

CREATE INDEX IF NOT EXISTS idx_bill_progress_bill ON bill_progress(bill_id);

-- ---------------------------------------------------------------------------
-- MP disconnect scores (speech vs vote alignment)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mp_disconnect_scores (
    person_id            TEXT NOT NULL REFERENCES members(person_id),
    topic_id             INTEGER NOT NULL REFERENCES topics(topic_id),
    topic_name           TEXT NOT NULL,
    speech_count         INTEGER NOT NULL DEFAULT 0,
    pro_reform_speeches  INTEGER NOT NULL DEFAULT 0,
    anti_reform_speeches INTEGER NOT NULL DEFAULT 0,
    relevant_divisions   INTEGER NOT NULL DEFAULT 0,
    aligned_votes        INTEGER NOT NULL DEFAULT 0,
    misaligned_votes     INTEGER NOT NULL DEFAULT 0,
    vote_alignment       DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    disconnect_score     DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    updated_at           TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (person_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_disconnect_score ON mp_disconnect_scores(disconnect_score DESC);
CREATE INDEX IF NOT EXISTS idx_disconnect_person ON mp_disconnect_scores(person_id);
CREATE INDEX IF NOT EXISTS idx_disconnect_topic ON mp_disconnect_scores(topic_id);

-- ---------------------------------------------------------------------------
-- Contract-speech cross-reference links (pay-to-play detection)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contract_speech_links (
    link_id           BIGSERIAL PRIMARY KEY,
    contract_id       TEXT NOT NULL,
    speech_id         BIGINT NOT NULL,
    person_id         TEXT,
    company_name      TEXT NOT NULL,
    supplier_name     TEXT,
    donor_name        TEXT,
    contract_amount   NUMERIC,
    donation_amount   NUMERIC,
    party             TEXT,
    recipient_party   TEXT,
    match_type        TEXT NOT NULL,
    speech_date       DATE,
    speech_snippet    TEXT,
    created_at        TIMESTAMP DEFAULT NOW(),
    UNIQUE(contract_id, speech_id)
);

CREATE INDEX IF NOT EXISTS idx_csl_company ON contract_speech_links(company_name);
CREATE INDEX IF NOT EXISTS idx_csl_party ON contract_speech_links(party);
CREATE INDEX IF NOT EXISTS idx_csl_person ON contract_speech_links(person_id);
CREATE INDEX IF NOT EXISTS idx_csl_match_type ON contract_speech_links(match_type);
CREATE INDEX IF NOT EXISTS idx_csl_contract_amount ON contract_speech_links(contract_amount DESC);

-- ---------------------------------------------------------------------------
-- Donor-vote influence scores (party level)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS donor_influence_scores (
    id                      SERIAL PRIMARY KEY,
    party                   TEXT NOT NULL,
    industry                TEXT NOT NULL,
    total_donated           NUMERIC,
    relevant_divisions      INTEGER,
    divisions_with_votes    INTEGER,
    total_votes_cast        INTEGER,
    aye_count               INTEGER,
    no_count                INTEGER,
    favorable_vote_pct      DOUBLE PRECISION,
    influence_score         DOUBLE PRECISION,
    updated_at              TIMESTAMP DEFAULT NOW(),
    UNIQUE(party, industry)
);

CREATE INDEX IF NOT EXISTS idx_donor_influence_party ON donor_influence_scores(party);
CREATE INDEX IF NOT EXISTS idx_donor_influence_industry ON donor_influence_scores(industry);
CREATE INDEX IF NOT EXISTS idx_donor_influence_score ON donor_influence_scores(influence_score DESC);

-- ---------------------------------------------------------------------------
-- Donor-vote influence scores (per-MP level)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mp_donor_influence_scores (
    id                              SERIAL PRIMARY KEY,
    person_id                       TEXT NOT NULL,
    full_name                       TEXT,
    party                           TEXT NOT NULL,
    industry                        TEXT NOT NULL,
    party_donations_from_industry   NUMERIC,
    divisions_voted                 INTEGER,
    aye_count                       INTEGER,
    no_count                        INTEGER,
    favorable_vote_pct              DOUBLE PRECISION,
    influence_score                 DOUBLE PRECISION,
    updated_at                      TIMESTAMP DEFAULT NOW(),
    UNIQUE(person_id, industry)
);

CREATE INDEX IF NOT EXISTS idx_mp_donor_influence_person ON mp_donor_influence_scores(person_id);
CREATE INDEX IF NOT EXISTS idx_mp_donor_influence_score ON mp_donor_influence_scores(influence_score DESC);

-- ---------------------------------------------------------------------------
-- MP Register of Interests: general interests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mp_interests (
    interest_id    SERIAL PRIMARY KEY,
    person_id      TEXT REFERENCES members(person_id),
    interest_type  TEXT NOT NULL,
    entity_name    TEXT,
    description    TEXT,
    declared_date  DATE,
    parliament_number INTEGER,
    raw_text       TEXT,
    source_url     TEXT,
    created_at     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mp_interests_person ON mp_interests(person_id);
CREATE INDEX IF NOT EXISTS idx_mp_interests_type ON mp_interests(interest_type);

-- ---------------------------------------------------------------------------
-- MP Register of Interests: shareholdings detail
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mp_shareholdings (
    shareholding_id  SERIAL PRIMARY KEY,
    person_id        TEXT REFERENCES members(person_id),
    company_name     TEXT NOT NULL,
    share_type       TEXT,
    declared_date    DATE
);

CREATE INDEX IF NOT EXISTS idx_mp_shareholdings_person ON mp_shareholdings(person_id);
CREATE INDEX IF NOT EXISTS idx_mp_shareholdings_company ON mp_shareholdings(company_name);

-- ---------------------------------------------------------------------------
-- MP Register of Interests: real estate detail
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mp_properties (
    property_id          SERIAL PRIMARY KEY,
    person_id            TEXT REFERENCES members(person_id),
    property_description TEXT,
    location             TEXT,
    purpose              TEXT,
    declared_date        DATE
);

CREATE INDEX IF NOT EXISTS idx_mp_properties_person ON mp_properties(person_id);

-- ---------------------------------------------------------------------------
-- MP Register of Interests: directorships detail
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mp_directorships (
    directorship_id  SERIAL PRIMARY KEY,
    person_id        TEXT REFERENCES members(person_id),
    company_name     TEXT NOT NULL,
    role             TEXT,
    declared_date    DATE
);

CREATE INDEX IF NOT EXISTS idx_mp_directorships_person ON mp_directorships(person_id);
CREATE INDEX IF NOT EXISTS idx_mp_directorships_company ON mp_directorships(company_name);

-- ---------------------------------------------------------------------------
-- Ministerial meetings (diary disclosures)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ministerial_meetings (
    meeting_id      SERIAL PRIMARY KEY,
    minister_name   TEXT NOT NULL,
    person_id       TEXT REFERENCES members(person_id),
    meeting_date    DATE NOT NULL,
    organisation    TEXT,
    attendee_name   TEXT,
    purpose         TEXT,
    portfolio       TEXT,
    state           TEXT DEFAULT 'qld',
    source_url      TEXT
);

CREATE INDEX IF NOT EXISTS idx_mm_minister ON ministerial_meetings(minister_name);
CREATE INDEX IF NOT EXISTS idx_mm_date ON ministerial_meetings(meeting_date);
CREATE INDEX IF NOT EXISTS idx_mm_organisation ON ministerial_meetings(organisation);
CREATE INDEX IF NOT EXISTS idx_mm_state ON ministerial_meetings(state);
CREATE INDEX IF NOT EXISTS idx_mm_person ON ministerial_meetings(person_id);

-- ---------------------------------------------------------------------------
-- Electorate demographics (ABS Census profiles)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS electorate_demographics (
    id                              SERIAL PRIMARY KEY,
    electorate_name                 TEXT NOT NULL,
    state                           TEXT,
    population                      INTEGER,
    median_income                   NUMERIC,
    median_age                      NUMERIC,
    unemployment_rate               NUMERIC,
    homeownership_pct               NUMERIC,
    rental_pct                      NUMERIC,
    born_overseas_pct               NUMERIC,
    university_pct                  NUMERIC,
    indigenous_pct                  NUMERIC,
    median_rent_weekly              NUMERIC,
    median_mortgage_monthly         NUMERIC,
    median_household_income_weekly  NUMERIC,
    average_household_size          NUMERIC,
    labour_force_participation      NUMERIC,
    year                            INTEGER NOT NULL DEFAULT 2021,
    source                          TEXT DEFAULT 'abs_census_2021',
    created_at                      TIMESTAMP DEFAULT NOW(),
    UNIQUE(electorate_name, year)
);

CREATE INDEX IF NOT EXISTS idx_electorate_demo_name ON electorate_demographics(electorate_name);
CREATE INDEX IF NOT EXISTS idx_electorate_demo_state ON electorate_demographics(state);
CREATE INDEX IF NOT EXISTS idx_electorate_demo_income ON electorate_demographics(median_income);
CREATE INDEX IF NOT EXISTS idx_electorate_demo_unemployment ON electorate_demographics(unemployment_rate DESC);

-- ---------------------------------------------------------------------------
-- Precomputed analysis cache
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analysis_cache (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMP DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- ANAO audit reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_reports (
    audit_id               SERIAL PRIMARY KEY,
    title                  TEXT NOT NULL,
    report_number          TEXT,
    audit_type             TEXT,
    agency_audited         TEXT,
    date_tabled            DATE,
    summary                TEXT,
    findings_count         INTEGER DEFAULT 0,
    recommendations_count  INTEGER DEFAULT 0,
    url                    TEXT UNIQUE,
    full_text              TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_reports_agency ON audit_reports(agency_audited);
CREATE INDEX IF NOT EXISTS idx_audit_reports_type ON audit_reports(audit_type);
CREATE INDEX IF NOT EXISTS idx_audit_reports_date ON audit_reports(date_tabled);

-- ---------------------------------------------------------------------------
-- Government grants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS government_grants (
    grant_id        BIGSERIAL PRIMARY KEY,
    title           TEXT,
    description     TEXT,
    recipient       TEXT,
    recipient_abn   TEXT,
    amount          NUMERIC,
    agency          TEXT,
    program         TEXT,
    electorate      TEXT,
    state           TEXT,
    start_date      DATE,
    end_date        DATE,
    grant_type      TEXT,
    source_url      TEXT,
    suburb          TEXT,
    postcode        TEXT,
    category        TEXT,
    recipient_type  TEXT,
    financial_year  TEXT,
    source          TEXT DEFAULT 'data_gov_au',
    created_at      TIMESTAMP DEFAULT NOW(),
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

-- ---------------------------------------------------------------------------
-- Government board appointments (patronage/corruption tracking)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS board_appointments (
    appointment_id       SERIAL PRIMARY KEY,
    person_name          TEXT,
    board_name           TEXT NOT NULL,
    agency               TEXT,
    role                 TEXT,
    start_date           DATE,
    end_date             DATE,
    remuneration         TEXT,
    appointment_type     TEXT,
    source_url           TEXT,
    body_type            TEXT,
    classification       TEXT,
    established_by       TEXT,
    matched_person_id    TEXT REFERENCES members(person_id),
    matched_donor_name   TEXT,
    created_at           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_board_person ON board_appointments(person_name);
CREATE INDEX IF NOT EXISTS idx_board_name ON board_appointments(board_name);
CREATE INDEX IF NOT EXISTS idx_board_agency ON board_appointments(agency);
CREATE INDEX IF NOT EXISTS idx_board_matched_mp ON board_appointments(matched_person_id);
CREATE INDEX IF NOT EXISTS idx_board_matched_donor ON board_appointments(matched_donor_name);

-- ---------------------------------------------------------------------------
-- Legal documents from the Open Australian Legal Corpus
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS legal_documents (
    doc_id        BIGSERIAL PRIMARY KEY,
    version_id    TEXT UNIQUE,
    title         TEXT,
    jurisdiction  TEXT,
    doc_type      TEXT,
    date          DATE,
    citation      TEXT,
    url           TEXT,
    text          TEXT,
    source        TEXT DEFAULT 'open_australian_legal_corpus',
    -- Full-text search vector
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(citation, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(text, '')), 'C')
    ) STORED
);

CREATE INDEX IF NOT EXISTS idx_legal_documents_search_vector ON legal_documents USING GIN(search_vector);

-- ---------------------------------------------------------------------------
-- Federal lobbyist register
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS federal_lobbyists (
    lobbyist_id        TEXT PRIMARY KEY,
    trading_name       TEXT NOT NULL,
    abn                TEXT,
    business_entity    TEXT,
    former_govt_role   TEXT,
    registration_date  DATE,
    status             TEXT
);

CREATE INDEX IF NOT EXISTS idx_fed_lob_name ON federal_lobbyists(trading_name);
CREATE INDEX IF NOT EXISTS idx_fed_lob_status ON federal_lobbyists(status);
CREATE INDEX IF NOT EXISTS idx_fed_lob_abn ON federal_lobbyists(abn);

-- ---------------------------------------------------------------------------
-- Clients represented by federal lobbyists
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS federal_lobbyist_clients (
    id             SERIAL PRIMARY KEY,
    lobbyist_id    TEXT NOT NULL REFERENCES federal_lobbyists(lobbyist_id),
    client_name    TEXT NOT NULL,
    client_abn     TEXT,
    UNIQUE(lobbyist_id, client_name)
);

CREATE INDEX IF NOT EXISTS idx_fed_lob_client_name ON federal_lobbyist_clients(client_name);
CREATE INDEX IF NOT EXISTS idx_fed_lob_client_lobbyist ON federal_lobbyist_clients(lobbyist_id);

-- ---------------------------------------------------------------------------
-- Seed topics (same as SQLite schema.py SEED_TOPICS)
-- ---------------------------------------------------------------------------
INSERT INTO topics (name, keywords) VALUES
    ('gambling', 'gambling,poker machines,pokies,betting,wagering,casino,lotteries,gaming'),
    ('housing', 'housing,rent,mortgage,affordable housing,homelessness,property,tenants,real estate,first home'),
    ('climate', 'climate,emissions,carbon,renewable,solar,wind energy,global warming,net zero,paris agreement'),
    ('immigration', 'immigration,visa,migration,refugees,asylum,border,citizenship,multicultural,deportation'),
    ('health', 'health,hospital,medicare,medical,pharmaceutical,mental health,aged care,disability,ndis,pandemic'),
    ('education', 'education,school,university,students,teachers,curriculum,tafe,vocational,childcare,preschool'),
    ('economy', 'economy,budget,gdp,inflation,interest rates,employment,unemployment,jobs,wages,productivity,reserve bank'),
    ('defence', 'defence,military,army,navy,air force,aukus,veterans,national security,intelligence,cyber'),
    ('indigenous_affairs', 'indigenous,aboriginal,torres strait,first nations,closing the gap,native title,uluru statement,reconciliation,voice'),
    ('corruption', 'corruption,integrity,icac,nacc,transparency,whistleblower,lobbying,accountability,misconduct'),
    ('media', 'media,broadcasting,press,journalism,social media,misinformation,abc,sbs,news,digital platforms'),
    ('environment', 'environment,biodiversity,conservation,water,pollution,national parks,threatened species,deforestation,reef'),
    ('taxation', 'taxation,tax,gst,income tax,capital gains,superannuation,franking credits,tax reform,revenue'),
    ('infrastructure', 'infrastructure,roads,rail,transport,broadband,nbn,airports,ports,construction,urban planning'),
    ('foreign_affairs', 'foreign affairs,diplomacy,trade,china,united states,pacific,sanctions,aid,international,treaty'),
    ('cost_of_living', 'cost of living,grocery,energy prices,fuel,electricity,gas,household budget,wages,affordability,essentials')
ON CONFLICT (name) DO NOTHING;
