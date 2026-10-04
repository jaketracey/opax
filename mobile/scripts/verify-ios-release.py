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
ROUTE_KEY = re.compile(r"\./[A-Za-z0-9_(),@%.\[\]/+~-]+\.(?:tsx?|jsx?)")
PATH_TOKENS = re.compile(rb"[A-Za-z0-9_(),@%.\[\]/+~-]+")
HERMES_MAGIC = 0x1F1903C103BC1FC6
HERMES_HEADER_SIZE = 128
HERMES_FIELDS = ("fileLength", "globalCodeIndex", "functionCount", "stringKindCount", "identifierCount",
                 "stringCount", "overflowStringCount", "stringStorageSize", "bigIntCount", "bigIntStorageSize",
                 "regExpCount", "regExpStorageSize", "literalValueBufferSize", "objKeyBufferSize",
                 "objShapeTableCount", "numStringSwitchImms", "segmentID", "cjsModuleCount",
                 "functionSourceCount", "debugInfoOffset")
# Bytecode versions whose layout this reader knows (function header bytes).
# Any other version fails closed: check a shipped bundle before adding one.
HERMES_LAYOUTS = {98: {"function_header_size": 12}}
DEVELOPMENT_ROUTE = re.compile(r"workbench|source-destination|fixture|__tests__|\(dev\)|__dev|home-prototype", re.I)
DEVELOPMENT_PATHS = re.compile(rb"(?:src/app|app)/[^\x00\s\"']*(?:workbench|__tests__|fixtures?|\(dev\)|__dev)|"
                               rb"ui-workbench|home-prototype|/__dev(?:/|\x00)", re.I)
SCENE_DELEGATE = "EXExpoAppSceneDelegate"
# Files under mobile/scripts/ that shape the shipped app (Metro reads the block
# list) are application inputs, not tooling, for artifact provenance.
APP_INPUTS_UNDER_SCRIPTS = {"mobile/scripts/production-block-list.json"}


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
        try:
            patterns.append(re.compile(rule["source"], flags))
        except re.error as error:
            require(False, f"Metro exclusion expression /{rule['source']}/{rule['flags']} "
                           f"is not Python-compatible ({error}); rewrite it in the shared syntax")
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


def hermes_strings(body):
    """Every entry of a Hermes bytecode string table, or None if the body is not
    Hermes bytecode. Malformed tables and unknown versions fail closed."""
    if len(body) < HERMES_HEADER_SIZE or struct.unpack_from("<Q", body)[0] != HERMES_MAGIC:
        return None
    version = struct.unpack_from("<I", body, 8)[0]
    layout = HERMES_LAYOUTS.get(version)
    require(layout is not None, f"shipped JS is Hermes bytecode version {version}; the verifier reads "
            f"only versions {sorted(HERMES_LAYOUTS)}")
    header = dict(zip(HERMES_FIELDS, struct.unpack_from("<20I", body, 32)))
    require(header["fileLength"] == len(body), "Hermes bytecode length matches its header")

    def align(offset):
        return (offset + 3) & ~3

    offset = align(HERMES_HEADER_SIZE + header["functionCount"] * layout["function_header_size"])
    kinds = offset
    offset = align(offset + 4 * header["stringKindCount"])
    offset = align(offset + 4 * header["identifierCount"])
    small = offset
    offset = align(offset + 4 * header["stringCount"])
    overflow = offset
    storage = align(offset + 8 * header["overflowStringCount"])
    end = storage + header["stringStorageSize"]
    require(end <= (header["debugInfoOffset"] or len(body)) <= len(body),
            "Hermes string storage lies within the bytecode")
    runs = struct.unpack_from(f"<{header['stringKindCount']}I", body, kinds)
    require(sum(run & 0x7FFFFFFF for run in runs) == header["stringCount"],
            "Hermes string kinds cover the whole string table")
    strings = set()
    for index in range(header["stringCount"]):
        entry = struct.unpack_from("<I", body, small + 4 * index)[0]
        utf16, start, length = entry & 1, (entry >> 1) & 0x7FFFFF, entry >> 24
        if length == 0xFF:
            require(start < header["overflowStringCount"], "Hermes overflow string index is valid")
            start, length = struct.unpack_from("<II", body, overflow + 8 * start)
        size = length * (2 if utf16 else 1)
        require(start + size <= header["stringStorageSize"], "Hermes string entries lie within string storage")
        raw = body[storage + start:storage + start + size]
        strings.add(raw.decode("utf-16-le", errors="replace") if utf16 else raw.decode("latin-1"))
    return strings


