#!/usr/bin/env python3
"""Place React's own required reasons inside its prebuilt dynamic bundle.

CocoaPods copies React's privacy resource bundles beside the app; Apple's
per-executable rule also requires them INSIDE the prebuilt React.framework.
This runs in post_install and after React's build-time configuration replacement,
before CocoaPods copies/embeds/signs the frameworks, and only
modifies this worktree's Pods. Never mutate shared download/cache artifacts.
"""
from pathlib import Path
import plistlib


def stage(mobile):
    pods = mobile / "ios/Pods"
    if pods.is_symlink():
        raise ValueError("Refusing shared Pods")
    reasons = {}
    source = mobile / "node_modules/react-native"
    for relative in ("React/Resources/PrivacyInfo.xcprivacy", "ReactCommon/react/timing/PrivacyInfo.xcprivacy"):
        manifest = plistlib.loads((source / relative).read_bytes())
        for entry in manifest.get("NSPrivacyAccessedAPITypes", []):
            reasons.setdefault(entry["NSPrivacyAccessedAPIType"], set()).update(entry["NSPrivacyAccessedAPITypeReasons"])
    # React prebuilt also contains performance timers (mach_absolute_time).
    reasons.setdefault("NSPrivacyAccessedAPICategorySystemBootTime", set()).add("35F9.1")
    manifest = {"NSPrivacyTracking": False, "NSPrivacyCollectedDataTypes": [],
                "NSPrivacyAccessedAPITypes": [
                    {"NSPrivacyAccessedAPIType": category, "NSPrivacyAccessedAPITypeReasons": sorted(codes)}
                    for category, codes in sorted(reasons.items())]}
    targets = sorted(pods.rglob("React.framework"))
    if not targets:
        raise ValueError("Expected prebuilt React.framework slices for privacy staging")
    for target in targets:
        if target.is_symlink() or not target.resolve().is_relative_to(pods.resolve()):
            raise ValueError("Refusing shared framework artifact")
        (target / "PrivacyInfo.xcprivacy").write_bytes(plistlib.dumps(manifest))
    print(f"PASS staged React's required reasons in {len(targets)} local prebuilt slices")


if __name__ == "__main__":
    stage(Path(__file__).resolve().parent.parent)
