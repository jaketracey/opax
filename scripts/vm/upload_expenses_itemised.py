#!/usr/bin/env python3
"""
Keep R2 in step with the itemised expenses tree (scripts/export_expenses_itemised.py), which the portal
serves from `/media/expenses/v1/<person_id>/<year>.json`. The nightly runs it after its push
(scripts/vm/nightly.sh, sync_expenses_itemised), every night:

  python3 scripts/vm/upload_expenses_itemised.py --tree ~/.cache/autoresearch/pipeline/expenses-itemised \
      --repo ~/opax --env ~/opax/.env --skip-without-credentials
  python3 scripts/vm/upload_expenses_itemised.py --tree ... --dry-run     # list and compare, change nothing

With --repo it first checks that the tree belongs to what is published: the export stamps the sha256 of
the expenses.json it was written beside (`<tree>.expenses-sha256`), and nothing is sent unless HEAD's
portal/public/expenses.json is that file. A night whose expenses group was held or reverted therefore
leaves R2 as it was, and a later night that publishes it sends the tree then.

It lists what the bucket holds under the prefix (three requests for 2,675 files), PUTs only the files
whose MD5 differs from the stored ETag, as `application/json` with a Cache-Control, and deletes stored
files the tree no longer has (a person whose lines moved to another id), unless they are more than
MAX_ORPHAN_RATIO of what is stored, in which case none is deleted and it says so. A run on unchanged
data sends nothing. It reads and writes nowhere but BUCKET/PREFIX: both are constants, not options.
A request that fails with 429, a 5xx or a connection error is tried three times with a pause.

Credentials are an R2 API token scoped to that one bucket (object read and write), in the environment
(on the box, ~/.config/opax/nightly.env, which nightly.sh exports) or the --env file: OPAX_R2_ACCOUNT_ID,
OPAX_R2_ACCESS_KEY_ID, OPAX_R2_SECRET_ACCESS_KEY. They are never printed.

Exit codes: 0 in step, or nothing to do (held, or no credentials with --skip-without-credentials);
2 usage, no credentials or no tree; 3 refused: the tree has under MIN_RATIO of the files already
stored (a shrunken export; the stored files are kept); 1 a request failed after its retries (what was
already sent stays; the next run sends the rest).
"""

import argparse
import datetime
import hashlib
import hmac
import os
import re
import subprocess
import sys
import time
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path

BUCKET = "opax-media"
PREFIX = "expenses/v1/"
REGION = "auto"
MIN_RATIO = 0.9
MAX_ORPHAN_RATIO = 0.05
TRIES = 3
CACHE_CONTROL = "public, max-age=3600"
EXPENSES_JSON = "portal/public/expenses.json"
# ASCII only, the same pattern as the export's safe_id and the portal's /media route
FILE_RE = re.compile(r"^[A-Za-z0-9_-]{1,80}/\d{4}\.json$", re.ASCII)
EMPTY_SHA256 = hashlib.sha256(b"").hexdigest()


def _quote(value, safe="-_.~"):
    return urllib.parse.quote(str(value), safe=safe)


def sign(method, host, path, query, headers, payload_sha256, access_key, secret_key, now, region=REGION):
    """AWS Signature Version 4 for S3: the request's headers plus Authorization.

    `headers` are extra headers to sign (lower-case names); host, x-amz-date and x-amz-content-sha256
    are added. `query` is a dict. `now` is an aware UTC datetime.
    """
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    day = amz_date[:8]
    signed = {k.lower(): " ".join(str(v).split()) for k, v in headers.items()}
    signed.update({"host": host, "x-amz-date": amz_date, "x-amz-content-sha256": payload_sha256})
    names = ";".join(sorted(signed))
    canonical = "\n".join([
        method,
        _quote(path, safe="/-_.~"),
        "&".join(f"{_quote(k)}={_quote(v)}" for k, v in sorted(query.items())),
        "".join(f"{k}:{signed[k]}\n" for k in sorted(signed)),
        names,
        payload_sha256,
    ])
    scope = f"{day}/{region}/s3/aws4_request"
    to_sign = "\n".join(["AWS4-HMAC-SHA256", amz_date, scope, hashlib.sha256(canonical.encode()).hexdigest()])
    key = f"AWS4{secret_key}".encode()
    for part in (day, region, "s3", "aws4_request"):
        key = hmac.new(key, part.encode(), hashlib.sha256).digest()
    signature = hmac.new(key, to_sign.encode(), hashlib.sha256).hexdigest()
    out = dict(signed)
    out["authorization"] = (f"AWS4-HMAC-SHA256 Credential={access_key}/{scope}, SignedHeaders={names}, "
                            f"Signature={signature}")
    return out


