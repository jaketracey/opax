#!/usr/bin/env python3
"""Tests for the reviewed hold list (scripts/vm/gate_hold.txt) that nightly.sh applies before its portal gate.

    python3 -m unittest scripts/vm/test_gate_hold.py -v

A held group goes back to HEAD. A group left to publish whose exporter read the held group's files would then
publish something built from data that was not published, so it has to be held as well. The reads are taken
from the exporters' source: every script a refresh step runs for a group, searched for the published paths
of the other groups.
"""
import datetime
import re
import unittest
from pathlib import Path

VM = Path(__file__).resolve().parent
ROOT = VM.parents[1]
HOLD = VM / "gate_hold.txt"
# the steps that write the published tree, and the wrappers they call
REFRESH_SCRIPTS = ("scripts/weekly_refresh.sh", "scripts/daily_refresh.sh", "scripts/vm/divisions_refresh.sh",
                   "scripts/vm/bills_refresh.sh", "scripts/vm/evidence_refresh.sh")
# nightly.sh refuses to hold these: each has its own acceptance state
UNHOLDABLE = {"bills", "votes", "divisions", "seovotes", "evidence", "corpus", "wrangler", "bills-tas", "bills-act",
              "budget", "vic-gifts"}
# the install wrappers every step shares: they name other groups' paths in their usage text, and read none
WRAPPERS = {"scripts/vm/export_step.sh", "scripts/vm/keep_if_unchanged.py"}
LAST_EXPIRY = datetime.date(2026, 12, 31)   # a hold is short; move this only in a reviewed change


def group_paths():
    text = (VM / "data_groups.sh").read_text()
    return {m.group(1): m.group(2).split() for m in re.finditer(r'^\s*\[([a-z-]+)\]="([^"]+)"', text, re.M)}


def holds():
    rows = []
    for line in HOLD.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        group, expiry, reason = (line.split(None, 2) + ["", ""])[:3]
        rows.append((group, expiry, reason))
    return rows


def owner(path, groups):
    for group, paths in groups.items():
        if any(path == p or path.startswith(p + "/") for p in paths):
            return group
    return None


def scripts_named(line):
    found = set(re.findall(r"scripts/[A-Za-z0-9_/.-]+\.(?:py|mjs|sh)", line))
    found |= {"parli/" + m.split(".", 1)[1].replace(".", "/") + ".py" for m in re.findall(r"-m (parli\.[a-z_.]+)", line)}
    return found


def exporters(groups):
    """group -> (the scripts its export steps run, the step lines themselves)"""
    out = {}
    for script in REFRESH_SCRIPTS:
        path = ROOT / script
        if not path.exists():
            continue
        for line in re.sub(r"\\\n", " ", path.read_text()).splitlines():
            if line.lstrip().startswith("#") or "EXPORT" not in line:
                continue
            written = [owner(p, groups) for p in re.findall(r"portal/(?:public|src)/[A-Za-z0-9_./-]+", line)]
            written = [g for g in written if g]
            if not written:
                continue
            scripts, lines = out.setdefault(written[0], (set(), []))
            lines.append(line)
            pending = scripts_named(line)
            while pending:   # a wrapper (export_people.sh) names the scripts that do the work
                name = pending.pop()
                if name in scripts or name in WRAPPERS or not (ROOT / name).exists():
                    continue
                scripts.add(name)
                if name.endswith(".sh"):
                    pending |= scripts_named((ROOT / name).read_text())
    return out


def path_patterns(paths):
    """Regexes that find a published path in an exporter's source: a file by its path under portal/public,
    a directory as public/<dir> or as a quoted path segment."""
    patterns = []
    for path in paths:
        rel = path.split("portal/public/", 1)[-1]
        if "portal/public/" not in path:
            continue
        if re.search(r"\.[a-z]+$", rel):
            patterns.append(r"(?<![A-Za-z0-9_.-])" + re.escape(rel) + r"(?![A-Za-z0-9_-])")
            if rel.startswith("graph/money."):   # the money graphs are also read as graph/money*.json
                patterns.append(r"graph/money\*\.json")
        else:
            patterns.append(r"public/" + re.escape(rel) + r"(?![A-Za-z0-9_-])")
            patterns.append(r"/\s*[\"']" + re.escape(rel) + r"[\"'/]")
    return patterns


def reads(groups):
    """group -> the other groups whose published files its exporters name"""
    out = {}
    for group, (scripts, lines) in exporters(groups).items():
        source = "\n".join(lines) + "".join("\n" + (ROOT / s).read_text() for s in sorted(scripts))
        for other, paths in groups.items():
            if other != group and any(re.search(p, source) for p in path_patterns(paths)):
                out.setdefault(group, set()).add(other)
    return out


class GateHoldList(unittest.TestCase):
    def setUp(self):
        self.groups = group_paths()
        self.holds = holds()
        self.held = {group for group, _, _ in self.holds}

    def test_every_line_is_a_known_holdable_group_with_an_expiry_and_a_reason(self):
        for group, expiry, reason in self.holds:
            self.assertIn(group, self.groups, "unknown group")
            self.assertNotIn(group, UNHOLDABLE, f"{group} has its own acceptance state")
            self.assertRegex(expiry, r"^\d{4}-\d{2}-\d{2}$", f"{group}: expiry")
            self.assertLessEqual(datetime.date.fromisoformat(expiry), LAST_EXPIRY, f"{group}: a hold is short")
            self.assertGreaterEqual(len(reason), 20, f"{group}: say why it is held")
        self.assertEqual(len(self.held), len(self.holds), "a group is listed twice")

    def test_the_exporter_scan_sees_the_known_reads(self):
        # if these go missing the scan has stopped working, and the next test would pass for nothing
        found = reads(self.groups)
        self.assertLessEqual({"money", "speakers"}, found.get("access", set()))
        self.assertIn("money", found.get("suppliers", set()))
        self.assertLessEqual({"money", "access"}, found.get("fits", set()))
        self.assertLessEqual({"money", "access", "fits"}, found.get("interests", set()))
        self.assertIn("suppliers", found.get("taxcharity", set()))
        for group in ("expenses", "people", "pay"):
            self.assertIn(group, exporters(self.groups), f"no export step found for {group}")

    def test_no_group_left_to_publish_reads_a_held_groups_files(self):
        found = reads(self.groups)
        leaks = {group: sorted(others & self.held) for group, others in found.items()
                 if group not in self.held and others & self.held}
        self.assertEqual(leaks, {}, "these groups read held files: hold them too (or fix the cause and lift the hold)")

    def test_nightly_applies_the_list_before_validation_and_fails_on_an_expired_hold(self):
        nightly = (VM / "nightly.sh").read_text()
        self.assertLess(nightly.index("gate_hold.txt"), nightly.index("# ---- 4. validate what will be committed"))
        self.assertRegex(nightly, r'if \[\[ "\$hold_today" > "\$hold_expiry" \]\]; then\n[^\n]*revert_group[^\n]*\n\s*fail "the review hold on')
        for group in UNHOLDABLE:
            self.assertRegex(nightly, r"case \"\$hold_group\" in [a-z|-]*\b" + re.escape(group) + r"\b")


if __name__ == "__main__":
    unittest.main()
