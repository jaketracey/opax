"""The committee-hearing ingest: discovery, storing turns, Proof -> Final refresh, matching of stored rows.

No network: pages come from a fake session serving the fixtures in tests/fixtures/committees.
"""
import gzip
import re
import sqlite3
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import unquote

import pytest

from parli.ingest import committee_hearings as ch
from parli.ingest import committee_transcript as ct
from parli.ingest.committee_store import read_cached_page
from parli.schema import get_db

FIX = Path(__file__).parent / "fixtures" / "committees"
BASE = "committees/commrep/29882"


def fixture(name: str) -> str:
    return (FIX / name).read_text(encoding="utf-8")


class FakeResponse:
    def __init__(self, status: int, text: str):
        self.status_code, self.text = status, text

    def raise_for_status(self):
        if self.status_code >= 400:
            raise ch.requests.HTTPError(str(self.status_code))


class FakeHttp:
    """Serves pages by exact URL (a value may be a callable, so a page can change between fetches)."""

    def __init__(self, pages: dict | None = None):
        self.pages = pages or {}
        self.requests = 0
        self.urls: list[str] = []

    def get(self, url, **kw):
        self.requests += 1
        self.urls.append(url)
        val = self.pages.get(url)
        if val is None:
            return FakeResponse(404, "")
        return FakeResponse(200, val() if callable(val) else val)


def hearing_pages(status="Proof", fragment=None):
    return {ct.toc_url(BASE): fixture("toc_proof.html" if status == "Proof" else "toc_final.html"),
            ct.fragment_url(BASE, "0001"): fragment if fragment is not None else fixture("fragment_house.html")}


def house_hearing(**kw):
    return ct.HearingMetadata(hearing_id=BASE, dataset="commrep", committee_name="Standing Committee on Economics",
                              inquiry_title="Review of the Reserve Bank of Australia Annual Report 2025", date="2026-09-18",
                              category="HoR Committee Hansard", fragment_ids=["0001"], **kw)


@pytest.fixture
def db(tmp_path):
    conn = get_db(tmp_path / "scratch.db")
    ch.ensure_schema(conn)
    conn.row_factory = sqlite3.Row
    yield conn
    conn.close()


@pytest.fixture
def cache(tmp_path):
    return ch.FragmentCache(tmp_path / "cache")


def sync(db, cache, pages, hearing=None, refresh=False, seen=None):
    return ch.sync_hearing(FakeHttp(pages), db, cache, hearing or house_hearing(), seen or ch.build_dedup_index(db), refresh=refresh)


def rows(db):
    return db.execute("SELECT * FROM speeches WHERE source = 'committee_house' ORDER BY speech_id").fetchall()


# ---- discovery -------------------------------------------------------------------------------------------------------

def listing_html(entries, total):
    lis = "".join(
        f'<li class="result"><div class="sumLink"><a href="x">{c} : {d.strftime("%d/%m/%Y")} : {i} :</a> '
        f'<span class="cat">[HoR Committee Hansard]</span></div><div class="sumMeta">ID: committees/commrep/{n}/{f}</div></li>'
        for (n, f, d, c, i) in entries)
    return f'<div class="resultsSummaryNav">Summary results: 1-{len(entries)} of {total}&#160;matches.</div><ul>{lis}</ul>'


class ListingHttp:
    """A fake ParlInfo listing over a fixed set of fragment results, honouring the date window and page size."""

    def __init__(self, entries):
        self.entries = entries          # (hearing_num, fragment, date, committee, inquiry)
        self.requests = 0

    def get(self, url, **kw):
        self.requests += 1
        q = unquote(url)
        m = re.search(r"Date:(\d\d)/(\d\d)/(\d{4}) >> (\d\d)/(\d\d)/(\d{4})", q)
        start = date(int(m[3]), int(m[2]), int(m[1]))
        end = date(int(m[6]), int(m[5]), int(m[4]))
        size = int(re.search(r"resCount=(\d+)", q)[1])
        page = int(re.search(r"page=(\d+)", q)[1])
        hits = [e for e in self.entries if start <= e[2] <= end]
        chunk = hits[page * size:(page + 1) * size]
        return FakeResponse(200, listing_html(chunk, len(hits)))


