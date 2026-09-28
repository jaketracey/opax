import copy
import unittest
from unittest.mock import Mock, patch

from parli.arag import AragError
from scripts.arag_patch_speakers import (
    OWNED_LABELSETS, dropped_non_owned, merge_owned, patch_one, read_classifications,
)


def C(labelset, label, **extra):
    return {"labelset": labelset, "label": label, **extra}


class TextPatchTests(unittest.TestCase):
    def test_text_repair_preserves_existing_enrichments(self):
        kb = Mock()
        document = {
            'slug': 'speech-123', 'title': 'A speech', 'origin': {},
            'usermetadata': {'classifications': []}, 'extra': {},
            'texts': {'body': {'body': 'Clean speech.', 'format': 'PLAIN'}},
        }
        with patch('scripts.arag_patch_speakers.map_speech', return_value=document):
            self.assertEqual(patch_one(kb, {}, 'text:openaustralia_website_footer'), ('patched', None))
        kb.patch_resource_by_slug.assert_called_once_with('speech-123', {'texts': document['texts']})
        kb.get_resource_by_slug.assert_not_called()          # a text patch reads nothing

    def test_speaker_repair_still_updates_metadata_without_text(self):
        kb = FakeBox({"speech-123": [C("kind", "speech")]})
        document = dict(slug='speech-123', title='Speaker', origin={}, usermetadata={'classifications': []}, extra={}, texts={})
        with patch('scripts.arag_patch_speakers.map_speech', return_value=document):
            self.assertEqual(patch_one(kb, {}, 'speaker'), ('patched', None))
        self.assertNotIn('texts', kb.patches[0][1])


class FakeBox:
    """An in-memory knowledge box with the box's semantics that matter here: a PATCH carrying
    usermetadata.classifications REPLACES the whole list."""

    def __init__(self, resources, drop_after_patch=None, fail_read=None):
        self.res = {slug: {"title": "old", "usermetadata": {"classifications": copy.deepcopy(cls)}} for slug, cls in resources.items()}
        self.patches, self.reads = [], 0
        self.drop_after_patch = drop_after_patch      # {'times': n, 'labelset': x}: the first n patches lose that labelset
        self.fail_read = fail_read or set()

    def get_resource_by_slug(self, slug, **params):
        self.reads += 1
        if slug not in self.res:
            raise AragError(404, "u", "not found")
        if slug in self.fail_read:
            raise AragError(400, "u", "bad request")
        return copy.deepcopy(self.res[slug])

    def patch_resource_by_slug(self, slug, body):
        self.patches.append((slug, copy.deepcopy(body)))
        if slug not in self.res:
            raise AragError(404, "u", "not found")
        r = self.res[slug]
        for k in ("title", "origin", "extra"):
            if k in body:
                r[k] = body[k]
        if "usermetadata" in body and "classifications" in body["usermetadata"]:
            cls = copy.deepcopy(body["usermetadata"]["classifications"])
            d = self.drop_after_patch
            if d and d["times"] > 0:
                d["times"] -= 1
                cls = [c for c in cls if c["labelset"] != d["labelset"]]
            r["usermetadata"] = {"classifications": cls}

    def labels(self, slug):
        return {(c["labelset"], c["label"]) for c in self.res[slug]["usermetadata"]["classifications"]}


PUSHED = [C("kind", "speech"), C("source", "committee_senate"), C("state", "federal"), C("party", "Labor"),
          C("chamber", "senate_committee"), C("decade", "2020s"), C("speaker_type", "witness"),
          C("topic", "health"), C("topic", "ageing")]


def doc_with(*labels, slug="speech-1"):
    return dict(slug=slug, title="Ms Lopez — Topic — 2026-05-27", origin={"collaborators": ["Margaret Lopez"]},
                usermetadata={"classifications": list(labels)}, extra={"metadata": {"speech_id": 1}}, texts={})


def run(kb, document, slug="speech-1", reason="speaker"):
    with patch('scripts.arag_patch_speakers.map_speech', return_value=document):
        return patch_one(kb, {}, reason)