class R2:
    """The three calls this script makes, against one bucket and one prefix."""

    def __init__(self, session, account_id, access_key, secret_key, sleep=time.sleep):
        self.session, self.access_key, self.secret_key, self.sleep = session, access_key, secret_key, sleep
        self.host = f"{account_id}.r2.cloudflarestorage.com"

    def _send(self, method, path, query=None, headers=None, body=b""):
        query = query or {}
        digest = hashlib.sha256(body).hexdigest() if body else EMPTY_SHA256
        url = f"https://{self.host}{_quote(path, safe='/-_.~')}"
        if query:
            url += "?" + "&".join(f"{_quote(k)}={_quote(v)}" for k, v in sorted(query.items()))
        problem = None
        for attempt in range(1, TRIES + 1):
            # signed afresh each try: the signature carries the time
            now = datetime.datetime.now(datetime.timezone.utc)
            signed = sign(method, self.host, path, query, headers or {}, digest, self.access_key, self.secret_key, now)
            try:
                response = self.session.request(method, url, headers=signed, data=body or None, timeout=120)
            except OSError as err:      # requests' connection and timeout errors are OSErrors
                problem = type(err).__name__
            else:
                if response.status_code < 300:
                    return response
                problem = f"HTTP {response.status_code}"
                if response.status_code != 429 and response.status_code < 500:
                    break               # a refusal will not change on a retry
            if attempt < TRIES:
                self.sleep(2 ** attempt)
        raise RuntimeError(f"{method} {path}: {problem}")

    def list(self):
        """{key under PREFIX: md5 hex} for everything stored under PREFIX."""
        found, token = {}, None
        while True:
            query = {"list-type": "2", "prefix": PREFIX, "max-keys": "1000"}
            if token:
                query["continuation-token"] = token
            root = ET.fromstring(self._send("GET", f"/{BUCKET}", query).content)
            tag = lambda node, name: next((c.text or "" for c in node if c.tag.rsplit("}", 1)[-1] == name), "")
            for node in root:
                if node.tag.rsplit("}", 1)[-1] == "Contents":
                    key = tag(node, "Key")
                    if key.startswith(PREFIX):
                        found[key[len(PREFIX):]] = tag(node, "ETag").strip('"').lower()
            token = tag(root, "NextContinuationToken")
            if tag(root, "IsTruncated").lower() != "true" or not token:
                return found

    def _key(self, name, doing):
        if not FILE_RE.match(name):
            raise RuntimeError(f"refusing to {doing} {name!r}: not <person_id>/<year>.json")
        return f"/{BUCKET}/{PREFIX}{name}"

    def put(self, name, body):
        self._send("PUT", self._key(name, "write"), body=body,
                   headers={"content-type": "application/json", "cache-control": CACHE_CONTROL})

    def delete(self, name):
        self._send("DELETE", self._key(name, "delete"))


def local_files(tree):
    """{relative name: path} for the export's files; anything else in the tree is an error."""
    out = {}
    for path in sorted(tree.rglob("*")):
        if path.is_dir():
            continue
        name = path.relative_to(tree).as_posix()
        if not FILE_RE.match(name):
            raise SystemExit(f"unexpected file in the tree: {name}")
        out[name] = path
    return out