def test_a_window_with_more_results_than_a_page_is_halved_until_everything_is_found():
    days = [date(2026, 9, 1) + timedelta(days=i) for i in range(10)]
    entries = [(100 + i, f, d, "Standing Committee on Economics", "Inquiry") for i, d in enumerate(days) for f in ("0000", "0001")]
    http = ListingHttp(entries)
    hearings = ch.discover_from_listing(http, days[0], days[-1], res_count=5)
    assert len(hearings) == 10 and http.requests > 4
    assert sorted(h.hearing_id for h in hearings) == sorted(f"committees/commrep/{100 + i}" for i in range(10))
    assert all(h.fragment_ids == ["0001"] for h in hearings)


def test_a_window_that_fits_one_page_is_one_request():
    http = ListingHttp([(1, "0000", date(2026, 9, 2), "C", "I"), (1, "0001", date(2026, 9, 2), "C", "I")])
    assert len(ch.discover_from_listing(http, date(2026, 9, 1), date(2026, 9, 30))) == 1 and http.requests == 1


def test_one_day_with_more_results_than_a_page_is_paged_through():
    d = date(2026, 9, 2)
    entries = [(n, "0001", d, "C", "I") for n in range(1, 8)]
    http = ListingHttp(entries)
    hearings = ch.discover_from_listing(http, d, d, res_count=3)
    assert len(hearings) == 7


def test_three_refusals_in_a_row_stop_the_run_instead_of_hammering_parlinfo():
    class Refuser:
        headers = {}

        def get(self, url, **kw):
            return FakeResponse(403, "")

    http = ch.RateLimitedSession(rate_limit=0, session=Refuser(), sleep=lambda s: None)
    assert http.get("https://x").status_code == 403 and http.get("https://x").status_code == 403
    with pytest.raises(ch.SourceBlocked):
        http.get("https://x")


def test_network_errors_and_5xx_are_retried_then_raised():
    calls = []

    class Flaky:
        headers = {}

        def get(self, url, **kw):
            calls.append(url)
            if len(calls) < 3:
                raise ch.requests.ConnectionError("boom")
            return FakeResponse(200, "ok")

    http = ch.RateLimitedSession(rate_limit=0, session=Flaky(), sleep=lambda s: None)
    assert http.get("https://x").text == "ok" and len(calls) == 3


def test_page_text_reads_utf8_even_when_requests_would_guess_latin1():
    body = "Zoë Daniel — “quoted”".encode("utf-8")
    resp = type("R", (), {"content": body, "text": body.decode("latin-1")})()
    assert ch.page_text(resp) == "Zoë Daniel — “quoted”" and resp.text != ch.page_text(resp)
    assert ch.page_text(FakeResponse(200, "plain")) == "plain"          # a response with no bytes falls back to .text


# ---- storing a new hearing -------------------------------------------------------------------------------------------

def test_a_new_house_hearing_is_stored_with_source_chamber_status_and_speaker_fields(db, cache):
    r = sync(db, cache, hearing_pages())
    assert r.is_new and r.inserted == 8 and r.fragments_ok == 1 and r.status == "Proof" and not r.failed_fragments
    rs = rows(db)
    assert len(rs) == 8
    assert {x["chamber"] for x in rs} == {"house_committee"} and {x["state"] for x in rs} == {"federal"}
    assert {x["hearing_id"] for x in rs} == {BASE + "/0001"} and {x["date"] for x in rs} == {"2026-09-18"}
    assert {x["topic"] for x in rs} == {"Standing Committee on Economics - Review of the Reserve Bank of Australia Annual Report 2025"}
    kennedy = next(x for x in rs if x["speaker_name"] == "Mr KENNEDY")
    assert (kennedy["speaker_type"], kennedy["handbook_id"], kennedy["person_id"]) == ("member", "267506", None)
    bullock = next(x for x in rs if x["speaker_name"] == "Ms Bullock")
    assert (bullock["speaker_type"], bullock["witness_name"], bullock["handbook_id"]) == ("witness", "Ms Bullock", None)
    assert {x["hearing_type"] for x in rs} == {"committee"}
    h = db.execute("SELECT * FROM ext_committee_hearings WHERE hearing_base = ?", (BASE,)).fetchone()
    assert (h["status"], h["dataset"], h["parser_version"], h["fragments_expected"], h["fragments_ok"], h["refresh_count"]) == (
        "Proof", "commrep", 2, 1, 1, 0)
    assert h["content_hash"] and h["first_seen"] and h["last_checked"]
    assert db.execute("SELECT COUNT(*) FROM ext_committee_fragments WHERE hearing_base = ?", (BASE,)).fetchone()[0] == 1


