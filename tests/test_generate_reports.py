import unittest

from scripts.generate_reports import (
    REPORTS,
    brief_matches_topic,
    compose_stat_label,
    debate_question,
    dedupe_subjects,
    holds_the_quotes,
    is_procedural_debate,
    is_topic_echo,
    period_question,
    settle_jurisdiction,
    settle_lede_ref,
    stat_support,
    voices,
    window_questions,
    debate_title,
    is_hollow_brief,
    is_hollow_speech,
    is_hollow_title,
    select_key_moments,
)


class KeyMomentPredicateTests(unittest.TestCase):
    def test_debate_title_removes_ingest_wrapper(self):
        self.assertEqual(
            debate_title(
                "Kevin Rudd — Apology to Australia's Indigenous Peoples — 2008-02-13",
                "Kevin Rudd",
                "2008-02-13",
            ),
            "Apology to Australia's Indigenous Peoples",
        )
        self.assertEqual(debate_title("Kevin Rudd — 2008-02-13", "Kevin Rudd", "2008-02-13"), "")

    def test_hollow_titles_are_rejected(self):
        for title in (
            "Bills",
            "Questions without Notice",
            "Points of Order",
            "Senate division, 20 March 2024",
            "Environment and Communications Legislation Committee Estimates CLIMATE CHANGE, ENERGY, THE ENVIRONMENT AND WATER PORTFOLIO",
        ):
            with self.subTest(title=title):
                self.assertTrue(is_hollow_title(title))
        self.assertFalse(is_hollow_title("Apology to Australia's Indigenous Peoples"))
        self.assertTrue(is_hollow_title("Questions without Notice: Take Note of Answers"))
        self.assertTrue(is_hollow_title("Valedictory"))

    def test_short_and_procedural_speeches_are_rejected(self):
        self.assertTrue(is_hollow_speech("I move: That this bill be now read a second time."))
        self.assertTrue(is_hollow_speech(
            "The answer to the honourable member's question is: " + "not available " * 200))
        substantive = (
            "I move: That this bill be now read a second time. "
            + "This reform changes the law because communities have waited for action. " * 45
        )
        self.assertFalse(is_hollow_speech(substantive))

    def test_missing_or_single_procedural_briefs_are_rejected(self):
        self.assertTrue(is_hollow_brief(None))
        self.assertTrue(is_hollow_brief("The speaker moved the second reading of a bill."))
        self.assertTrue(is_hollow_brief(
            "The senator criticised the management of Senate business and moved to suspend standing orders. "
            "The motion would extend sitting hours so the chamber could reach the carbon tax repeal bills."
        ))
        self.assertTrue(is_hollow_brief(
            "The member requested further details from the Minister for Housing about how a new program "
            "would affect jobs and housing construction in the electorate."
        ))
        self.assertFalse(is_hollow_brief(
            "The speech argued that the bill would restore native-title protections removed by earlier amendments. "
            "It linked the reform to the response to the Wik decision and explained the practical effect on claimants."
        ))

    def test_brief_must_name_the_report_subject(self):
        self.assertTrue(brief_matches_topic(
            "The bill restricts gambling advertising and online wagering inducements.",
            ("gambling", "wagering"),
        ))
        self.assertFalse(brief_matches_topic(
            "The senator reflected on women in parliament during her valedictory.",
            ("immigration", "refugee", "detention"),
        ))


class KeyMomentSpreadTests(unittest.TestCase):
    def test_selection_uses_distinct_speakers_years_and_two_parliaments(self):
        candidates = []
        for i, (speaker, year, state, score) in enumerate((
            ("A", "2008", "federal", 10.0),
            ("B", "2009", "federal", 9.9),
            ("C", "2010", "nsw", 9.0),
            ("A", "2011", "vic", 8.9),
            ("D", "2010", "qld", 8.8),
            ("E", "2020", "sa", 8.5),
        )):
            candidates.append({
                "slug": f"speech-{i}", "speaker": speaker, "date": f"{year}-01-01",
                "state": state, "title": f"Debate {i}", "base_score": score,
                "query_indexes": [i],
            })
        selected = select_key_moments(candidates, limit=4)
        self.assertEqual(len(selected), 4)
        self.assertEqual(len({c["speaker"] for c in selected}), 4)
        self.assertEqual(len({c["date"][:4] for c in selected}), 4)
        self.assertGreaterEqual(len({c["state"] for c in selected}), 2)


if __name__ == "__main__":
    unittest.main()