def sync(store, tree, dry_run=False, log=print):
    """Send what differs and delete what the tree no longer has. Returns (exit code, counts)."""
    files = local_files(tree)
    if not files:
        log("the tree is empty: nothing sent")
        return 2, {}
    stored = store.list()
    if stored and len(files) < MIN_RATIO * len(stored):
        log(f"REFUSED: the tree has {len(files)} files, the bucket {len(stored)} under {PREFIX}; "
            f"a shrunken export is not uploaded and the stored files are kept")
        return 3, {"local": len(files), "stored": len(stored)}
    sent = same = sent_bytes = 0
    for name, path in files.items():
        body = path.read_bytes()
        if stored.get(name) == hashlib.md5(body).hexdigest():   # noqa: S324 (an ETag comparison, not security)
            same += 1
            continue
        if not dry_run:
            store.put(name, body)
        sent += 1
        sent_bytes += len(body)
    # Stored files the tree no longer has would be served for ever (a person's lines re-filed under another id).
    # Only names of this export's own shape are ever deleted, and never more than a small share in one run.
    orphans = sorted(name for name in set(stored) - set(files) if FILE_RE.match(name))
    deleted = 0
    if len(orphans) > MAX_ORPHAN_RATIO * len(stored):
        log(f"{len(orphans)} stored files are not in the tree, over {MAX_ORPHAN_RATIO:.0%} of the {len(stored)} stored: "
            f"none deleted; check the export, then delete them by hand if they are stale")
    else:
        for name in orphans:
            if not dry_run:
                store.delete(name)
            deleted += 1
    counts = {"local": len(files), "stored_before": len(stored), "sent": sent, "unchanged": same,
              "sent_bytes": sent_bytes, "orphans": len(orphans), "deleted": deleted}
    log(("DRY RUN " if dry_run else "") + " ".join(f"{k}={v}" for k, v in counts.items()))
    return 0, counts


def stamp_path(tree):
    return tree.with_name(tree.name + ".expenses-sha256")


def published_problem(tree, repo):
    """Why the tree must not be uploaded yet, or None when HEAD's expenses.json is the one it was exported beside."""
    stamp = stamp_path(tree)
    if not stamp.is_file():
        return f"no {stamp.name} beside the tree (it was not exported beside an expenses.json)"
    try:
        head = subprocess.run(["git", "-C", str(repo), "show", f"HEAD:{EXPENSES_JSON}"], capture_output=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return f"HEAD's {EXPENSES_JSON} could not be read"
    if hashlib.sha256(head).hexdigest() != stamp.read_text().strip():
        return f"HEAD's {EXPENSES_JSON} is not the export this tree was written beside (held or not yet published)"
    return None


def read_env_file(path, names):
    """The named KEY=value lines of a dotenv file; values are never logged."""
    out = {}
    try:
        text = Path(path).read_text()
    except OSError:
        return out
    for line in text.splitlines():
        key, sep, value = line.strip().removeprefix("export ").partition("=")
        if sep and key.strip() in names:
            out[key.strip()] = value.strip().strip("'\"")
    return out


CREDENTIALS = ("OPAX_R2_ACCOUNT_ID", "OPAX_R2_ACCESS_KEY_ID", "OPAX_R2_SECRET_ACCESS_KEY")


def main(argv=None):
    ap = argparse.ArgumentParser(description=f"itemised expenses tree -> r2://{BUCKET}/{PREFIX}")
    ap.add_argument("--tree", required=True, type=Path)
    ap.add_argument("--repo", type=Path, help="send only while this checkout's HEAD publishes the expenses.json the tree was exported beside")
    ap.add_argument("--env", type=Path, help="a dotenv file to read the OPAX_R2_* credentials from when the environment lacks them")
    ap.add_argument("--skip-without-credentials", action="store_true", help="exit 0, not 2, when there are no credentials")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    say = lambda line: print(line, file=sys.stderr)
    tree = args.tree.expanduser()
    if not tree.is_dir():
        say(f"no tree at {tree}")
        return 2
    if args.repo:
        problem = published_problem(tree, args.repo.expanduser())
        if problem:
            say(f"held, nothing sent: {problem}")
            return 0
    from_file = read_env_file(args.env.expanduser(), CREDENTIALS) if args.env else {}
    creds = [os.environ.get(k) or from_file.get(k) for k in CREDENTIALS]
    if not all(creds):
        say("skipped: " + ", ".join(CREDENTIALS) + " are not all set")
        return 0 if args.skip_without_credentials else 2
    import requests
    try:
        code, _ = sync(R2(requests.Session(), *creds), tree, dry_run=args.dry_run, log=say)
    except RuntimeError as err:
        say(f"upload failed: {str(err)[:200]}")
        return 1
    return code


if __name__ == "__main__":
    sys.exit(main())