def test_the_witness_list_becomes_the_hearings_attendance_rows(db, cache):
    sync(db, cache, hearing_pages())
    att = db.execute("SELECT name, surname, position, organisation, kind, fragment FROM ext_committee_attendance "
                     "WHERE hearing_base = ? ORDER BY seq", (BASE,)).fetchall()
    assert [(a["name"], a["position"], a["organisation"], a["kind"], a["fragment"]) for a in att][:2] == [
        ("Michele Bullock", "Governor", "Reserve Bank of Australia", "witness", "0001"),
        ("Andrew Hauser", "Deputy Governor", "Reserve Bank of Australia", "witness", "0001")]


def test_pages_are_cached_gzipped_where_committee_witnesses_looks(db, cache, tmp_path):
    sync(db, cache, hearing_pages())
    assert (tmp_path / "cache" / "committees-commrep-29882-0001.html.gz").exists()
    assert read_cached_page(tmp_path / "cache", BASE, "0001") == fixture("fragment_house.html")
    assert "Proof" in gzip.decompress((tmp_path / "cache" / "committees-commrep-29882-0000.html.gz").read_bytes()).decode()


def test_syncing_again_adds_nothing_and_does_not_duplicate(db, cache):
    sync(db, cache, hearing_pages())
    seen = ch.build_dedup_index(db)
    r = ch.sync_hearing(FakeHttp(hearing_pages()), db, cache, house_hearing(), seen, refresh=True)
    assert (r.inserted, r.updated, r.unchanged_fragments, r.is_new) == (0, 0, 1, False)
    assert len(rows(db)) == 8
    h = db.execute("SELECT refresh_count, last_changed FROM ext_committee_hearings WHERE hearing_base = ?", (BASE,)).fetchone()
    assert h["refresh_count"] == 1 and h["last_changed"] is None
    assert db.execute("SELECT COUNT(*) FROM committee_kb_queue").fetchone()[0] == 0


def test_a_fragment_that_cannot_be_fetched_marks_the_hearing_incomplete_and_it_is_retried(db, cache):
    pages = hearing_pages()
    del pages[ct.fragment_url(BASE, "0001")]
    r = sync(db, cache, pages)
    assert r.failed_fragments == ["0001"] and r.inserted == 0
    h = db.execute("SELECT fragments_expected, fragments_ok, content_hash FROM ext_committee_hearings WHERE hearing_base = ?", (BASE,)).fetchone()
    assert (h["fragments_expected"], h["fragments_ok"], h["content_hash"]) == (1, 0, None)
    db.execute("UPDATE ext_committee_hearings SET last_checked = '2000-01-01T00:00:00Z'")
    assert [c.hearing_id for c in ch.refresh_candidates(db)] == [BASE]
    r2 = ch.sync_hearing(FakeHttp(hearing_pages()), db, cache, house_hearing(), ch.build_dedup_index(db), refresh=True)
    assert r2.inserted == 8 and not r2.failed_fragments


# ---- Proof -> Final --------------------------------------------------------------------------------------------------

