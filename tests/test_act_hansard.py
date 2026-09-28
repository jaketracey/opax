"""ACT Legislative Assembly Hansard loader (parli.ingest.act_hansard).

Run with: python -m unittest tests.test_act_hansard   (or pytest tests/test_act_hansard.py)

The PDFs here are generated in the test (standard PDF fonts, one Times/Arial style set like the
Assembly's Word exports), so nothing is copied from the Assembly's site; the shapes they copy
are the ones the parser depends on: a bold Times speaker label, a bold Arial heading, an italic
stage direction, a running header and a page-number footer.
"""
import io
import sqlite3
import unittest
import urllib.error
from datetime import date

try:
    import pdfminer  # noqa: F401
    HAVE_PDFMINER = True
except ImportError:  # pragma: no cover
    HAVE_PDFMINER = False

from parli.ingest import act_hansard as act

FONTS = {"T": "Times-Roman", "B": "Times-Bold", "H": "Helvetica-Bold", "I": "Times-Italic"}


def make_pdf(pages: list[list[tuple]]) -> bytes:
    """pages -> a PDF. Each line is (kind, text) or (kind, text, rest): kind 'H1'/'H2' heading,
    'L' label (bold `text`, regular `rest`), 'P' body, 'Q' 11pt quote, 'I' italic, 'GAP' vertical gap."""
    objs: list[bytes] = []

    def add(b: bytes) -> int:
        objs.append(b)
        return len(objs)

    font_ids = {}
    for key, name in FONTS.items():
        font_ids[key] = add(f"<< /Type /Font /Subtype /Type1 /BaseFont /{name} /Encoding /WinAnsiEncoding >>".encode())
    page_ids = []
    content_ids = []
    for lines in pages:
        y = 760.0
        ops = ["BT"]
        # running header and footer
        ops += [f"/F4 12 Tf 1 0 0 1 90 800 Tm (Legislative Assembly for the ACT) Tj",
                f"/F4 12 Tf 1 0 0 1 430 800 Tm (18 March 2025) Tj",
                f"/F1 12 Tf 1 0 0 1 289 35 Tm ({100 + len(page_ids)}) Tj"]
        for ln in lines:
            kind = ln[0]
            if kind == "GAP":
                y -= 14
                continue
            text = ln[1].replace("(", "\\(").replace(")", "\\)")
            if kind in ("H1", "H2"):
                size = 14 if kind == "H1" else 12
                ops.append(f"/F3 {size} Tf 1 0 0 1 90 {y:.1f} Tm ({text}) Tj")
            elif kind == "L":
                rest = ln[2].replace("(", "\\(").replace(")", "\\)")
                ops.append(f"/F2 12 Tf 1 0 0 1 90 {y:.1f} Tm ({text}) Tj")
                ops.append(f"/F1 12 Tf 1 0 0 1 {90 + 9.5 * len(ln[1]) + 6:.1f} {y:.1f} Tm ({rest}) Tj")
            elif kind == "I":
                ops.append(f"/F4 12 Tf 1 0 0 1 90 {y:.1f} Tm ({text}) Tj")
            elif kind == "Q":
                ops.append(f"/F1 11 Tf 1 0 0 1 118 {y:.1f} Tm ({text}) Tj")
            else:
                ops.append(f"/F1 12 Tf 1 0 0 1 90 {y:.1f} Tm ({text}) Tj")
            y -= 13.8
        ops.append("ET")
        stream = "\n".join(ops).encode("cp1252")
        content_ids.append(add(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream"))
    fonts = " ".join(f"/F{i + 1} {font_ids[k]} 0 R" for i, k in enumerate(["T", "B", "H", "I"]))
    pages_id = len(objs) + len(pages) + 1
    for cid in content_ids:
        page_ids.append(add(
            f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 595 842] /Contents {cid} 0 R "
            f"/Resources << /Font << {fonts} >> >> >>".encode()))
    assert add(("<< /Type /Pages /Kids [%s] /Count %d >>" % (" ".join(f"{p} 0 R" for p in page_ids), len(page_ids))).encode()) == pages_id
    cat = add(f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode())
    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(out.tell())
        out.write(f"{i} 0 obj\n".encode() + o + b"\nendobj\n")
    xref = out.tell()
    out.write(f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode())
    for off in offsets:
        out.write(f"{off:010d} 00000 n \n".encode())
    out.write(f"trailer\n<< /Size {len(objs) + 1} /Root {cat} 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return out.getvalue()


def day_pdf(*, extra_turn: bool = False, edited: bool = False, drop_last: bool = False) -> bytes:
    steel = ("It is important that we have a strong regulatory system to deliver the quality buildings "
             "that Canberrans deserve. But we do want to make sure that the industry has the support "
             "and tools they need to get the job done.")
    if edited:
        steel = steel.replace("Canberrans deserve", "Canberrans expect")
    p1 = [
        ("H1", "Tuesday, 18 March 2025"),
        ("L", "MR SPEAKER", " (Mr Parton) (10.01): Members: Dhawura nguna, dhawura Ngunnawal."),
        ("GAP",),
        ("H1", "Petition"),
        ("H2", "Motion to take note of petition"),
        ("L", "MR PARTON", " (Brindabella) (10.03): As the shadow minister for construction last term I developed"),
        ("P", "a keen interest in this area and the people who work in it, who are sick of imaginary walls."),
        ("GAP",),
        ("P", "To those who are in the gallery: thank you so much for turning up and getting your hands dirty."),
        ("GAP",),
        ("L", "MR STEEL", " (Murrumbidgee—Treasurer, Minister for Planning and Heritage) (10.06): " + steel[:59]),
        ("P", steel[59:]),
        ("GAP",),
        ("I", "Members interjecting—"),
        ("GAP",),
        ("P", "Debate continues after the interjection with a further sentence from the minister here."),
        ("GAP",),
        ("L", "MS CLAY", " (Ginninderra) (10.11): I thank you, Mr Speaker, for sponsoring this petition."),
        ("GAP",),
        ("P", "Question put:"),
        ("GAP",),
        ("Q", "That the petition so lodged be noted."),
        ("GAP",),
        ("P", "The Assembly voted—"),
        ("GAP",),
        ("P", "Ayes 3   Noes 2"),
        ("P", "Peter Cain  Yvette Berry  Marisa Paterson"),
        ("P", "Andrew Braddock  Jo Clay"),
        ("GAP",),
        ("P", "Question resolved in the affirmative."),
    ]
    p2 = [
        ("H1", "Questions without notice"),
        ("H2", "Minister for Health—conduct"),
        ("L", "MS CASTLEY:", " My question is to the Chief Minister. Given the forecasts, does the Chief"),
        ("P", "Minister have confidence in the health minister?"),
        ("GAP",),
        ("L", "MR BARR:", " Yes, I have full confidence in the health minister, who is undertaking reform."),
        ("GAP",),
        ("L", "Mr Cocks:", " Point of order."),
        ("GAP",),
        ("L", "MR SPEAKER:", " There is no point of order."),
    ]
    if extra_turn:
        p2 += [("GAP",), ("L", "MS CLAY:", " A supplementary question that only the final transcript contains, added on "
                                             "review by the member, long enough to be kept by the corpus filters, "
                                             "with a second sentence that keeps it comfortably past two hundred chars.")]
    if not drop_last:
        p2 += [("GAP",), ("L", "MR BARR:", " I thank Ms Clay for the supplementary question and will answer it below."),]
    p3 = [
        ("H1", "Adjournment"),
        ("H2", "Health—lymphoedema"),
        ("L", "MS CHEYNE", " (Ginninderra—Attorney-General) (5.01), by leave: I move that the Assembly do now adjourn."),
        ("GAP",),
        ("L", "MR CAIN", " (Ginninderra) (5.02) I rise to speak, although the printed label lost its colon."),
    ]
    return make_pdf([p1, p2, p3])


@unittest.skipUnless(HAVE_PDFMINER, "pdfminer.six not installed")
class ParserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.turns = act.parse_pdf(day_pdf())

    def by(self, speaker, n=0):
        return [t for t in self.turns if t.speaker == speaker][n]

    def test_turns_have_speaker_electorate_time_topic(self):
        parton = self.by("Mr Parton")
        self.assertEqual((parton.electorate, parton.time), ("Brindabella", "10:03"))
        self.assertEqual(parton.topic, "Petition: Motion to take note of petition")
        self.assertTrue(parton.text.startswith("As the shadow minister"))
        self.assertIn("\n\nTo those who are in the gallery", parton.text)      # paragraphs kept
        steel = self.by("Mr Steel")
        self.assertEqual(steel.electorate, "Murrumbidgee")
        self.assertNotIn("Treasurer", steel.text)                              # the portfolio label is not speech

    def test_running_header_and_footer_never_reach_the_text(self):
        for t in self.turns:
            self.assertNotIn("Legislative Assembly for the ACT", t.text)
            self.assertNotIn("18 March 2025", t.text)

    def test_stage_direction_dropped_and_speech_continues(self):
        steel = self.by("Mr Steel")
        self.assertNotIn("Members interjecting", steel.text)
        self.assertIn("Debate continues after the interjection", steel.text)

    def test_chair_turn_kept_and_labelled_without_the_member_name(self):
        chair = self.by("Mr Speaker")
        self.assertTrue(chair.is_chair)
        self.assertEqual(chair.time, "10:01")
        self.assertNotIn("Parton", chair.speaker)

    def test_question_time_topic_and_bare_labels(self):
        castley = self.by("Ms Castley")
        self.assertEqual(castley.topic, "Questions without notice: Minister for Health—conduct")
        self.assertTrue(castley.bare_label)
        self.assertEqual(castley.electorate, "")
        self.assertIn("Minister have confidence", castley.text)                # the wrapped line joined
        cocks = self.by("Mr Cocks")
        self.assertEqual(cocks.text, "Point of order.")                        # plain 'Mr Cocks:' interjection is a turn

    def test_division_and_outcome_lines_are_not_speech(self):
        clay = self.by("Ms Clay")
        for junk in ("Question put", "Assembly voted", "Ayes", "Peter Cain", "Question resolved", "petition so lodged"):
            self.assertNotIn(junk, clay.text)
        self.assertTrue(clay.text.startswith("I thank you, Mr Speaker"))

    def test_by_leave_modifier_and_missing_colon(self):
        cheyne = self.by("Ms Cheyne")
        self.assertEqual((cheyne.electorate, cheyne.time), ("Ginninderra", "5:01"))
        self.assertTrue(cheyne.text.startswith("I move that the Assembly"))
        cain = self.by("Mr Cain")
        self.assertTrue(cain.text.startswith("I rise to speak"))

    def test_topics_follow_headings(self):
        self.assertEqual(self.by("Ms Cheyne").topic, "Adjournment: Health—lymphoedema")

    def test_normalise_label(self):
        self.assertEqual(act.normalise_label("MS STEPHEN-SMITH"), ("Ms Stephen-Smith", "stephen-smith"))
        self.assertEqual(act.normalise_label("MS LE COUTEUR")[0], "Ms Le Couteur")
        self.assertEqual(act.normalise_label("MRS DUNNE")[0], "Mrs Dunne")
        self.assertEqual(act.normalise_label("MR DEPUTY SPEAKER")[0], "Mr Deputy Speaker")
        self.assertEqual(act.normalise_label("MADAM ASSISTANT SPEAKER")[0], "Madam Assistant Speaker")
        self.assertIsNone(act.normalise_label("Building and construction—regulation"))
        self.assertIsNone(act.normalise_label("Questions without notice"))


class DiscoveryTests(unittest.TestCase):
    def test_pdf_names(self):
        self.assertEqual(act.classify_pdf_name("20250318.pdf"), ("final", "2025-03-18"))
        self.assertEqual(act.classify_pdf_name("P250513.pdf"), ("proof", "2025-05-13"))
        self.assertEqual(act.classify_pdf_name("tP260203.pdf"), ("proof", "2026-02-03"))
        self.assertEqual(act.classify_pdf_name("P980216.pdf"), ("proof", "1998-02-16"))
        self.assertIsNone(act.classify_pdf_name("notes.pdf"))
        self.assertIsNone(act.classify_pdf_name("20251345.pdf"))

    YEAR = """<table><tr><td><a
       href="https://www.hansard.act.gov.au/hansard/11th-assembly/2025/PDF/20250508.pdf">8
       May</a></td><td><a href="https://www.hansard.act.gov.au/hansard/11th-assembly/2025/PDF/P250513.pdf">13 May</a></td>
       <td><a href="../2025/PDF/tP250514.pdf">14 May</a></td><td><a href="PDF/P250514.pdf">14 May</a></td>
       <td><a href="debates(HTML).htm">HTML</a></td></tr></table>"""

    def test_year_page_and_best_per_day(self):
        docs = act.parse_year_page(self.YEAR, "https://www.hansard.act.gov.au/hansard/11th-assembly/2025/debates(PDF).htm")
        self.assertEqual([d.name for d in docs], ["20250508.pdf", "P250513.pdf", "P250514.pdf", "tP250514.pdf"])
        self.assertEqual(docs[2].url, "https://www.hansard.act.gov.au/hansard/11th-assembly/2025/PDF/P250514.pdf")
        best = act.best_per_day(docs)
        self.assertEqual([(d.date, d.name) for d in best],
                         [("2025-05-08", "20250508.pdf"), ("2025-05-13", "P250513.pdf"), ("2025-05-14", "P250514.pdf")])
        final = act.DayDoc("2025-05-13", "final", "u", "20250513.pdf")
        self.assertEqual(act.best_per_day(docs + [final])[1].name, "20250513.pdf")


class FakeResp:
    def __init__(self, body, headers=None, status=200):
        self._b, self.headers, self.status = body, headers or {}, status

    def read(self):
        return self._b

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class FakeSite:
    """URL -> bytes, honours If-None-Match."""

    def __init__(self, pages):
        self.pages, self.log = pages, []

    def __call__(self, req, timeout=0):
        url = req.full_url
        self.log.append((url, req.headers.get("If-none-match")))
        if url not in self.pages:
            raise urllib.error.HTTPError(url, 404, "nf", {}, None)
        body = self.pages[url]
        etag = '"%d"' % len(body)
        if req.headers.get("If-none-match") == etag:
            raise urllib.error.HTTPError(url, 304, "nm", {}, None)
        return FakeResp(body, {"ETag": etag, "Last-Modified": "Tue, 22 Sep 2026 02:43:22 GMT"})


@unittest.skipUnless(HAVE_PDFMINER, "pdfminer.six not installed")
class LoadTests(unittest.TestCase):
    def setUp(self):
        import tempfile
        from pathlib import Path
        self.tmp = tempfile.TemporaryDirectory()
        self.cache = Path(self.tmp.name)
        self.db = act.open_db(self.tmp.name + "/t.db")
        self.proof = act.DayDoc("2025-03-18", "proof", "https://x/P250318.pdf", "P250318.pdf")
        self.final = act.DayDoc("2025-03-18", "final", "https://x/20250318.pdf", "20250318.pdf")

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def load(self, doc, pdf):
        turns = act.dedupe_turns(act.parse_pdf(pdf))
        return act.load_day(self.db, doc, turns, doc_sha=str(len(pdf)))

    def rows(self):
        return self.db.execute("SELECT speech_id, speaker_name, text, source, state, chamber, date, topic, electorate, "
                               "word_count, party, person_id FROM speeches ORDER BY speech_id").fetchall()

    def test_first_load_columns(self):
        c = self.load(self.proof, day_pdf())
        self.assertGreater(c["inserted"], 8)
        r = self.rows()
        self.assertTrue(all(x["source"] == "act_hansard" and x["state"] == "act" and x["chamber"] == "act_la"
                            and x["date"] == "2025-03-18" for x in r))
        self.assertTrue(all(x["party"] is None and x["person_id"] is None for x in r))
        parton = [x for x in r if x["speaker_name"] == "Mr Parton"][0]
        self.assertEqual((parton["electorate"], parton["word_count"] > 5), ("Brindabella", True))
        day = self.db.execute("SELECT kind, name, n_turns, parser_version FROM act_hansard_days").fetchone()
        self.assertEqual((day["kind"], day["name"], day["parser_version"]), ("proof", "P250318.pdf", act.PARSER_VERSION))

    def test_reload_same_document_changes_nothing(self):
        self.load(self.proof, day_pdf())
        before = self.rows()
        c = self.load(self.proof, day_pdf())
        self.assertEqual((c["inserted"], c["updated"], c["deleted"]), (0, 0, 0))
        self.assertEqual([tuple(x) for x in before], [tuple(x) for x in self.rows()])
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM act_hansard_kb_queue").fetchone()[0], 0)

    def test_final_replaces_proof_in_place(self):
        self.load(self.proof, day_pdf())
        ids = {x["speaker_name"] + str(i): x["speech_id"] for i, x in enumerate(self.rows())}
        n_before = len(self.rows())
        steel_id = [x["speech_id"] for x in self.rows() if x["speaker_name"] == "Mr Steel"][0]
        # the Final: one word corrected in Mr Steel's speech, one turn added, the last turn gone
        c = self.load(self.final, day_pdf(extra_turn=True, edited=True, drop_last=True))
        self.assertEqual((c["inserted"], c["updated"], c["deleted"]), (1, 1, 1))
        rows = self.rows()
        self.assertEqual(len(rows), n_before)                                   # +1 -1
        steel = self.db.execute("SELECT text FROM speeches WHERE speech_id=?", (steel_id,)).fetchone()
        self.assertIn("Canberrans expect", steel["text"])                       # same speech_id, new text
        self.assertTrue(set(ids.values()) >= {steel_id})
        q = {r["speech_id"]: (r["op"], r["reason"]) for r in self.db.execute("SELECT * FROM act_hansard_kb_queue")}
        self.assertEqual(q[steel_id][0], "patch")
        self.assertEqual(sorted(v[0] for v in q.values()), ["delete", "patch"])
        deleted = [k for k, v in q.items() if v[0] == "delete"][0]
        self.assertIsNone(self.db.execute("SELECT 1 FROM speeches WHERE speech_id=?", (deleted,)).fetchone())
        self.assertEqual(self.db.execute("SELECT kind FROM act_hansard_days").fetchone()["kind"], "final")
        self.assertEqual({r["kind"] for r in self.db.execute("SELECT kind FROM act_hansard_turns")}, {"final"})

    def test_exact_repeats_in_a_day_are_one_row(self):
        turns = act.parse_pdf(day_pdf())
        dup = list(turns) + [turns[3]]
        self.assertEqual(len(act.dedupe_turns(dup)), len(turns))

    def test_stale_text_clean_is_cleared_on_update(self):
        self.load(self.proof, day_pdf())
        self.db.execute("UPDATE speeches SET text_clean='old', text_clean_rules='x'")
        self.load(self.final, day_pdf(edited=True))
        row = self.db.execute("SELECT text_clean, text_clean_rules, text FROM speeches WHERE speaker_name='Mr Steel'").fetchone()
        self.assertIsNone(row["text_clean"])
        self.assertIsNone(row["text_clean_rules"])
        other = self.db.execute("SELECT text_clean FROM speeches WHERE speaker_name='Mr Parton'").fetchone()
        self.assertEqual(other["text_clean"], "old")                            # untouched rows keep theirs

    def test_align_survives_edit_at_the_start_of_a_turn(self):
        old = [{"speech_id": 1, "speaker_name": "Mr Steel", "text": "It is important that we have a strong regulatory system"},
               {"speech_id": 2, "speaker_name": "Ms Clay", "text": "I thank you for sponsoring this petition and more words here"}]
        new = [act.Turn(0, "MR STEEL", "Mr Steel", "", "", "It is really important that we have a strong regulatory system"),
               act.Turn(1, "MS CLAY", "Ms Clay", "", "", "I thank you for sponsoring this petition and more words here")]
        pairs, gone, added = act.align_turns(old, new)
        self.assertEqual((pairs, gone, added), ([(0, 0), (1, 1)], [], []))

    def site(self, doc, pdf):
        idx = ('<a href="11th-assembly/2025/debates(PDF).htm">2025</a>').encode()
        year = f'<a href="{doc.url}">18 March</a>'.encode()
        return FakeSite({
            act.INDEX_URL: idx,
            act.BASE + "11th-assembly/2025/debates(PDF).htm": year,
            doc.url: pdf,
        })

    def test_process_day_conditional_get_and_final_never_refetched(self):
        pdf = day_pdf()
        site = self.site(self.proof, pdf)
        f = act.Fetcher(delay=0, opener=site)
        r = act.process_day(self.db, f, self.proof, cache_dir=self.cache)
        self.assertEqual(r["status"], "loaded")
        self.assertTrue(act.cache_path(self.proof, self.cache).exists())
        # second night: the server answers 304, nothing is parsed or written
        r2 = act.process_day(self.db, f, self.proof, cache_dir=self.cache)
        self.assertEqual(r2["status"], "skipped")
        self.assertEqual(site.log[-1][1], '"%d"' % len(pdf))                    # the stored ETag was sent
        # the Final appears: same day, new file -> updated in place
        site.pages[self.final.url] = day_pdf(edited=True)
        r3 = act.process_day(self.db, f, self.final, cache_dir=self.cache)
        self.assertEqual((r3["status"], r3["updated"]), ("updated", 1))
        # and a Final is never fetched again, nor replaced by a proof
        n = len(site.log)
        self.assertEqual(act.process_day(self.db, f, self.final, cache_dir=self.cache)["status"], "skipped")
        self.assertEqual(act.process_day(self.db, f, self.proof, cache_dir=self.cache)["status"], "skipped")
        self.assertEqual(len(site.log), n)

    def test_too_few_turns_is_an_error_not_a_sitting(self):
        tiny = make_pdf([[("P", "Nothing to see here.")]])
        site = FakeSite({self.proof.url: tiny})
        r = act.process_day(self.db, act.Fetcher(delay=0, opener=site), self.proof, cache_dir=self.cache)
        self.assertEqual(r["status"], "error")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM speeches").fetchone()[0], 0)

    def test_reload_that_would_gut_a_day_is_refused(self):
        self.load(self.proof, day_pdf())
        prior = self.db.execute("SELECT COUNT(*) FROM act_hansard_turns").fetchone()[0]
        self.assertGreater(prior, 8)
        pdf = make_pdf([[("L", "MR BARR:", " A single surviving turn. " * 3)] * 1] * 1)
        site = FakeSite({self.final.url: pdf})
        act.MIN_TURNS = 1
        try:
            r = act.process_day(self.db, act.Fetcher(delay=0, opener=site), self.final, cache_dir=self.cache)
        finally:
            act.MIN_TURNS = 5
        self.assertEqual(r["status"], "error")
        self.assertIn("refused", r["error"])
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM act_hansard_turns").fetchone()[0], prior)

    def test_run_discovers_and_loads(self):
        pdf = day_pdf()
        site = self.site(self.proof, pdf)
        site.pages[act.BASE + "11th-assembly/2025/debates(PDF).htm"] = f'<a href="{self.proof.url}">18</a>'.encode()
        rep = act.run(self.db, act.Fetcher(delay=0, opener=site), date(2025, 3, 1), date(2025, 3, 31),
                      cache_dir=self.cache)
        self.assertEqual(rep["errors"], [])
        self.assertGreater(rep["inserted"], 8)
        outside = act.run(self.db, act.Fetcher(delay=0, opener=site), date(2025, 4, 1), date(2025, 4, 30),
                          cache_dir=self.cache, refresh_proofs=False)
        self.assertEqual(outside["results"], [])


MEMBERS_HTML = """<table><tbody>
<tr><td headers="a"><a href="https://www.parliament.act.gov.au/members/current/barry"><img src="x.png" alt="" />Chiaka <strong>Barry</strong></a></td>
<td headers="b">
   Ginninderra
</td><td headers="c"><span style="color: blue">⬤</span>&nbsp;Liberal
</td><td>☎ (02) 6205 4874</td></tr>
<tr><td><a href="https://www.parliament.act.gov.au/members/current/hanson"><img src="x.png"/>Jeremy <strong>Hanson</strong> CSC</a><br /><span>Speaker</span></td>
<td>Murrumbidgee</td><td><span style="color: blue">⬤</span>&nbsp;Liberal</td><td></td></tr>
<tr><td><a href="https://www.parliament.act.gov.au/members/current/stephen-smith"><img src="x.png"/>Rachel <strong>Stephen-Smith</strong></a></td>
<td>Kurrajong</td><td><span>⬤</span>&nbsp;Labor</td><td></td></tr>
<tr><td><a href="https://www.parliament.act.gov.au/members/current/carrick"><img src="x.png"/>Fiona <strong>Carrick</strong></a></td>
<td>Murrumbidgee</td><td><span style="color: grey">⬤ I</span>ndependent </td><td></td></tr>
<tr><td><a href="https://www.parliament.act.gov.au/members/current/vassarotti"><img src="x.png"/>Rebecca <b>Vassarotti</b></a></td>
<td>Kurrajong</td><td><span>⬤</span>&nbsp;Green</td><td></td></tr>
<tr><td>Not a member row</td><td>x</td><td>y</td></tr>
</tbody></table>"""


class MemberTests(unittest.TestCase):
    def test_parse_current_members(self):
        m = act.parse_current_members(MEMBERS_HTML)
        self.assertEqual([x["full_name"] for x in m],
                         ["Chiaka Barry", "Jeremy Hanson", "Rachel Stephen-Smith", "Fiona Carrick", "Rebecca Vassarotti"])
        self.assertEqual([x["party"] for x in m], ["Liberal", "Liberal", "Labor", "Independent", "Greens"])
        self.assertEqual(m[1]["last_name"], "Hanson")                            # 'CSC' is not part of the name
        self.assertEqual(m[0]["electorate"], "Ginninderra")
        self.assertEqual(m[4]["last_name"], "Vassarotti")                        # a <b> surname, not only <strong>

    def test_a_member_the_table_parse_missed_is_an_error_not_a_silent_drop(self):
        broken = MEMBERS_HTML.replace("Rebecca <b>Vassarotti</b>", "Rebecca").replace(
            '<td>Kurrajong</td><td><span>⬤</span>&nbsp;Green</td>', '<td></td><td></td>')
        with self.assertRaises(RuntimeError):
            act.parse_current_members(broken)

    def test_seed_members_completes_a_surname_stub_in_place(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            db = act.open_db(d + "/t.db")
            db.execute("INSERT INTO members (person_id, first_name, last_name, full_name, chamber, state) "
                       "VALUES ('act_hanson', '', 'Hanson', 'Hanson', 'act_la', 'act')")
            db.execute("INSERT INTO members (person_id, full_name, state) VALUES ('qld_hanson', 'Hanson', 'qld')")
            c = act.seed_members(db, act.parse_current_members(MEMBERS_HTML))
            self.assertEqual(c, {"inserted": 4, "updated": 1})
            row = db.execute("SELECT * FROM members WHERE person_id='act_hanson'").fetchone()
            self.assertEqual((row["full_name"], row["first_name"], row["party"], row["electorate"]),
                             ("Jeremy Hanson", "Jeremy", "Liberal", "Murrumbidgee"))
            new = db.execute("SELECT person_id, chamber, state FROM members WHERE full_name='Rachel Stephen-Smith'").fetchone()
            # the id link_speakers' own surname stub would get, so the two never become two people
            self.assertEqual(tuple(new), ("act_stephensmith", "act_la", "act"))
            self.assertEqual(db.execute("SELECT full_name FROM members WHERE person_id='qld_hanson'").fetchone()[0], "Hanson")
            again = act.seed_members(db, act.parse_current_members(MEMBERS_HTML))
            self.assertEqual(again["inserted"], 0)                               # idempotent
            db.close()


@unittest.skipUnless(HAVE_PDFMINER, "pdfminer.six not installed")
class LinkerTests(unittest.TestCase):
    """The loaded rows and the seeded roster meet in link_speakers as they do for the other states."""

    def test_roster_then_linker_links_by_surname_with_no_duplicate_people(self):
        import tempfile
        from parli.ingest import link_speakers as ls
        roster = [{"first_name": f, "last_name": l, "full_name": f"{f} {l}", "electorate": e, "party": p}
                  for f, l, e, p in [("Mark", "Parton", "Brindabella", "Liberal"), ("Chris", "Steel", "Murrumbidgee", "Labor"),
                                     ("Jo", "Clay", "Ginninderra", "Greens"), ("Leanne", "Castley", "Yerrabi", "Independent"),
                                     ("Andrew", "Barr", "Kurrajong", "Labor"), ("Ed", "Cocks", "Murrumbidgee", "Liberal"),
                                     ("Tara", "Cheyne", "Ginninderra", "Labor"), ("Peter", "Cain", "Ginninderra", "Liberal")]]
        with tempfile.TemporaryDirectory() as d:
            db = act.open_db(d + "/t.db")
            act.load_day(db, act.DayDoc("2025-03-18", "final", "u", "20250318.pdf"),
                         act.dedupe_turns(act.parse_pdf(day_pdf())), doc_sha="x")
            act.seed_members(db, roster)
            ls.seed_state_members(db)
            ls.link_state_speakers(db)
            people = [r[0] for r in db.execute("SELECT full_name FROM members WHERE state='act' ORDER BY full_name")]
            self.assertEqual(people, sorted(m["full_name"] for m in roster))     # no 'Parton' beside 'Mark Parton'
            linked = dict(db.execute("SELECT speaker_name, person_id FROM speeches WHERE source='act_hansard' "
                                     "AND person_id IS NOT NULL").fetchall())
            self.assertEqual(linked["Mr Parton"], "act_parton")
            self.assertEqual(linked["Ms Clay"], "act_clay")
            self.assertEqual(linked["Ms Castley"], "act_castley")
            self.assertNotIn("Mr Speaker", linked)                               # the chair is never a person
            db.close()


class MissTests(unittest.TestCase):
    def test_miss_is_an_honorific_for_the_state_linker(self):
        from parli.ingest import link_speakers as ls
        self.assertEqual(ls.normalize_state_speaker_name("Miss Nuttall", "act"), "Nuttall")
        self.assertEqual(ls.normalize_state_speaker_name("Ms Castley", "act"), "Castley")
        self.assertEqual(ls.normalize_state_speaker_name("Mr Stephen-Smith", "act"), "Stephen-Smith")
        self.assertTrue(ls.is_procedural("Madam Assistant Speaker"))
        self.assertTrue(ls.is_procedural("Mr Deputy Speaker"))


class FakeKb:
    def __init__(self, missing=()):
        self.calls, self.missing = [], set(missing)

    def patch_resource_by_slug(self, slug, body):
        from parli.ingest.arag_sync import AragError
        self.calls.append(("patch", slug, body))
        if slug in self.missing:
            raise AragError(404, "u", "not found")

    def delete_resource_by_slug(self, slug):
        self.calls.append(("delete", slug))

    def create_resource(self, body):
        self.calls.append(("create", body["slug"]))


@unittest.skipUnless(HAVE_PDFMINER, "pdfminer.six not installed")
class PatchKbTests(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.tmp = tempfile.TemporaryDirectory()
        self.db = act.open_db(self.tmp.name + "/t.db")
        doc = act.DayDoc("2025-03-18", "proof", "u", "P250318.pdf")
        act.load_day(self.db, doc, act.dedupe_turns(act.parse_pdf(day_pdf())), doc_sha="a")
        final = act.DayDoc("2025-03-18", "final", "u", "20250318.pdf")
        act.load_day(self.db, final, act.dedupe_turns(act.parse_pdf(day_pdf(edited=True, drop_last=True))), doc_sha="b")
        self.q = [dict(r) for r in self.db.execute("SELECT * FROM act_hansard_kb_queue")]

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def test_patch_and_delete_rows_the_box_already_holds(self):
        self.assertEqual(sorted(q["op"] for q in self.q), ["delete", "patch"])
        kb = FakeKb()
        out = act.patch_kb(self.db, kb, checkpoint=10**9)
        self.assertEqual(out, {"patched": 1, "deleted": 1})
        kinds = sorted(c[0] for c in kb.calls)
        self.assertEqual(kinds, ["delete", "patch"])
        patch = [c for c in kb.calls if c[0] == "patch"][0]
        self.assertEqual(list(patch[2]), ["texts"])                              # text only: labels and summaries untouched
        self.assertIn("Canberrans expect", patch[2]["texts"]["body"]["body"])
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM act_hansard_kb_queue WHERE done_at IS NULL").fetchone()[0], 0)
        self.assertEqual(act.patch_kb(self.db, kb, checkpoint=10**9), {})        # nothing left to send

    def test_rows_above_the_checkpoint_wait_for_the_ordinary_push(self):
        kb = FakeKb()
        out = act.patch_kb(self.db, kb, checkpoint=0)
        self.assertEqual(out, {"not-pushed": 2})
        self.assertEqual(kb.calls, [])

    def test_404_creates_only_if_the_final_qualifies(self):
        for q in self.q:
            if q["op"] == "patch":
                kb = FakeKb(missing={f"speech-{q['speech_id']}"})
        out = act.patch_kb(self.db, kb, checkpoint=10**9)
        self.assertEqual(out.get("created"), 1)                                  # Mr Steel's speech is over 200 chars
        self.assertIn(("create", f"speech-{[q for q in self.q if q['op'] == 'patch'][0]['speech_id']}"), kb.calls)

    def test_failed_calls_stay_queued(self):
        class Boom(FakeKb):
            def patch_resource_by_slug(self, slug, body):
                raise RuntimeError("box down")
        out = act.patch_kb(self.db, Boom(), checkpoint=10**9)
        self.assertEqual(out["failed"], 1)
        pending = self.db.execute("SELECT op, error FROM act_hansard_kb_queue WHERE done_at IS NULL").fetchall()
        self.assertEqual([p["op"] for p in pending], ["patch"])
        self.assertIn("box down", pending[0]["error"])


class SyncCompatibilityTests(unittest.TestCase):
    """The rows this loader writes go through arag_sync untouched: labels come from the row."""

    def test_map_speech_labels(self):
        from parli.ingest.arag_sync import map_speech
        db = sqlite3.connect(":memory:")
        db.row_factory = sqlite3.Row
        db.execute("CREATE TABLE speeches (speech_id INTEGER, person_id TEXT, speaker_name TEXT, party TEXT, electorate TEXT, "
                   "chamber TEXT, date TEXT, topic TEXT, text TEXT, word_count INTEGER, source TEXT, state TEXT)")
        db.execute("INSERT INTO speeches VALUES (7, NULL, 'Ms Clay', NULL, 'Ginninderra', 'act_la', '2025-03-18', "
                   "'Petition: Motion to take note of petition', 'I thank you, Mr Speaker.', 5, 'act_hansard', 'act')")
        body = map_speech(db.execute("SELECT * FROM speeches").fetchone())
        labels = {c["labelset"]: c["label"] for c in body["usermetadata"]["classifications"]}
        self.assertEqual(labels, {"kind": "speech", "source": "act_hansard", "state": "act", "chamber": "act_la",
                                  "decade": "2020s"})
        self.assertEqual(body["slug"], "speech-7")
        self.assertTrue(body["title"].startswith("Clay — Petition: Motion to take note of petition"))


if __name__ == "__main__":
    unittest.main()
