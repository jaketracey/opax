#!/usr/bin/env python3
"""Verify a signed OPAX archive app or exported IPA without disclosing signing IDs."""
import argparse
from functools import lru_cache
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import plistlib
import re
import struct
import socket
import subprocess
import sys
import tempfile
import zipfile
from urllib.parse import unquote, urlsplit

sys.dont_write_bytecode = True
from release_support import PRIVATE_NAMES, ReleaseError, load_credentials, matches, private_values, redact, scan_tracked

GUARDS = (
    "Route is outside the public catalog allow-list",
    "Search requires one explicit non-bill catalog kind",
    "Cross-origin API requests are forbidden",
    "Redirects are not allowed for catalog data",
)
SDK_PATTERN = re.compile(rb"posthog|mixpanel|amplitude|segment\.com|sentry|appsflyer|"
                         rb"firebaseanalytics|appcenter|bugsnag|datadog|fbSDK|crashlytics|heapanalytics", re.I)
SHIPPED_FRAMEWORKS = {"ExpoModulesJSI.framework", "hermesvm.framework", "ExpoFont.framework",
                      "ExpoModulesCore.framework", "React.framework", "ReactNativeDependencies.framework",
                      "ExpoModulesWorklets.framework", "ExpoFileSystem.framework"}
ANALYTICS_HOSTS = {"segment.io", "segment.com", "segmentapis.com", "posthog.com", "mixpanel.com",
                   "amplitude.com", "sentry.io", "appsflyer.com", "adjust.com", "google-analytics.com",
                   "app-measurement.com", "crashlytics.com", "heap.io", "heapanalytics.com",
                   "appcenter.ms", "bugsnag.com", "datadoghq.com", "graph.facebook.com"}
ROUTE_KEYS = re.compile(rb"\./[A-Za-z0-9_(),@%.\[\]/+~-]+\.(?:tsx?|jsx?)")
DEVELOPMENT_ROUTE = re.compile(r"workbench|fixture|__tests__|\(dev\)|__dev|home-prototype|voice-bridge-test|test-screens", re.I)


def url_hosts(body):
    for raw in re.findall(rb"https?://[^\x00\s\"'<>\\]+", body, re.I):
        try:
            host = urlsplit(raw.decode("utf-8", errors="replace")).hostname
            if host:
                yield unquote(host).lower().rstrip(".")
        except ValueError:
            continue


def has_loopback(body):
    if re.search(rb":89[0-9]{2}", body):
        return True
    for host in url_hosts(body):
        if host in {"localhost", "localhost.localdomain"} or host.endswith(".localhost"):
            return True
        try:
            address = ipaddress.ip_address(host.split("%")[0])
        except ValueError:
            try:
                # inet_aton normalizes abbreviated, integer, octal and hex IPv4;
                # it parses locally and never makes a DNS/network request.
                address = ipaddress.IPv4Address(socket.inet_aton(host))
            except OSError:
                continue
        if address.is_loopback or (isinstance(address, ipaddress.IPv6Address) and
                                  address.ipv4_mapped and address.ipv4_mapped.is_loopback):
            return True
    return False


def has_analytics(body):
    return bool(SDK_PATTERN.search(body)) or any(
        host == denied or host.endswith("." + denied)
        for host in url_hosts(body) for denied in ANALYTICS_HOSTS)


@lru_cache(maxsize=1)
def production_block_list():
    """Resolve Metro's actual rules, including inherited Expo exclusions."""
    env = {key: value for key, value in os.environ.items()
           if key not in (*PRIVATE_NAMES, "OPAX_INTERNAL_TESTER_EMAIL")}
    env.update(OPAX_VARIANT="production", EXPO_NO_TELEMETRY="1", EXPO_NO_DOTENV="1")
    result = subprocess.run(["node", "-e", """
const config = require('./metro.config.js');
const rules = [config.resolver.blockList].flat().filter(Boolean);
process.stdout.write(JSON.stringify(rules.map(rule => ({source: rule.source, flags: rule.flags}))));
"""], cwd=Path(__file__).resolve().parent.parent, env=env, capture_output=True, text=True)
    require(result.returncode == 0, "production Metro exclusions resolve successfully")
    rules = json.loads(result.stdout)
    require(isinstance(rules, list) and bool(rules), "production Metro exclusion list exists")
    patterns = []
    for rule in rules:
        require(isinstance(rule.get("source"), str) and isinstance(rule.get("flags"), str) and
                set(rule["flags"]) <= set("imsu"), "supported Metro exclusion expression")
        flags = re.ASCII
        for flag, value in (("i", re.I), ("m", re.M), ("s", re.S)):
            if flag in rule["flags"]:
                flags |= value
        patterns.append(re.compile(rule["source"], flags))
    return tuple(patterns)


