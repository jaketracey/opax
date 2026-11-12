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

from android_release import configured_version, verify_identity, verify_evidence, verify_ios_candidate, permission_allowlist, bundled_routes

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("variant", choices=["development", "e2e", "production"])
parser.add_argument("apk", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--certificate-sha256", help="Expected public upload certificate SHA-256; default is the local debug key")
parser.add_argument("--expected-version")
parser.add_argument("--version-code", type=int)
parser.add_argument("--expected-commit")
parser.add_argument("--build-evidence", type=Path)
parser.add_argument("--ios-release", type=Path)
parser.add_argument("--require-ios-parity", action="store_true")
args = parser.parse_args()
sdk = Path(os.environ["ANDROID_HOME"])
analyzer = sdk / "cmdline-tools/latest/bin/apkanalyzer"
build_tools = sdk / "build-tools" / os.environ.get("OPAX_ANDROID_BUILD_TOOLS", "36.0.0")


def run(*command):
    return subprocess.check_output([str(part) for part in command], text=True)


manifest = run(analyzer, "manifest", "print", args.apk)
root = ET.fromstring(manifest)
ns = "{http://schemas.android.com/apk/res/android}"
expected_version = args.expected_version or configured_version(Path(__file__).resolve().parent.parent)
release_candidate = args.require_ios_parity or args.version_code is not None or bool(args.certificate_sha256)
code = verify_identity(root, expected_version, args.version_code, release_candidate)
with zipfile.ZipFile(args.apk) as archive:
    abis = sorted({name.split("/")[1] for name in archive.namelist() if name.startswith("lib/") and name.endswith(".so")})
if args.variant == "production" and release_candidate:
    assert abis == ["arm64-v8a", "x86_64"], "Unexpected release ABIs"
permissions = sorted(n.attrib[ns + "name"] for n in root.findall("uses-permission"))
# The production voice switch (OPAX_PRODUCTION_VOICE, default on) is the only
# build that may declare the microphone, as only its iOS twin embeds the
# purpose string. E2e and development never open the hardware microphone.
# A voice build needs both: RECORD_AUDIO for capture and MODIFY_AUDIO_SETTINGS
# for the call's communication mode and routing (the module's
# voiceProduction manifest).
voice = False
microphone_prompt = False
if args.variant != "development":
    with zipfile.ZipFile(args.apk) as archive:
        packaged = json.loads(archive.read("assets/app.config"))["extra"]
    voice = args.variant == "production" and packaged.get("productionVoiceEnabled") is True
    # The e2e prompt build (OPAX_E2E_MICROPHONE=1) declares RECORD_AUDIO alone,
    # for Talk's permission journeys; its native input stays synthetic.
    microphone_prompt = args.variant == "e2e" and packaged.get("e2eMicrophonePrompt") is True
voice_permissions = {"android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS"}
allowed = permission_allowlist(voice, microphone_prompt)
if voice:
    allowed |= voice_permissions
    assert voice_permissions <= set(permissions), f"Voice build without {voice_permissions - set(permissions)}"
if microphone_prompt:
    allowed.add("android.permission.RECORD_AUDIO")
    assert "android.permission.RECORD_AUDIO" in permissions, "Prompt build without RECORD_AUDIO"
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
        # Android sends no analytics until its Data safety answers include
        # them (docs/ANALYTICS.md, "iOS and Android app"; verify-play.py).
        assert "analytics" not in extra, "Android build embeds an analytics config"
        bundle = archive.read("assets/index.android.bundle")
        routes = bundled_routes(bundle)
        if args.variant == "e2e" or voice:
            # Talk, sign-in and deletion ship as on iOS; the app offers them
            # when the OpaxVoice module is linked (src/voice/linked.ts).
            assert all(routes.values()), "Talk and account routes missing"
        else:
            assert not routes["sign_in"] and not routes["delete"], "Voice-off sign-in or deletion route"
        if args.variant == "e2e":
            assert not extra.get("productionVoiceEnabled")
        if voice:
            assert extra.get("voiceConsentDefault") is False
        if args.variant == "production":
            for marker in [b"http://10.0.2.2", b"http://127.0.0.1", b"http://localhost",
                           b"OPAXWelcomeTour", b"source-destination-url", b"OPAX_DESIGN_WORKBENCH"]:
                assert marker not in bundle, f"Production fixture marker: {marker}"
            for marker in [b"Route is outside the public catalog allow-list",
                           b"Cross-origin API requests are forbidden", b"Redirects are not allowed for catalog data"]:
                assert marker in bundle, f"Missing API guard: {marker}"
build_evidence = None
if args.build_evidence or args.expected_commit or args.require_ios_parity:
    build_evidence = verify_evidence(args.apk, args.build_evidence or args.apk.parent / "build-evidence.json", args.expected_commit, voice)
    assert build_evidence.get("version") == expected_version and build_evidence.get("versionCode") == code, "Build evidence identity mismatch"
if args.require_ios_parity:
    assert args.variant == "production" and voice, "iOS 1.1 parity requires production voice"
    assert args.ios_release and args.version_code is not None, "Parity requires --ios-release and --version-code"
    verify_ios_candidate(args.ios_release, build_evidence, expected_version)
    assert b"./community/home.tsx" not in bundle, "Community must stay hidden"
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
            "versionCode": code, "targetSdk": 36, "abis": abis,
            "commit": build_evidence["commit"] if build_evidence else None,
            "ios_1_1_parity": "passed" if args.require_ios_parity else "not requested",
            "r8_mapping_and_native_symbols": "Conditional AAB metadata check in verify-play.py; not carried by an APK",
            "apk_bytes": args.apk.stat().st_size,
            "sha256": hashlib.sha256(args.apk.read_bytes()).hexdigest(),
            "permissions": permissions, "production_voice": voice,
            "e2e_microphone_prompt": microphone_prompt, "cleartext_domains": domains,
            "signing": signing_label, "checks": "passed"}
args.output.write_text(json.dumps(evidence, indent=2) + "\n")
print(json.dumps(evidence))
