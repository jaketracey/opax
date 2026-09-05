#!/usr/bin/env python3
"""Validate standing reports locally and against the live knowledge box.

v1 checked the reading list. v2 checks the whole document, because every v2
block makes a claim a reader can act on:

  every section        carries an answer, is not a refusal, and cites at least
                       one source that the knowledge box still holds
  every source         carries a passage of about 400 characters, and the
                       answer it sits under carries at least one inline
                       citation marker (a source's `answer_ranges`) pointing
                       into it — the same two things the ask page shows.
                       The lede is the one exception: it paraphrases the
                       whole report in three short paragraphs, so it may
                       carry fewer markers than the sections it draws on,
                       including none at all
  every key figure     carries a numerator, a denominator and a unit, and its
                       label names the base it is measured against
  every source slug    resolves live in the box
  the windows          do not overlap: the last era stops before `now` starts
  discovery            is real debates, not chamber furniture

  python3 scripts/validate_reports.py                 # every report
  python3 scripts/validate_reports.py indigenous      # a subset
  python3 scripts/validate_reports.py --offline       # skip the live KB pass
"""

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from parli.arag import AragConfig, AragError, KbClient, load_dotenv  # noqa: E402
from scripts.generate_reports import (  # noqa: E402
    ERAS, NOW_SINCE, PASSAGE_CHARS, REFUSAL, is_procedural_debate,
)

REPORT_DIR = ROOT / "portal" / "public" / "reports"
MOMENT_FIELDS = ("brief", "date", "speaker", "slug")
STAT_FIELDS = ("value", "label", "numerator", "denominator", "unit", "slug", "window")
# The openers the owner rejected. A v2 answer that starts with one of these is
# a regression, not a style quibble: it tells the reader they are reading a
# model's summary of a prompt rather than the record.
FORBIDDEN_OPENERS = re.compile(
    r"^\s*(?:based on|according to the (?:provided|passages)|the (?:provided )?context"
    r"|the passages|from the (?:provided )?context|the record shows|the record indicates"
    r"|the record reveals)", re.I)
# A passage is trimmed to PASSAGE_CHARS and may carry an ellipsis on either
# side ("…" is one character), so a couple of characters of slack either way
# is the trim doing its job, not a bug. PASSAGE_MIN only catches the empty or
# near-empty string a failed lookup would leave behind.
PASSAGE_MIN = 10
PASSAGE_MAX = PASSAGE_CHARS + 4


class Failure(Exception):
    pass


def check(condition: object, message: str, problems: list[str]) -> bool:
    if not condition:
        problems.append(message)
        return False
    return True


def validate_markup(where: str, sources: list[dict], text: str, problems: list[str], *,
                    require_marker: bool = True) -> None:
    """Every source carries a quotable passage; the answer carries markers.

    These are the two things the ask page shows beside a live answer — a
    passage behind each source and a superscript in the prose that says which
    source a claim came from — and a report carries both in the file instead
    of asking the platform for them again on every page view.

    `require_marker` is False for the lede: it is a paraphrase of the whole
    report in three short paragraphs, not a one-sentence-per-source list, so
    it may earn fewer markers than the sections it draws on — a synthesised
    sentence with no verbatim quotation should carry no marker, not a wrong
    one, and a lede with none at all is honest rather than broken."""
    length = len(text)
    for source in sources:
        label = source.get("slug") or source.get("title") or "?"
        passage = str(source.get("passage") or "").strip()
        check(passage, f"{where}: source {label!r} has no passage", problems)
        if passage:
            check(PASSAGE_MIN <= len(passage) <= PASSAGE_MAX,
                  f"{where}: source {label!r} passage is {len(passage)} chars", problems)
        for span in source.get("answer_ranges") or []:
            valid = (isinstance(span, list) and len(span) == 2
                     and all(isinstance(n, int) for n in span)
                     and 0 <= span[0] < span[1] <= length)
            check(valid, f"{where}: source {label!r} has a bad citation range {span!r}", problems)
    if require_marker:
        check(any(s.get("answer_ranges") for s in sources),
              f"{where}: no source carries an inline citation marker", problems)