def shipping_source_keys(routes):
    # Model the production tree even when a tooling test uses a temporary tree.
    production_root = Path(__file__).resolve().parent.parent / "src/app"
    patterns = production_block_list()
    keys = set()
    for path in routes.rglob("*"):
        if not path.is_file() or path.suffix not in {".tsx", ".ts", ".jsx", ".js"}:
            continue
        relative = path.relative_to(routes)
        candidate = production_root / relative
        # Metro can block a directory itself, preventing traversal of its files.
        if not any(pattern.search(str(part)) for pattern in patterns
                   for part in (candidate, *candidate.parents)):
            keys.add("./" + relative.as_posix())
    return keys


def bundle_route_keys(body, routes):
    actual = {key.decode() for key in ROUTE_KEYS.findall(body)}
    expected = shipping_source_keys(routes)
    require(bool(actual) and actual == expected and
        not any(DEVELOPMENT_ROUTE.search(key) for key in actual) and not re.search(
        rb"(?:src/app|app)/[^\x00\s\"']*(?:workbench|__tests__|fixtures?|\(dev\)|__dev|voice-bridge-test|test-screens)|"
        rb"(?:src/)?test-screens/|ui-workbench|home-prototype|/__dev(?:/|\x00)", body, re.I),
        "bundle Expo route keys exactly match shipping source routes; no workbench routes")
    return sorted(actual)


def no_voice_native_symbols(symbols):
    return not re.search(rb"OpaxVoiceCore|OpaxVoice|requestRecordPermission", symbols, re.I)


MACHO_HEADERS = {b"\xcf\xfa\xed\xfe": ("<", 32), b"\xce\xfa\xed\xfe": ("<", 28),
                 b"\xfe\xed\xfa\xcf": (">", 32), b"\xfe\xed\xfa\xce": (">", 28)}
FAT_HEADERS = {b"\xca\xfe\xba\xbe": (">", 20), b"\xbe\xba\xfe\xca": ("<", 20),
               b"\xca\xfe\xba\xbf": (">", 32), b"\xbf\xba\xfe\xca": ("<", 32)}


def verify_no_voice_native_code(app):
    """Stripping removes symbols, not Swift metadata/provider registration bytes."""
    scanned = []
    for path in sorted(p for p in app.rglob("*") if p.is_file()):
        with path.open("rb") as stream:
            magic = stream.read(4)
        if magic not in MACHO_HEADERS and magic not in FAT_HEADERS:
            continue
        require(no_voice_native_symbols(without_signature(path.read_bytes())),
                f"No voice or microphone permission code in Mach-O: {path.relative_to(app)}")
        scanned.append(str(path.relative_to(app)))
    require(bool(scanned), "Production app contains Mach-O code to scan")
    return scanned


def scene_manifest_valid(info):
    manifest = info.get("UIApplicationSceneManifest", {})
    return (manifest.get("UIApplicationSupportsMultipleScenes") is False and
            manifest.get("UISceneConfigurations", {}).get("UIWindowSceneSessionRoleApplication") == [
                {"UISceneConfigurationName": "Default Configuration",
                 "UISceneDelegateClassName": "EXExpoAppSceneDelegate"}])


def framework_allowlist(app):
    frameworks = list(app.rglob("*.framework"))
    require({p.name for p in frameworks} == SHIPPED_FRAMEWORKS and
            all(p.parent == app / "Frameworks" for p in frameworks) and not list(app.rglob("*.dylib")),
            "native framework allowlist matches the eight shipped frameworks")


