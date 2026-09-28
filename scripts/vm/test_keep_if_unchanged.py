#!/usr/bin/env python3
"""Tests for keep_if_unchanged.py, run against a throwaway git repo.

    python3 -m unittest scripts/vm/test_keep_if_unchanged.py -v
"""
import contextlib
import importlib.util
import io
import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "keep_if_unchanged.py"
spec = importlib.util.spec_from_file_location("keep_if_unchanged", SCRIPT)
kiu = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kiu)

GIT_ENV = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
GIT_ENV.update(GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1")


def dump(doc) -> bytes:
    # Indented, so a byte-for-byte assertion cannot pass by accident on a re-serialised copy.
    return (json.dumps(doc, indent=2) + "\n").encode()


class Base(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)
        self.repo = self.tmp / "repo"
        self.repo.mkdir()
        self.git("init", "-q")

    def git(self, *args):
        return subprocess.run(
            ["git", "-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false",
             "-C", str(self.repo), *args],
            check=True, capture_output=True, env=GIT_ENV)

    def commit(self, rel: str, data: bytes) -> Path:
        p = self.repo / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        self.git("add", "--", rel)
        self.git("commit", "-q", "-m", f"add {rel}")
        return p

    def new(self, data: bytes, name: str = "new.out") -> Path:
        p = self.tmp / name
        p.write_bytes(data)
        return p

    def keep(self, rel, new, **kw) -> bool:
        return kiu.keep_if_unchanged(rel, new, repo=self.repo, **kw)

    def cli(self, *args) -> tuple:
        """main() in-process: (exit code, stdout, stderr)."""
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            rc = kiu.main([*map(str, args), "--repo", str(self.repo)])
        return rc, out.getvalue(), err.getvalue()


class JsonStampTests(Base):
    REL = "portal/public/data.json"

    def setUp(self):
        super().setUp()
        self.doc = {"generated": "2026-09-01T00:00:00Z", "rows": [{"id": 1, "n": "a"}, {"id": 2, "n": "b"}]}
        self.head = dump(self.doc)
        self.path = self.commit(self.REL, self.head)

    def test_only_generated_changed_keeps_committed_bytes(self):
        new = self.new(dump({**self.doc, "generated": "2026-09-02T09:09:09Z"}))
        self.assertTrue(self.keep(self.REL, new))
        self.assertEqual(self.path.read_bytes(), self.head)

    def test_cli_prints_unchanged_and_exits_zero(self):
        new = self.new(dump({**self.doc, "generated": "2026-09-02T09:09:09Z"}))
        rc, out, _ = self.cli(self.REL, new)
        self.assertEqual((rc, out), (0, f"unchanged {self.REL}\n"))
        self.assertEqual(self.path.read_bytes(), self.head)

    def test_unchanged_writes_nothing_when_working_copy_already_matches_head(self):
        before = self.path.stat().st_mtime_ns
        new = self.new(dump({**self.doc, "generated": "later"}))
        self.assertTrue(self.keep(self.REL, new))
        self.assertEqual(self.path.stat().st_mtime_ns, before)
        self.assertEqual(sorted(os.listdir(self.path.parent)), ["data.json"])

    def test_unchanged_restores_a_drifted_working_copy_from_head(self):
        self.path.write_bytes(dump({**self.doc, "generated": "drifted", "rows": []}))
        new = self.new(dump({**self.doc, "generated": "later"}))
        self.assertTrue(self.keep(self.REL, new))
        self.assertEqual(self.path.read_bytes(), self.head)
        self.assertEqual(self.git("status", "--porcelain").stdout, b"")

    def test_unchanged_restores_a_deleted_working_copy(self):
        self.path.unlink()
        new = self.new(dump({**self.doc, "generated": "later"}))
        self.assertTrue(self.keep(self.REL, new))
        self.assertEqual(self.path.read_bytes(), self.head)

    def test_real_difference_is_installed(self):
        newdoc = {**self.doc, "generated": "later", "rows": self.doc["rows"] + [{"id": 3, "n": "c"}]}
        new = self.new(dump(newdoc))
        self.assertFalse(self.keep(self.REL, new))
        self.assertEqual(self.path.read_bytes(), dump(newdoc))
        self.assertEqual(sorted(os.listdir(self.path.parent)), ["data.json"], "temp file left behind")

    def test_cli_prints_changed(self):
        new = self.new(dump({**self.doc, "rows": []}))
        rc, out, _ = self.cli(self.REL, new)
        self.assertEqual((rc, out), (0, f"changed {self.REL}\n"))
        self.assertEqual(json.loads(self.path.read_bytes())["rows"], [])

    def test_changed_keeps_the_file_mode(self):
        self.path.chmod(0o640)
        self.keep(self.REL, self.new(dump({**self.doc, "rows": []})))
        self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o640)

    def test_nested_at_stamps_and_other_timestamp_keys_are_ignored(self):
        doc = {"meta": {"generated_at": "a", "checked_at": "a", "generatedAt": "a", "updated_at": "a",
                        "generated_by": "a", "n": 1},
               "rows": [{"id": 1, "seen_at": "a", "inner": {"refreshed_at": "a", "v": 2}}]}
        rel = "portal/public/nested.json"
        head = dump(doc)
        path = self.commit(rel, head)
        stamped = json.loads(json.dumps(doc))
        stamped["meta"].update(generated_at="b", checked_at="b", generatedAt="b", updated_at="b",
                               generated_by="b")
        stamped["rows"][0]["seen_at"] = "b"
        stamped["rows"][0]["inner"]["refreshed_at"] = "b"
        self.assertTrue(self.keep(rel, self.new(dump(stamped))))
        self.assertEqual(path.read_bytes(), head)

    def test_as_at_and_updated_are_data_not_stamps(self):
        """interests/*.json `as_at` and parliamentarians meta.representation.updated are real dates: a move is a change."""
        for key in ("as_at", "updated"):
            with self.subTest(key=key):
                rel = f"portal/public/data-{key}.json"
                path = self.commit(rel, dump({key: "2026-09-02", "generated": "a", "rows": [1]}))
                self.assertFalse(self.keep(rel, self.new(dump({key: "2026-09-16", "generated": "a", "rows": [1]}))))
                self.assertEqual(json.loads(path.read_bytes())[key], "2026-09-16")

    def test_stamp_keys_added_or_removed_are_ignored_too(self):
        newdoc = {k: v for k, v in self.doc.items() if k != "generated"}
        newdoc["refreshed_at"] = "x"
        self.assertTrue(self.keep(self.REL, self.new(dump(newdoc))))
        self.assertEqual(self.path.read_bytes(), self.head)

    def test_near_miss_keys_are_real_data(self):
        for key in ("update", "atlas", "at", "reat", "regenerated", "_at_"):
            with self.subTest(key=key):
                rel = f"portal/public/near-{key}.json"
                path = self.commit(rel, dump({key: 1}))
                # "at" alone, "atlas" etc. do not match the default ignore pattern
                self.assertFalse(self.keep(rel, self.new(dump({key: 2}))))
                self.assertEqual(json.loads(path.read_bytes()), {key: 2})

    def test_ignore_key_extends_the_defaults(self):
        newdoc = {**self.doc, "generated": "later", "run_id": "42"}
        headdoc = {**self.doc, "run_id": "41"}
        rel = "portal/public/run.json"
        path = self.commit(rel, dump(headdoc))
        new = self.new(dump(newdoc))
        self.assertFalse(self.keep(rel, new), "run_id is data unless told otherwise")
        self.assertEqual(json.loads(path.read_bytes())["run_id"], "42")
        path.write_bytes(dump(headdoc))  # working tree back to HEAD's run_id 41
        self.assertTrue(self.keep(rel, new, ignore_re=[kiu.DEFAULT_IGNORE, r"^run_id$"]))
        self.assertEqual(path.read_bytes(), dump(headdoc))

    def test_cli_ignore_key_is_repeatable(self):
        rel = "portal/public/two.json"
        head = dump({"a": 1, "run": 1, "build": 1})
        path = self.commit(rel, head)
        new = self.new(dump({"a": 1, "run": 2, "build": 2}))
        rc, out, _ = self.cli(rel, new, "--ignore-key", "^run$", "--ignore-key", "^build$")
        self.assertEqual((rc, out), (0, f"unchanged {rel}\n"))
        self.assertEqual(path.read_bytes(), head)

    def test_stamp_inside_a_changed_row_still_counts_as_a_change(self):
        newdoc = {"generated": "later", "rows": [{"id": 1, "n": "a"}, {"id": 2, "n": "CHANGED"}]}
        self.assertFalse(self.keep(self.REL, self.new(dump(newdoc))))

    def test_strict_equality_distinguishes_int_float_bool_and_order(self):
        cases = {
            "int-vs-float": ({"v": 1}, {"v": 1.0}),
            "bool-vs-int": ({"v": True}, {"v": 1}),
            "list-order": ({"v": [1, 2]}, {"v": [2, 1]}),
            "key-order": ({"a": 1, "b": 2}, {"b": 2, "a": 1}),
            "null-vs-missing": ({"v": None}, {}),
        }
        for name, (old, new) in cases.items():
            with self.subTest(name):
                rel = f"portal/public/strict-{name}.json"
                path = self.commit(rel, dump(old))
                self.assertFalse(self.keep(rel, self.new(dump(new))))
                self.assertEqual(path.read_bytes(), dump(new))

    def test_whitespace_only_difference_is_unchanged(self):
        compact = self.new(json.dumps(self.doc, separators=(",", ":")).encode())
        self.assertTrue(self.keep(self.REL, compact))
        self.assertEqual(self.path.read_bytes(), self.head)

    def test_top_level_list_files_compare_too(self):
        rel = "portal/public/speakers.json"
        head = dump([["A", 1], ["B", 2]])
        path = self.commit(rel, head)
        self.assertTrue(self.keep(rel, self.new(head)))
        self.assertFalse(self.keep(rel, self.new(dump([["A", 1], ["B", 3]]))))
        self.assertEqual(json.loads(path.read_bytes()), [["A", 1], ["B", 3]])

    def test_head_copy_that_is_not_json_gets_replaced(self):
        rel = "portal/public/broken.json"
        path = self.commit(rel, b"{ this was committed truncated")
        self.assertFalse(self.keep(rel, self.new(dump(self.doc))))
        self.assertEqual(path.read_bytes(), dump(self.doc))

    def test_absolute_committed_path_is_made_repo_relative(self):
        new = self.new(dump({**self.doc, "generated": "later"}))
        self.assertTrue(kiu.keep_if_unchanged(self.path, new, repo=self.repo))
        self.assertTrue(kiu.keep_if_unchanged(Path(os.path.realpath(self.repo)) / self.REL, new, repo=self.repo))
        self.assertEqual(self.path.read_bytes(), self.head)

    def test_path_outside_the_repo_is_refused(self):
        outside = self.tmp / "elsewhere.json"
        with self.assertRaises(kiu.RepoError):
            kiu.keep_if_unchanged(outside, self.new(dump(self.doc)), repo=self.repo)
        with self.assertRaises(kiu.RepoError):
            kiu.keep_if_unchanged("../elsewhere.json", self.new(dump(self.doc)), repo=self.repo)
        self.assertFalse(outside.exists())
        rc, out, err = self.cli(outside, self.new(dump(self.doc)))
        self.assertEqual((rc, out), (3, ""))
        self.assertIn("not inside", err)