def test_a_final_transcript_that_edits_a_turn_updates_that_row_in_place_and_queues_a_text_patch(db, cache):
    sync(db, cache, hearing_pages("Proof"))
    before = {x["speech_id"]: x["text"] for x in rows(db)}
    edited = fixture("fragment_house.html").replace("consequential time", "very consequential time")
    r = sync(db, cache, hearing_pages("Final", edited), refresh=True)
    assert (r.inserted, r.updated, r.relabelled, r.status, r.status_changed) == (0, 1, 0, "Final", True)
    after = {x["speech_id"]: x["text"] for x in rows(db)}
    assert after.keys() == before.keys()                                  # same speech ids: the KB slugs do not move
    changed = [i for i in after if after[i] != before[i]]
    assert len(changed) == 1 and "very consequential time" in after[changed[0]]
    row = db.execute("SELECT word_count, text_clean, text_clean_rules FROM speeches WHERE speech_id = ?", (changed[0],)).fetchone()
    assert row["word_count"] == len(after[changed[0]].split()) and row["text_clean"] is None and row["text_clean_rules"] is None
    q = db.execute("SELECT speech_id, op, reason, done_at FROM committee_kb_queue").fetchall()
    assert [(x["speech_id"], x["op"], x["reason"], x["done_at"]) for x in q] == [(changed[0], "patch", "proof_to_final", None)]
    h = db.execute("SELECT status, final_seen, last_changed, refresh_count FROM ext_committee_hearings WHERE hearing_base = ?", (BASE,)).fetchone()
    assert h["status"] == "Final" and h["final_seen"] and h["last_changed"] and h["refresh_count"] == 1


def test_an_unreadable_toc_does_not_erase_the_recorded_status(db, cache):
    sync(db, cache, hearing_pages("Final"))
    pages = hearing_pages("Final")
    del pages[ct.toc_url(BASE)]
    r = sync(db, cache, pages, hearing=house_hearing(), refresh=True)
    assert r.status == "Final" and not r.status_changed
    assert db.execute("SELECT status FROM ext_committee_hearings").fetchone()[0] == "Final"


def test_a_final_that_only_changes_status_updates_the_status_and_nothing_else(db, cache):
    sync(db, cache, hearing_pages("Proof"))
    r = sync(db, cache, hearing_pages("Final"), refresh=True)
    assert (r.updated, r.inserted, r.status_changed) == (0, 0, True)
    assert db.execute("SELECT status FROM ext_committee_hearings").fetchone()[0] == "Final"
    assert db.execute("SELECT COUNT(*) FROM committee_kb_queue").fetchone()[0] == 0


def test_a_turn_the_final_adds_is_inserted_as_a_new_row_and_the_others_are_untouched(db, cache):
    sync(db, cache, hearing_pages("Proof"))
    before = {x["speech_id"]: x["text"] for x in rows(db)}
    extra = ('<p class="HPS-Normal"><span class="HPS-Normal"><span class="HPS-WitnessName">Ms Bullock</span>'
             '<span class="HPS-GeneralBold">:</span> A closing answer the Proof transcript did not carry, long enough to be kept as a row.</span></p>')
    page = fixture("fragment_house.html").replace("</div></div></div></body>", extra + "</div></div></div></body>")
    r = sync(db, cache, hearing_pages("Final", page), refresh=True)
    assert (r.inserted, r.updated) == (1, 0)
    assert {x["speech_id"]: x["text"] for x in rows(db) if x["speech_id"] in before} == before
    assert len(rows(db)) == 9


def test_a_corrected_speaker_label_relabels_the_row_and_clears_what_resolve_had_worked_out(db, cache):
    sync(db, cache, hearing_pages("Proof"))
    db.execute("UPDATE speeches SET person_id = NULL, speaker_name_clean = 'Simon Kennedy', witness_position = NULL WHERE speaker_name = 'Mr KENNEDY'")
    db.commit()
    page = fixture("fragment_house.html").replace("Mr KENNEDY:", "Mr KENNEDEY:").replace("267506", "999999")
    r = sync(db, cache, hearing_pages("Final", page), refresh=True)
    assert (r.updated, r.relabelled, r.inserted) == (1, 1, 0)
    row = db.execute("SELECT speaker_name, handbook_id, speaker_name_clean, person_id FROM speeches WHERE speaker_name LIKE 'Mr KENNED%'").fetchall()
    assert [(x["speaker_name"], x["handbook_id"], x["speaker_name_clean"], x["person_id"]) for x in row] == [("Mr KENNEDEY", "999999", None, None)]


def _without(page: str, label_text: str) -> str:
    return re.sub(r'<p class="HPS-Normal"[^>]*>(?:(?!</p>).)*?' + label_text + r'.*?</p>', "", page, count=1, flags=re.S)