class DiscoveryPredicateTests(unittest.TestCase):
    def test_chamber_furniture_is_not_a_debate(self):
        for title in (
            "Statements by Members",
            "Constituency Statements",
            "Ministers statements: housing",
            "Program",
            "Standing and sessional orders",
            "Matters Of Public Interest",
            "Motions by leave",
            "Government performance",
        ):
            with self.subTest(title=title):
                self.assertTrue(is_procedural_debate(title))

    def test_geography_headings_and_ocr_wreckage_are_rejected(self):
        self.assertTrue(is_procedural_debate("Southern Metropolitan Region"))
        self.assertTrue(is_procedural_debate("Appr Opr Iation (Parl Iament) B Ill"))

    def test_real_debates_survive(self):
        for title in (
            "Statewide Treaty Bill 2025 - Second reading",
            "Housing Supply",
            "Environmental Planning and Assessment Amendment Bill 2025",
            "Mount Arapiles rock climbing",
        ):
            with self.subTest(title=title):
                self.assertFalse(is_procedural_debate(title))

    def test_debate_question_drops_the_reading_stage(self):
        self.assertEqual(
            debate_question("Statewide Treaty Bill 2025 - Second reading"),
            "What has parliament said about the Statewide Treaty Bill 2025?",
        )
        self.assertEqual(
            debate_question("Planning policy"),
            "What has parliament said about Planning policy?",
        )

    def test_topic_echo_keeps_the_finding_but_drops_the_question(self):
        self.assertTrue(is_topic_echo("Housing", REPORTS["housing"]))
        self.assertFalse(is_topic_echo("Housing Supply", REPORTS["housing"]))

    def test_curated_questions_keep_their_slots(self):
        discovered = [{"title": f"Some Bill {n} 2025"} for n in range(8)]
        questions = window_questions(REPORTS["housing"], discovered)
        self.assertEqual(len(questions), 8)
        for curated in REPORTS["housing"]["questions"]:
            self.assertIn(period_question(curated), questions)

    def test_period_question_is_added_once(self):
        asked = period_question("What have MPs said about housing?")
        self.assertEqual(asked, "What have MPs said about housing since July 2024?")
        self.assertEqual(period_question(asked), asked)


class KeyFigureSupportTests(unittest.TestCase):
    PASSAGE = (
        "Aboriginal and Torres Strait Islander people make up just 3.8 per cent of the "
        "Australian population but 27 per cent of the national prison population."
    )

    def stat(self, **over):
        base = {
            "value": "27%", "numerator": "27", "unit": "per cent",
            "denominator": "the national prison population",
            "measure": "First Nations share of the prison population",
        }
        return {**base, **over}

    def test_a_supported_share_passes(self):
        self.assertIsNone(stat_support(self.stat(), self.PASSAGE))

    def test_a_reversed_denominator_is_rejected(self):
        reversed_stat = self.stat(
            denominator="Aboriginal and Torres Strait Islander people",
            measure="share of First Nations people in prison")
        self.assertIsNotNone(stat_support(reversed_stat, self.PASSAGE))

    def test_the_base_may_precede_the_number(self):
        passage = ("Of the national prison population, 27 per cent are Aboriginal "
                   "and Torres Strait Islander people.")
        self.assertIsNone(stat_support(self.stat(), passage))

    def test_an_invented_number_is_rejected(self):
        self.assertIsNotNone(stat_support(self.stat(value="52%", numerator="52"), self.PASSAGE))

    def test_a_number_must_not_match_inside_a_longer_one(self):
        passage = "There were 270 submissions to the inquiry."
        self.assertIsNotNone(
            stat_support(self.stat(denominator="270 submissions"), passage))

    def test_a_missing_scale_word_is_rejected(self):
        passage = "The fund will deliver 30,000 homes out of a 640,000 household shortfall."
        self.assertIsNotNone(stat_support({
            "value": "$30 billion", "numerator": "30 billion", "unit": "dollars",
            "denominator": "640,000 households", "measure": "fund size"}, passage))

    def test_a_stat_without_a_denominator_is_rejected(self):
        self.assertEqual(stat_support(self.stat(denominator=""), self.PASSAGE), "no denominator")

    def test_a_bare_year_is_not_a_figure(self):
        self.assertIsNotNone(stat_support(
            self.stat(value="2024", numerator="2024", unit="years"), self.PASSAGE))

    def test_the_label_always_names_its_base(self):
        label = compose_stat_label(self.stat(measure="First Nations people"))
        self.assertEqual(label, "First Nations people as a share of the national prison population")


