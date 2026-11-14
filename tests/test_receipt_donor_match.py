import pytest

from scripts.aec_receipt_selection import ReceiptSelection
from scripts.receipt_donor_match import ReceiptDonorMatcher, bracketless_name


def matcher(nodes, aliases=None, industry=None):
    from scripts.donor_disclosure import exact_alias_index
    aliases = aliases or {}
    selection = ReceiptSelection(aliases, exact_alias_index(aliases), {}, {}, set())
    return ReceiptDonorMatcher([{"id": id, "kind": "donor", "label": name, "industry": industry} for id, name in nodes], selection)


@pytest.mark.parametrize("name", ["Alex (Morgan) Hart", "Alex [Morgan] Hart", "ALEX (MORGAN) HART"])
def test_bracketed_middle_name_matches_one_existing_node(name):
    result = matcher([("alex", "Alex Hart")], industry="individual").match(name)
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


@pytest.mark.parametrize("annotation", ["please see annotation note page 18", "SEE return", "NOTE 2", "Page 18", "ANNOTATION"])
def test_annotated_restatement_routes_to_review_without_matching(annotation):
    name = f"Example Manufacturing ({annotation}) Ltd"
    lookup = matcher([("company", "Example Manufacturing Ltd")])
    assert lookup.match(name).node_id is None
    assert lookup.match(name).method == "annotation_review"
    selection = ReceiptSelection({}, {}, {}, {"Example Party": "Labor"}, set())
    assert selection.exclusion(name, "Example Party", 250, "2021-22", "political_party") == "flagged_review"


def test_legitimate_bracketed_branch_still_matches():
    lookup = matcher([("union", "Example Workers Union (QLD)")])
    assert lookup.match("Example Workers (Construction Division) Union (qld)").node_id == "union"


def test_state_brackets_cannot_match_a_different_state_alias():
    lookup = matcher([("company", "Example Developments (QLD) Pty Ltd")])
    result = lookup.match("Example Developments (NSW) Pty Ltd")
    assert result.node_id is None
    assert result.method == "state_mismatch"
    assert lookup.match("Example Developments (Residential) (QLD) Pty Ltd").node_id == "company"


def test_state_filtering_does_not_choose_between_existing_nodes():
    lookup = matcher([("generic", "Example Audit"), ("state", "Example Audit (NSW)")])
    result = lookup.match("Example Audit (VIC)")
    assert result.node_id is None
    assert result.candidates == {"generic", "state"}


def test_uncapped_bracket_fold_recovers_a_separate_resolved_individual():
    from scripts.donor_disclosure import exact_alias_index
    aliases = {'Example Person': 'base-entity', 'Example (Middle) Person': 'bracket-entity'}
    selection = ReceiptSelection(aliases, exact_alias_index(aliases),
        {'base-entity': 'individual', 'bracket-entity': 'individual'}, {}, set())
    lookup = ReceiptDonorMatcher([
        {'id': 'base', 'kind': 'donor', 'label': 'Example Person'},
        {'id': 'bracket', 'kind': 'donor', 'label': 'Example (Middle) Person'},
    ], selection)
    assert lookup.match('Example (Middle) Person').node_id == 'bracket', 'drawing lookup is unchanged'
    folds, decisions = lookup.bracket_folds()
    assert folds == {'bracket': 'base'}
    assert decisions == [{'source': 'bracket', 'status': 'folded', 'method': 'brackets',
                          'candidates': ['base'], 'target': 'base'}]