class FieldPatchKeepsEveryLabelItDoesNotOwn(unittest.TestCase):
    def test_topic_kind_source_state_chamber_and_decade_survive_and_only_party_and_speaker_type_change(self):
        kb = FakeBox({"speech-1": PUSHED})
        # the row now says: member, no party change to Liberal; its own list carries no topic (it never does)
        out = run(kb, doc_with(C("kind", "speech"), C("source", "committee_senate"), C("state", "federal"), C("party", "Liberal"),
                               C("chamber", "senate_committee"), C("decade", "2020s"), C("speaker_type", "member")))
        self.assertEqual(out, ("patched", None))
        got = kb.labels("speech-1")
        self.assertIn(("topic", "health"), got)
        self.assertIn(("topic", "ageing"), got)
        for keep in (("kind", "speech"), ("source", "committee_senate"), ("state", "federal"), ("chamber", "senate_committee"), ("decade", "2020s")):
            self.assertIn(keep, got)
        self.assertEqual({l for ls, l in got if ls == "party"}, {"Liberal"})
        self.assertEqual({l for ls, l in got if ls == "speaker_type"}, {"member"})
        self.assertEqual(kb.res["speech-1"]["title"], "Ms Lopez — Topic — 2026-05-27")        # the other fields are still written
        self.assertEqual(kb.res["speech-1"]["origin"], {"collaborators": ["Margaret Lopez"]})

    def test_what_the_old_patch_sent_would_have_dropped_the_topics(self):
        """Regression guard: sending the row's own list (the old behaviour) loses topic; the merge does not."""
        row_list = [C("kind", "speech"), C("party", "Liberal"), C("speaker_type", "member")]
        kb = FakeBox({"speech-1": PUSHED})
        kb.patch_resource_by_slug("speech-1", {"usermetadata": {"classifications": row_list}})
        self.assertNotIn(("topic", "health"), kb.labels("speech-1"))
        kb2 = FakeBox({"speech-1": PUSHED})
        run(kb2, doc_with(*row_list))
        self.assertIn(("topic", "health"), kb2.labels("speech-1"))

    def test_an_owned_label_the_row_no_longer_has_is_removed_and_a_new_one_is_added(self):
        kb = FakeBox({"speech-1": [C("kind", "speech"), C("party", "Labor"), C("topic", "health")]})
        run(kb, doc_with(C("kind", "speech"), C("speaker_type", "witness")))          # no party now; a type it had none of
        self.assertEqual(kb.labels("speech-1"), {("kind", "speech"), ("topic", "health"), ("speaker_type", "witness")})

    def test_a_cancelled_label_keeps_its_flag_and_unknown_labelsets_are_kept(self):
        kb = FakeBox({"speech-1": [C("kind", "speech"), C("topic", "health", cancelled_by_user=True), C("custom", "x")]})
        run(kb, doc_with(C("kind", "speech")))
        cls = kb.res["speech-1"]["usermetadata"]["classifications"]
        self.assertIn(C("topic", "health", cancelled_by_user=True), cls)
        self.assertIn(C("custom", "x"), cls)

    def test_the_list_is_read_immediately_before_the_write(self):
        kb = FakeBox({"speech-1": [C("kind", "speech"), C("topic", "health")]})
        original = kb.get_resource_by_slug
        calls = []

        def spy(slug, **kw):
            calls.append("read")
            return original(slug, **kw)
        kb.get_resource_by_slug = spy
        orig_patch = kb.patch_resource_by_slug
        kb.patch_resource_by_slug = lambda s, b: (calls.append("write"), orig_patch(s, b))[1]
        run(kb, doc_with(C("kind", "speech")))
        self.assertEqual(calls, ["read", "write", "read"])            # read, write, read back


class FieldPatchGuards(unittest.TestCase):
    def test_a_read_with_no_kind_label_is_refused_and_nothing_is_written(self):
        kb = FakeBox({"speech-1": [C("topic", "health")]})
        status, why = run(kb, doc_with(C("kind", "speech"), C("speaker_type", "member")))
        self.assertEqual(status, "failed")
        self.assertIn("no kind classification", why)
        self.assertEqual(kb.patches, [])

    def test_a_resource_with_no_classifications_at_all_is_refused(self):
        kb = FakeBox({"speech-1": []})
        self.assertEqual(run(kb, doc_with(C("kind", "speech")))[0], "failed")
        self.assertEqual(kb.patches, [])

    def test_a_missing_resource_is_missing_on_the_read_and_on_the_write(self):
        self.assertEqual(run(FakeBox({}), doc_with(C("kind", "speech"))), ("missing", None))
        kb = FakeBox({"speech-1": [C("kind", "speech")]})
        kb.patch_resource_by_slug = Mock(side_effect=AragError(404, "u", "gone"))
        self.assertEqual(run(kb, doc_with(C("kind", "speech"))), ("missing", None))

    def test_a_label_lost_by_the_box_after_the_patch_is_re_sent_once(self):
        kb = FakeBox({"speech-1": PUSHED}, drop_after_patch={"times": 1, "labelset": "topic"})
        self.assertEqual(run(kb, doc_with(C("kind", "speech"), C("speaker_type", "member"))), ("patched", None))
        self.assertIn(("topic", "health"), kb.labels("speech-1"))
        self.assertEqual(len(kb.patches), 2)

    def test_labels_still_missing_after_the_re_send_fail_the_row(self):
        kb = FakeBox({"speech-1": PUSHED}, drop_after_patch={"times": 5, "labelset": "topic"})
        status, why = run(kb, doc_with(C("kind", "speech")))
        self.assertEqual(status, "failed")
        self.assertIn("still missing", why)
        self.assertEqual(len(kb.patches), 2)                            # one re-send, no more

    def test_an_unreadable_resource_fails_without_writing(self):
        kb = FakeBox({"speech-1": PUSHED}, fail_read={"speech-1"})
        self.assertEqual(run(kb, doc_with(C("kind", "speech")))[0], "failed")
        self.assertEqual(kb.patches, [])


class Helpers(unittest.TestCase):
    def test_owned_labelsets_are_the_speaker_ones(self):
        self.assertEqual(OWNED_LABELSETS, {"party", "speaker_type"})

    def test_read_classifications_ignores_malformed_entries_and_a_non_dict(self):
        self.assertEqual(read_classifications(None), [])
        self.assertEqual(read_classifications({"usermetadata": {"classifications": [C("a", "b"), {"labelset": "x"}, "junk", C("", "y")]}}), [C("a", "b")])

    def test_merge_and_dropped(self):
        before = [C("kind", "speech"), C("party", "Labor"), C("topic", "health")]
        merged = merge_owned(before, [C("party", "Liberal"), C("kind", "speech"), C("topic", "ignored")])
        self.assertEqual(merged, [C("kind", "speech"), C("topic", "health"), C("party", "Liberal")])   # only owned new labels join
        self.assertEqual(dropped_non_owned(before, merged), [])
        self.assertEqual(dropped_non_owned(before, [C("kind", "speech")]), [C("topic", "health")])       # party is owned: not "dropped"