def bundle_route_keys(body, routes):
    """Route keys are compared as whole strings: Hermes string-table entries, or
    whole tokens for plain JS. Hermes packs and overlaps its string storage, so
    raw bytes cannot tell "./talk.tsx" from "./talk.tsx.workbench.tsx"."""
    expected = shipping_source_keys(routes)
    strings = hermes_strings(body)
    if strings is None:
        strings = {token.decode("latin-1") for token in PATH_TOKENS.findall(body)}
    missing = sorted(expected - strings)
    require(bool(expected) and not missing, "every shipping Expo route key is present in shipped JS" +
            (f" (missing {', '.join(missing)})" if missing else ""))
    unexpected = sorted(string for string in strings if ROUTE_KEY.fullmatch(string) and string not in expected)
    development = sorted(key for key in expected if DEVELOPMENT_ROUTE.search(key))
    require(not unexpected and not development and not DEVELOPMENT_PATHS.search(body),
            "no unshipped, development or workbench route keys in shipped JS" +
            (f" (found {', '.join(unexpected + development)})" if unexpected or development else ""))
    return sorted(expected)


def scene_manifest_valid(info):
    manifest = info.get("UIApplicationSceneManifest", {})
    return (manifest.get("UIApplicationSupportsMultipleScenes") is False and
            manifest.get("UISceneConfigurations", {}).get("UIWindowSceneSessionRoleApplication") == [
                {"UISceneConfigurationName": "Default Configuration",
                 "UISceneDelegateClassName": "EXExpoAppSceneDelegate"}])


def scene_delegate_linked(executable):
    """The manifest's delegate class must be defined in the app executable itself,
    not merely named in a string or referenced from elsewhere."""
    result = subprocess.run(["/usr/bin/otool", "-oV", str(executable)], capture_output=True, text=True)
    require(result.returncode == 0, "otool reads the app executable's Objective-C metadata")
    section = ""
    for line in result.stdout.splitlines():
        if line.startswith("Contents of ("):
            section = line
        elif "__objc_classlist" in section and re.fullmatch(
                r"\s+name\s+0x[0-9a-fA-F]+\s+" + SCENE_DELEGATE + r"\s*", line):
            return True
    return False


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
    if body[:4] != b"\xcf\xfa\xed\xfe":
        return body
    require(len(body) >= 32, "Valid Mach-O header")
    count = struct.unpack_from("<I", body, 16)[0]
    commands_end = 32 + struct.unpack_from("<I", body, 20)[0]
    require(commands_end <= len(body), "Valid Mach-O load-command boundary")
    offset = 32
    clean = bytearray(body)
    for _ in range(count):
        require(offset + 8 <= commands_end, "Valid Mach-O load command")
        kind, size = struct.unpack_from("<II", body, offset)
        require(size >= 8 and offset + size <= commands_end, "Valid Mach-O load command")
        if kind == 0x1d:
            require(size == 16, "Valid Mach-O signature command")
            start, length = struct.unpack_from("<II", body, offset + 8)
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
    require(all((p.startswith("mobile/scripts/") and p not in APP_INPUTS_UNDER_SCRIPTS) or
                p in ("mobile/README.md", "docs/IOS-RELEASE.md") for p in changes),
            "Application inputs unchanged since artifact commit")
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
    check(scene_delegate_linked(app / info["CFBundleExecutable"]),
          "Expo scene delegate class linked in the app executable")
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
    check(True, "every shipping Expo route key is present in shipped JS")
    check(True, "no unshipped, development or workbench route keys in shipped JS")
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