class NonJsonTests(Base):
    def test_bytes_must_match_exactly(self):
        rel = "portal/public/notes.txt"
        path = self.commit(rel, b"line one\nline two\n")
        same = self.new(b"line one\nline two\n")
        self.assertTrue(self.keep(rel, same))
        self.assertFalse(self.keep(rel, self.new(b"line one\nline two")))  # lost the final newline
        self.assertEqual(path.read_bytes(), b"line one\nline two")

    def test_ignore_keys_do_not_apply_to_non_json_paths(self):
        # JSON content, but the path is not .json: compared as bytes, so a stamp change is a change.
        rel = "portal/public/blob.txt"
        path = self.commit(rel, dump({"generated": "a", "v": 1}))
        newdata = dump({"generated": "b", "v": 1})
        rc, out, _ = self.cli(rel, self.new(newdata))
        self.assertEqual((rc, out), (0, f"changed {rel}\n"))
        self.assertEqual(path.read_bytes(), newdata)

    def test_non_json_garbage_is_fine_as_long_as_it_is_not_empty(self):
        rel = "portal/public/blob.bin"
        path = self.commit(rel, b"\x00\x01\x02")
        self.assertFalse(self.keep(rel, self.new(b"\xff\xfe not json")))
        self.assertEqual(path.read_bytes(), b"\xff\xfe not json")

    def test_jsonl_is_not_treated_as_json(self):
        rel = "portal/public/rows.jsonl"
        path = self.commit(rel, b'{"generated":"a","v":1}\n')
        self.assertFalse(self.keep(rel, self.new(b'{"generated":"b","v":1}\n')))
        self.assertEqual(path.read_bytes(), b'{"generated":"b","v":1}\n')


