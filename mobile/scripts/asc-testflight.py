#!/usr/bin/env python3
"""Manage only the OPAX internal TestFlight group; --dry-run makes GETs only."""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import jwt

sys.dont_write_bytecode = True
from release_support import ReleaseError, load_credentials, redact

API = "https://api.appstoreconnect.apple.com"
GROUP = "OPAX Internal"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Connect:
    def __init__(self, dry_run=False):
        load_credentials()
        self.dry_run = dry_run
        with open(os.path.expanduser(os.environ["ASC_KEY_PATH"])) as key:
            self.key = key.read()

    def request(self, method, path, data=None):
        if self.dry_run and method != "GET":
            raise ReleaseError("Dry-run attempted an API mutation.")
        url = urllib.parse.urljoin(API, path)
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != "https" or parsed.netloc != urllib.parse.urlparse(API).netloc:
            raise ReleaseError("Refusing an off-origin API pagination URL.")
        now = int(time.time())
        token = jwt.encode({"iss": os.environ["ASC_ISSUER_ID"], "iat": now,
                            "exp": now + 600, "aud": "appstoreconnect-v1"},
                           self.key, algorithm="ES256",
                           headers={"kid": os.environ["ASC_KEY_ID"], "typ": "JWT"})
        request = urllib.request.Request(url, method=method,
            data=json.dumps(data).encode() if data is not None else None,
            headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
        try:
            with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
                body = response.read()
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as error:
            # Do not echo server bodies, which may repeat signing/account values.
            raise ReleaseError(f"App Store Connect {method} failed: HTTP {error.code}. "
                               "Check API access, app permissions and Apple agreements.") from None
        except urllib.error.URLError:
            raise ReleaseError("App Store Connect network request failed; retry later.") from None

    def list(self, path, **filters):
        path += "?" + urllib.parse.urlencode({"limit": 200, **filters})
        items = []
        while path:
            page = self.request("GET", path)
            items.extend(page.get("data", []))
            path = page.get("links", {}).get("next")
        return items

    def app(self):
        apps = self.list("/v1/apps", **{"filter[bundleId]": "au.com.opax.app"})
        if len(apps) != 1:
            raise ReleaseError("OPAX App Store Connect app record is missing. "
                               "Jake must create OPAX with its registered bundle ID by hand.")
        return apps[0]


def linkage(kind, identifier):
    return {"data": {"type": kind, "id": identifier}}


def run(args, api):
    app = api.app()
    if args.next_build:
        builds = api.list("/v1/builds", **{"filter[app]": app["id"],
            "filter[preReleaseVersion.platform]": "IOS"})
        numbers = [int(b["attributes"]["version"]) for b in builds
                   if b["attributes"]["version"].isdigit()]
        print(max(numbers, default=0) + 1)
        return
    groups = api.list(f"/v1/apps/{app['id']}/betaGroups")
    group = next((g for g in groups if g["attributes"]["name"] == GROUP), None)
    if group and not group["attributes"].get("isInternalGroup"):
        raise ReleaseError("The named OPAX group is external; refusing to modify it.")
    print(f"Internal group: {'present' if group else 'would create'}")
    all_builds = bool(group and group["attributes"].get("hasAccessToAllBuilds") is True)
    print("Build access: group already sees every build" if all_builds else "Build access: explicitly assigned builds")
    tester_email = args.tester or os.environ.get("OPAX_INTERNAL_TESTER_EMAIL")
    if not tester_email:
        raise ReleaseError("Pass the existing team user's email with --tester; never commit account data.")
    tester_email = tester_email.lower()
    users = api.list("/v1/users", **{"filter[username]": tester_email})
    user = next((u for u in users if u["attributes"].get("username", "").lower() == tester_email), None)
    if not user:
        raise ReleaseError("The designated internal tester is not an existing team user.")
    print("PASS designated tester is an existing team user")
    testers = api.list("/v1/betaTesters", **{"filter[email]": tester_email})
    members = api.list(f"/v1/betaGroups/{group['id']}/betaTesters") if group else []
    # ASC can return several tester records with the same email. Prefer the
    # actual group member instead of mistaking the first global match for it.
    tester = next((t for t in members if (t["attributes"].get("email") or "").lower() == tester_email), None)
    tester_present = tester is not None
    if not tester:
        tester = next((t for t in testers if (t["attributes"].get("email") or "").lower() == tester_email), None)
    print(f"Tester membership: {'present' if tester_present else 'would add'}")
    deadline = time.monotonic() + args.wait_minutes * 60
    while True:
        builds = api.list("/v1/builds", **{"filter[app]": app["id"],
            "filter[version]": args.build, "filter[preReleaseVersion.version]": args.version,
            "filter[preReleaseVersion.platform]": "IOS"})
        if len(builds) > 1:
            raise ReleaseError("Ambiguous OPAX version/build; refusing distribution.")
        build = builds[0] if builds else None
        state = build["attributes"]["processingState"] if build else "NOT_LISTED"
        print(f"Build {args.version} ({args.build}): {state}", flush=True)
        if build and (state in ("FAILED", "INVALID") or build["attributes"].get("expired")):
            raise ReleaseError("Build failed processing or expired; refusing distribution.")
        if state == "VALID" or args.dry_run:
            break
        if time.monotonic() >= deadline:
            raise ReleaseError("Processing deadline reached. Retry after the build becomes VALID.")
        time.sleep(min(30, max(0, deadline - time.monotonic())))
    if args.dry_run:
        if build:
            localizations = api.list(f"/v1/builds/{build['id']}/betaBuildLocalizations")
            print(f"What to Test locale present: {any(l['attributes']['locale'] == args.locale for l in localizations)}")
            print(f"Export compliance exempt: {build['attributes'].get('usesNonExemptEncryption') is False}")
            current = api.list(f"/v1/betaGroups/{group['id']}/builds") if group else []
            print(f"Build available to group: {all_builds or any(b['id'] == build['id'] for b in current)}")
        print("Dry run complete: GET requests only; no upload, invitations or changes.")
        return
    if not args.what_to_test or not args.what_to_test.strip():
        raise ReleaseError("--what-to-test is required to distribute an internal build.")
    if build["attributes"].get("usesNonExemptEncryption") is True:
        raise ReleaseError("Build reports non-exempt encryption; reconcile it with the verified IPA.")
    if build["attributes"].get("usesNonExemptEncryption") is None:
        api.request("PATCH", f"/v1/builds/{build['id']}", {"data": {
            "type": "builds", "id": build["id"], "attributes": {"usesNonExemptEncryption": False}}})
    localizations = api.list(f"/v1/builds/{build['id']}/betaBuildLocalizations")
    localized = next((l for l in localizations if l["attributes"]["locale"] == args.locale), None)
    data = {"type": "betaBuildLocalizations", "attributes": {"whatsNew": args.what_to_test}}
    if localized:
        data["id"] = localized["id"]
        api.request("PATCH", f"/v1/betaBuildLocalizations/{localized['id']}", {"data": data})
    else:
        data["attributes"]["locale"] = args.locale
        data["relationships"] = {"build": linkage("builds", build["id"])}
        api.request("POST", "/v1/betaBuildLocalizations", {"data": data})
    if not group:
        group = api.request("POST", "/v1/betaGroups", {"data": {
            "type": "betaGroups", "attributes": {"name": GROUP, "isInternalGroup": True,
                "hasAccessToAllBuilds": False},
            "relationships": {"app": linkage("apps", app["id"])}}})["data"]
    if not tester:
        tester = api.request("POST", "/v1/betaTesters", {"data": {
            "type": "betaTesters", "attributes": {"email": tester_email},
            "relationships": {"betaGroups": {"data": [{"type": "betaGroups", "id": group["id"]}]}}}})["data"]
    elif not tester_present:
        api.request("POST", f"/v1/betaGroups/{group['id']}/relationships/betaTesters",
                    {"data": [{"type": "betaTesters", "id": tester["id"]}]})
    current = api.list(f"/v1/betaGroups/{group['id']}/builds")
    if not all_builds and not any(b["id"] == build["id"] for b in current):
        api.request("POST", f"/v1/betaGroups/{group['id']}/relationships/builds",
                    {"data": [{"type": "builds", "id": build["id"]}]})
    # Verify membership, rather than treating successful writes as availability proof.
    members = api.list(f"/v1/betaGroups/{group['id']}/betaTesters")
    current = api.list(f"/v1/betaGroups/{group['id']}/builds")
    if not any(t["id"] == tester["id"] for t in members) or (not all_builds and not any(b["id"] == build["id"] for b in current)):
        raise ReleaseError("TestFlight membership verification failed; inspect the OPAX group.")
    print("PASS build VALID, compliance exempt, What to Test set, tester and build available in OPAX Internal")
    print("Tester must accept TestFlight access and install on their device to prove installation.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("version")
    parser.add_argument("build", nargs="?")
    parser.add_argument("--next-build", action="store_true", help="Read next integer build across all OPAX iOS versions")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--what-to-test")
    parser.add_argument("--tester", help="Email of the existing team user to enable for internal testing")
    parser.add_argument("--locale", default="en-AU")
    parser.add_argument("--wait-minutes", type=float, default=45)
    args = parser.parse_args()
    if not args.next_build and (not args.build or not args.build.isdigit() or int(args.build) < 1):
        parser.error("A positive integer build is required")
    if args.wait_minutes < 0:
        parser.error("--wait-minutes must be nonnegative")
    try:
        run(args, Connect(dry_run=args.dry_run or args.next_build))
    except (ReleaseError, OSError, ValueError, jwt.PyJWTError) as error:
        raise SystemExit(redact(str(error)))


if __name__ == "__main__":
    main()
