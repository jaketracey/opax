"""
parli.ingest.money_lobbyists -- lobbyist registers (federal + five states) into
four ext_* tables:

  ext_lobbyists          one row per registered lobbying entity (firm / sole trader)
  ext_lobbyist_clients   entity -> client relationships (with dates where published)
  ext_lobbyist_people    individual lobbyists / employees / owners, with the
                         former-government-representative flag where published
  ext_lobbyist_contacts  QLD Integrity Commissioner contact log (the only
                         jurisdiction that publishes lobbying *activity*)

Sources and access method (all verified 2026-09-02; see docs/DATA-MONEY.md):

  federal  Attorney-General's Department register, JSON API behind the SPA:
           POST https://api.lobbyists.ag.gov.au/search/organisations and
           GET  .../search/organisations/{id}/profile (lobbyists, clients,
           former-representative details). AGD content is CC BY 4.0.
  nsw      NSW Electoral Commission register (Visualforce site). The landing
           page https://lobbyists.elections.nsw.gov.au/ server-renders the
           Active / Inactive / Cancelled / Suspended tables; clients,
           employees and owners come from the same page's AJAX detail
           postback. Listed on data.nsw.gov.au (CC BY-SA 3.0 AU).
  qld      Queensland Integrity Commissioner Lobbying Register (Power Pages):
           entity lists dpc_lobbyist, dpc_client and dpc_contactlog via the
           /_services/entity-grid-data.json API. QLD Government CC BY 4.0.
  vic      VPSC register at https://www.lobbyists.vic.gov.au/ -- sitemap.xml
           lists every /search-the-register/{slug} page; each page carries
           entity details, owners, employees (with the former-official
           description) and current clients with date added. CC BY 4.0.
  sa       DPC register SPA https://www.lobbyists.sa.gov.au/ backed by
           https://saglobbyistapi02prdaue.azurewebsites.net/api/{lobbyist,
           client?lobbyistId=, employee?lobbyistId=} (anonymous GET). Licence
           not stated on the register; SA Government sites default to CC BY.
  wa       Public Sector Commission register https://www.lobbyists.wa.gov.au/
           (Power Pages) embeds the whole register in the home page script
           (gridData + per-company lobbyist/client/owner pushes). wa.gov.au
           terms discourage automated access; one page fetch per run.

The legacy `federal_lobbyists`/`federal_lobbyist_clients` (March 2026) and
empty `qld_lobbyist*` tables are left untouched.

Usage:
    python -m parli.ingest.money_lobbyists                        # all six
    python -m parli.ingest.money_lobbyists --jurisdiction nsw --jurisdiction vic
    python -m parli.ingest.money_lobbyists --jurisdiction qld --limit 50 --db /tmp/t.db
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
from datetime import datetime, timezone

from parli.ingest.ext_common import (
    CACHE_ROOT, PowerPagesGrid, add_writer_args, clean_ws, log, make_session, parse_date,
    polite_get, writer_from_args,
)

CACHE = CACHE_ROOT / "lobbyists"

DDL = """
CREATE TABLE IF NOT EXISTS ext_lobbyists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jurisdiction TEXT NOT NULL,          -- federal | nsw | qld | vic | sa | wa
    source TEXT NOT NULL,                -- agd_register | nsw_ec_register | qld_integrity | vic_vpsc | sa_dpc | wa_psc
    register_id TEXT,                    -- the register's own id (GUID / numeric / slug); hash of name if none
    entity_name TEXT NOT NULL,           -- legal / business name
    trading_name TEXT,
    abn TEXT,
    status TEXT,                         -- active | inactive | cancelled | suspended | deregistered | ...
    registered_on TEXT,
    updated_on TEXT,
    deregistered_on TEXT,
    on_watchlist INTEGER,                -- NSW watchlist flag
    former_govt_reps TEXT,               -- summary of former-government-representative disclosures
    owners TEXT,                         -- '; '-joined owner names where published
    source_url TEXT,
    ingested_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ext_lob_source ON ext_lobbyists(source);