class UntrackedTests(Base):
    def test_path_not_in_head_is_installed_and_parents_created(self):
        self.commit("README", b"x\n")
        rel = "portal/public/graph/brand-new.json"
        data = dump({"generated": "a", "v": 1})
        rc, out, _ = self.cli(rel, self.new(data))
        self.assertEqual((rc, out), (0, f"changed {rel}\n"))
        self.assertEqual((self.repo / rel).read_bytes(), data)

    def test_untracked_but_present_file_is_overwritten_not_kept(self):
        self.commit("README", b"x\n")
        rel = "portal/public/leftover.json"
        (self.repo / "portal/public").mkdir(parents=True)
        (self.repo / rel).write_bytes(dump({"stale": True}))  # in the working tree only, never committed
        data = dump({"fresh": True})
        self.assertFalse(self.keep(rel, self.new(data)))
        self.assertEqual((self.repo / rel).read_bytes(), data)

    def test_repo_with_no_commits_installs(self):
        rel = "portal/public/first.json"
        data = dump({"v": 1})
        self.assertFalse(self.keep(rel, self.new(data)))
        self.assertEqual((self.repo / rel).read_bytes(), data)

    def test_not_a_repo_is_refused(self):
        plain = self.tmp / "plain"
        plain.mkdir()
        with self.assertRaises(kiu.RepoError):
            kiu.keep_if_unchanged("x.json", self.new(dump({"v": 1})), repo=plain)
        self.assertFalse((plain / "x.json").exists())


