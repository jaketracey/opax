#!/usr/bin/env python3
"""Commands run inside the gate; credentials never appear in gate arguments."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import sys

sys.dont_write_bytecode = True
from release_inputs import clean_commit, dependency_command, refuse_dotenv
from release_support import JS_SOURCE_MAP, ReleaseError, load_credentials, redact, run_logged


# Xcode's export copies with whichever rsync PATH finds first and fails with
# "Copy failed" under Homebrew rsync 3.x (12 Nov). The export step searches
# Apple's tool directories first; every other step keeps the caller's PATH.
APPLE_TOOL_DIRS = ("/usr/bin", "/bin", "/usr/sbin", "/sbin")
APPLE_RSYNC = Path("/usr/bin/rsync")


def export_path(caller_path):
    """Apple's tool directories, then the caller's other PATH entries in order."""
    rest = [entry for entry in caller_path.split(os.pathsep)
            if entry and os.path.normpath(entry) not in APPLE_TOOL_DIRS]
    return os.pathsep.join([*APPLE_TOOL_DIRS, *rest])


def upload_verified(mobile, out, approved_commit, expected_voice_mode):
    refuse_dotenv(mobile)
    report = json.loads((out / "release.json").read_text())
    if expected_voice_mode not in ("0", "1"):
        raise ReleaseError("Upload refused: an explicit expected voice mode (0 or 1) is required.")
    expected_enabled = expected_voice_mode == "1"
    if (report.get("production_voice_enabled") is not expected_enabled or
            report.get("production_voice_mode") != ("on" if expected_enabled else "off")):
        raise ReleaseError("Upload refused: recorded production voice mode differs from the expected mode.")
    ipa = out / "export/OPAX.ipa"
    if not re.fullmatch(r"[0-9a-f]{40}", approved_commit or "") or report["commit"] != approved_commit:
        raise ReleaseError("Upload refused: verified artifact must match the full QA-approved commit.")
    if ipa.is_symlink() or ipa.resolve() != ipa or report.get("uploaded") is not False:
        raise ReleaseError("Upload refused: expected a regular, not-yet-uploaded verified IPA.")
    if (hashlib.sha256(ipa.read_bytes()).hexdigest() != report["ipa_sha256"] or
            ipa.stat().st_size != report["ipa_bytes"]):
        raise ReleaseError("Upload refused: IPA bytes differ from the verified release.json hash or size.")
    # These are the final checks before starting altool. No re-export occurs.
    clean_commit(mobile.parent, approved_commit)
    load_credentials()
    run_logged(["xcrun", "altool", "--upload-app", "-f", str(ipa),
                "--api-key", os.environ["ASC_KEY_ID"], "--api-issuer", os.environ["ASC_ISSUER_ID"],
                "--p8-file-path", os.environ["ASC_KEY_PATH"]], out / "upload-command.log", public_env=True)
    report["uploaded"] = True
    (out / "release.json").write_text(json.dumps(report, indent=2) + "\n")
    print("PASS uploaded the exact verified IPA bytes")


def run(step, mobile, out, expected_voice_mode=None):
    refuse_dotenv(mobile)
    if step == "upload":
        upload_verified(mobile, out, os.environ.get("OPAX_RELEASE_COMMIT"), expected_voice_mode)
        return
    if step == "dependencies":
        cmd = dependency_command(mobile)
    elif step == "prebuild":
        run_logged(["python3", "scripts/apply-privacy-patches.py"],
                   out / "privacy-patches-prebuild.log", public_env=True)
        cmd = ["nice", "-n", "10", "./node_modules/.bin/expo", "prebuild", "--platform", "ios", "--clean"]
    else:
        load_credentials()  # Source the local mode-600 file inside the gated process.
        if os.environ.get("DEVELOPER_DIR") != "/Applications/Xcode.app/Contents/Developer":
            raise ReleaseError("Release step requires the released Xcode path.")
        clean_commit(mobile.parent, os.environ["OPAX_RELEASE_COMMIT"])
        auth = ["-allowProvisioningUpdates", "-authenticationKeyPath", os.environ["ASC_KEY_PATH"],
                "-authenticationKeyID", os.environ["ASC_KEY_ID"],
                "-authenticationKeyIssuerID", os.environ["ASC_ISSUER_ID"]]
        archive = out / "OPAX.xcarchive"
        if step == "archive":
            # Parallel compile jobs: 4 is the shared-host default; a quiet Mac can
            # take OPAX_XCODE_JOBS=8. The output does not depend on it.
            jobs = os.environ.get("OPAX_XCODE_JOBS", "4")
            if not re.fullmatch(r"[1-9][0-9]?", jobs):
                raise ReleaseError("OPAX_XCODE_JOBS must be a small positive integer.")
            # Every archive keeps its composed Hermes source map beside it, never
            # in the app: React Native's bundle phase writes it to SOURCEMAP_FILE,
            # and Metro records the bundle's chunk ID in OPAX_SYMBOLS_DIR. Build
            # settings reach that phase as environment variables.
            symbols = ["SOURCEMAP_FILE=" + str(out / JS_SOURCE_MAP), "OPAX_SYMBOLS_DIR=" + str(out)]
            cmd = ["nice", "-n", "10", "xcodebuild", "-jobs", jobs, "-workspace", "ios/OPAX.xcworkspace",
                   "-scheme", "OPAX", "-configuration", "Release", "-destination", "generic/platform=iOS",
                   "-archivePath", str(archive), "-derivedDataPath", str(out / "DerivedData"),
                   "DEVELOPMENT_TEAM=" + os.environ["APPLE_TEAM_ID"], "CODE_SIGN_STYLE=Automatic", *symbols,
                   *auth, "archive"]
        else:
            options = out / "ExportOptions.plist"
            options.write_bytes(plistlib.dumps({"method": "app-store-connect", "destination": "export",
                "teamID": os.environ["APPLE_TEAM_ID"], "signingStyle": "automatic",
                "manageAppVersionAndBuildNumber": False, "uploadSymbols": True}))
            cmd = ["nice", "-n", "10", "xcodebuild", "-exportArchive", "-archivePath", str(archive),
                   "-exportOptionsPlist", str(options), "-exportPath", str(out / "export"), *auth]
    # Only command output is logged; arguments are never echoed. Remove signing
    # variables before Expo or Xcode build phases inherit the environment.
    if step == "export":
        if not os.access(APPLE_RSYNC, os.X_OK):
            raise ReleaseError("Export requires Apple's executable /usr/bin/rsync.")
        env = {**os.environ, "PATH": export_path(os.environ.get("PATH", os.defpath))}
        run_logged(cmd, out / f"{step}-command.log", public_env=True, env=env)
    else:
        run_logged(cmd, out / f"{step}-command.log", public_env=True)
    if step == "dependencies":
        run_logged(["python3", "scripts/apply-privacy-patches.py"],
                   out / "privacy-patches-command.log", public_env=True)
        # Reviewed pinned Skia installer copies bundled platform libraries; no network.
        run_logged(["node", "node_modules/@shopify/react-native-skia/scripts/install-libs.js"],
                   out / "native-libs-command.log", public_env=True)
    print(f"PASS release step: {step}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("step", choices=["dependencies", "prebuild", "archive", "export", "upload"])
    parser.add_argument("--expected-voice-mode", choices=["0", "1"])
    args = parser.parse_args()
    try:
        mobile = Path(__file__).resolve().parent.parent
        build = os.environ["OPAX_BUILD_NUMBER"]
        out = Path(os.environ["OPAX_RELEASE_OUT"])
        if not re.fullmatch(r"[1-9][0-9]*", build) or out != mobile / f"private/release/1.1.4-{build}" or out.resolve() != out:
            raise ReleaseError("Release evidence path must identify this worktree's build.")
        run(args.step, mobile, out, args.expected_voice_mode)
    except (ReleaseError, OSError, ValueError, KeyError) as error:
        raise SystemExit(redact(str(error)))


if __name__ == "__main__":
    main()
