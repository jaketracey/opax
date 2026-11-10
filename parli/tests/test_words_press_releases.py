"""PM Transcripts titles: decoded once at fetch and again when an older stored row is mapped
for the knowledge box (speeches-press-005)."""
import sqlite3

from parli.ingest import words_press_releases as words

PMT_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<response><item>
  <title><![CDATA[Doorstop - The Royal Children&#039;s Hospital, Melbourne]]></title>
  <prime-minister>Albanese, Anthony</prime-minister>
  <field_date>2026-03-04</field_date>
  <release-type>Doorstop</release-type>
  <content><![CDATA[<p>PRIME MINISTER: It&#039;s good to be here.</p>]]></content>
</item></response>"""


class FakeResponse:
    status_code = 200
    content = PMT_XML


class FakeSession:
    def get(self, url):
        assert url == words.PMT_QUERY.format(id=47226)
        return FakeResponse()


def test_fetch_decodes_the_cdata_title_the_api_returns_encoded():
    row = words.fetch_pm_transcript(FakeSession(), 47226)
    assert row["title"] == "Doorstop - The Royal Children's Hospital, Melbourne"
    assert row["speaker"] == "Anthony Albanese"


def stored(source, title, body="PRIME MINISTER: It's good to be here. " * 8):
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.execute("""CREATE TABLE r (source, source_id, url, date, title, body_text, speaker, role, party,
                  jurisdiction, release_type, government, subjects, document_url, licence, speaker_raw, extra_json)""")
    db.execute("INSERT INTO r VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
               (source, "47226", "https://pmtranscripts.pmc.gov.au/release/transcript-47226", "2026-03-04", title, body,
                "Anthony Albanese", "Prime Minister", "ALP", "federal", "Doorstop", None, None, None, "CC BY 4.0", None, None))
    return db.execute("SELECT * FROM r").fetchone()


def test_mapping_an_older_stored_title_publishes_it_decoded():
    body = words.map_press_release(stored("pmtranscripts", "International Women&#039;s Day &amp; &quot;Equal Pay&quot;"))
    assert body["title"] == 'Anthony Albanese — International Women\'s Day & "Equal Pay" — 2026-03-04'
    assert body["extra"]["metadata"]["headline"] == 'International Women\'s Day & "Equal Pay"'
    assert body["texts"]["body"]["body"].startswith('International Women\'s Day & "Equal Pay"\n\n')


def test_mapping_leaves_other_sources_and_clean_titles_alone():
    assert words.map_press_release(stored("pmtranscripts", "Doorstop - Canberra"))["extra"]["metadata"]["headline"] == "Doorstop - Canberra"
    row = stored("pmtranscripts", "Q&A")
    assert words.map_press_release(row)["extra"]["metadata"]["headline"] == "Q&A"


# premier.vic.gov.au (speeches-press-014): a title that names the Premier as author takes the
# Premier in office on the date; other unattributed releases stay unattributed.
class VicResponse:
    status_code = 200

    def __init__(self, payload):
        self.payload = payload

    def json(self):
        return self.payload


class VicSession:
    def __init__(self, title, date, body="<p>The Victorian Government will build the line.</p>"):
        self.payload = {"type": "news", "title": title, "published": date, "body": {"content": body}}

    def get(self, url):
        return VicResponse(self.payload)


def vic(title, date, body=None):
    session = VicSession(title, date) if body is None else VicSession(title, date, body)
    return words.fetch_vic_page(session, "statement-premier-179")


def test_vic_title_naming_the_premier_takes_the_premier_in_office():
    # The four records the verifier confirmed, with the Premier Victorian Hansard lists for the date.
    for title, date, premier in [
        ("Statement From The Premier", "2019-06-17", "Daniel Andrews"),
        ("Statement From The Premier On Western Renewables Link", "2026-09-15", "Ben Carroll"),
        ("Premier’s Speech to Police Association of Victoria", "2026-09-17", "Ben Carroll"),
        ("Statement From The Premier", "2026-09-19", "Ben Carroll"),
    ]:
        row = vic(title, date)
        assert (row["speaker"], row["role"], row["party"]) == (premier, "Premier", "Labor"), title
        assert row["speaker_raw"] is None
        assert '"speaker_from": "title"' in row["extra_json"]


def test_vic_government_changes_to_carroll_on_28_july_2026():
    assert words.government_for("vic", "2026-07-27") == ("Allan (Labor)", "Labor")
    assert words.government_for("vic", "2026-07-28") == ("Carroll (Labor)", "Labor")
    assert words.government_for("vic", "2023-09-26") == ("Andrews (Labor)", "Labor")


def test_vic_titles_that_name_no_author_stay_unattributed():
    for title in ["Statement On The North Richmond Housing Estate", "Statement On Bob Hawke",
                  "Taking More Trucks Off Busy Local Roads", "Premier Opens New School"]:
        row = vic(title, "2026-09-18")
        assert (row["speaker"], row["role"], row["party"]) == (None, None, None), title


def test_vic_attributable_line_still_wins_and_old_premiers_get_the_office_only():
    row = vic("Statement From The Premier", "2026-09-19",
              "<p>Text.</p><p>Quotes attributable to Minister for Health Ingrid Stitt</p>")
    assert (row["speaker"], row["role"]) == ("Ingrid Stitt", "Minister for Health")
    # Brumby is not in the checked full-name table, so only the office is set.
    row = vic("Statement From The Premier", "2009-05-01")
    assert (row["speaker"], row["role"], row["party"]) == (None, "Premier", None)