def test_a_turn_the_final_drops_is_deleted_here_and_queued_for_the_box(db, cache):
    sync(db, cache, hearing_pages("Proof"))
    gregg = db.execute("SELECT speech_id FROM speeches WHERE speaker_name = 'Mr GREGG'").fetchone()[0]
    r = sync(db, cache, hearing_pages("Final", _without(fixture("fragment_house.html"), "Mr GREGG:")), refresh=True)
    assert (r.orphaned, r.deleted, r.updated, r.delete_refused) == (1, 1, 0, 0)
    assert len(rows(db)) == 7 and not db.execute("SELECT 1 FROM speeches WHERE speech_id = ?", (gregg,)).fetchone()
    q = db.execute("SELECT speech_id, op, reason FROM committee_kb_queue").fetchall()
    assert [(x["speech_id"], x["op"], x["reason"]) for x in q] == [(gregg, "delete", "turn absent from the Final")]


def test_a_reparse_that_would_drop_most_of_a_fragment_deletes_nothing(db, cache):
    sync(db, cache, hearing_pages("Proof"))
    stump = fixture("fragment_house.html")
    for name in ("Mr GREGG:", "Mr KENNEDY:", "Mr Hauser", "Ms Bullock"):
        stump = _without(stump, name) if name != "Ms Bullock" else re.sub(r'<p class="HPS-Normal"[^>]*>(?:(?!</p>).)*?Ms Bullock.*?</p>', "", stump, flags=re.S)
    r = sync(db, cache, hearing_pages("Final", stump), refresh=True)
    assert r.delete_refused == 1 and r.deleted == 0 and len(rows(db)) == 8
    assert db.execute("SELECT COUNT(*) FROM committee_kb_queue").fetchone()[0] == 0


def test_stored_rows_from_the_older_ingest_are_adopted_not_duplicated(db, cache):
    """The pre-2026-09-29 parser left the label and entities in the text and set no speaker_type or handbook id."""
    for t in ct.parse_fragment(fixture("fragment_house.html"), house_hearing(), "0001"):
        legacy_text = f"&#10; &#10; {t.speaker_name}: {t.text}".replace("\n\n", " ")
        db.execute(
            "INSERT INTO speeches (speaker_name, chamber, date, topic, text, word_count, source, state, hearing_type, hearing_id) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (t.speaker_name, "house_committee", t.date, "old topic", legacy_text, 1, "committee_house", "federal", "committee",
             t.hearing_id))
    db.commit()
    assert len(rows(db)) == 8
    seen = ch.build_dedup_index(db)
    r = ch.sync_hearing(FakeHttp(hearing_pages("Final")), db, cache, house_hearing(), seen, refresh=True)
    assert (r.inserted, r.updated, r.orphaned, r.deleted) == (0, 0, 0, 0)          # same words, different formatting: nothing to change
    assert db.execute("SELECT parser_version FROM ext_committee_hearings").fetchone()[0] == 1
    edited = fixture("fragment_house.html").replace("consequential time", "very consequential time")
    r2 = ch.sync_hearing(FakeHttp(hearing_pages("Final", edited)), db, cache, house_hearing(), seen, refresh=True)
    assert (r2.inserted, r2.updated) == (0, 1) and len(rows(db)) == 8
    # a legacy row the current transcript does not contain is left alone: the older parser's rows are never deleted
    db.execute("INSERT INTO speeches (speaker_name, chamber, date, topic, text, word_count, source, state, hearing_type, hearing_id) "
               "VALUES ('UNKNOWN','house_committee','2026-09-18','t','In Attendance Ms A, Mr B, and the officials of several agencies',9,'committee_house','federal','committee',?)",
               (BASE + "/0001",))
    db.commit()
    edited_again = fixture("fragment_house.html").replace("consequential time", "highly consequential time")
    r3 = ch.sync_hearing(FakeHttp(hearing_pages("Final", edited_again)), db, cache, house_hearing(), seen, refresh=True)
    assert (r3.orphaned, r3.deleted) == (1, 0) and len(rows(db)) == 9


