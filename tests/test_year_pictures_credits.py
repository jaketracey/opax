"""Run with: python3 -m unittest discover -s tests -p test_year_pictures_credits.py

A year-in-pictures credit names a person or archive, never a bare web address
(BACKLOG A49). scripts/year_pictures_credits.py rewrites an address-only credit
to the picture's author, falling back to the archive's name, and keeps the
address as credit_url.
"""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import year_pictures_credits as Y  # noqa: E402


def entry(**overrides):
    base = {
        "file": "years/pictures/2030/invented-rally.webp",
        "caption": "An invented rally outside an invented hall, 1 May 2030.",
        "author": "Avery Quillfeather",
        "credit": "https://www.flickr.com/photos/invented/123456/",
        "licence": "CC BY-SA 4.0",
        "licence_url": "https://creativecommons.org/licenses/by-sa/4.0/",
        "source_url": "https://commons.wikimedia.org/wiki/File:Invented_rally.jpg",
    }
    base.update(overrides)
    return base


class CreditFor(unittest.TestCase):
    def test_url_credit_with_author_gives_the_author(self):
        self.assertEqual(
            Y.credit_for(entry()),
            ("Avery Quillfeather", "https://www.flickr.com/photos/invented/123456/"),
        )

    def test_author_is_stripped_of_html_and_trimmed(self):
        picture = entry(author='  <a href="//commons.wikimedia.org/wiki/User:Aq">Avery&nbsp;Quillfeather</a>\n ')
        self.assertEqual(Y.credit_for(picture)[0], "Avery Quillfeather")

    def test_no_usable_author_falls_back_to_the_archive(self):
        for author in ("", "   ", "Unknown", "<span>anonymous</span>", None):
            with self.subTest(author=author):
                picture = entry(author=author, credit="https://www.dvidshub.net/image/1/invented")
                self.assertEqual(Y.credit_for(picture), ("DVIDS", "https://www.dvidshub.net/image/1/invented"))

    def test_unknown_host_falls_back_to_the_host(self):
        picture = entry(author="", credit="http://www.invented-archive.example/item/9")
        self.assertEqual(Y.credit_for(picture)[0], "invented-archive.example")

    def test_several_addresses_keep_the_first_as_the_link_with_entities_decoded(self):
        picture = entry(credit="http://a.example/x?p=1&amp;q=2 http://b.example/y")
        self.assertEqual(Y.credit_for(picture), ("Avery Quillfeather", "http://a.example/x?p=1&q=2"))

    def test_named_credits_are_left_alone(self):
        for credit in (
            "Own work",
            "Invented Archive – https://invented.example/photo/1",
            "invented.example, A caption mentioning the event",
            None,
        ):
            with self.subTest(credit=credit):
                self.assertEqual(Y.credit_for(entry(credit=credit)), (credit, None))


class Normalise(unittest.TestCase):
    def manifest(self):
        return {
            "2030": [
                entry(),
                entry(file="years/pictures/2030/invented-hall.webp", credit="Invented Archive"),
            ]
        }

    def test_rewrites_only_the_credit_and_keeps_key_order(self):
        manifest = self.manifest()
        before = json.loads(json.dumps(manifest))
        changes = Y.normalise(manifest)
        self.assertEqual(len(changes), 1)
        first = manifest["2030"][0]
        self.assertEqual(first["credit"], "Avery Quillfeather")
        self.assertEqual(first["credit_url"], "https://www.flickr.com/photos/invented/123456/")
        keys = list(first)
        self.assertEqual(keys.index("credit_url"), keys.index("credit") + 1)
        rest = {k: v for k, v in first.items() if k not in ("credit", "credit_url")}
        self.assertEqual(rest, {k: v for k, v in before["2030"][0].items() if k != "credit"})
        self.assertEqual(manifest["2030"][1], before["2030"][1])
        # A second pass has nothing to do.
        self.assertEqual(Y.normalise(manifest), [])

    def test_cli_check_and_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "pictures.json"
            path.write_text(Y.dump(self.manifest()), encoding="utf-8")
            script = str(ROOT / "scripts" / "year_pictures_credits.py")
            check = [sys.executable, script, "--check", "--manifest", str(path)]
            self.assertEqual(subprocess.run(check, capture_output=True).returncode, 1)
            subprocess.run([sys.executable, script, "--manifest", str(path)], check=True, capture_output=True)
            self.assertEqual(subprocess.run(check, capture_output=True).returncode, 0)
            self.assertEqual(json.loads(path.read_text())["2030"][0]["credit"], "Avery Quillfeather")


class ReleasedManifest(unittest.TestCase):
    def test_no_released_credit_is_a_bare_address(self):
        manifest = json.loads(Y.MANIFEST.read_text(encoding="utf-8"))
        bare = [
            (year, p["file"], p["credit"])
            for year, pictures in manifest.items()
            for p in pictures
            if Y.is_bare_url(p.get("credit"))
        ]
        self.assertEqual(bare, [])


if __name__ == "__main__":
    unittest.main()