CREATE INDEX IF NOT EXISTS idx_ext_lob_name ON ext_lobbyists(entity_name);
CREATE INDEX IF NOT EXISTS idx_ext_lob_abn ON ext_lobbyists(abn);

CREATE TABLE IF NOT EXISTS ext_lobbyist_clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jurisdiction TEXT NOT NULL,
    source TEXT NOT NULL,
    lobbyist_register_id TEXT,
    lobbyist_name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_abn TEXT,
    active INTEGER,                      -- 1/0 where the register says; NULL unknown
    date_added TEXT,
    date_ceased TEXT,
    foreign_principal INTEGER,           -- NSW flag
    derived_from TEXT,                   -- 'register' or 'contact_log' (QLD pairs inferred from activity)
    source_url TEXT,
    ingested_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ext_lc_source ON ext_lobbyist_clients(source);
CREATE INDEX IF NOT EXISTS idx_ext_lc_client ON ext_lobbyist_clients(client_name);
CREATE INDEX IF NOT EXISTS idx_ext_lc_lobbyist ON ext_lobbyist_clients(lobbyist_name);

CREATE TABLE IF NOT EXISTS ext_lobbyist_people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jurisdiction TEXT NOT NULL,
    source TEXT NOT NULL,
    lobbyist_register_id TEXT,
    lobbyist_name TEXT NOT NULL,
    person_name TEXT NOT NULL,
    role TEXT,                           -- lobbyist | employee | owner
    position TEXT,
    former_govt_rep INTEGER,             -- 1 when the register flags a former government representative
    former_role TEXT,                    -- description of the former role / restriction
    active INTEGER,
    date_added TEXT,
    date_ceased TEXT,
    source_url TEXT,
    ingested_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ext_lp_source ON ext_lobbyist_people(source);
CREATE INDEX IF NOT EXISTS idx_ext_lp_person ON ext_lobbyist_people(person_name);
CREATE INDEX IF NOT EXISTS idx_ext_lp_former ON ext_lobbyist_people(former_govt_rep);

CREATE TABLE IF NOT EXISTS ext_lobbyist_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jurisdiction TEXT NOT NULL,
    source TEXT NOT NULL,
    record_id TEXT,
    contact_date TEXT,                   -- ISO
    lobbyist_entity TEXT,
    client_name TEXT,
    government_representatives TEXT,     -- who was lobbied (free text, may list several)
    portfolio_area TEXT,
    purpose TEXT,
    contact_mode TEXT,                   -- Meeting / Telephone / Email ...
    source_url TEXT,
    ingested_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ext_lct_source ON ext_lobbyist_contacts(source);