# ---- matching stored rows to a re-parse ------------------------------------------------------------------------------

def rec(name, text):
    return ct.SpeechRecord(name, "member", text, BASE + "/0001", "C", "2026-09-18", "t", "commrep")


def stored(i, name, text):
    return {"speech_id": i, "speaker_name": name, "text": text}


def test_align_pairs_identical_turns_edited_turns_and_corrected_labels():
    a = "The RBA has increased the cash rate by 75 basis points during 2026, taking it to 4.35 per cent."
    b = "Thank you, Chair, and apologies for not being there in person; I had things in the diary already."
    c = "Could I add one thing, Chair, about the payments system and how the reserve bank thinks of it."
    stored_rows = [stored(1, "Mr KENNEDY", a), stored(2, "Ms Bullock", b), stored(3, "Mr GREGG", c)]
    turns = [rec("Mr KENNEDY", a),                                             # identical
             rec("Ms Bullock", b.replace("apologies", "my apologies")),          # edited text
             rec("Mr GREG", c),                                                # corrected label, same words
             rec("Ms New", "A turn that has no stored row at all, in a fragment the Final expanded.")]
    pairs = ch.align(stored_rows, turns)
    got = [(s["speech_id"] if s else None, t.speaker_name if t else None) for s, t in pairs]
    assert got == [(1, "Mr KENNEDY"), (2, "Ms Bullock"), (3, "Mr GREG"), (None, "Ms New")]


def test_align_reports_stored_rows_with_no_turn_as_orphans_and_prefers_the_same_speaker():
    x = "First long paragraph of the answer, with plenty of words so that similarity is meaningful here."
    y = "Second long paragraph of the answer, with plenty of other words so that similarity stays meaningful."
    pairs = ch.align([stored(1, "Ms A", x), stored(2, "Ms B", y), stored(3, "Ms A", "an unrelated turn that vanished from the transcript entirely")],
                     [rec("Ms B", y + " Plus an edit."), rec("Ms A", x)])
    assert [(s["speech_id"] if s else None, t.speaker_name if t else None) for s, t in pairs] == [(2, "Ms B"), (1, "Ms A"), (3, None)]


def test_norm_text_strips_the_legacy_speaker_prefix_entities_and_trailing_procedure():
    assert ch.norm_text("&#10; &#10; CHAIR (Mr Husic): Welcome all. Committee adjourned at 12:30", "CHAIR") == "Welcome all."
    assert ch.norm_text("Mr West&#10; : I'd need to take that on notice", "Mr West") == "I'd need to take that on notice"
    assert ch.norm_text("Senator SHOEBRIDGE: What &#8212; exactly?", "Senator SHOEBRIDGE") == "What — exactly?"
    assert ch.norm_text("plain text", "Ms A") == "plain text"


# ---- which hearings are due ------------------------------------------------------------------------------------------

def _hearing_row(db, base, status, first_seen, last_checked, expected=1, ok=1):
    db.execute("INSERT INTO ext_committee_hearings (hearing_base, dataset, hearing_date, status, fragments_expected, fragments_ok, "
               "first_seen, last_checked) VALUES (?,?,?,?,?,?,?,?)", (base, "commrep", "2026-09-01", status, expected, ok, first_seen, last_checked))


