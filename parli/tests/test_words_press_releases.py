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