CREATE INDEX IF NOT EXISTS idx_ext_lct_date ON ext_lobbyist_contacts(contact_date);
CREATE INDEX IF NOT EXISTS idx_ext_lct_entity ON ext_lobbyist_contacts(lobbyist_entity);
CREATE INDEX IF NOT EXISTS idx_ext_lct_client ON ext_lobbyist_contacts(client_name);
"""

LOB_COLS = ["jurisdiction", "source", "register_id", "entity_name", "trading_name", "abn", "status",
            "registered_on", "updated_on", "deregistered_on", "on_watchlist", "former_govt_reps", "owners",
            "source_url", "ingested_at"]
CLI_COLS = ["jurisdiction", "source", "lobbyist_register_id", "lobbyist_name", "client_name", "client_abn",
            "active", "date_added", "date_ceased", "foreign_principal", "derived_from", "source_url", "ingested_at"]
PPL_COLS = ["jurisdiction", "source", "lobbyist_register_id", "lobbyist_name", "person_name", "role", "position",
            "former_govt_rep", "former_role", "active", "date_added", "date_ceased", "source_url", "ingested_at"]
CON_COLS = ["jurisdiction", "source", "record_id", "contact_date", "lobbyist_entity", "client_name",
            "government_representatives", "portfolio_area", "purpose", "contact_mode", "source_url", "ingested_at"]


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _h(*parts) -> str:
    return hashlib.sha1("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()[:16]


def _abn(s) -> str | None:
    d = re.sub(r"\D", "", str(s or ""))
    return d if len(d) == 11 else (clean_ws(s) or None)


class Bundle:
    def __init__(self, jur: str, source: str, url: str):
        self.jur, self.source, self.url = jur, source, url
        self.lobbyists: list[list] = []
        self.clients: list[list] = []
        self.people: list[list] = []
        self.contacts: list[list] = []

    def lobbyist(self, register_id, name, trading=None, abn=None, status=None, registered=None, updated=None,
                 dereg=None, watch=None, former=None, owners=None, url=None):
        self.lobbyists.append([self.jur, self.source, register_id, clean_ws(name), clean_ws(trading) or None, _abn(abn),
                               (status or None), registered, updated, dereg, watch, former or None, owners or None,
                               url or self.url, _now()])

    def client(self, register_id, lobbyist, client, abn=None, active=None, added=None, ceased=None, foreign=None,
               derived="register", url=None):
        if not clean_ws(client):
            return
        self.clients.append([self.jur, self.source, register_id, clean_ws(lobbyist), clean_ws(client), _abn(abn),
                             active, added, ceased, foreign, derived, url or self.url, _now()])

    def person(self, register_id, lobbyist, name, role, position=None, former=None, former_role=None, active=None,
               added=None, ceased=None, url=None):
        if not clean_ws(name):
            return
        self.people.append([self.jur, self.source, register_id, clean_ws(lobbyist), clean_ws(name), role,
                            clean_ws(position) or None, former, clean_ws(former_role) or None, active, added, ceased,
                            url or self.url, _now()])

    def contact(self, record_id, date, entity, client, reps, portfolio, purpose, mode, url=None):
        self.contacts.append([self.jur, self.source, record_id, date, clean_ws(entity) or None, clean_ws(client) or None,
                              clean_ws(reps) or None, clean_ws(portfolio) or None, clean_ws(purpose) or None,
                              clean_ws(mode) or None, url or self.url, _now()])

    def summary(self) -> str:
        return (f"{len(self.lobbyists)} lobbyists, {len(self.clients)} client links, "
                f"{len(self.people)} people, {len(self.contacts)} contacts")


# ── Federal (AGD API) ────────────────────────────────────────────────────────

def fetch_federal(session, limit: int) -> Bundle:
    from parli.ingest.federal_lobbyists import API_BASE, API_HEADERS, _fetch_organisation_list, _fetch_organisation_profile
    b = Bundle("federal", "agd_register", "https://lobbyists.ag.gov.au/register")
    orgs = _fetch_organisation_list(include_deregistered=True)
    log(f"  federal: {len(orgs)} organisations listed")
    if limit:
        orgs = orgs[:limit]
    for i, org in enumerate(orgs, 1):
        oid = org.get("id")
        prof = _fetch_organisation_profile(oid) if oid else None
        time.sleep(0.2)
        summ = (prof or {}).get("summary", {}) or {}
        dereg = summ.get("isDeregistered", org.get("_is_deregistered"))
        name = summ.get("displayName") or org.get("displayName")
        url = f"https://lobbyists.ag.gov.au/register/view/{oid}"
        former = []
        for lob in (prof or {}).get("lobbyists", []) or []:
            pname = lob.get("displayName") or f"{lob.get('firstName', '')} {lob.get('lastName', '')}"
            is_former = bool(lob.get("isFormerRepresentative"))
            role_desc = clean_ws(" ".join(str(x) for x in [lob.get("previousPositionOther") or lob.get("previousPosition") or "",
                                                            f"({lob.get('previousPositionLevel')})" if lob.get("previousPositionLevel") else "",
                                                            f"left {str(lob.get('cessationDate'))[:10]}" if lob.get("cessationDate") else ""] if x))
            b.person(oid, name, pname, "lobbyist", lob.get("position"), 1 if is_former else 0,
                     role_desc if is_former else None, None, (lob.get("createdOn") or "")[:10] or None, url=url)
            if is_former:
                former.append(f"{clean_ws(pname)} -- {role_desc}" if role_desc else clean_ws(pname))
        for cl in (prof or {}).get("clients", []) or []:
            b.client(oid, name, cl.get("displayName") or cl.get("businessName") or cl.get("lastName"), cl.get("abn"),
                     1, (cl.get("createdOn") or "")[:10] or None, url=url)
        for st in (prof or {}).get("stakeholders", []) or []:
            b.person(oid, name, st.get("displayName") or st.get("businessName") or "", "owner", st.get("position"), url=url)
        b.lobbyist(oid, name, org.get("tradingName"), summ.get("abn") or org.get("abn"),
                   "deregistered" if dereg else "active", (summ.get("registeredOn") or org.get("registeredOn") or "")[:10] or None,
                   (org.get("modifiedOn") or "")[:10] or None, (org.get("dateDeregistered") or "")[:10] or None,
                   None, "; ".join(former) or None, None, url)
        if i % 50 == 0:
            log(f"    {i}/{len(orgs)} profiles")
    return b


# ── NSW (Visualforce) ────────────────────────────────────────────────────────

NSW_URL = "https://lobbyists.elections.nsw.gov.au/"
NSW_TABS = {"tableSort2": "active", "tableSort3": "inactive", "tableSort4": "cancelled",
            "tableSort5": "suspended", "tableSort6": "ineligible"}


def fetch_nsw(session, limit: int) -> Bundle:
    from bs4 import BeautifulSoup
    b = Bundle("nsw", "nsw_ec_register", NSW_URL)
    r = polite_get(session, NSW_URL)
    soup = BeautifulSoup(r.text, "lxml")
    hidden = {i["name"]: i.get("value", "") for i in soup.find_all("input", type="hidden") if i.get("name")}
    entries = []
    for tid, status in NSW_TABS.items():
        t = soup.find("table", id=tid)
        if not t or not t.find("tbody"):
            continue
        for tr in t.find("tbody").find_all("tr"):
            tds = tr.find_all("td")
            if len(tds) < 5:
                continue
            m = re.search(r"showLobbyDetails\('([^']+)'", str(tds[0]))
            entries.append({"id": m.group(1) if m else None, "name": clean_ws(tds[0].get_text(" ")),
                            "abn": clean_ws(tds[1].get_text(" ")), "trading": clean_ws(tds[2].get_text(" ")),
                            "watch": 1 if "yes" in tds[3].get_text(" ").lower() else 0,
                            "status_raw": clean_ws(tds[4].get_text(" ")), "status": status})
    log(f"  nsw: {len(entries)} lobbyists across tabs")
    if limit:
        entries = entries[:limit]
    for i, e in enumerate(entries, 1):
        detail = None
        if e["id"]:
            data = {"AJAXREQUEST": "_viewRoot", "j_id0:j_id14": "j_id0:j_id14", "j_id0:j_id14:j_id15": "j_id0:j_id14:j_id15",
                    "selectedLobbyistId": e["id"], "selectedLobbyistName": e["name"]}
            for k, v in hidden.items():
                if k.startswith("com.salesforce.visualforce.ViewState"):
                    data[k] = v
            time.sleep(0.8)
            try:
                rr = session.post(NSW_URL + "whoisontheregister", data=data, timeout=90,
                                  headers={"Referer": NSW_URL, "X-Requested-With": "XMLHttpRequest"})
                rr.raise_for_status()
                detail = BeautifulSoup(rr.text, "lxml")
            except Exception as ex:  # noqa: BLE001
                log(f"    detail failed for {e['name']}: {ex}")
        owners = []
        if detail is not None:
            for tr in _rows(detail, "lobTab2"):
                c = [clean_ws(td.get_text(" ")) for td in tr]
                if len(c) >= 2:
                    b.client(e["id"], e["name"], c[0], c[1] if len(c) > 1 else None,
                             _yn(c[2]) if len(c) > 2 else None, None, None, _yn(c[3]) if len(c) > 3 else None)
            for tr in _rows(detail, "lobTab3"):
                c = [clean_ws(td.get_text(" ")) for td in tr]
                if c:
                    b.person(e["id"], e["name"], c[0], "employee", c[1] if len(c) > 1 else None, None, None,
                             _yn(c[2]) if len(c) > 2 else None, parse_date((c[3] if len(c) > 3 else "").split(" ")[0], ["dmy_slash"]))
            for tr in _rows(detail, "lobTab4"):
                c = [clean_ws(td.get_text(" ")) for td in tr]
                if c:
                    owners.append(c[0])
                    b.person(e["id"], e["name"], c[0], "owner", None, None, None, _yn(c[1]) if len(c) > 1 else None,
                             parse_date((c[2] if len(c) > 2 else "").split(" ")[0], ["dmy_slash"]))
        b.lobbyist(e["id"], e["name"], e["trading"], e["abn"], e["status"], None, None, None, e["watch"], None,
                   "; ".join(owners) or None)
        if i % 50 == 0:
            log(f"    {i}/{len(entries)} details")
    return b


def _rows(soup, table_id):
    t = soup.find("table", id=table_id)
    if not t:
        return []
    out = []
    for tr in t.find_all("tr"):
        tds = tr.find_all("td")
        if tds:
            out.append(tds)
    return out


def _yn(s):
    s = (s or "").strip().lower()
    return 1 if s in ("yes", "y", "true", "active") else 0 if s in ("no", "n", "false", "inactive") else None


# ── QLD (Power Pages) ────────────────────────────────────────────────────────

QLD_BASE = "https://lobbyists.integrity.qld.gov.au/Lobbying-Register/"


def fetch_qld(session, limit: int) -> Bundle:
    b = Bundle("qld", "qld_integrity", QLD_BASE)
    lob = PowerPagesGrid(QLD_BASE + "Search-lobbyists/", session=session).fetch_all(entity="dpc_lobbyist")
    cli = PowerPagesGrid(QLD_BASE + "Search-clients/", session=session).fetch_all(entity="dpc_client")
    con = PowerPagesGrid(QLD_BASE + "Search-lobbying-activity/", session=session).fetch_all(
        entity="dpc_contactlog", page_size=5000, max_pages=0 if False else 400)
    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE / "qld_contact_log.json").write_text(json.dumps(con, default=str))
    if limit:
        lob, cli, con = lob[:limit], cli[:limit], con[:limit]
    entities: dict[str, dict] = {}
    for p in lob:
        tn = clean_ws(p.get("dpc_tradingname"))
        if not tn:
            continue
        entities.setdefault(tn, {"people": 0, "former": []})
        former = str(p.get("dpc_formerseniorgovernmentrepresentative", "")).lower() == "yes"
        if former:
            entities[tn]["former"].append(clean_ws(p.get("dpc_lobbyistname")))
        b.person(p.get("dpc_lobbyistid") or p.get("_id"), tn, p.get("dpc_lobbyistname"), "lobbyist",
                 p.get("dpc_position"), 1 if former else 0, None, 1 if str(p.get("statuscode")).lower() == "approved" else None,
                 url=QLD_BASE + "Search-lobbyists/")
    pairs: dict[tuple, dict] = {}
    for c in con:
        d = parse_date(c.get("dpc_datelobbyingcontactoccurred_date"), ["mdy_slash", "dmy_slash", "iso"])
        b.contact(c.get("dpc_contactlogid") or c.get("_id"), d, c.get("dpc_entity"), c.get("dpc_clientsrepresented"),
                  c.get("dpc_representative_mtext"), c.get("dpc_portfolioareas"), c.get("dpc_contactpurpose"),
                  c.get("dpc_contactmode"), url=QLD_BASE + "Search-lobbying-activity/")
        ent = clean_ws(c.get("dpc_entity"))
        if ent:
            entities.setdefault(ent, {"people": 0, "former": []})
            for cl in re.split(r";\s*|\s*\|\s*", clean_ws(c.get("dpc_clientsrepresented")) or ""):
                if cl:
                    k = (ent, cl)
                    pairs.setdefault(k, {"first": d, "last": d})
                    if d:
                        pairs[k]["first"] = min(filter(None, [pairs[k]["first"], d]))
                        pairs[k]["last"] = max(filter(None, [pairs[k]["last"], d]))
    for (ent, cl), dd in pairs.items():
        b.client(_h("qld", ent), ent, cl, None, None, dd["first"], None, None, derived="contact_log",
                 url=QLD_BASE + "Search-lobbying-activity/")
    for name, info in entities.items():
        b.lobbyist(_h("qld", name), name, None, None, "active", None, None, None, None,
                   "; ".join(info["former"]) or None, None, QLD_BASE + "Search-lobbyists/")
    # standalone client list (no lobbyist linkage in the grid) -> keep as unlinked rows
    known = {c[4].lower() for c in b.clients}
    for c in cli:
        nm = clean_ws(c.get("dpc_clientname"))
        if nm and nm.lower() not in known:
            b.client(None, "(unlinked: QLD client list)", nm, None, 1 if str(c.get("statuscode")).lower() == "active" else 0,
                     derived="client_list", url=QLD_BASE + "Search-clients/")
    return b


# ── VIC (VPSC Drupal site) ───────────────────────────────────────────────────

VIC_SITEMAP = "https://www.lobbyists.vic.gov.au/sitemap.xml"


def fetch_vic(session, limit: int) -> Bundle:
    from bs4 import BeautifulSoup
    b = Bundle("vic", "vic_vpsc", "https://www.lobbyists.vic.gov.au/")
    xml = polite_get(session, VIC_SITEMAP).text
    urls = sorted(set(re.findall(r"<loc>(https://www\.lobbyists\.vic\.gov\.au/search-the-register/[^<]+)</loc>", xml)))
    log(f"  vic: {len(urls)} register pages in sitemap")
    if limit:
        urls = urls[:limit]
    for i, url in enumerate(urls, 1):
        try:
            html = polite_get(session, url).text
        except Exception as ex:  # noqa: BLE001
            log(f"    {url}: {ex}"); continue
        # The Ripple theme renders the whole record inside <template> elements;
        # bs4 >= 4.10 excludes template text from get_text(), so unwrap them first.
        html = re.sub(r"</?template\b[^>]*>", "", html)
        soup = BeautifulSoup(html, "lxml")
        slug = url.rstrip("/").rsplit("/", 1)[-1]
        title = clean_ws(soup.find("h1").get_text(" ")) if soup.find("h1") else \
            (clean_ws(soup.title.get_text(" ")).split("|")[0].strip() if soup.title else slug)
        fields = {}
        for h3 in soup.select("h3"):
            label = clean_ws(h3.get_text(" ")).lower()
            nxt = h3.find_next_sibling(["p", "div"])
            if nxt is not None and label in ("official entity name", "australian business number (abn)", "registration", "name", "employer"):
                fields[label] = nxt
        entity = clean_ws(fields["official entity name"].get_text(" ")) if "official entity name" in fields else title
        abn = clean_ws(fields["australian business number (abn)"].get_text(" ")) if "australian business number (abn)" in fields else None
        reg_status, reg_date, upd = None, None, None
        for p in soup.select("p"):
            txt = clean_ws(p.get_text(" "))
            tm = p.find("time")
            if tm is not None and tm.get("datetime"):
                if txt.lower().startswith("updated"):
                    upd = tm["datetime"][:10]
                elif re.match(r"^(registered|deregistered|suspended|cancelled)", txt, re.I):
                    reg_status = txt.split(" ")[0].lower(); reg_date = tm["datetime"][:10]
        owners = []
        for sec in soup.select(".field--name-field-owners .field__item"):
            nm = clean_ws(sec.get_text(" "))
            if nm:
                owners.append(nm); b.person(slug, entity, nm, "owner", url=url)
        for art in soup.select(".field--name-field-employees article"):
            nm_el = art.select_one(".field--name-label")
            pos_el = art.select_one(".field--name-field-contact-title")
            former_p = art.find("p")
            nm = clean_ws(nm_el.get_text(" ")) if nm_el else None
            if nm:
                fr = clean_ws(former_p.get_text(" ")) if former_p else None
                b.person(slug, entity, nm, "employee", clean_ws(pos_el.get_text(" ")) if pos_el else None,
                         1 if fr else 0, fr, url=url)
        former_names = [p[4] for p in b.people if p[2] == slug and p[7] == 1]
        for art in soup.select(".field--name-field-clients article"):
            nm_el = art.select_one(".field--name-label")
            tm = art.find("time")
            nm = clean_ws(nm_el.get_text(" ")) if nm_el else None
            heading = art.find_previous(["h3"])
            current = not (heading and "former" in heading.get_text(" ").lower())
            if nm and nm.lower() != "no clients":  # placeholder card on empty registers
                b.client(slug, entity, nm, None, 1 if current else 0, tm["datetime"][:10] if tm and tm.get("datetime") else None, url=url)
        b.lobbyist(slug, entity, title if title != entity else None, abn, reg_status or "registered", reg_date, upd, None, None,
                   "; ".join(former_names) or None, "; ".join(owners) or None, url)
        if i % 50 == 0:
            log(f"    {i}/{len(urls)} pages")
    return b


# ── SA (Azure API) ───────────────────────────────────────────────────────────

SA_API = "https://saglobbyistapi02prdaue.azurewebsites.net/api"
SA_URL = "https://www.lobbyists.sa.gov.au/"


def fetch_sa(session, limit: int) -> Bundle:
    b = Bundle("sa", "sa_dpc", SA_URL)
    hdrs = {"Accept": "application/json", "Origin": "https://www.lobbyists.sa.gov.au", "Referer": SA_URL}
    lst = polite_get(session, f"{SA_API}/lobbyist", headers=hdrs).json().get("$values", [])
    log(f"  sa: {len(lst)} lobbyists")
    if limit:
        lst = lst[:limit]
    for i, l in enumerate(lst, 1):
        lid = l.get("LobbyistId")
        name = l.get("BusinessName") or l.get("TradingName")
        detail = {}
        try:
            detail = polite_get(session, f"{SA_API}/lobbyist/{lid}", headers=hdrs, delay=0.4).json()
        except Exception:  # noqa: BLE001
            pass
        try:
            clients = polite_get(session, f"{SA_API}/client", headers=hdrs, delay=0.4, params={"lobbyistId": lid}).json().get("$values", [])
        except Exception:  # noqa: BLE001
            clients = []
        try:
            emps = polite_get(session, f"{SA_API}/employee", headers=hdrs, delay=0.4, params={"lobbyistId": lid}).json().get("$values", [])
        except Exception:  # noqa: BLE001
            emps = []
        former = []
        for c in clients:
            b.client(str(lid), name, c.get("Name"), None, 1 if not c.get("EndDate") else 0,
                     (c.get("StartDate") or "")[:10] or None, (c.get("EndDate") or "")[:10] or None)
        for e in emps:
            restr = (e.get("Restriction") or "None")
            is_former = restr.lower() not in ("none", "")
            fr = clean_ws(" ".join(x for x in [restr if is_former else "", e.get("OtherRestrictionDetails") or "",
                                                 e.get("DetailsOrComments") or ""] if x)) or None
            b.person(str(lid), name, e.get("Name"), "employee", e.get("Position"), 1 if is_former else 0, fr,
                     1 if not e.get("EndDate") else 0, (e.get("StartDate") or "")[:10] or None, (e.get("EndDate") or "")[:10] or None)
            if is_former:
                former.append(f"{clean_ws(e.get('Name'))} -- {fr}")
        status = (detail.get("StatusDescription") or l.get("StatusDescription") or l.get("StatusCode") or "").replace("STATUS_", "").lower() or None
        b.lobbyist(str(lid), name, l.get("TradingName"), l.get("Abn"), status, None, (l.get("ModifiedDate") or "")[:10] or None,
                   None, None, "; ".join(former) or None, clean_ws(detail.get("OwnerDetails")) or None, SA_URL)
        if i % 50 == 0:
            log(f"    {i}/{len(lst)}")
    return b


# ── WA (Power Pages, embedded) ───────────────────────────────────────────────

WA_URL = "https://www.lobbyists.wa.gov.au/"


def fetch_wa(session, limit: int) -> Bundle:
    b = Bundle("wa", "wa_psc", WA_URL)
    html = polite_get(session, WA_URL).text
    companies = {}
    for m in re.finditer(r"gridData\.push\(\{\s*name:\s*`([^`]*)`,\s*abn:\s*`([^`]*)`,\s*lastUpdated:\s*'([^']*)',\s*companyId:\s*'([^']*)'", html):
        companies[m.group(4)] = {"name": clean_ws(m.group(1)), "abn": m.group(2), "updated": m.group(3), "lobbyists": [], "clients": [], "owners": []}
    for m in re.finditer(r"company\.companyId == '([0-9a-f-]+)';\s*\}\);\s*if \(companyRow\) \{\s*var (lobbyist|client|owner)Name = `([^`]*)`", html):
        cid, kind, nm = m.group(1), m.group(2), clean_ws(m.group(3))
        if cid in companies and nm:
            companies[cid][kind + "s"].append(nm)
    log(f"  wa: {len(companies)} companies embedded in the register home page")
    items = list(companies.items())
    if limit:
        items = items[:limit]
    for cid, c in items:
        url = f"{WA_URL}searchdetails/?id={cid}"
        for nm in c["lobbyists"]:
            b.person(cid, c["name"], nm, "lobbyist", url=url)
        for nm in c["owners"]:
            b.person(cid, c["name"], nm, "owner", url=url)
        for nm in c["clients"]:
            b.client(cid, c["name"], nm, None, 1, url=url)
        b.lobbyist(cid, c["name"], None, c["abn"], "active", None, parse_date(c["updated"], ["dmy_slash"]), None, None, None,
                   "; ".join(c["owners"]) or None, url)
    return b


FETCHERS = {"federal": fetch_federal, "nsw": fetch_nsw, "qld": fetch_qld, "vic": fetch_vic, "sa": fetch_sa, "wa": fetch_wa}


def main() -> None:
    ap = argparse.ArgumentParser(description="Lobbyist registers -> ext_lobbyists / _clients / _people / _contacts")
    ap.add_argument("--jurisdiction", action="append", choices=sorted(FETCHERS), help="repeatable; default all")
    ap.add_argument("--limit", type=int, default=0, help="cap entities per jurisdiction (sampling)")
    add_writer_args(ap)
    args = ap.parse_args()
    session = make_session()
    writer = writer_from_args(args)
    log(f"lobbyist registers <- {args.jurisdiction or sorted(FETCHERS)} ; writer={writer.describe()}")
    summary = {}
    for jur in args.jurisdiction or sorted(FETCHERS):
        log(f"\n== {jur} ==")
        try:
            b = FETCHERS[jur](session, args.limit)
        except Exception as ex:  # noqa: BLE001
            log(f"  FAILED {jur}: {type(ex).__name__}: {ex}")
            summary[jur] = f"FAILED: {ex}"
            continue
        log(f"  {b.summary()}")
        res = {}
        for table, cols, rows in (("ext_lobbyists", LOB_COLS, b.lobbyists), ("ext_lobbyist_clients", CLI_COLS, b.clients),
                                  ("ext_lobbyist_people", PPL_COLS, b.people), ("ext_lobbyist_contacts", CON_COLS, b.contacts)):
            if not rows and table != "ext_lobbyists":
                continue
            r = writer.replace(table, DDL, cols, rows, source=b.source, notes=f"limit={args.limit}" if args.limit else None)
            res[table] = r.get("inserted")
        summary[jur] = res
    log("\nSummary: " + json.dumps(summary, default=str))


if __name__ == "__main__":
    main()
