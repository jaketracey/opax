import sqlite3
import unittest

from parli.ingest.arag_sync import map_speech
from parli.ingest.speech_hygiene import (
    clean_party,
    clean_speaker_name,
    clean_speech_text,
    clean_speech_text_with_rules,
)


class SpeechTextHygieneTests(unittest.TestCase):
    def assert_rule(self, rule, before, after, **record):
        result = clean_speech_text_with_rules(before, **record)
        self.assertEqual(result.text, after)
        self.assertIn(rule, result.rules)
        # Every repair rule must be idempotent on already-clean text.
        rerun = clean_speech_text_with_rules(result.text, **record)
        self.assertEqual(rerun.text, result.text)

    def test_matching_broken_timestamp_banner_real_donato_1286344(self):
        before = (
            "Mr PHILIP DONATO ( Orange ) ( 22:2 5 :05 ): Few issues debated "
            "in this House have as widespread an impact."
        )
        self.assert_rule(
            "matching_speaker_banner",
            before,
            "Few issues debated in this House have as widespread an impact.",
            source="nsw_hansard",
            topic="Cost of Living",
            speaker_name="Mr PHILIP DONATO",
        )

    def test_matching_parenthetical_timestamp_banner_real_bishop_246829(self):
        before = (
            "Ms JULIE BISHOP (Curtin-Deputy Leader of the Opposition) "
            "(14: 40): My question is to the Acting Prime Minister."
        )
        self.assert_rule(
            "matching_speaker_banner",
            before,
            "My question is to the Acting Prime Minister.",
            source="zenodo",
            speaker_name="Bishop, Julie, MP",
        )

    def test_dash_terminated_timestamp_is_removed_as_a_whole_real_74431(self):
        before = (
            "Mr ABBOTT (Warringah—Leader of the House) (16:58)—Papers are "
            "tabled as listed in the schedule."
        )
        self.assert_rule(
            "matching_speaker_banner",
            before,
            "Papers are tabled as listed in the schedule.",
            source="zenodo",
            speaker_name="Abbott, Tony MP",
        )

    def test_matching_bracket_time_banner_real_taylor_835678(self):
        before = "The Hon. BRONNIE TAYLOR [10.45 a.m.]: I move: That this House notes her retirement."
        self.assert_rule(
            "matching_speaker_banner",
            before,
            "I move: That this House notes her retirement.",
            source="nsw_hansard",
            speaker_name="The Hon. BRONNIE TAYLOR",
        )

    def test_matching_banner_allows_surname_only_attribution(self):
        before = "Hon. SJ HINCHLIFFE: I table the report."
        self.assert_rule(
            "matching_speaker_banner",
            before,
            "I table the report.",
            source="qld_hansard",
            speaker_name="Mr HINCHLIFFE",
        )

    def test_mismatched_or_sentence_like_banner_is_preserved_real_243(self):
        text = (
            "Mr Peter Morris asked the Minister for Transport, upon notice, on "
            "26 June 1997: Further to the statement, what reports were produced?"
        )
        self.assertEqual(
            clean_speech_text(text, "zenodo", None, "Morris, Peter, MP"),
            text,
        )
        mismatch = "Mr SOMEONE ELSE ( Orange ) ( 22:25:05 ): Body text."
        self.assertEqual(
            clean_speech_text(mismatch, "nsw_hansard", None, "Mr PHILIP DONATO"),
            mismatch,
        )

    def test_leading_timestamp_real_748545(self):
        self.assert_rule(
            "leading_timestamp",
            "[10:21].- I move - That the bill be now read a second time.",
            "I move - That the bill be now read a second time.",
            source="wragge_xml",
            speaker_name="Senator Sir GEORGE PEARCE",
        )

    def test_numeric_entity_real_423182(self):
        self.assert_rule(
            "numeric_html_entity",
            "whether we can process them&#8212;or all received",
            "whether we can process them—or all received",
            source="sa_hansard",
        )

    def test_mojibake_is_repaired_but_replacement_character_is_retained(self):
        self.assert_rule("mojibake", "Itâ€™s clear.", "It’s clear.")
        self.assertEqual(clean_speech_text("m *� to 45,068"), "m *� to 45,068")

    def test_control_character_real_775784(self):
        self.assert_rule(
            "control_character",
            "Division\x1011:15 amStephen Conroy |Hansard source",
            "Division 11:15 amStephen Conroy |Hansard source",
            source="openaustralia",
        )

    def test_whitespace_runs_real_124371(self):
        result = clean_speech_text_with_rules("The House divided.\u00a0\u00a0\u00a0\u00a0 AYES\n\n\nNOES")
        self.assertEqual(result.text, "The House divided. AYES\n\nNOES")
        self.assertIn("horizontal_whitespace", result.rules)
        self.assertIn("blank_line_run", result.rules)

    def test_edge_whitespace_is_traced(self):
        self.assert_rule("edge_whitespace", " Body text. \n", "Body text.")

    def test_soft_line_wrap_real_3(self):
        self.assert_rule(
            "soft_line_wrap",
            "the report has \n said that reform is needed",
            "the report has said that reform is needed",
            source="zenodo",
        )

    def test_line_end_hyphenation_real_638(self):
        self.assert_rule(
            "line_end_hyphenation",
            "payment to under 16-year- \nolds because it is constrained",
            "payment to under 16-year-olds because it is constrained",
            source="zenodo",
        )

    def test_known_ocr_word_split_real_47(self):
        self.assert_rule(
            "known_ocr_word_split",
            "shape the govern \n ment's response",
            "shape the government's response",
            source="zenodo",
        )
        self.assertEqual(clean_speech_text("notwith-stand-ing the powers"), "notwithstanding the powers")

    def test_only_audited_missing_space_phrases_are_split(self):
        self.assert_rule(
            "audited_missing_space",
            "on behalf ofSenator Barnett, I move",
            "on behalf of Senator Barnett, I move",
            source="openaustralia",
        )
        self.assertEqual(
            clean_speech_text("recorded in theVotes and Proceedings", "openaustralia"),
            "recorded in the Votes and Proceedings",
        )
        self.assertEqual(clean_speech_text("a discussion ofAppraisal policy"), "a discussion ofAppraisal policy")

    def test_interjection_is_marked_and_preserved_real_35550(self):
        result = clean_speech_text(
            "Honourable members interjecting—Mr Costello interjecting—",
            "zenodo",
        )
        self.assertEqual(
            result,
            "[Interjection: Honourable members] [Interjection: Mr Costello]",
        )
        self.assertIn("Costello", result)

    def test_tagged_and_stage_interjections_are_marked(self):
        self.assertEqual(
            clean_speech_text("A <interjection>Order!</interjection> B"),
            "A [Interjection: Order!] B",
        )
        self.assertEqual(clean_speech_text("A (inaudible) B"), "A [Inaudible] B")

    def test_duplicate_topic_first_line_is_removed_only_with_body(self):
        self.assert_rule(
            "duplicate_topic_header",
            "COST OF LIVING\nFew issues are as widespread.",
            "Few issues are as widespread.",
            source="nsw_hansard",
            topic="Cost of Living",
        )
        heading_only = "Alan and Jenny Tunks fundraising for cystic fibrosis"
        self.assertEqual(
            clean_speech_text(
                heading_only,
                "nsw_hansard",
                "Alan and Jenny Tunks Fundraising for Cystic Fibrosis",
            ),
            heading_only,
        )

    def test_nsw_inline_uppercase_topic_is_removed_but_real_sentence_is_not(self):
        self.assertEqual(
            clean_speech_text(
                "MINING PROTEST LEGISLATION The Hon. ADAM SEARLE: My question is directed to the Leader.",
                "nsw_hansard",
                "Mining Protest Legislation",
            ),
            "The Hon. ADAM SEARLE: My question is directed to the Leader.",
        )
        text = "Documents are tabled in accordance with the list circulated."
        self.assertEqual(clean_speech_text(text, "openaustralia", "Documents"), text)

    def test_all_caps_component_header_real_772068(self):
        topic = (
            "Superannuation Legislation Amendment (Trustee Board and Other Measures) Bill 2006; "
            "Superannuation Legislation Amendment Bill 2004"
        )
        before = "SUPERANNUATION LEGISLATION AMENDMENT (TRUSTEE BOARD AND OTHER MEASURES) BILL 2006\n\nBill—by leave—taken as a whole."
        self.assertEqual(
            clean_speech_text(before, "openaustralia", topic),
            "Bill—by leave—taken as a whole.",
        )

    def test_committee_topic_context_is_idempotent(self):
        topic = "Finance and Public Administration Committee"
        expected = f"[{topic}] The witness answered."
        self.assertEqual(clean_speech_text("The witness answered.", "committee_senate", topic), expected)
        self.assertEqual(clean_speech_text(expected, "committee_senate", topic), expected)

    def test_unsafe_footer_candidate_and_procedural_text_are_preserved(self):
        table = "Page\n\n89\n\nByron Sports and Community Facility"
        self.assertEqual(clean_speech_text(table), table)
        motion = "Motion (by Mr Reith)—by leave—agreed to: That standing orders be suspended."
        self.assertEqual(clean_speech_text(motion), motion)


