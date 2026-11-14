"""Commons template artefacts should not become displayed artist names."""

from scripts.portrait_credits import credit_text, portrait_artist


def test_repeated_unknown_author_uses_attribution():
    artist = "<span>Unknown author</span><span>Unknown author</span>"
    assert credit_text(artist) == "Unknown author"
    assert portrait_artist(artist, "Fixture Party website", "https://example.org") == "Fixture Party website"


def test_unfinished_author_uses_credit_and_preserves_derivative_author():
    artist = "<div>Original.jpg: PLEASE COMPLETE AUTHOR INFORMATION</div><div>derivative work: FixtureAuthor</div>"
    assert portrait_artist(artist, "", "This file was derived from: Original.jpg:") == (
        "This file was derived from: Original.jpg; derivative work: FixtureAuthor"
    )


def test_meaningful_artist_and_missing_fallback():
    assert portrait_artist("FixtureAuthor", "Fixture source", "Own work") == "FixtureAuthor"
    assert portrait_artist("Unknown authorUnknown author") == "Unknown author"
    assert credit_text("A &amp; B") == "A & B"
