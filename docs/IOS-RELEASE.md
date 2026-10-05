# OPAX iOS release

Release tooling produces a production-only, signed App Store Connect IPA for
`au.com.opax.app`, version `0.1.0`. Upload and TestFlight distribution are separate
steps. Only the orchestrator uploads a commit that has passed the QA gate.
App Store listing, review notes, questionnaires and gaps: [IOS-STORE.md](IOS-STORE.md).

Use Node 24, npm 11, Python 3 with PyJWT, CocoaPods and the released Xcode at
`/Applications/Xcode.app`. The tool checks the Xcode build against a reviewed
public release-build allow-list; update that list when adopting another release.
Create the OPAX app record in App Store Connect by hand before automatic build
number selection or distribution. Accept any required Apple agreements.

The local ASC environment file, outside the repository, must have mode 600 and
define `ASC_KEY_PATH`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `APPLE_TEAM_ID` and
`OPAX_BUNDLE_ID`. Scripts source it at runtime and redact captured command output. Never
commit its values, signing assets or account details. Configure `OPAX_BUILD_GATE`
in ignored `mobile/private/local.env`; it receives a lane label and command.
When unset, the script announces direct execution. Existing ignored QA hooks are
also supported. No manual certificate/profile changes are needed: Xcode uses
automatic provisioning authenticated by the API key, including cloud-managed
distribution signing. The gate receives only `bash scripts/release-step.sh` and
a public step name. The wrapper loads signing credentials inside the gated
process; key/team values never enter the gate's arguments or inherited environment.

From a clean committed worktree:

```sh
cd mobile
npm run qa
scripts/release-ios.sh --build-number 1
python3 scripts/asc-testflight.py 0.1.0 1 --tester "$OPAX_INTERNAL_TESTER_EMAIL" --dry-run
```

Omit `--build-number` to select one greater than the highest integer build App
Store Connect reports for this iOS version. An explicit number supports local
export before the app record exists. Build numbers are not reserved by reads;
coordinate concurrent releases. `OPAX_BUILD_NUMBER` supplies the number to both
native identity and embedded Expo config. Production origin is always
`https://opax.com.au`. Every run refuses root `.env*` files, disables Expo dotenv
loading, and runs `npm ci --include=dev --ignore-scripts` from the committed
lockfile before QA and clean prebuild. It refuses a symlinked `node_modules`.
This replaces ignored dependency edits before bundling. With `--upload`, an
explicit number must be at least the next number ASC reports, checked before
archiving; missing app records or API access fail before the build.

Evidence stays in ignored `mobile/private/release/<version>-<build>/`: exact full
commit, redacted logs, archive, IPA, verification reports, archive duration, IPA
size and SHA-256. Archive/export refuses an existing evidence directory. The exit
trap prunes DerivedData intermediates, Apple's binary build logs and this run's
temporary distribution-log bundle, and removes temporary export options; it
keeps the archive, IPA and built app. Our captured command-output logs are
redacted. Apple's generated signing/build logs are private and can contain
signing metadata until cleanup; they are not covered by that redaction claim.
Evidence directories have mode 700 and new reports/logs have mode 600. Inspect
failed logs locally; do not publish them.

Verification covers bundle/version/build, released Xcode, production config,
loopback/fixture origins, catalog/origin/redirect guards, ATS, standard HTTPS
encryption declaration, SDK dependencies and embedded markers, development and
workbench routes (including disabling Expo Router's debugging sitemap in the
embedded runtime config), purpose strings, default signing entitlements, code signatures,
OPAX provisioning and font notices. Bundle route keys must exactly match the
shipping source routes. Loopback URLs are normalized, case insensitive and
include abbreviated IPv4 and expanded IPv6. Embedded frameworks must match the
reviewed eight-framework allowlist; JS also rejects known analytics hosts. Any
app extension is refused, and every executable/resource bundle is checked for
unexpected entitlements. Reports count each distinct check once.
The current app ships no permission-gated
features, so no `NS*UsageDescription` purpose strings are permitted. Review that
allow-list when a permission-requiring feature ships.

The tracked-file scan rejects the actual credential path, key ID, issuer ID and
team ID. The IPA scan rejects credential path/key/issuer values everywhere and
team ID in every non-signing file, including JS, Info.plist strings, resources,
logs and payload files outside the app. The team ID is permitted only in the
validated embedded provisioning profile and verified Apple code signatures,
whose OPAX application/team entitlements are checked. The scan excludes only
the Mach-O signature byte range after validating its signature and Apple team;
file names and ZIP metadata also undergo the full scan. No policy flag is needed.
Signing IDs are never included in printed verification reports. Signing identity
names and local/cloud-managed classification are recorded without the team suffix.

To repeat verification without rebuilding, use the original artifact commit
from its evidence. The verifier requires a clean worktree, an ancestor artifact
commit and unchanged app inputs; only release scripts and these release docs
may differ. Reports retain the artifact commit and separately record the commit
that performed verification:

```sh
EVIDENCE="private/release/0.1.0-$BUILD"
ARTIFACT_COMMIT=$(cat "$EVIDENCE/commit.txt")
XCODE_BUILD=$(cat "$EVIDENCE/xcode-build.txt")
python3 scripts/verify-ios-release.py "$EVIDENCE/OPAX.xcarchive/Products/Applications/OPAX.app" \
  --kind archive --version 0.1.0 --build "$BUILD" --commit "$ARTIFACT_COMMIT" \
  --xcode-build "$XCODE_BUILD" --output "$EVIDENCE/verification-archive.json"
python3 scripts/verify-ios-release.py "$EVIDENCE/export/OPAX.ipa" \
  --kind distribution --version 0.1.0 --build "$BUILD" --commit "$ARTIFACT_COMMIT" \
  --xcode-build "$XCODE_BUILD" --output "$EVIDENCE/verification-distribution.json"
```

After QA approval, the orchestrator can release a new unused build number from
the approved full commit:

```sh
scripts/release-ios.sh --build-number "$BUILD" \
  --upload --expected-commit "$QA_APPROVED_COMMIT"
python3 scripts/asc-testflight.py 0.1.0 "$BUILD" \
  --tester "$OPAX_INTERNAL_TESTER_EMAIL" \
  --what-to-test 'Check public catalog browsing, search and saved data.'
```

Upload runs outside the build gate and sends `export/OPAX.ipa` itself with
`xcrun altool --upload-app`. The upload process reads API credentials internally
and never logs its argument list. Immediately before starting altool it compares
the IPA's SHA-256 and size with `release.json` and rechecks clean HEAD against the
full QA-approved artifact commit. It never re-exports or re-signs at upload time.
The TestFlight script never
uploads. It waits for the exact iOS version/build to become VALID, refuses
failed/expired builds and external groups, creates `OPAX Internal` if needed,
checks the tester is already a team user, sets exempt encryption if missing,
sets the supplied What to Test text, and verifies tester/build availability. An
existing all-builds internal group is reported explicitly; the script leaves
that policy intact and skips redundant build assignment while still setting
compliance and What to Test. It
does not submit for external beta review. `--dry-run` performs GET requests only
and reports missing records or planned changes without invitations or writes.

Group membership is not proof of installation: the tester must accept access
and install with TestFlight on their device. Apple processing, missing app access,
agreements or signing prompts can require account-holder action. Never work
around these by changing another app's signing assets.
