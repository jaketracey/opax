#!/usr/bin/env python3
"""
Send the itemised expenses tree (scripts/export_expenses_itemised.py) to R2, where the portal serves
it from `/media/expenses/v1/<person_id>/<year>.json`. Run by the monthly refresh group:

  python3 scripts/vm/upload_expenses_itemised.py --tree ~/.cache/autoresearch/pipeline/expenses-itemised
  python3 scripts/vm/upload_expenses_itemised.py --tree ... --dry-run     # list and compare, send nothing

It lists what the bucket holds under the prefix, then PUTs only the files whose MD5 differs from the
stored ETag, as `application/json`. A run on unchanged data sends nothing. It never deletes, and it
writes nowhere but BUCKET/PREFIX: both are constants, not options.

Credentials are an R2 API token scoped to that one bucket (object read and write), in the environment
or ~/opax/.env on the box: OPAX_R2_ACCOUNT_ID, OPAX_R2_ACCESS_KEY_ID, OPAX_R2_SECRET_ACCESS_KEY. They
are never printed.

Exit codes: 0 sent or already identical; 2 usage, no credentials or no tree; 3 refused: the tree has
under MIN_RATIO of the files already stored (a shrunken export; the stored files are kept); 1 a
request failed (files already sent stay; the next run sends the rest).
"""

import argparse
import datetime
import hashlib
import hmac
import os
import re
import sys
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path

BUCKET = "opax-media"
PREFIX = "expenses/v1/"
REGION = "auto"
MIN_RATIO = 0.9
FILE_RE = re.compile(r"^[A-Za-z0-9_-]+/\d{4}\.json$")
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
    """The two calls this script makes, against one bucket."""

    def __init__(self, session, account_id, access_key, secret_key):
        self.session, self.access_key, self.secret_key = session, access_key, secret_key
        self.host = f"{account_id}.r2.cloudflarestorage.com"

    def _send(self, method, path, query=None, headers=None, body=b""):
        query = query or {}
        digest = hashlib.sha256(body).hexdigest() if body else EMPTY_SHA256
        now = datetime.datetime.now(datetime.timezone.utc)
        signed = sign(method, self.host, path, query, headers or {}, digest, self.access_key, self.secret_key, now)
        url = f"https://{self.host}{_quote(path, safe='/-_.~')}"
        if query:
            url += "?" + "&".join(f"{_quote(k)}={_quote(v)}" for k, v in sorted(query.items()))
        response = self.session.request(method, url, headers=signed, data=body or None, timeout=120)
        if response.status_code >= 300:
            raise RuntimeError(f"{method} {path}: HTTP {response.status_code}")
        return response

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

    def put(self, name, body):
        if not FILE_RE.match(name):
            raise RuntimeError(f"refusing to write {name!r}: not <person_id>/<year>.json")
        self._send("PUT", f"/{BUCKET}/{PREFIX}{name}", headers={"content-type": "application/json"}, body=body)


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
    """Send what differs. Returns (exit code, counts)."""
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
    counts = {"local": len(files), "stored_before": len(stored), "sent": sent, "unchanged": same,
              "sent_bytes": sent_bytes, "stored_not_in_tree": len(set(stored) - set(files))}
    log(("DRY RUN " if dry_run else "") + " ".join(f"{k}={v}" for k, v in counts.items()))
    return 0, counts


def main(argv=None):
    ap = argparse.ArgumentParser(description=f"itemised expenses tree -> r2://{BUCKET}/{PREFIX}")
    ap.add_argument("--tree", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    tree = args.tree.expanduser()
    if not tree.is_dir():
        print(f"no tree at {tree}", file=sys.stderr)
        return 2
    creds = [os.environ.get(k) for k in ("OPAX_R2_ACCOUNT_ID", "OPAX_R2_ACCESS_KEY_ID", "OPAX_R2_SECRET_ACCESS_KEY")]
    if not all(creds):
        print("OPAX_R2_ACCOUNT_ID, OPAX_R2_ACCESS_KEY_ID and OPAX_R2_SECRET_ACCESS_KEY are not all set", file=sys.stderr)
        return 2
    import requests
    try:
        code, _ = sync(R2(requests.Session(), *creds), tree, dry_run=args.dry_run,
                       log=lambda line: print(line, file=sys.stderr))
    except (RuntimeError, requests.RequestException) as err:
        print(f"upload failed: {type(err).__name__}: {str(err)[:200]}", file=sys.stderr)
        return 1
    return code


if __name__ == "__main__":
    sys.exit(main())
