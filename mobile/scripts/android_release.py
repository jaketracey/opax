"""Shared, offline Android release identity and evidence checks."""
import hashlib
import json
from pathlib import Path
import re
from datetime import datetime

from release_support import ANALYTICS_CONFIG, ReleaseError

NS = "{http://schemas.android.com/apk/res/android}"
# Crash report symbols (docs/ANALYTICS.md) that build-play.sh keeps in the
# evidence folder beside the AAB, never inside it, for
# scripts/upload-crash-symbols.sh: the composed Hermes source map Gradle
# writes, the bundle chunk ID Metro records (metro.config.js) and R8's mapping.
ANDROID_SOURCE_MAP = "index.android.bundle.map"
ANDROID_CHUNK_ID = "android.chunk-id"
R8_MAPPING = "mapping.txt"
R8_PLAY_MAPPING = "BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map"
CHUNK_ID_PATTERN = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
# The effective Expo config build-play.sh records before and after Gradle.
RECORDED_CONFIGS = ("config.json", "config-after.json")


def require(condition, message):
    if not condition:
        raise ReleaseError(message)


def configured_version(mobile):
    # The top-level Expo version is the release marketing version. extra.appVersion
    # is independently owned and is deliberately not used for release identity.
    # It is a literal, or one named string constant (`version: appVersion`,
    # the one app version that extra.appVersion and analytics also read).
    text = (Path(mobile) / "app.config.ts").read_text()
    versions = re.findall(r"^\s*version:\s*['\"]([^'\"]+)['\"],?\s*$", text, re.M)
    names = re.findall(r"^\s*version:\s*([A-Za-z_$][\w$]*),?\s*$", text, re.M)
    for name in names:
        versions += re.findall(r"^const\s+" + re.escape(name) + r"\s*=\s*['\"]([^'\"]+)['\"];?\s*$", text, re.M)
    require(len(versions) == 1 and len(versions) >= len(names),
            "Expected one literal Expo version in app.config.ts")
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
        require(enabled or not found,
                "Release metadata present but build evidence says disabled: " + flag)
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


def verify_analytics_config(config, variant):
    """Production builds carry exactly the opax.com.au/ingest host and the
    public project token, as on iOS; e2e and development builds carry no
    analytics config at all (docs/ANALYTICS.md). Returns "on" or "off"."""
    extra = config.get("extra") if isinstance(config, dict) else None
    require(isinstance(extra, dict) and extra.get("variant") == variant,
            "Expected a " + variant + " build config")
    if variant == "production":
        require(extra.get("analytics") == ANALYTICS_CONFIG,
                "Production build config must carry the opax.com.au/ingest analytics host and project token")
        return "on"
    require("analytics" not in extra, variant + " build config must carry no analytics")
    return "off"


def verify_recorded_configs(output, packaged):
    """The Expo config build-play.sh recorded before and after Gradle, and the
    one packaged in the bundle, are all production configs with analytics on."""
    result = {}
    for name in RECORDED_CONFIGS:
        path = Path(output) / name
        require(path.is_file(), "Missing recorded build config: " + name)
        result[name] = verify_analytics_config(json.loads(path.read_text()), "production")
    result["assets/app.config"] = verify_analytics_config(packaged, "production")
    return result


def verify_crash_symbols(output, bundle, evidence, archive):
    """The composed Hermes map and the chunk ID are kept beside the AAB, and
    the chunk ID is the one the shipped bundle reports. With R8 on, the kept
    mapping.txt is the mapping the AAB gives Play. Returns the chunk ID."""
    path = Path(output) / ANDROID_SOURCE_MAP
    require(path.is_file(), "Hermes source map kept beside the AAB (" + ANDROID_SOURCE_MAP + ")")
    try:
        source_map = json.loads(path.read_bytes())
    except ValueError:
        source_map = None
    require(isinstance(source_map, dict) and source_map.get("version") == 3 and bool(source_map.get("sources")) and
            bool(source_map.get("mappings")) and "x_hermes_function_offsets" in source_map,
            "Source map is React Native's composed Hermes map")
    chunk_path = Path(output) / ANDROID_CHUNK_ID
    chunk_id = chunk_path.read_text().strip() if chunk_path.is_file() else ""
    require(bool(re.fullmatch(CHUNK_ID_PATTERN, chunk_id)) and chunk_id.encode() in bundle,
            "Recorded chunk ID is the one in the shipped bundle")
    if evidence.get("r8_enabled"):
        mapping = Path(output) / R8_MAPPING
        require(mapping.is_file() and mapping.stat().st_size > 0 and
                R8_PLAY_MAPPING in archive.namelist() and mapping.read_bytes() == archive.read(R8_PLAY_MAPPING),
                "R8 mapping.txt kept beside the AAB is the mapping the AAB gives Play")
    return chunk_id


def shipped_source_maps(names):
    """`.map` files a phone would install. BUNDLE-METADATA/ is Play's own
    (R8's com.android.tools.build.obfuscation/proguard.map): Play keeps it to
    deobfuscate crashes and never puts it in an APK."""
    return [name for name in names
            if name.lower().endswith(".map") and not name.startswith("BUNDLE-METADATA/")]


def permission_allowlist(voice=False, microphone_prompt=False):
    # expo-network declares the two normal network-state permissions. They
    # expose connectivity state and do not add a runtime permission dialog.
    allowed = {"android.permission.ACCESS_COARSE_LOCATION", "android.permission.ACCESS_FINE_LOCATION",
               "android.permission.INTERNET", "android.permission.VIBRATE",
               "android.permission.ACCESS_NETWORK_STATE", "android.permission.ACCESS_WIFI_STATE",
               "au.com.opax.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"}
    if voice:
        allowed |= {"android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS"}
    if microphone_prompt:
        allowed.add("android.permission.RECORD_AUDIO")
    return allowed


def bundled_routes(body):
    # Use the release reader's whole Hermes entries: packed strings are not
    # NUL-separated, and Talk moved from talk.tsx to talk/index.tsx in 1.1.
    import importlib.util
    spec = importlib.util.spec_from_file_location('opax_ios_bundle_reader', Path(__file__).with_name('verify-ios-release.py'))
    reader = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(reader)
    strings = reader.hermes_strings(body)
    if strings is None:
        strings = {token.decode('latin-1') for token in reader.PATH_TOKENS.findall(body)}
    return {
        'talk': bool({'./talk.tsx', './talk/index.tsx'} & strings),
        'account': './account/index.tsx' in strings,
        'sign_in': './account/sign-in.tsx' in strings,
        'delete': './account/delete.tsx' in strings,
    }
