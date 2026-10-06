"""Offline Mach-O privacy inventory, shared by signed and simulator verifiers.

Rules use Apple's API/reason inventory (checked 7 Oct 2026):
https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api
Symbols, Objective-C metadata, framework loads and printable strings are scanned
because stripping removes some symbols but retains selectors and Swift metadata.
This is a conservative static gate; it cannot establish actual runtime intent.
"""
import hashlib
import json
from pathlib import Path
import plistlib
import re
import subprocess

from release_support import ReleaseError

MAGICS = {b"\xcf\xfa\xed\xfe", b"\xce\xfa\xed\xfe", b"\xfe\xed\xfa\xcf", b"\xfe\xed\xfa\xce",
          b"\xca\xfe\xba\xbe", b"\xbe\xba\xfe\xca", b"\xca\xfe\xba\xbf", b"\xbf\xba\xfe\xca"}

REASONS = {
    "FileTimestamp": {"DDA9.1", "C617.1", "3B52.1", "0A2A.1"},
    "SystemBootTime": {"35F9.1", "8FFB.1", "3D61.1"},
    "DiskSpace": {"85F4.1", "E174.1", "7D9E.1", "B728.1"},
    "UserDefaults": {"CA92.1", "1C8F.1", "C56D.1", "AC6B.1"},
    "ActiveKeyboards": {"3EC4.1", "54BD.1"},
}

# Shared getattrlist APIs are conservatively attributed to BOTH categories:
# static symbols cannot reveal the requested attribute mask.
REQUIRED = {
    "FileTimestamp": r"(?<![A-Za-z0-9])_?(?:stat|fstat|fstatat|lstat|getattrlist|getattrlistbulk|fgetattrlist|getattrlistat)(?=\$|[^A-Za-z0-9_]|$)|NSFile(?:Creation|Modification)Date|NSURL(?:CreationDate|ContentModificationDate|AttributeModificationDate)Key|\b(?:creationDate|modificationDate|fileModificationDate|contentModificationDate|attributeModificationDate)\b",
    "SystemBootTime": r"(?<![A-Za-z0-9])_?mach_absolute_time\b|\bsystemUptime\b",
    "DiskSpace": r"(?<![A-Za-z0-9])_?(?:statfs|fstatfs|statvfs|fstatvfs|getattrlist|fgetattrlist|getattrlistat)(?=\$|[^A-Za-z0-9_]|$)|NSFileSystem(?:Free)?Size|NSURLVolume(?:AvailableCapacity(?:ForImportantUsage|ForOpportunisticUsage)?|TotalCapacity)Key|\b(?:systemFreeSize|systemSize|volumeAvailableCapacity(?:ForImportantUsage|ForOpportunisticUsage)?|volumeTotalCapacity)\b",
    "UserDefaults": r"NSUserDefaults|\bUserDefaults\b|\bstandardUserDefaults\b|\$s10Foundation12UserDefaults",
    "ActiveKeyboards": r"\bactiveInputModes\b",
}