class VoiceMergeTests(unittest.TestCase):
    def test_a_surname_merges_into_its_only_full_name(self):
        rows = ([{"date": "2025-01-01", "speaker": "Thorpe", "party": None}] * 3
                + [{"date": "2025-01-02", "speaker": "Lidia Thorpe", "party": "Independent"}] * 2)
        tally = voices(rows)
        self.assertEqual(tally, [{"speaker": "Lidia Thorpe", "party": "Independent", "count": 5}])

    def test_an_ambiguous_surname_is_left_alone(self):
        rows = ([{"date": "2025-01-01", "speaker": "Thorpe", "party": None}] * 3
                + [{"date": "2025-01-02", "speaker": "Lidia Thorpe", "party": None}] * 2
                + [{"date": "2025-01-03", "speaker": "David Thorpe", "party": None}])
        names = {row["speaker"] for row in voices(rows)}
        self.assertEqual(names, {"Thorpe", "Lidia Thorpe", "David Thorpe"})

    def test_the_window_bounds_the_tally(self):
        rows = [{"date": "2023-01-01", "speaker": "Old Member", "party": None},
                {"date": "2025-01-01", "speaker": "New Member", "party": None}]
        self.assertEqual([v["speaker"] for v in voices(rows, "2024-07-01")], ["New Member"])


class TautologicalDenominatorTests(unittest.TestCase):
    def test_a_denominator_that_only_repeats_the_unit_is_rejected(self):
        passage = ("Total enrolment of First Nations students increased by just over "
                   "five per cent in 2024 to 24,561 students.")
        self.assertEqual(
            stat_support({
                "value": "24,561 students", "numerator": "24,561", "unit": "students",
                "denominator": "students", "measure": "First Nations enrolment"}, passage),
            "the denominator only repeats the unit",
        )

    def test_a_real_base_in_the_same_unit_still_passes(self):
        passage = "We funded 4,000 homes of the 30,000 homes the state needs."
        self.assertIsNone(stat_support({
            "value": "4,000 homes", "numerator": "4,000", "unit": "homes",
            "denominator": "30,000 homes", "measure": "homes funded"}, passage))


class DebateDedupeTests(unittest.TestCase):
    def test_a_bill_folded_inside_a_longer_one_loses_its_question(self):
        titles = [
            "Environmental Planning and Assessment Amendment (Planning System Reforms) Bill 2025",
            "Environmental Planning and Assessment Amendment Bill 2025",
            "Strata Schemes Legislation Amendment Bill 2024",
        ]
        self.assertEqual(dedupe_subjects(titles), [titles[0], titles[2]])

    def test_the_bigger_debate_keeps_its_question(self):
        # discover_debates returns largest first, so the survivor is the larger.
        titles = ["Residential Tenancies Amendment (Rental Reform) Bill 2025",
                  "Residential Tenancies Amendment Bill 2025"]
        self.assertEqual(dedupe_subjects(titles), [titles[0]])

    def test_a_two_word_debate_is_never_folded_away(self):
        titles = ["Housing Supply and Affordability Bill 2025", "Housing Supply"]
        self.assertEqual(dedupe_subjects(titles), titles)

    def test_a_short_standing_debate_survives_a_bill_that_contains_it(self):
        titles = ["Statewide Treaty Bill 2025 - Second reading", "Treaty"]
        self.assertEqual(dedupe_subjects(titles), titles)

    def test_unrelated_debates_are_left_alone(self):
        titles = ["Planning policy", "Energy policy", "Community safety"]
        self.assertEqual(dedupe_subjects(titles), titles)


class AnchoredQuestionTests(unittest.TestCase):
    housing = REPORTS["housing"]
    indigenous = REPORTS["indigenous"]

    def test_a_bare_heading_is_anchored_to_the_report(self):
        self.assertEqual(
            debate_question("Energy policy", self.housing),
            "What has parliament said about Energy policy and housing?")

    def test_a_heading_that_already_says_the_subject_is_left_alone(self):
        self.assertEqual(
            debate_question("Housing Supply", self.housing),
            "What has parliament said about Housing Supply?")

    def test_a_bill_names_itself_and_is_never_anchored(self):
        self.assertEqual(
            debate_question("Aboriginal Land Legislation Amendment Bill 2024 - Second reading",
                            self.indigenous),
            "What has parliament said about the Aboriginal Land Legislation Amendment Bill 2024?")

    def test_without_a_report_the_question_is_the_bare_heading(self):
        self.assertEqual(debate_question("Energy policy"),
                         "What has parliament said about Energy policy?")