class BadNewFileTests(Base):
    REL = "portal/public/data.json"

    def setUp(self):
        super().setUp()
        self.head = dump({"generated": "a", "rows": [1, 2, 3]})
        self.path = self.commit(self.REL, self.head)

    def assertRefused(self, new_path, needle):
        rc, out, err = self.cli(self.REL, new_path)
        self.assertEqual(rc, 2, err)
        self.assertEqual(out, "")
        self.assertIn(needle, err)
        self.assertEqual(self.path.read_bytes(), self.head, "committed file was touched")
        self.assertEqual(self.git("status", "--porcelain").stdout, b"")
        with self.assertRaises(kiu.NewFileError):
            self.keep(self.REL, new_path)
        self.assertEqual(self.path.read_bytes(), self.head)

    def test_empty_new_file(self):
        self.assertRefused(self.new(b""), "is empty")

    def test_garbage_new_file(self):
        self.assertRefused(self.new(b"<html>502 Bad Gateway</html>"), "not valid JSON")

    def test_truncated_json_new_file(self):
        self.assertRefused(self.new(b'{"generated": "a", "rows": [1, 2,'), "not valid JSON")

    def test_missing_new_file(self):
        self.assertRefused(self.tmp / "nope.json", "is missing")

    def test_directory_as_new_file(self):
        d = self.tmp / "adir"
        d.mkdir()
        self.assertRefused(d, "not a file")

    def test_whitespace_only_is_not_json(self):
        self.assertRefused(self.new(b"  \n"), "not valid JSON")

    def test_bad_new_file_for_a_path_not_in_head_creates_nothing(self):
        rel = "portal/public/never.json"
        rc, _, _ = self.cli(rel, self.new(b"{oops"))
        self.assertEqual(rc, 2)
        self.assertFalse((self.repo / rel).exists())
        self.assertEqual(list((self.repo / "portal/public").glob(".never*")), [], "temp file left behind")

    def test_empty_non_json_new_file_is_refused_too(self):
        rel = "portal/public/notes.txt"
        path = self.commit(rel, b"keep me\n")
        rc, _, err = self.cli(rel, self.new(b""))
        self.assertEqual(rc, 2, err)
        self.assertEqual(path.read_bytes(), b"keep me\n")