# Alternative permissions are OR groups. Separate groups are all required.
# AVAudioSession alone supports playback; record/input selectors trigger mic.
# Ordinary sockets/Network.framework do not prove local-network discovery.
PURPOSES = {
    "CoreMotion": (r"CoreMotion|\bCM(?:Motion\w*|Pedometer\w*|Altimeter\w*|Accelerometer\w*|Gyro\w*|Magnetometer\w*|DeviceMotion|Attitude|HeadphoneMotion\w*|FallDetection\w*|SensorRecorder)\b", [("NSMotionUsageDescription",)]),
    "Camera": (r"\bAVCapture(?:Device\w*|Session|MultiCamSession|Photo\w*|Video\w*|MovieFileOutput|MetadataOutput)\b", [("NSCameraUsageDescription",)]),
    "Microphone": (r"AVAudioRecorder|AudioQueueNewInput|AVAudioSessionCategory(?:PlayAnd)?Record|requestRecordPermission|recordPermission|AVAudioSessionRecordPermission|AVAudioApplication.*Record|\binputNode\b|\bAVCaptureAudioDataOutput\b", [("NSMicrophoneUsageDescription",)]),
    "CoreLocation": (r"CoreLocation|\bCLLocationManager\b", [("NSLocationWhenInUseUsageDescription", "NSLocationAlwaysAndWhenInUseUsageDescription")]),
    "Contacts": (r"Contacts\.framework|\bCNContactStore\b|\bABAddressBook(?:Create\w*|RequestAccessWithCompletion)\b", [("NSContactsUsageDescription",)]),
    "PhotosRead": (r"Photos\.framework|\bPHAsset\b|\bPHAssetCollection\b|\bPHImageManager\b|\bPHCachingImageManager\b|\bALAssetsLibrary\b", [("NSPhotoLibraryUsageDescription",)]),
    "PhotosWrite": (r"\bPHPhotoLibrary\b|\bPHAssetCreationRequest\b|\bPHAssetChangeRequest\b|UIImageWriteToSavedPhotosAlbum|UISaveVideoAtPathToSavedPhotosAlbum", [("NSPhotoLibraryUsageDescription", "NSPhotoLibraryAddUsageDescription")]),
    "Bluetooth": (r"CoreBluetooth|\bCB(?:CentralManager|PeripheralManager|Peripheral|Manager)\b", [("NSBluetoothAlwaysUsageDescription",)]),
    "HealthRead": (r"HealthKit|\bHKHealthStore\b|\bHK(?:SampleQuery|ObserverQuery|StatisticsQuery|AnchoredObjectQuery)\b", [("NSHealthShareUsageDescription",)]),
    "HealthWrite": (r"\b(?:saveObject:withCompletion:|saveObjects:withCompletion:|HKWorkoutBuilder|HKQuantitySample|HKCategorySample)\b", [("NSHealthUpdateUsageDescription",)]),
    "EventKit": (r"EventKit\.framework", [("NSCalendarsUsageDescription", "NSCalendarsFullAccessUsageDescription", "NSCalendarsWriteOnlyAccessUsageDescription", "NSRemindersUsageDescription", "NSRemindersFullAccessUsageDescription")]),
    "Calendar": (r"\bEK(?:EventStore|Event|Calendar)\b", [("NSCalendarsUsageDescription", "NSCalendarsFullAccessUsageDescription", "NSCalendarsWriteOnlyAccessUsageDescription")]),
    "CalendarFull": (r"\brequestFullAccessToEventsWithCompletion:", [("NSCalendarsFullAccessUsageDescription",)]),
    "Reminders": (r"\bEKReminder\b|requestFullAccessToRemindersWithCompletion", [("NSRemindersUsageDescription", "NSRemindersFullAccessUsageDescription")]),
    "Tracking": (r"AdSupport|AppTrackingTransparency|\bASIdentifierManager\b|\bATTrackingManager\b|\badvertisingIdentifier\b", [("NSUserTrackingUsageDescription",)]),
    "LocalNetwork": (r"\bNSNetService(?:Browser)?\b|\bNetService(?:Browser)?\b|\b_?(?:DNSService(?:Browse|Register|Resolve|QueryRecord)|nw_browser_create|nw_browse_descriptor_create_bonjour_service)\b", [("NSLocalNetworkUsageDescription",)]),
    "Bonjour": (r"NSNetService|NetServiceBrowser|DNSService(?:Browse|Register|Resolve)|nw_browse_descriptor_create_bonjour_service", [("NSBonjourServices",)]),
    "SpeechRecognition": (r"Speech\.framework|\bSFSpeech(?:Recognizer|RecognitionRequest|AudioBufferRecognitionRequest|URLRecognitionRequest)\b", [("NSSpeechRecognitionUsageDescription",)]),
}


def findings(text):
    # Normalize nm's ObjC import prefix, retaining raw evidence in reports.
    text = re.sub(r"_OBJC_(?:CLASS|METACLASS)_\$_", " ", text)
    required = {category: sorted({m.group(0) for m in re.finditer(pattern, text)})
                for category, pattern in REQUIRED.items()}
    purposes = {name: sorted({m.group(0) for m in re.finditer(pattern, text)})
                for name, (pattern, _) in PURPOSES.items()}
    return {k: v for k, v in required.items() if v}, {k: v for k, v in purposes.items() if v}


def declarations(manifest):
    result = {}
    entries = manifest.get("NSPrivacyAccessedAPITypes", [])
    if not isinstance(entries, list):
        raise ReleaseError("FAIL privacy accessed API entries must be an array")
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get("NSPrivacyAccessedAPIType"), str):
            raise ReleaseError("FAIL privacy accessed API entry must identify a category")
        category = entry.get("NSPrivacyAccessedAPIType", "").removeprefix("NSPrivacyAccessedAPICategory")
        reasons = entry.get("NSPrivacyAccessedAPITypeReasons")
        if category not in REASONS or not isinstance(reasons, list) or not reasons or not all(
                isinstance(reason, str) and reason in REASONS[category] for reason in reasons):
            raise ReleaseError("FAIL invalid required-reason category/codes: " + category)
        result.setdefault(category, set()).update(reasons)
    return {k: sorted(v) for k, v in result.items()}