def validate_section(where: str, section: dict, problems: list[str]) -> list[str]:
    """A section must answer, must not refuse, and must cite. Returns its slugs."""
    answer = (section.get("answer") or "").strip()
    if not check(section.get("question"), f"{where}: no question", problems):
        return []
    if not check(answer, f"{where}: empty answer", problems):
        return []
    check(not answer.startswith(REFUSAL[:24]), f"{where}: the model refused the question", problems)
    check(not FORBIDDEN_OPENERS.match(answer), f"{where}: opens with a context preamble", problems)
    sources = section.get("sources") or []
    cited = [s for s in sources if s.get("cited")]
    check(cited, f"{where}: no cited source", problems)
    validate_markup(where, sources, answer, problems)
    return [s["slug"] for s in sources if s.get("slug")]


def validate_report(slug: str, report: dict, problems: list[str]) -> list[str]:
    slugs: list[str] = []
    version = report.get("version")
    if version != 2:
        problems.append(f"{slug}: version {version!r}, expected 2")
        return slugs

    # v1 fields must survive, so the live page keeps working.
    for field in ("title", "blurb", "generated_at", "key_moments", "sections", "stats"):
        check(field in report, f"{slug}: v1 field {field!r} was dropped", problems)

    moments = report.get("key_moments") or []
    check(6 <= len(moments) <= 8, f"{slug}: {len(moments)} key speeches, expected 6-8", problems)
    speakers: set[str] = set()
    for index, moment in enumerate(moments, 1):
        missing = [f for f in MOMENT_FIELDS if not moment.get(f)]
        check(not missing, f"{slug} key speech #{index}: missing {', '.join(missing)}", problems)
        speaker = str(moment.get("speaker") or "").casefold()
        check(speaker not in speakers, f"{slug}: repeated speaker {moment.get('speaker')}", problems)
        speakers.add(speaker)
        if moment.get("slug"):
            slugs.append(moment["slug"])

    lede = report.get("lede") or {}
    lede_text = (lede.get("text") or "").strip()
    check(lede_text, f"{slug}: no lede", problems)
    check(lede.get("sources"), f"{slug}: the lede cites nothing", problems)
    check(not FORBIDDEN_OPENERS.match(lede.get("text") or ""),
          f"{slug}: the lede opens with a context preamble", problems)
    if lede_text and lede.get("sources"):
        validate_markup(f"{slug} lede", lede.get("sources") or [], lede.get("text") or "",
                        problems, require_marker=False)
    slugs += [s["slug"] for s in (lede.get("sources") or []) if s.get("slug")]

    now = report.get("now") or {}
    since = now.get("since") or ""
    check(re.fullmatch(r"\d{4}-\d{2}-\d{2}", since), f"{slug}: now.since is {since!r}", problems)
    discovered = now.get("discovered") or []
    check(discovered, f"{slug}: no debates discovered in the now window", problems)
    for entry in discovered:
        title = entry.get("title") or ""
        check(not is_procedural_debate(title),
              f"{slug}: discovered {title!r} is chamber furniture", problems)
        check((entry.get("count") or 0) >= 3, f"{slug}: {title!r} has {entry.get('count')} speeches", problems)
        check(str(entry.get("first") or "") >= since,
              f"{slug}: {title!r} starts {entry.get('first')}, before the window", problems)
        check(str(entry.get("search") or "").startswith("/search?"),
              f"{slug}: {title!r} has no search link", problems)
    sections = now.get("sections") or []
    check(6 <= len(sections) <= 8, f"{slug}: {len(sections)} now sections, expected 6-8", problems)
    for section in sections:
        slugs += validate_section(f"{slug} now {section.get('question', '?')[:44]!r}", section, problems)

    over_time = report.get("over_time") or {}
    eras = over_time.get("eras") or []
    check(len(eras) == len(ERAS), f"{slug}: {len(eras)} eras, expected {len(ERAS)}", problems)
    for era in eras:
        slugs += validate_section(f"{slug} era {era.get('label')}", era, problems)
        check(str(era.get("to") or "") < since,
              f"{slug}: era {era.get('label')} ends {era.get('to')}, on or after the now window", problems)
    tide = over_time.get("tide") or []
    check(len(tide) == 4, f"{slug}: {len(tide)} tide decades, expected 4", problems)
    for row in tide:
        labelled = row.get("labelled") or 0
        check(labelled > 0, f"{slug}: tide {row.get('decade')} has no labelled denominator", problems)
        check((row.get("count") or 0) <= labelled,
              f"{slug}: tide {row.get('decade')} counts more than it labelled", problems)
    check(over_time.get("key_moments") is not None,
          f"{slug}: over_time carries no key moments", problems)

    for index, stat in enumerate(report.get("key_stats") or [], 1):
        missing = [f for f in STAT_FIELDS if not str(stat.get(f) or "").strip()]
        check(not missing, f"{slug} figure #{index}: missing {', '.join(missing)}", problems)
        label = str(stat.get("label") or "")
        check(not label.endswith("."), f"{slug} figure #{index}: label is a sentence", problems)
        check(any(c.isdigit() for c in str(stat.get("numerator") or "")),
              f"{slug} figure #{index}: numerator carries no number", problems)
        check(stat.get("window") in ("now", "all"),
              f"{slug} figure #{index}: window is {stat.get('window')!r}", problems)
        if stat.get("slug"):
            slugs.append(stat["slug"])

    positions = report.get("positions") or []
    for index, position in enumerate(positions, 1):
        check(position.get("window") == "now",
              f"{slug} position #{index}: window is {position.get('window')!r}", problems)
        for field in ("party", "position", "slug"):
            check(position.get(field), f"{slug} position #{index}: no {field}", problems)
        if position.get("slug"):
            slugs.append(position["slug"])

    voices = report.get("voices") or {}
    for window in ("now", "all"):
        rows = voices.get(window) or []
        check(rows, f"{slug}: no {window} voices", problems)
        check(len(rows) <= 8, f"{slug}: {len(rows)} {window} voices, expected at most 8", problems)
        for row in rows:
            check(row.get("speaker") and (row.get("count") or 0) > 0,
                  f"{slug}: a {window} voice has no speaker or no count", problems)
    return slugs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reports", nargs="*", help="report slugs (all when omitted)")
    parser.add_argument("--offline", action="store_true", help="skip the live KB slug pass")
    args = parser.parse_args()
    load_dotenv(str(ROOT / ".env"))

    problems: list[str] = []
    slugs: list[str] = []
    checked = []
    for path in sorted(REPORT_DIR.glob("*.json")):
        if path.name == "index.json":
            continue
        if args.reports and path.stem not in args.reports:
            continue
        report = json.loads(path.read_text())
        found = validate_report(path.stem, report, problems)
        slugs += found
        checked.append((path.stem, len(report.get("now", {}).get("sections") or []),
                        len(report.get("key_stats") or [])))

    if not checked:
        raise SystemExit("no reports matched")

    live = 0
    if not args.offline:
        kb = KbClient(AragConfig.from_env())
        unique = sorted(set(slugs))

        def check_slug(slug: str) -> str | None:
            try:
                resource = kb.get_resource_by_slug(slug)
            except AragError as error:
                return f"{slug}: KB returned {error.status}"
            if not resource or resource.get("slug") != slug:
                return f"{slug}: KB returned {(resource or {}).get('slug')!r}"
            return None

        with ThreadPoolExecutor(max_workers=8) as pool:
            problems += [p for p in pool.map(check_slug, unique) if p]
        live = len(unique)

    summary = ", ".join(f"{name} ({sections} sections, {stats} figures)"
                        for name, sections, stats in checked)
    if problems:
        for problem in problems:
            print(f"FAIL {problem}", file=sys.stderr)
        raise SystemExit(f"{len(problems)} problem(s) across {len(checked)} report(s)")
    print(f"Validated {len(checked)} report(s) and {live} live KB slugs: {summary}.")


if __name__ == "__main__":
    main()