def no_app_extensions(app, info):
    return "NSExtension" not in info and not any(p.suffix.lower() == ".appex" for p in app.rglob("*"))


def nested_entitlements(app):
    """Executable bundles are signed; resource bundles must have no executable/signature."""
    details = []
    for path in sorted(p for p in app.rglob("*") if p.is_dir() and p.suffix in {".framework", ".bundle", ".app"}):
        require(path.suffix != ".app", "No nested application bundle")
        info_path = path / "Info.plist"
        info = plistlib.loads(info_path.read_bytes()) if info_path.exists() else {}
        require("NSExtension" not in info, "No app extension declaration")
        if info.get("CFBundleExecutable") or (path / "_CodeSignature").exists():
            command("/usr/bin/codesign", "--verify", "--strict", str(path))
            raw = command("/usr/bin/codesign", "-d", "--entitlements", ":-", str(path))
            entitlements = plistlib.loads(raw) if raw.strip() else {}
            require(not entitlements, "Every embedded code bundle has no entitlements")
        else:
            require(not any(p.suffix in {".entitlements", ".xcent"} for p in path.rglob("*")),
                    "Every resource bundle has no entitlement payload")
        details.append({"path": str(path.relative_to(app)), "entitlements": "none"})
    return details


def require(condition, description):
    if not condition:
        raise ReleaseError("FAIL " + description)


def command(*args):
    result = subprocess.run(args, capture_output=True)
    require(result.returncode == 0, f"{Path(args[0]).name} signing metadata command succeeded")
    return result.stdout


def without_signature(body):
    """Exclude only LC_CODE_SIGNATURE bytes; scan every other Mach-O byte."""
    magic = body[:4]
    if magic in FAT_HEADERS:
        endian, entry_size = FAT_HEADERS[magic]
        require(len(body) >= 8, "Valid fat Mach-O header")
        count = struct.unpack_from(endian + "I", body, 4)[0]
        table_end = 8 + count * entry_size
        require(count > 0 and table_end <= len(body), "Valid fat Mach-O architecture table")
        clean = bytearray(body)
        ranges = []
        for index in range(count):
            start, length = struct.unpack_from(endian + ("II" if entry_size == 20 else "QQ"),
                                              body, 8 + index * entry_size + 8)
            require(start >= table_end and length >= 28 and start + length <= len(body),
                    "Valid fat Mach-O slice boundary")
            require(body[start:start + 4] in MACHO_HEADERS, "Valid thin Mach-O slice")
            ranges.append((start, start + length))
            clean[start:start + length] = without_signature(body[start:start + length])
        ordered = sorted(ranges)
        require(all(left[1] <= right[0] for left, right in zip(ordered, ordered[1:])),
                "Non-overlapping fat Mach-O slices")
        return bytes(clean)
    if magic not in MACHO_HEADERS:
        return body
    endian, header_size = MACHO_HEADERS[magic]
    require(len(body) >= header_size, "Valid Mach-O header")
    count = struct.unpack_from(endian + "I", body, 16)[0]
    commands_end = header_size + struct.unpack_from(endian + "I", body, 20)[0]
    require(commands_end <= len(body), "Valid Mach-O load-command boundary")
    offset = header_size
    clean = bytearray(body)
    for _ in range(count):
        require(offset + 8 <= commands_end, "Valid Mach-O load command")
        kind, size = struct.unpack_from(endian + "II", body, offset)
        require(size >= 8 and offset + size <= commands_end, "Valid Mach-O load command")
        if kind == 0x1d:
            require(size == 16, "Valid Mach-O signature command")
            start, length = struct.unpack_from(endian + "II", body, offset + 8)
            require(start >= commands_end and length > 0 and start + length <= len(body),
                    "Valid Mach-O signature boundary")
            clean[start:start + length] = b"\0" * length
        offset += size
    require(offset == commands_end, "Complete Mach-O load commands")
    return bytes(clean)


def no_private_values(body, values, label, *, signing_team=False):
    for variable, value in values.items():
        if variable == "APPLE_TEAM_ID" and signing_team:
            continue
        require(not matches(body, value), f"{label}: no {variable}")