def check_purposes(found, info, *, forbid_motion=True):
    errors = []
    if forbid_motion and ("CoreMotion" in found or "NSMotionUsageDescription" in info):
        errors.append("CoreMotion must be absent, including its unused purpose string")
    for name in found:
        for alternatives in PURPOSES[name][1]:
            if not any((isinstance(info.get(key), list) and bool(info[key]) and all(isinstance(service, str) and service.strip() for service in info[key])) if key == "NSBonjourServices" else (isinstance(info.get(key), str) and bool(info[key].strip())) for key in alternatives):
                errors.append(name + " requires " + " or ".join(alternatives))
    return errors


def scan(app, *, output=None, evidence_dir=None, forbid_motion=True):
    app = Path(app)
    info = plistlib.loads((app / "Info.plist").read_bytes())
    manifests = []
    for path in sorted(app.rglob("PrivacyInfo.xcprivacy")):
        manifests.append({"path": str(path.relative_to(app)),
                          "declared": declarations(plistlib.loads(path.read_bytes()))})
    app_manifest = next((m["declared"] for m in manifests if m["path"] == "PrivacyInfo.xcprivacy"), {})
    if evidence_dir:
        evidence_dir = Path(evidence_dir)
        evidence_dir.mkdir(parents=True, exist_ok=True)
    report = {"schema": 1, "tools": ["nm -a", "otool -L", "otool -ov", "strings -a"],
              "required_categories_checked": list(REQUIRED), "purpose_rules_checked": list(PURPOSES),
              "manifests": manifests, "binaries": [], "errors": [],
              "limitations": "Static conservative matches; review reason intent and permission access modes in source. A new selector/API requires a rule update."}
    for path in sorted(p for p in app.rglob("*") if p.is_file()):
        with path.open("rb") as stream:
            if stream.read(4) not in MAGICS:
                continue
        relative = str(path.relative_to(app))
        sections = []
        for cmd in (("/usr/bin/nm", "-a"), ("/usr/bin/otool", "-L"),
                    ("/usr/bin/otool", "-ov"), ("/usr/bin/strings", "-a")):
            run = subprocess.run([*cmd, str(path)], capture_output=True, text=True, errors="replace")
            if run.returncode:
                raise ReleaseError("FAIL privacy scan tool could not read " + relative + ": " + cmd[0])
            sections.append("\n" + " ".join(cmd) + "\n" + run.stdout)
        text = "".join(sections)
        if evidence_dir:
            (evidence_dir / (relative.replace("/", "__") + ".txt")).write_text(text)
        required, sensitive = findings(text)
        # A dynamic framework must carry its own manifest. Manifests from an
        # unrelated sibling SDK never mask missing coverage. Static pods use
        # the app manifest, which must also cover the full app-level inventory.
        bundle = next((parent for parent in path.parents if parent.suffix in (".framework", ".appex", ".app")), app)
        local = app_manifest if bundle == app else {}
        if bundle != app:
            for manifest in manifests:
                if (app / manifest["path"]).is_relative_to(bundle):
                    for category, reasons in manifest["declared"].items():
                        local.setdefault(category, []).extend(reasons)
        errors = check_purposes(sensitive, info, forbid_motion=forbid_motion)
        for category in required:
            if not local.get(category):
                errors.append(category + " has no declaration in its executable bundle")
            if not app_manifest.get(category):
                errors.append(category + " has no app-level declaration")
        report["binaries"].append({"path": relative, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                                   "bundle": str(bundle.relative_to(app)) or ".", "required_reason_apis": required,
                                   "purpose_apis": sensitive, "bundle_declarations": local, "errors": errors})
        report["errors"].extend(relative + ": " + error for error in errors)
    if not report["binaries"]:
        report["errors"].append("No Mach-O binaries scanned")
    if output:
        Path(output).write_text(json.dumps(report, indent=2) + "\n")
    if report["errors"]:
        raise ReleaseError("FAIL binary privacy scan: " + "; ".join(report["errors"]))
    return report