def test_refresh_candidates_are_proofs_due_weekly_for_sixty_days_and_never_finals(db):
    now = datetime(2026, 9, 29, tzinfo=timezone.utc)

    def ago(days):
        return (now - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")

    _hearing_row(db, "committees/commrep/1", "Proof", ago(20), ago(8))            # due
    _hearing_row(db, "committees/commrep/2", "Proof", ago(20), ago(2))            # checked this week
    _hearing_row(db, "committees/commrep/3", "Final", ago(20), ago(30))           # final: never
    _hearing_row(db, "committees/commrep/4", "Proof", ago(70), ago(30))           # seen more than 60 days ago: given up on
    _hearing_row(db, "committees/commrep/5", None, ago(10), None)                 # status unknown, never re-checked: due
    _hearing_row(db, "committees/commrep/6", "Final", ago(10), ago(3), expected=4, ok=3)   # incomplete: retried daily
    _hearing_row(db, "committees/commrep/7", "Final", ago(10), ago(0), expected=4, ok=3)   # incomplete but tried today
    got = sorted(h.hearing_id for h in ch.refresh_candidates(db, now=now))
    assert got == ["committees/commrep/1", "committees/commrep/5", "committees/commrep/6"]


# ---- the command line ------------------------------------------------------------------------------------------------

class CliHttp(FakeHttp):
    """One listing page holding the house fixture hearing, plus its TOC and fragment."""

    def __init__(self):
        super().__init__(hearing_pages())
        self.listing = listing_html([(29882, "0000", date(2026, 9, 18), "Standing Committee on Economics",
                                      "Review of the Reserve Bank of Australia Annual Report 2025"),
                                     (29882, "0001", date(2026, 9, 18), "Standing Committee on Economics",
                                      "Review of the Reserve Bank of Australia Annual Report 2025")], 2)

    def get(self, url, **kw):
        if "summary.w3p" in url:
            self.requests += 1
            self.urls.append(url)
            return FakeResponse(200, self.listing)
        return super().get(url, **kw)


def test_the_command_with_no_arguments_discovers_ingests_and_is_idempotent(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(ch, "RateLimitedSession", lambda: CliHttp())
    monkeypatch.setenv("OPAX_COMMITTEES_SINCE", "2026-09-01")
    monkeypatch.delenv("OPAX_SYNC_KB", raising=False)
    args = ["--db", str(tmp_path / "cli.db"), "--cache-dir", str(tmp_path / "cache"), "--until", "2026-09-30"]
    assert ch.main(args) == 0
    assert "8 speeches inserted" in capsys.readouterr().out
    assert ch.main(args) == 0
    out = capsys.readouterr().out
    assert "0 speeches inserted" in out and "Will sync 0 hearings" in out
    conn = sqlite3.connect(tmp_path / "cli.db")
    assert conn.execute("SELECT COUNT(*) FROM speeches WHERE source = 'committee_house'").fetchone()[0] == 8


def test_dry_run_writes_nothing(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(ch, "RateLimitedSession", lambda: CliHttp())
    args = ["--db", str(tmp_path / "dry.db"), "--cache-dir", str(tmp_path / "cache"), "--since", "2026-09-01", "--until", "2026-09-30", "--dry-run"]
    assert ch.main(args) == 0
    assert "new     committees/commrep/29882" in capsys.readouterr().out
    conn = sqlite3.connect(tmp_path / "dry.db")
    assert conn.execute("SELECT COUNT(*) FROM speeches").fetchone()[0] == 0


def test_the_set_flag_limits_the_datasets_asked_for(tmp_path, monkeypatch):
    http = CliHttp()
    monkeypatch.setattr(ch, "RateLimitedSession", lambda: http)
    ch.main(["--db", str(tmp_path / "s.db"), "--cache-dir", str(tmp_path / "c"), "--since", "2026-09-01", "--until", "2026-09-30",
             "--set", "commjnt", "--dry-run"])
    listing_urls = [u for u in http.urls if "summary.w3p" in u]
    assert listing_urls and all("Dataset%3Acommjnt%20Date" in u for u in listing_urls)


def test_the_hearing_flag_syncs_only_that_hearing_without_asking_for_a_listing(tmp_path, monkeypatch, capsys):
    http = CliHttp()
    monkeypatch.setattr(ch, "RateLimitedSession", lambda: http)
    args = ["--db", str(tmp_path / "h.db"), "--cache-dir", str(tmp_path / "c"), "--hearing", BASE]
    assert ch.main(args) == 0
    assert not [u for u in http.urls if "summary.w3p" in u]
    conn = sqlite3.connect(tmp_path / "h.db")
    assert conn.execute("SELECT COUNT(*) FROM speeches WHERE source = 'committee_house'").fetchone()[0] == 8
    assert conn.execute("SELECT status, committee_name FROM ext_committee_hearings").fetchone() == ("Proof", "Standing Committee on Economics")
    with pytest.raises(SystemExit):
        ch.main(["--db", str(tmp_path / "h.db"), "--hearing", "not-a-hearing"])