def verify_file_privacy(path, values, validated_profile):
    """The profile is exempt only after the caller validates its CMS and scope."""
    body = path.read_bytes()
    no_private_values(body, values, "App privacy", signing_team=True)
    team = values["APPLE_TEAM_ID"]
    if not matches(body, team):
        return False
    if path == validated_profile:
        return True
    content = without_signature(body)
    require(not matches(content, team), "Team ID absent outside Apple signing metadata")
    # A resource cannot exempt its bytes merely by imitating a Mach-O header.
    command("/usr/bin/codesign", "--verify", "--strict", str(path))
    display = subprocess.run(["/usr/bin/codesign", "-d", "--verbose=4", str(path)],
                             capture_output=True, text=True)
    require(display.returncode == 0 and f"TeamIdentifier={team}" in display.stderr.splitlines() and
            any(line.startswith(("Authority=Apple Distribution:", "Authority=Apple Development:"))
                for line in display.stderr.splitlines()),
            "Excluded signature belongs to the configured Apple signing team")
    return True


def verify_provenance(root, built_commit):
    """Rechecks may change tooling/docs, never the app inputs attributed to a build."""
    require(bool(re.fullmatch(r"[0-9a-f]{40}", built_commit)), "Full artifact commit SHA")
    def git(*args):
        return subprocess.check_output(["git", *args], cwd=root).decode().strip()
    head = git("rev-parse", "HEAD")
    require(not git("status", "--porcelain", "--untracked-files=all"), "Clean verification worktree")
    ancestor = subprocess.run(["git", "merge-base", "--is-ancestor", built_commit, head], cwd=root,
                              capture_output=True)
    require(ancestor.returncode == 0, "Artifact commit is an ancestor of the verification commit")
    changes = git("diff", "--name-only", built_commit, head).splitlines()
    require(all(p.startswith("mobile/scripts/") or p in ("mobile/README.md", "docs/IOS-RELEASE.md")
                for p in changes), "Application inputs unchanged since artifact commit")
    print("PASS artifact provenance: original commit retained; application inputs unchanged")
    return head