@pytest.mark.parametrize('reverse', [False, True])
def test_uncapped_bracket_fold_lists_ambiguity_before_checking_kind(reverse):
    nodes = [
        {'id': 'one', 'kind': 'donor', 'label': 'Example Person', 'industry': 'individual'},
        {'id': 'two', 'kind': 'donor', 'label': 'Example, Person', 'industry': 'finance'},
        {'id': 'bracket', 'kind': 'donor', 'label': 'Example (Middle) Person', 'industry': 'individual'},
    ]
    selection = ReceiptSelection({}, {}, {}, {}, set())
    lookup = ReceiptDonorMatcher(nodes[::-1] if reverse else nodes, selection)
    folds, [decision] = lookup.bracket_folds()
    assert folds == {}
    assert decision == {'source': 'bracket', 'status': 'ambiguous', 'method': 'brackets', 'candidates': ['one', 'two']}


def test_uncapped_bracket_fold_requires_matching_known_kinds_and_a_plain_base():
    selection = ReceiptSelection({}, {}, {}, {}, set())
    nodes = [{'id': 'base', 'kind': 'donor', 'label': 'Example Source', 'industry': 'finance'},
             {'id': 'person', 'kind': 'donor', 'label': 'Example (Middle) Source', 'industry': 'individual'},
             {'id': 'unknown', 'kind': 'donor', 'label': 'Example (Other) Source', 'industry': 'other'},
             {'id': 'alone', 'kind': 'donor', 'label': 'Another (Middle) Source', 'industry': 'individual'}]
    folds, decisions = ReceiptDonorMatcher(nodes, selection).bracket_folds()
    assert folds == {}
    assert {d['source']: d['status'] for d in decisions} == {'person': 'kind_mismatch', 'unknown': 'kind_mismatch', 'alone': 'no_base'}
    assert ReceiptDonorMatcher(nodes, selection).bracket_folds({'person'})[0] == {}, 'inactive drawing-only bases cannot change a fold'


def test_uncapped_bracket_only_identities_stay_separate_and_are_listed():
    selection = ReceiptSelection({}, {}, {}, {}, set())
    nodes = [{'id': 'one', 'kind': 'donor', 'label': 'Example (One) Source', 'industry': 'finance'},
             {'id': 'two', 'kind': 'donor', 'label': 'Example (Two) Source', 'industry': 'finance'}]
    folds, decisions = ReceiptDonorMatcher(nodes, selection).bracket_folds()
    assert folds == {}
    assert all(d['status'] == 'ambiguous' and d['candidates'] == ['one', 'two'] for d in decisions)


@pytest.mark.parametrize('qualifier', [
    'Donation Returned', 'funds returned', 'Refunded', 'Loan', 'In Kind',
    'in-kind', 'non cash', 'repaid', 'reimbursement', 'cancelled', 'reversed', 'duplicate',
])
def test_transaction_qualifiers_never_fold_even_inside_a_personal_name(qualifier):
    selection = ReceiptSelection({}, {}, {}, {}, set())
    for label in [f'Alex Hart ({qualifier})', f'Alex ({qualifier}) Hart']:
        lookup = ReceiptDonorMatcher([
            {'id': 'base', 'kind': 'donor', 'label': 'Alex Hart', 'industry': 'individual'},
            {'id': 'qualified', 'kind': 'donor', 'label': label, 'industry': 'individual'},
        ], selection)
        folds, [decision] = lookup.bracket_folds()
        assert folds == {}
        assert decision['status'] == 'transaction_qualifier'


@pytest.mark.parametrize('base,qualified,industry,status', [
    ('Example Audit', 'Example Audit (NSW)', 'finance', 'state_branch'),
    ('Example Realty', 'Example Realty (Alice Springs)', 'property', 'organisation_qualifier'),
    ('Example Union', 'Example Union (Example Subsidiary P/L)', 'unions', 'entity_qualifier'),
    ('Example Energy', 'Example Energy (Example Power Pty Ltd)', 'fossil_fuels', 'entity_qualifier'),
    ('Example Holdings Ltd', 'Example Holdings (No. 2092) Ltd', 'other', 'entity_qualifier'),
    ('Example Hospitality', 'Example Hospitality (T/as Example Bar)', 'hospitality', 'entity_qualifier'),
])
def test_separately_resolved_branches_and_business_entities_are_not_bracket_aliases(base, qualified, industry, status):
    from scripts.donor_disclosure import exact_alias_index
    aliases = {base: 'national', qualified: 'branch'}
    selection = ReceiptSelection(aliases, exact_alias_index(aliases),
                                 {'national': 'company', 'branch': 'company'}, {}, set())
    lookup = ReceiptDonorMatcher([
        {'id': 'base', 'kind': 'donor', 'label': base, 'industry': industry},
        {'id': 'qualified', 'kind': 'donor', 'label': qualified, 'industry': industry},
    ], selection)
    folds, [decision] = lookup.bracket_folds()
    assert folds == {}
    assert decision['status'] == status
    assert lookup.match(qualified).node_id == 'qualified'