class SamePathTests(Base):
    REL = "portal/public/data.json"

    def setUp(self):
        super().setUp()
        self.doc = {"generated": "a", "rows": [{"id": 1}]}
        self.head = dump(self.doc)
        self.path = self.commit(self.REL, self.head)

    def test_stamp_only_in_place_export_is_restored_to_head(self):
        self.path.write_bytes(dump({**self.doc, "generated": "b"}))
        rc, out, _ = self.cli(self.REL, self.path)
        self.assertEqual((rc, out), (0, f"unchanged {self.REL}\n"))
        self.assertEqual(self.path.read_bytes(), self.head)
        self.assertEqual(self.git("status", "--porcelain").stdout, b"")

    def test_real_in_place_change_is_left_alone(self):
        newdata = dump({"generated": "b", "rows": [{"id": 1}, {"id": 2}]})
        self.path.write_bytes(newdata)
        inode = self.path.stat().st_ino
        rc, out, _ = self.cli(self.REL, self.path)
        self.assertEqual((rc, out), (0, f"changed {self.REL}\n"))
        self.assertEqual(self.path.read_bytes(), newdata)
        self.assertEqual(self.path.stat().st_ino, inode, "install over itself should be a no-op")

    def test_absolute_path_for_both_arguments(self):
        self.path.write_bytes(dump({**self.doc, "generated": "b"}))
        self.assertTrue(kiu.keep_if_unchanged(self.path, self.path, repo=self.repo))
        self.assertEqual(self.path.read_bytes(), self.head)

    def test_same_file_through_a_symlink(self):
        link = self.tmp / "link.json"
        link.symlink_to(self.path)
        self.path.write_bytes(dump({**self.doc, "generated": "b"}))
        self.assertTrue(self.keep(self.REL, link))
        self.assertEqual(self.path.read_bytes(), self.head)

    def test_untracked_in_place_file_is_kept_as_written(self):
        rel = "portal/public/fresh.json"
        p = self.repo / rel
        data = dump({"v": 1})
        p.write_bytes(data)
        self.assertFalse(self.keep(rel, p))
        self.assertEqual(p.read_bytes(), data)


class CommandLineTests(Base):
    def test_script_exit_codes_and_output(self):
        rel = "portal/public/data.json"
        head = dump({"generated": "a", "v": 1})
        self.commit(rel, head)

        def run(new: Path):
            return subprocess.run([sys.executable, str(SCRIPT), rel, str(new), "--repo", str(self.repo)],
                                  capture_output=True, text=True, env=GIT_ENV, cwd=self.tmp)

        r = run(self.new(dump({"generated": "b", "v": 1})))
        self.assertEqual((r.returncode, r.stdout), (0, f"unchanged {rel}\n"))
        r = run(self.new(dump({"generated": "b", "v": 2})))
        self.assertEqual((r.returncode, r.stdout), (0, f"changed {rel}\n"))
        r = run(self.new(b""))
        self.assertEqual(r.returncode, 2)
        self.assertIn("left untouched", r.stderr)
        self.assertEqual(json.loads((self.repo / rel).read_bytes()), {"generated": "b", "v": 2})

    def test_bad_ignore_pattern_is_a_usage_error(self):
        rel = "portal/public/data.json"
        self.commit(rel, dump({"v": 1}))
        rc = None
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as cm:
                kiu.main([rel, str(self.new(dump({"v": 1}))), "--repo", str(self.repo), "--ignore-key", "("])
            rc = cm.exception.code
        self.assertEqual(rc, 2)


if __name__ == "__main__":
    unittest.main()
