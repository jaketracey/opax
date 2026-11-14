"""Clean Commons display credits without discarding a derivative's author."""

import html
import re


def credit_text(value):
    text = html.unescape(re.sub(r"<[^>]+>", " ", value or ""))
    text = " ".join(text.split())
    # Commons unknown-author templates can repeat their visible and hidden text.
    repeated = re.fullmatch(r"(.{3,}?)(?:\s*\1)+", text)
    return repeated[1].strip() if repeated else text


def portrait_artist(artist, attribution="", credit=""):
    """Use the supplied attribution/source when Commons has no meaningful artist.

    A derivative-work author is still a real credit even if the original author
    field contains an unfinished template.
    """
    artist = credit_text(artist)
    placeholder = re.fullmatch(r"unknown(?: author)?|anonymous", artist, re.I)
    unfinished = re.search(r"PLEASE COMPLETE AUTHOR INFORMATION", artist, re.I)
    if artist and not placeholder and not unfinished:
        return artist
    fallback = credit_text(attribution) or credit_text(credit)
    derivative = re.search(r"\bderivative work:\s*(.+)$", artist, re.I) if unfinished else None
    if derivative:
        author = f"derivative work: {derivative[1]}"
        return f"{fallback.rstrip(':; ')}; {author}" if fallback else author
    return fallback or artist
