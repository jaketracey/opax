"""NSW fragment blocks: every division block is found, and a block is attached
to a table-of-contents division only when its name tables agree with it.

Legislative Council, 23 Dec 2025 (HANSARD-1820781676-102591): one paragraph read
"The Committee divided ." and was missed, so the Greens amendment No. 2 division
(Ayes 5, Noes 25, negatived) took the third reading's question and outcome."""
import xml.etree.ElementTree as ET

from parli.ingest import votes_state

XH = "http://www.w3.org/1999/xhtml"


def fragment(*blocks):
    paras = []
    for question, divided, ayes, noes, outcome in blocks:
        paras.append(f'<p xmlns="{XH}">{question}</p>')
        paras.append(f'<p xmlns="{XH}">{divided}</p>')
        paras.append(f'<p xmlns="{XH}" class="DivisionHeading">AYES</p>')
        paras += [f'<p xmlns="{XH}" class="DivisionNames">Aye{i}, A</p>' for i in range(ayes)]
        paras.append(f'<p xmlns="{XH}" class="DivisionHeading">NOES</p>')
        paras += [f'<p xmlns="{XH}" class="DivisionNames">No{i}, B</p>' for i in range(noes)]
        paras.append(f'<p xmlns="{XH}">{outcome}</p>')
    return ET.fromstring(f"<hansard><fragment.text>{''.join(paras)}</fragment.text></hansard>")


def test_a_detached_full_stop_still_starts_a_block():
    frag = fragment(
        ("That the amendment be agreed to.", "The Committee divided .", 5, 25, "Amendment negatived."),
        ("That this bill be now read a third time.", "The House divided.", 18, 8, "Motion agreed to."),
    )
    blocks = votes_state.nsw_fragment_blocks(frag)
    assert [b["question"] for b in blocks] == ["That the amendment be agreed to.", "That this bill be now read a third time."]
    assert [b["result_text"] for b in blocks] == ["Amendment negatived.", "Motion agreed to."]
    assert [(len(b["names"]["aye"]), len(b["names"]["no"])) for b in blocks] == [(5, 25), (18, 8)]


def test_a_block_whose_names_disagree_with_the_toc_is_not_attached():
    third = {"question": "That this bill be now read a third time.", "result_text": "Motion agreed to.",
             "names": {"aye": ["x"] * 18, "no": ["y"] * 8, "paired": []}}
    assert votes_state.nsw_block_matches(third, 18, 8)
    assert not votes_state.nsw_block_matches(third, 5, 25)
    assert not votes_state.nsw_block_matches(None, 5, 25)
    # No name table to compare: keep the positional pairing rather than drop evidence.
    assert votes_state.nsw_block_matches({"names": {"aye": [], "no": [], "paired": []}}, 5, 25)
    assert votes_state.nsw_block_matches(third, None, 8)
