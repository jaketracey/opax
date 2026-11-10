"""The speaker normaliser and the shared non-person rule (speeches-press-011, members-electorates-005,
state-datasets-009): one rule for the roster and the speaker directory."""
import pytest

from parli.ingest.speaker_names import non_person_name, normalize_speaker


@pytest.mark.parametrize("raw, name", [
    ("Reverend the Hon. FRED NILE", "Fred Nile"),
    ("the Right Hon. Jane Lomax-Smith", "Jane Lomax-Smith"),
    ("Rt Hon. JOHN KEY (Prime Minister of New Zealand)", "John Key"),
    ("The Honourable George Walker Bush", "George Walker Bush"),
    ("Katter, Bob, Jnr, MP", "Bob Katter"),
    ("Bird, Sharon, MEMBER OF PARLIAMENT", "Sharon Bird"),
    # unchanged prints
    ("Mr TEAGUE", "Teague"), ("Senator HUME", "Hume"), ("The Hon. K.A. HILDYARD", "K.A. Hildyard"),
    ("Hon. SJ HINCHLIFFE", "SJ Hinchliffe"), ("Grace, Elizabeth, MP", "Elizabeth Grace"),
    ("Mr DEPUTY SPEAKER (Mr Nehl)", "Nehl"), ("Ms Honey", "Honey"), ("Witness A", "Witness A"),
])
def test_names(raw, name):
    assert normalize_speaker(raw) == name


@pytest.mark.parametrize("raw", [
    "Government members", "Opposition members", "An opposition member", "A government member", "Opposition member",
    "Honourable members", "An honourable member", "Mr", "Ms", "Dr", "Senator", "Hon", "The Hon.", "ON", "ER", "de",
])
def test_labels_titles_and_fragments_are_no_one(raw):
    assert normalize_speaker(raw) is None


@pytest.mark.parametrize("name, verdict", [
    ("Government members", True), ("Opposition members", True), ("Senator", True), ("Hon", True), ("Mr", True),
    ("Ms", True), ("Dr", True), ("On", True), ("Er", True), ("de", True), ("Witness A", True), ("Witness 6", True),
    ("", True), (None, True),
    ("Fred Nile", False), ("Teague", False), ("Ng", False), ("Witness", False), ("Witnesses Smith", False),
    ("Reverend the Hon. Fred Nile", False), ("Honey", False), ("Ong", False),
])
def test_non_person_name(name, verdict):
    assert non_person_name(name) is verdict