class AttributionHygieneTests(unittest.TestCase):
    def test_real_parenthetical_speaker_66(self):
        self.assertEqual(clean_speaker_name("Beazley, Kim (Jr), MP"), "Kim Beazley")

    def test_party_aliases_and_junk(self):
        self.assertEqual(clean_party("Australian Labor Party"), "Labor")
        self.assertEqual(clean_party("Pauline Hanson's One Nation Party"), "One Nation")
        self.assertEqual(clean_party("Democratic Labor Party"), "DLP")
        self.assertIsNone(clean_party("Shadow Minister for Defence"))
        self.assertIsNone(clean_party("ALP; NAT from 1917"))
        self.assertIsNone(clean_party("UNKNOWN"))

    def test_map_speech_prefers_derived_source_of_truth_fields(self):
        db = sqlite3.connect(":memory:")
        db.row_factory = sqlite3.Row
        db.execute(
            """CREATE TABLE s (
                speech_id INTEGER, date TEXT, speaker_name TEXT, speaker_name_clean TEXT,
                party TEXT, party_canonical TEXT, topic TEXT, text TEXT, text_clean TEXT,
                source TEXT, state TEXT, chamber TEXT, person_id TEXT, electorate TEXT,
                word_count INTEGER
            )"""
        )
        db.execute(
            "INSERT INTO s VALUES (1,'2025-03-19','Mr PHILIP DONATO','Philip Donato',"
            "'UNKNOWN','Independent','Cost of Living','raw','Few issues','nsw_hansard',"
            "'nsw','assembly',NULL,'Orange',2)"
        )
        resource = map_speech(db.execute("SELECT * FROM s").fetchone())
        self.assertEqual(resource["texts"]["body"]["body"], "Few issues")
        self.assertEqual(resource["origin"]["collaborators"], ["Philip Donato"])
        labels = {x["labelset"]: x["label"] for x in resource["usermetadata"]["classifications"]}
        self.assertEqual(labels["party"], "Independent")


if __name__ == "__main__":
    unittest.main()
