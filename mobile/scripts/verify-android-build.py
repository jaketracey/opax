#!/usr/bin/env python3
"""Inspect the packaged local APK, including its optimized resource names."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("variant", choices=["development", "e2e", "production"])
parser.add_argument("apk", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--certificate-sha256", help="Expected public upload certificate SHA-256; default is the local debug key")
args = parser.parse_args()
sdk = Path(os.environ["ANDROID_HOME"])
analyzer = sdk / "cmdline-tools/latest/bin/apkanalyzer"
build_tools = sdk / "build-tools" / os.environ.get("OPAX_ANDROID_BUILD_TOOLS", "36.0.0")


def run(*command):
    return subprocess.check_output([str(part) for part in command], text=True)


manifest = run(analyzer, "manifest", "print", args.apk)
root = ET.fromstring(manifest)
ns = "{http://schemas.android.com/apk/res/android}"
permissions = sorted(n.attrib[ns + "name"] for n in root.findall("uses-permission"))
allowed = {"android.permission.ACCESS_COARSE_LOCATION", "android.permission.ACCESS_FINE_LOCATION",
           "android.permission.INTERNET", "android.permission.VIBRATE",
           "au.com.opax.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"}
assert set(permissions) <= allowed, f"Unexpected Android permission: {set(permissions) - allowed}"
app = root.find("application")
assert app is not None and app.attrib[ns + "usesCleartextTraffic"] == "false"
assert app.attrib[ns + "allowBackup"] == "false"
assert root.attrib["package"] == "au.com.opax.app"
resources = run(build_tools / "aapt2", "dump", "resources", args.apk)
name = re.search(r"xml/opax_network_security\s+\(\) \(file\) (\S+)", resources)
assert name, "Packaged network security resource missing"
network = run(analyzer, "resources", "xml", "--file", name[1], args.apk)
policy = ET.fromstring(network)
assert policy.find("base-config").attrib["cleartextTrafficPermitted"] == "false"
domains = [((n.text or "").strip(), n.attrib.get("includeSubdomains")) for n in policy.iter("domain")]
expected_domains = [] if args.variant == "production" else (
    [("10.0.2.2", "false")] if args.variant == "e2e" else
    [("localhost", "false"), ("127.0.0.1", "false")])
assert domains == expected_domains, (domains, expected_domains)
with zipfile.ZipFile(args.apk) as archive:
    if args.variant != "development":
        config = json.loads(archive.read("assets/app.config"))
        extra = config["extra"]
        expected_origin = "https://opax.com.au" if args.variant == "production" else (
            "http://10.0.2.2:" + os.environ.get("OPAX_FIXTURE_PORT", "8910"))
        assert extra["apiOrigin"] == expected_origin
        assert extra["variant"] == args.variant
        assert not extra.get("productionVoiceEnabled")
        bundle = archive.read("assets/index.android.bundle")
        assert b"./talk.tsx" not in bundle and b"./account/sign-in.tsx" not in bundle
        if args.variant == "production":
            for marker in [b"http://10.0.2.2", b"http://127.0.0.1", b"http://localhost",
                           b"OPAXWelcomeTour", b"source-destination-url", b"OPAX_DESIGN_WORKBENCH"]:
                assert marker not in bundle, f"Production fixture marker: {marker}"
            for marker in [b"Route is outside the public catalog allow-list",
                           b"Cross-origin API requests are forbidden", b"Redirects are not allowed for catalog data"]:
                assert marker in bundle, f"Missing API guard: {marker}"
signing = run(build_tools / "apksigner", "verify", "--print-certs", args.apk)
if args.certificate_sha256:
    expected = args.certificate_sha256.replace(":", "").lower()
    assert re.fullmatch(r"[0-9a-f]{64}", expected), "Invalid certificate SHA-256"
    digest = re.search(r"Signer #1 certificate SHA-256 digest: ([0-9a-f]+)", signing)
    assert digest and digest[1] == expected, "Unexpected upload certificate"
    signing_label = "upload key (not the Play app signing key)"
else:
    assert "CN=Android Debug" in signing, "Expected local debug signing only"
    signing_label = "local Android debug key"
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.with_suffix(".manifest.xml").write_text(manifest)
args.output.with_suffix(".network.xml").write_text(network)
evidence = {"variant": args.variant, "version": root.attrib[ns + "versionName"],
            "apk_bytes": args.apk.stat().st_size,
            "sha256": hashlib.sha256(args.apk.read_bytes()).hexdigest(),
            "permissions": permissions, "cleartext_domains": domains,
            "signing": signing_label, "checks": "passed"}
args.output.write_text(json.dumps(evidence, indent=2) + "\n")
print(json.dumps(evidence))