class TotalWithoutABaseTests(unittest.TestCase):
    def test_a_total_measured_against_nothing_is_not_a_statistic(self):
        passage = ("The Indigenous business snapshot estimated First Nations businesses "
                   "contribute about $16 billion in revenue to the economy.")
        self.assertEqual(
            stat_support({
                "value": "$16 billion", "numerator": "16 billion", "unit": "dollars",
                "denominator": "economy", "measure": "revenue contributed"}, passage),
            "the passage states no total for this number to be measured against",
        )

    def test_a_count_out_of_a_stated_total_still_passes(self):
        passage = "Of the 19 targets, only 4 are on track."
        self.assertIsNone(stat_support({
            "value": "4 of 19", "numerator": "4", "unit": "targets",
            "denominator": "19 targets", "measure": "Closing the Gap targets on track"}, passage))

    def test_a_share_needs_no_number_in_its_base(self):
        passage = ("First Nations people make up 37 per cent of the adult prisoners "
                   "in custody in Queensland.")
        self.assertIsNone(stat_support({
            "value": "37 per cent", "numerator": "37", "unit": "per cent",
            "denominator": "adult prisoners in custody in Queensland",
            "measure": "First Nations share of adult prisoners"}, passage))


class JurisdictionTests(unittest.TestCase):
    def test_a_state_member_speaking_of_their_own_state_is_not_national(self):
        self.assertEqual(
            settle_jurisdiction(
                {"jurisdiction": "Australia"}, {"state": "vic"},
                "your government has claimed that only 1.8 per cent of social housing "
                "was unoccupied as of March 2024"),
            "Victoria")

    def test_a_state_member_quoting_a_national_figure_stays_national(self):
        self.assertEqual(
            settle_jurisdiction(
                {"jurisdiction": "Australia"}, {"state": "vic"},
                "compared to a national average of 3.8 per cent across Australia"),
            "Australia")

    def test_a_named_place_is_always_kept(self):
        self.assertEqual(
            settle_jurisdiction(
                {"jurisdiction": "Queensland"}, {"state": "federal"},
                "In Queensland, First Nations people make up 37 per cent"),
            "Queensland")

    def test_a_federal_speaker_keeps_the_national_label(self):
        self.assertEqual(
            settle_jurisdiction({"jurisdiction": "Australia"}, {"state": "federal"}, "x"),
            "Australia")


class LedeCitationTests(unittest.TestCase):
    srcs = {
        1: {"slug": "speech-1", "speaker": "Andrew Bragg"},
        2: {"slug": "speech-2", "speaker": "Jason Li"},
        3: {"slug": "speech-3", "speaker": "Sue Higginson"},
    }

    def test_a_sentence_is_moved_to_the_speaker_it_names(self):
        self.assertEqual(
            settle_lede_ref("Senator Bragg argued the government will never solve it.",
                            2, self.srcs), 1)

    def test_a_correct_citation_is_left_alone(self):
        self.assertEqual(
            settle_lede_ref("Sue Higginson opposed the bill.", 3, self.srcs), 3)

    def test_a_sentence_naming_nobody_keeps_its_citation(self):
        self.assertEqual(
            settle_lede_ref("Government speakers defended the plan.", 2, self.srcs), 2)

    def test_a_sentence_naming_two_speakers_at_once_is_dropped(self):
        self.assertIsNone(
            settle_lede_ref("Bragg and Higginson disagreed.", 2, self.srcs))


class LedeQuoteTests(unittest.TestCase):
    class FakeKb:
        bodies = {
            "speech-1": "the government's own tax changes will decrease supply over the decade",
            "speech-2": "we are talking to builders, developers and tradespeople every day",
        }

        def get_resource_by_slug(self, slug, **params):
            return {"data": {"texts": {"body": {"value": {"body": self.bodies.get(slug, "")}}}}}

    def test_a_quotation_in_the_cited_record_passes(self):
        self.assertTrue(holds_the_quotes(
            self.FakeKb(), 'Bragg said the changes "will decrease supply" this decade.',
            "speech-1", {}))

    def test_a_quotation_from_another_speech_fails(self):
        self.assertFalse(holds_the_quotes(
            self.FakeKb(), 'Bragg said the changes "will decrease supply" this decade.',
            "speech-2", {}))

    def test_curly_quotes_and_loose_spacing_still_match(self):
        self.assertTrue(holds_the_quotes(
            self.FakeKb(), 'Bragg named “builders,  developers and tradespeople”.',
            "speech-2", {}))

    def test_a_sentence_with_no_quotation_is_never_dropped(self):
        self.assertTrue(holds_the_quotes(
            self.FakeKb(), "Bragg criticised the government.", "speech-2", {}))
