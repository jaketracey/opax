import json
from pathlib import Path
import re

import pytest

from scripts import build_transcript_fulltext as ft

OUT = Path(__file__).resolve().parents[1] / "portal" / "public" / "transcripts"


def test_tokens_fold_case_accents_and_apostrophes():
    assert ft.tokens("The Robodebt scheme’s income-averaging, café 2016 and 42 a") == [
        "robodebt", "schemes", "income", "averaging", "cafe", "2016"]


def test_shard_is_fnv1a_mod_shards():
    # The TypeScript shardOf() must agree; these values pin the hash.
    assert ft.shard("robodebt") == ft.shard("robodebt")
    h = 0x811C9DC5
    for b in b"averaging":
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    assert ft.shard("averaging") == h % ft.SHARDS


def w(x0, y0, text):
    return (x0, y0, x0 + 6 * len(text), y0 + 10, text, 0, 0, 0)


def test_clean_page_drops_margin_numbers_headers_and_keeps_folio():
    words = [w(273, 15, "OFFICIAL"), w(72, 100, "MR"), w(90, 100, "SCOTT:"), w(130, 100, "Thank"), w(48, 129, "5"),
             w(72, 129, "20"), w(90, 129, "people"), w(72, 768, "ASCRC"), w(286, 768, "P-444")]
    folio, text = ft.clean_page(words, 595, 842)
    assert folio == "P-444"
    assert text == "MR SCOTT: Thank\n20 people"


def test_order_pattern_is_broad_but_not_data_words():
    for s in ["subject to a non-publication order", "under the pseudonym Amy", "a direction in place prohibiting the publication of",
              "address not be published in any form", "a suppression order", "confidentiality orders and the like"]:
        assert ft.ORDER.search(s), s
    for s in ["de-identified hospital data", "you are being suppressed", "anonymity of the survey"]:
        assert not ft.ORDER.search(s), s


def test_word_index_pages_are_detected():
    assert ft.is_word_index(" ".join(f"word{i} [1] - 12:3" for i in range(20)))
    assert not ft.is_word_index("MR SCOTT: Exhibit [1] - tendered.")


@pytest.mark.skipif(not (OUT / "index.json").exists(), reason="full text not built")
def test_published_files_honour_the_quote_policy():
    ix = json.loads((OUT / "index.json").read_text(encoding="utf-8"))
    assert {d["commission"] for d in ix["docs"]} == set(ft.COMMISSIONS)
    for d in ix["docs"]:
        doc = json.loads((OUT / d["file"].removeprefix("/transcripts/")).read_text(encoding="utf-8"))
        assert doc["label"] == ft.LABEL and doc["licence"] == "CC BY 4.0" and doc["quote_policy"] == d["quote_policy"]
        text = " ".join(re.sub(r"\s+", " ", p.get("text", "")) for p in doc["pages"])
        if doc["quote_policy"] == "no_quotes":
            assert not text.strip() and doc["order_pages"]
        else:
            assert not ft.ORDER.search(text), d["key"]
            assert not any(ft.is_word_index(p["text"]) for p in doc["pages"])
