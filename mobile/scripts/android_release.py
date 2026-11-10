"""Shared, offline Android release identity and evidence checks."""
import hashlib
import json
from pathlib import Path
import re
from datetime import datetime

from release_support import ReleaseError

NS = "{http://schemas.android.com/apk/res/android}"


def require(condition, message):
    if not condition:
        raise ReleaseError(message)


def configured_version(mobile):
    # The top-level Expo version is the release marketing version. extra.appVersion
    # is independently owned and is deliberately not used for release identity.
    versions = re.findall(r"^\s*version:\s*['\"]([^'\"]+)['\"],?\s*$",
                          (Path(mobile) / "app.config.ts").read_text(), re.M)
    require(len(versions) == 1, "Expected one literal Expo version in app.config.ts")
    return versions[0]


def version_code(value, release=True):
    text = str(value)
    require(bool(re.fullmatch(r"[1-9][0-9]*", text)) and int(text) <= 2100000000,
            "Android versionCode must be positive and at most 2100000000")
    if release:
        require(bool(re.fullmatch(r"[1-9][0-9]{9}", text)), "Expected YYYYMMDDrr versionCode")
        try:
            datetime.strptime(text[:8], "%Y%m%d")
        except ValueError as error:
            raise ReleaseError("Invalid versionCode calendar date") from error
    return int(text)


def verify_identity(root, expected_version, expected_code=None, release=True):
    require(root.get(NS + "versionName") == expected_version, "Android versionName mismatch")
    code = version_code(root.get(NS + "versionCode"), release)
    if expected_code is not None:
        require(code == version_code(expected_code, release), "Android versionCode mismatch")
    require(root.find("uses-sdk").get(NS + "targetSdkVersion") == "36", "Expected targetSdk 36")
    return code


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def verify_evidence(artifact, evidence_path, expected_commit=None, voice=None):
    evidence_path = Path(evidence_path)
    evidence = json.loads(evidence_path.read_text())
    commit = evidence.get("commit", "")
    require(bool(re.fullmatch(r"[0-9a-f]{40}", commit)), "Build evidence needs a full commit SHA")
    require(expected_commit is None or commit == expected_commit, "Android build commit mismatch")
    require(evidence.get("artifacts", {}).get(Path(artifact).name) == sha256(artifact),
            "Build evidence does not match the artifact SHA-256")
    require(evidence.get("production_voice_mode") in ("0", "1"), "Missing build voice mode")
    if voice is not None:
        require(evidence["production_voice_mode"] == ("1" if voice else "0"),
                "Packaged voice switch differs from build evidence")
    return evidence


def verify_ios_candidate(path, evidence, version):
    ios = json.loads(Path(path).read_text())
    require(ios.get("commit") == evidence["commit"], "Android and iOS candidate commits differ")
    require(ios.get("version") == version, "Android and iOS candidate versions differ")
    require(ios.get("production_voice_enabled") is True and evidence["production_voice_mode"] == "1",
            "iOS 1.1 parity requires production voice on for both candidates")
    require(ios.get("checks") and ios.get("kind") == "distribution", "Expected verified iOS distribution report")
    return ios["commit"]


def debug_artifacts(archive, evidence, output):
    """Conditional: disabled features do not require nonexistent Play metadata."""
    result = {}
    names = archive.namelist()
    for flag, prefix in (("r8_enabled", "BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map"),
                         ("native_symbols_enabled", "BUNDLE-METADATA/com.android.tools.build.debugsymbols/")):
        enabled = evidence.get(flag)
        require(type(enabled) is bool, "Build evidence must state " + flag)
        found = [name for name in names if name.startswith(prefix) and not name.endswith("/")]
        if enabled:
            require(found and all(archive.getinfo(name).file_size for name in found),
                    "Missing enabled release metadata: " + flag)
            if flag == "native_symbols_enabled":
                require(all(any('/' + abi + '/' in n for n in found) for abi in ("arm64-v8a", "x86_64")),
                        "Native symbols must cover both release ABIs")
            for name in found:
                target = Path(output) / "release-metadata" / name.removeprefix("BUNDLE-METADATA/")
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.read(name))
        result[flag] = "passed" if enabled else "not enabled (conditional check skipped)"
    return result