def verify_app(app, args):
    results = []

    def check(condition, label):
        require(condition, label)
        if label not in results:
            results.append(label)
            print("PASS " + label)

    info = plistlib.loads((app / "Info.plist").read_bytes())
    check(info.get("CFBundleIdentifier") == "au.com.opax.app", "bundle ID")
    check(info.get("CFBundleShortVersionString") == args.version, "marketing version")
    check(info.get("CFBundleVersion") == args.build, "build number")
    check(info.get("MinimumOSVersion") == "18.4", "minimum iOS 18.4")
    check(scene_manifest_valid(info), "single-window Expo scene lifecycle")
    check(info.get("ITSAppUsesNonExemptEncryption") is False, "standard HTTPS encryption compliance")
    check("NSAppTransportSecurity" not in info, "no ATS exception")
    # Current catalog app has no permission-gated features. This allow-list must
    # be deliberately reviewed when a permission-requiring feature ships.
    check(not any(re.fullmatch(r"NS.*UsageDescription", k) for k in info),
          "no purpose strings for unshipped permission features")
    check(info.get("DTXcodeBuild") == args.xcode_build, "archive uses the selected release Xcode")
    check(no_app_extensions(app, info), "no app extensions")
    framework_allowlist(app)
    check(True, "native framework allowlist matches the eight shipped frameworks")
    command("/usr/bin/codesign", "--verify", "--deep", "--strict", str(app))
    check(True, "code signatures valid")
    entitlements = plistlib.loads(command("/usr/bin/codesign", "-d", "--entitlements", ":-", str(app)))
    team = os.environ["APPLE_TEAM_ID"]
    app_identifier = team + ".au.com.opax.app"
    allowed = {"application-identifier", "com.apple.developer.team-identifier",
               "keychain-access-groups", "get-task-allow", "beta-reports-active"}
    embedded_bundles = nested_entitlements(app)
    check(set(entitlements) <= allowed, "every bundle checked: no special app entitlements or embedded entitlements")
    check(entitlements.get("application-identifier") == app_identifier and
          entitlements.get("com.apple.developer.team-identifier") == team and
          entitlements.get("keychain-access-groups", [app_identifier]) == [app_identifier],
          "signing entitlements match OPAX only")
    if args.kind == "distribution":
        check(entitlements.get("get-task-allow", False) is False, "distribution disallows debugger")
        check(entitlements.get("beta-reports-active") is True, "TestFlight beta entitlement")
    else:
        check(isinstance(entitlements.get("get-task-allow"), bool), "archive signing debug entitlement recorded")
    profile_path = app / "embedded.mobileprovision"
    require(profile_path.is_file(), "Embedded provisioning profile exists")
    profile = plistlib.loads(command("/usr/bin/security", "cms", "-D", "-i", str(profile_path)))
    profile_identifier = profile["Entitlements"].get("application-identifier")
    profile_app_matches = profile_identifier == app_identifier or (
        args.kind == "archive" and profile_identifier == team + ".*" and
        profile["Entitlements"].get("get-task-allow") is True)
    check(profile.get("TeamIdentifier") == [team] and profile_app_matches,
          "provisioning profile belongs to OPAX and the configured team")
    if args.kind == "distribution":
        check(not profile.get("ProvisionedDevices") and not profile.get("ProvisionsAllDevices") and
              profile["Entitlements"].get("get-task-allow", False) is False,
              "App Store distribution profile")
    bundle = (app / "main.jsbundle").read_bytes()
    check(all(marker.encode() in bundle for marker in GUARDS), "shipped catalog/origin/redirect guards")
    check(not has_loopback(bundle), "no normalized loopback or fixture origin in shipped JS")
    route_keys = bundle_route_keys(bundle, Path("src/app"))
    check(True, "bundle Expo route keys exactly match shipping source routes; no workbench routes")
    verify_no_voice_native_code(app)
    check(True, "no OpaxVoiceCore, OpaxVoice or microphone permission code in any production Mach-O")
    configs = list(app.rglob("app.config"))
    check(bool(configs), "embedded Expo config exists")
    for path in configs:
        config = json.loads(path.read_bytes())
        check(config["extra"]["variant"] == "production" and
              config["extra"]["apiOrigin"] == "https://opax.com.au" and
              config["extra"]["appBuild"] == args.build and
              config["ios"]["buildNumber"] == args.build and
              "NSAppTransportSecurity" not in config["ios"]["infoPlist"],
              "embedded production OPAX origin, config and build number")
        check(config.get("updates", {}).get("enabled") is False, "OTA updates disabled")
        check(config["extra"].get("router", {}).get("sitemap") is False,
              "Expo debugging sitemap route disabled in embedded runtime config")
        check(len(config["extra"]["fontAcknowledgements"]) == 2 and
              all("SIL OPEN FONT LICENSE" in f["notice"] for f in config["extra"]["fontAcknowledgements"]),
              "bundled font licence notices")
    lock = json.loads(Path("package-lock.json").read_bytes())
    check(not re.search(r"node_modules/(?:@sentry/|@amplitude/|@segment/|@react-native-firebase/|"
                        r"firebase(?:/|$)|posthog|mixpanel|appcenter|react-native-appsflyer|"
                        r"react-native-adjust|expo-tracking-transparency|expo-insights|@bugsnag/|"
                        r"bugsnag|@datadog/|datadog|react-native-fbsdk|@facebook/)",
                        "\n".join(lock["packages"]), re.I), "no analytics SDK dependencies")
    check(not has_analytics(bundle), "no analytics SDK markers or known analytics hosts in shipped JS")
    files = [p for p in app.rglob("*") if p.is_file()]
    team_in_metadata = False
    values = private_values()
    for path in files:
        no_private_values(str(path.relative_to(app)).encode(), values, "App file names")
        team_in_metadata = verify_file_privacy(path, values, profile_path) or team_in_metadata
    check(True, "credential key path, key ID and issuer ID absent from app")
    check(True, "team ID absent from app content outside validated Apple signing metadata")
    display = subprocess.run(["/usr/bin/codesign", "-d", "--verbose=4", str(app)], capture_output=True, text=True).stderr
    authority = next((line.removeprefix("Authority=") for line in display.splitlines()
                      if line.startswith("Authority=")), "unknown")
    authority = re.sub(r"\s*\([^)]*\)\s*$", "", authority)
    cert_type = "distribution" if "Distribution" in authority else "development"
    check(authority != "unknown" and (args.kind != "distribution" or cert_type == "distribution"),
          "signing certificate identity and type available")
    with tempfile.TemporaryDirectory(dir=Path(args.output).parent) as directory:
        prefix = str(Path(directory) / "certificate")
        command("/usr/bin/codesign", "-d", "--extract-certificates=" + prefix, str(app))
        fingerprint = hashlib.sha1(Path(prefix + "0").read_bytes()).hexdigest().upper()
        identities = command("/usr/bin/security", "find-identity", "-v", "-p", "codesigning").decode()
        local = fingerprint in identities
    signing = {"identity_name": redact(authority), "identity_type": cert_type,
               "source": "local" if local else "cloud-managed"}
    print(f"Signing: {signing['source']} {cert_type}; {signing['identity_name']}")
    return {"commit": args.commit, "version": args.version, "build": args.build,
            "kind": args.kind, "checks": results, "signing": signing,
            "bundle_route_keys": route_keys, "embedded_bundles_checked": embedded_bundles,
            "team_id_in_required_signing_metadata": team_in_metadata}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    parser.add_argument("--kind", choices=["archive", "distribution"], required=True)
    for field in ("version", "build", "commit", "xcode-build", "output"):
        parser.add_argument("--" + field, required=True)
    args = parser.parse_args()
    try:
        load_credentials()
        require((Path(args.output).parent / "commit.txt").read_text().strip() == args.commit,
                "Release evidence commit matches verification provenance")
        root = subprocess.check_output(["git", "rev-parse", "--show-toplevel"]).decode().strip()
        verification_commit = verify_provenance(root, args.commit)
        scan_tracked(root)
        if args.path.suffix == ".ipa":
            values = private_values()
            no_private_values(args.path.read_bytes(), values, "IPA container", signing_team=True)
            with tempfile.TemporaryDirectory(dir=Path(args.output).parent) as directory:
                with zipfile.ZipFile(args.path) as archive:
                    no_private_values(archive.comment, values, "IPA ZIP comment")
                    names = set()
                    for item in archive.infolist():
                        require(not any(p.lower().endswith(".appex") for p in Path(item.filename).parts),
                                "No app extension anywhere in IPA")
                        require(item.filename not in names, "Unique IPA entries")
                        names.add(item.filename)
                        no_private_values(item.filename.encode(), values, "IPA entry names")
                        no_private_values(item.comment + item.extra, values, "IPA entry metadata")
                        require(not item.filename.startswith("/") and ".." not in Path(item.filename).parts,
                                "Safe IPA entry")
                        no_private_values(archive.read(item), values, "IPA content", signing_team=True)
                    archive.extractall(directory)
                apps = list((Path(directory) / "Payload").glob("*.app"))
                require(len(apps) == 1, "Exactly one app in IPA")
                for path in Path(directory).rglob("*"):
                    if path.is_file() and not path.is_relative_to(apps[0]):
                        no_private_values(path.read_bytes(), values, "IPA content outside the validated app")
                print("PASS IPA container, entry metadata and content outside the app: no private values")
                evidence = verify_app(apps[0], args)
                evidence["checks"].append("IPA container, entry metadata and content outside the app: no private values")
            evidence["ipa_sha256"] = hashlib.sha256(args.path.read_bytes()).hexdigest()
            evidence["ipa_bytes"] = args.path.stat().st_size
        else:
            evidence = verify_app(args.path, args)
        evidence["verification_commit"] = verification_commit
        evidence["checks"].extend(["tracked files contain no private values",
                                   "original artifact commit retained; application inputs unchanged"])
        Path(args.output).write_text(json.dumps(evidence, indent=2) + "\n")
    except (ReleaseError, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        raise SystemExit(redact(str(error)))


if __name__ == "__main__":
    main()