def test_company_industry_blocks_personal_middle_name_heuristic_despite_resolver_kind():
    from scripts.donor_disclosure import exact_alias_index
    aliases = {'Example Realty': 'base', 'Example (Alice Springs) Realty': 'branch'}
    selection = ReceiptSelection(aliases, exact_alias_index(aliases),
                                 {'base': 'individual', 'branch': 'individual'}, {}, set())
    nodes = [{'id': label, 'label': label, 'kind': 'donor', 'industry': 'property'} for label in aliases]
    folds, [decision] = ReceiptDonorMatcher(nodes, selection).bracket_folds()
    assert folds == {}
    assert decision['status'] == 'organisation_qualifier'


@pytest.mark.parametrize('name,returned', [
    ('Alex Hart (Donation Returned)', True),
    ('Alex Hart (funds returned)', True),
    ('Alex Hart (Refunded)', True),
    ('Example (Returns Processing Pty Ltd)', False),
    ('Example (Returned Goods Pty Ltd)', False),
    ('Alex Hart (In Kind)', False),
])
def test_returned_giving_exclusion_requires_an_explicit_transaction_not_a_company_name(name, returned):
    from scripts.receipt_donor_match import has_returned_qualifier
    assert bool(has_returned_qualifier(name)) is returned


@pytest.mark.parametrize('name', ['Alex Hart (Refund)', 'Alex Hart (donation return)',
                                  'Alex Hart (returned donation)', 'Alex Hart - Donation Returned',
                                  'Alex Hart - Refund'])
def test_additional_return_forms_are_preserved_and_excluded_from_giving(name):
    from scripts.receipt_donor_match import has_returned_qualifier, has_transaction_qualifier
    assert has_returned_qualifier(name)
    assert has_transaction_qualifier(name)
    lookup = ReceiptDonorMatcher([{'id':'base','kind':'donor','label':'Alex Hart','industry':'individual'}],
                                 ReceiptSelection({}, {}, {}, {}, set()))
    assert lookup.match(name).node_id is None


def test_map_and_receipt_lookup_share_reviewed_aliases_and_transaction_guards():
    selection = ReceiptSelection({}, {}, {}, {}, set())
    reviewed = [
        {'id':'union','kind':'donor','label':'Example Workers Union','industry':'unions',
         'aliases':['EWU','Example Workers Union (NSW Branch)']},
        {'id':'branch','kind':'donor','label':'Example Audit (NSW)','industry':'finance','aliases':[]},
        {'id':'national','kind':'donor','label':'Example Audit','industry':'finance','aliases':[]},
    ]
    for drawing in [[],reviewed]:
        lookup=ReceiptDonorMatcher(drawing,selection,reviewed)
        for name in ['EWU (Representative)', 'Example Workers Union (Northern NSW Branch)']:
            assert lookup.match(name).node_id=='union'
        assert lookup.match('Example Audit (NSW)').node_id=='branch'
        assert lookup.match('Example Audit (QLD)').node_id is None
        for qualifier in ['Loan','Donation Returned','Refund','In Kind','Example Subsidiary P/L']:
            assert lookup.match(f'Example Workers Union ({qualifier})').node_id is None
