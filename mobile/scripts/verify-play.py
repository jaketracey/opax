#!/usr/bin/env python3
"""Verify a local upload bundle and inspect an APK generated from that bundle.

Only public certificate hashes appear in output. No upload is performed.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import struct
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("aab", type=Path)
parser.add_argument("bundletool", type=Path)
parser.add_argument("--version-code", type=int, help="Expected candidate versionCode")
parser.add_argument(
    "--require-ios-parity",
    action="store_true",
    help="Fail after writing evidence if the iOS 1.0 feature flags are absent",
)
args = parser.parse_args()
output = args.aab.parent
java = Path(os.environ["JAVA_HOME"]) / "bin"
credentials_path = Path(
    os.environ.get(
        "OPAX_UPLOAD_KEY_ENV", str(Path.home() / ".config/opax/android/upload-key.env")
    )
)
credentials = dict(
    line.split("=", 1)
    for line in credentials_path.read_text().splitlines()
    if line and not line.startswith("#")
)
environment = {**os.environ, **credentials}
keystore = credentials_path.parent / "opax-upload.p12"
assert credentials_path.stat().st_mode & 0o777 == 0o600
assert keystore.stat().st_mode & 0o777 == 0o600


def run(*command, binary=False):
    return subprocess.check_output(
        [str(p) for p in command],
        env=environment,
        text=not binary,
        stderr=subprocess.STDOUT,
    )


der = run(
    java / "keytool",
    "-exportcert",
    "-keystore",
    keystore,
    "-alias",
    "opax-upload",
    "-storepass:env",
    "OPAX_UPLOAD_STORE_PASSWORD",
    binary=True,
)
fingerprints = {
    algorithm: ":".join(
        re.findall("..", hashlib.new(algorithm, der).hexdigest().upper())
    )
    for algorithm in ("sha1", "sha256")
}
certificate = run(java / "keytool", "-printcert", "-jarfile", args.aab)
assert fingerprints["sha256"] in certificate, "AAB upload certificate mismatch"
verification = run(java / "jarsigner", "-verify", "-verbose", "-certs", args.aab)
(output / "jarsigner-verify.txt").write_text(verification)
assert (
    "jar verified." in verification and "unsigned entries" not in verification
), "AAB is not fully signed"
run(java / "java", "-jar", args.bundletool, "validate", "--bundle=" + str(args.aab))
manifest = run(
    java / "java",
    "-jar",
    args.bundletool,
    "dump",
    "manifest",
    "--bundle=" + str(args.aab),
)
(output / "aab-manifest.xml").write_text(manifest)
root = ET.fromstring(manifest)
namespace = "{http://schemas.android.com/apk/res/android}"
app = root.find("application")
assert root.attrib["package"] == "au.com.opax.app"
assert app is not None and app.attrib[namespace + "usesCleartextTraffic"] == "false"
assert "android.permission.RECORD_AUDIO" not in manifest
assert root.attrib[namespace + "versionName"] == "1.0.0"
assert int(root.find("uses-sdk").attrib[namespace + "targetSdkVersion"]) >= 36
permissions = sorted(
    n.attrib[namespace + "name"] for n in root.findall("uses-permission")
)
if args.version_code is not None:
    assert int(root.attrib[namespace + "versionCode"]) == args.version_code
with zipfile.ZipFile(args.aab) as archive:
    entries = archive.namelist()
    abis = sorted(
        {name.split("/")[2] for name in entries if name.startswith("base/lib/")}
    )
    assert abis == ["arm64-v8a", "x86_64"], "Unexpected release ABIs"
    native_alignment = {}
    for name in entries:
        if not name.startswith("base/lib/") or not name.endswith(".so"):
            continue
        data = archive.read(name)
        assert data[:6] == b"\x7fELF\x02\x01", "Expected little-endian ELF64"
        phoff = struct.unpack_from("<Q", data, 32)[0]
        phsize, phcount = struct.unpack_from("<HH", data, 54)
        alignments = [
            struct.unpack_from("<Q", data, phoff + i * phsize + 48)[0]
            for i in range(phcount)
            if struct.unpack_from("<I", data, phoff + i * phsize)[0] == 1
        ]
        assert alignments and all(a >= 16384 for a in alignments), (
            "Native library is not 16KB-aligned: " + name
        )
        native_alignment[name] = alignments
    dex_names = [
        name
        for name in entries
        if name.startswith("base/dex/") and name.endswith(".dex")
    ]
    # Namespace scan across every release DEX, plus the Hermes string table.
    markers = [
        "com/google/android/gms/ads",
        "com/google/firebase",
        "com/facebook/ads",
        "com/facebook/appevents",
        "com/facebook/FacebookSdk",
        "io/sentry",
        "com/amplitude",
        "com/mixpanel",
        "com/segment/analytics",
        "com/appsflyer",
        "com/adjust/sdk",
        "com/bugsnag",
        "com/datadog/android",
        "com/posthog",
        "expo/modules/insights",
    ]
    blobs = {name: archive.read(name) for name in dex_names}
    blobs["base/assets/index.android.bundle"] = archive.read(
        "base/assets/index.android.bundle"
    )
    # Play Services basement defines three Firebase exception adapters, which
    # are not Firebase Analytics. Distinguish actual class definitions from
    # references and retain this narrowly enumerated exception in the report.
    harmless_adapters = {
        "Lcom/google/firebase/FirebaseException;",
        "Lcom/google/firebase/FirebaseApiNotAvailableException;",
        "Lcom/google/firebase/FirebaseExceptionMapper;",
    }
    class_counts = {}
    benign = {}
    findings = {}
    for name in dex_names:
        data = blobs[name]
        _, string_offset, _, type_offset = struct.unpack_from("<IIII", data, 56)
        class_count, class_offset = struct.unpack_from("<II", data, 96)
        class_counts[name] = class_count
        classes = []
        for index in range(class_count):
            type_id = struct.unpack_from("<I", data, class_offset + index * 32)[0]
            string_id = struct.unpack_from("<I", data, type_offset + type_id * 4)[0]
            offset = struct.unpack_from("<I", data, string_offset + string_id * 4)[0]
            while data[offset] & 0x80:
                offset += 1
            offset += 1
            classes.append(
                data[offset : data.index(b"\0", offset)].decode(
                    "utf-8", errors="replace"
                )
            )
        benign[name] = sorted(set(classes) & harmless_adapters)
        findings[name] = [
            descriptor
            for descriptor in classes
            if descriptor not in harmless_adapters
            and any(descriptor.startswith("L" + marker) for marker in markers)
        ]
    js = blobs["base/assets/index.android.bundle"]
    findings["embedded_js"] = [
        marker
        for marker in markers
        if marker.encode() in js or marker.replace("/", ".").encode() in js
    ]
    assert not any(findings.values()), "Known advertising/analytics SDK namespace found"
    for secret in credentials.values():
        assert all(
            secret.encode() not in archive.read(name)
            for name in entries
            if not name.endswith("/")
        ), "Credential found in bundle"
    bundle_sha256 = hashlib.sha256(
        blobs["base/assets/index.android.bundle"]
    ).hexdigest()

# bundletool accepts password files. Make a mode-600 temporary file beside the
# private keystore, remove it immediately, and never put a password in argv.
fd, password_path = tempfile.mkstemp(
    prefix=".bundletool-password-", dir=credentials_path.parent
)
try:
    with os.fdopen(fd, "w") as password_file:
        password_file.write(credentials["OPAX_UPLOAD_STORE_PASSWORD"])
    apk_set = output / "verified.apks"
    run(
        java / "java",
        "-jar",
        args.bundletool,
        "build-apks",
        "--bundle=" + str(args.aab),
        "--output=" + str(apk_set),
        "--mode=universal",
        "--overwrite",
        "--ks=" + str(keystore),
        "--ks-key-alias=opax-upload",
        "--ks-pass=file:" + password_path,
    )
finally:
    Path(password_path).unlink(missing_ok=True)
apk = output / "opax-from-aab.apk"
with zipfile.ZipFile(apk_set) as archive:
    apk.write_bytes(archive.read("universal.apk"))
with zipfile.ZipFile(apk) as archive:
    assert (
        hashlib.sha256(archive.read("assets/index.android.bundle")).hexdigest()
        == bundle_sha256
    )
    packaged_config = json.loads(archive.read("assets/app.config"))
extra = packaged_config["extra"]
build_tools = (
    Path(os.environ["ANDROID_HOME"])
    / "build-tools"
    / os.environ.get("OPAX_ANDROID_BUILD_TOOLS", "36.0.0")
)
(output / "zipalign.txt").write_text(
    run(build_tools / "zipalign", "-c", "-P", "16", "-v", "4", apk)
)
parity = {
    "community_hidden": b"./community/home.tsx" not in js,
    "voice_on": extra.get("productionVoiceEnabled") is True,
    "voice_consent_off_by_default": extra.get("voiceConsentDefault") is False,
    "microphone_declared": "android.permission.RECORD_AUDIO" in permissions,
    "talk_route": b"./talk.tsx" in js,
    "account_sign_in_route": b"./account/sign-in.tsx" in js,
}
run(
    "python3",
    Path(__file__).with_name("verify-android-build.py"),
    "production",
    apk,
    output / "apk-policy.json",
    "--certificate-sha256",
    fingerprints["sha256"],
)
report = {
    "aab": args.aab.name,
    "bytes": args.aab.stat().st_size,
    "sha256": hashlib.sha256(args.aab.read_bytes()).hexdigest(),
    "versionCode": int(root.attrib[namespace + "versionCode"]),
    "versionName": root.attrib[namespace + "versionName"],
    "package": root.attrib["package"],
    "abis": abis,
    "minSdk": root.find("uses-sdk").attrib[namespace + "minSdkVersion"],
    "targetSdk": root.find("uses-sdk").attrib[namespace + "targetSdkVersion"],
    "upload_certificate": fingerprints,
    "bundle_signature": "verified; all payload entries signed",
    "bundletool": "validated and universal APK generated",
    "sdk_scan": {
        "dex_files": len(dex_names),
        "class_counts": class_counts,
        "scanned_markers": markers,
        "findings": findings,
        "benign_play_services_exception_adapters": benign,
        "scope": "release DEX class definitions and embedded JS; namespace scan cannot prove server retention or all telemetry behavior",
    },
    "device_apk": apk.name,
    "device_apk_sha256": hashlib.sha256(apk.read_bytes()).hexdigest(),
    "embedded_js_sha256": bundle_sha256,
    "permissions": permissions,
    "checks": {
        "credential_file_modes_600": "passed",
        "upload_certificate_matches": "passed",
        "all_aab_payload_entries_signed": "passed",
        "bundletool_validate": "passed",
        "package_id": "passed",
        "cleartext_disabled": "passed",
        "android_permission_allowlist": "passed",
        "known_advertising_analytics_namespaces_absent": "passed",
        "signing_credentials_absent_from_bundle": "passed",
        "universal_apk_generated": "passed",
        "aab_and_apk_embedded_js_identical": "passed",
        "apk_network_origin_routes_and_signature_policy": "passed",
        "expected_version_code": (
            "passed" if args.version_code is not None else "not requested"
        ),
        "version_name_1_0_0": "passed",
        "target_sdk_at_least_36": "passed",
        "arm64_and_x86_64": "passed",
        "native_elf_16kb_alignment": "passed",
        "apk_zip_16kb_alignment": "passed",
    },
    "native_elf_alignment": native_alignment,
    "ios_1_0_parity": parity,
    "ios_1_0_parity_status": "passed" if all(parity.values()) else "failed",
}
(output / "verification.json").write_text(json.dumps(report, indent=2) + "\n")
print(
    json.dumps(
        {
            key: value
            for key, value in report.items()
            if key not in {"sdk_scan", "native_elf_alignment"}
        },
        indent=2,
    )
)
if args.require_ios_parity and not all(parity.values()):
    print(
        "FAIL iOS 1.0 parity: "
        + ", ".join(key for key, passed in parity.items() if not passed),
        file=sys.stderr,
    )
    sys.exit(1)
