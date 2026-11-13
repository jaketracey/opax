import pytest

from scripts.aec_receipt_selection import ReceiptSelection
from scripts.receipt_donor_match import ReceiptDonorMatcher, bracketless_name


def matcher(nodes, aliases=None):
    from scripts.donor_disclosure import exact_alias_index
    aliases = aliases or {}
    selection = ReceiptSelection(aliases, exact_alias_index(aliases), {}, {}, set())
    return ReceiptDonorMatcher([{"id": id, "kind": "donor", "label": name} for id, name in nodes], selection)


@pytest.mark.parametrize("name", ["Alex (Morgan) Hart", "Alex [Morgan] Hart", "ALEX (MORGAN) HART"])
def test_bracketed_middle_name_matches_one_existing_node(name):
    result = matcher([("alex", "Alex Hart")]).match(name)
    assert result.node_id == "alex"
    assert result.method == "brackets"


@pytest.mark.parametrize("name", ["ALEX HART", "  Alex,  Hart. ", "Alex\u00a0Hart"])
def test_case_punctuation_and_whitespace_match(name):
    result = matcher([("alex", "Alex Hart")]).match(name)
    assert result.node_id == "alex"
    assert result.method == "normalised"


def test_ambiguous_stripped_name_stays_unmatched_regardless_of_node_order():
    nodes = [("jordan", "Jordan Vale"), ("other", "Jordan (Quinn) Vale")]
    for order in [nodes, nodes[::-1]]:
        result = matcher(order).match("Jordan (Riley) Vale")
        assert result.node_id is None
        assert result.candidates == {"jordan", "other"}
        assert result.method == "brackets"


def test_existing_distinct_pair_keeps_its_own_rows_without_merging():
    nodes = [("first", "North-South Example Ltd"), ("second", "North South Example Ltd")]
    aliases = {"North-South Example Ltd": "one", "North South Example Ltd": "two"}
    lookup = matcher(nodes, aliases)
    assert lookup.match(nodes[0][1]).node_id == "first"
    assert lookup.match(nodes[1][1]).node_id == "second"
    assert lookup.match("NORTH SOUTH EXAMPLE LTD").node_id is None
    assert lookup.match("North South (Trading) Example Ltd").node_id is None


def test_existing_bracketed_pair_keeps_its_own_exact_and_case_matches():
    lookup = matcher([("jordan", "Jordan Vale"), ("other", "Jordan (Quinn) Vale")])
    assert lookup.match("Jordan Vale").node_id == "jordan"
    assert lookup.match("Jordan (Quinn) Vale").node_id == "other"
    assert lookup.match("JORDAN (QUINN) VALE").node_id == "other"
    assert lookup.match("Jordan (Riley) Vale").node_id is None


def test_entity_collisions_are_not_resolved_by_the_last_node():
    lookup = matcher([("first", "Example Systems"), ("second", "Example System")],
                     {"Example Systems": "same", "Example System": "same", "Example Systems Ltd": "same"})
    assert lookup.match("Example Systems Ltd").node_id is None
    assert lookup.match("Example Systems Ltd").candidates == {"first", "second"}


@pytest.mark.parametrize("name", ["Alex Morgan Hart", "Alex (Morgan Hart", "Alex (Morgan (Riley)) Hart", "Alex Harth"])
def test_unbracketed_tokens_malformed_brackets_and_near_names_are_not_dropped(name):
    assert matcher([("alex", "Alex Hart")]).match(name).node_id is None


def test_empty_stripped_key_never_matches():
    assert bracketless_name("(Morgan)") == ""
    assert matcher([("alex", "(Morgan)")]).match("[Riley]").node_id is None
