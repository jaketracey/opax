# Android Play upload (draft)

Draft only, 12 October 2026. No uploader, Google API calls or credentials are included. The account owner performs the Console setup; a later authorized lane can implement and run the upload script, following the explicit artifact handoff used for TestFlight drops.

## Console setup by the account owner

1. Create or select an OPAX Google Cloud project and enable the Google Play Developer API. Google no longer requires linking the Play developer account to the Cloud project. Follow [Google's setup guide](https://developers.google.com/android-publisher/getting_started).
2. In Google Cloud Console, open **IAM & Admin → Service Accounts** and create a dedicated Play uploader account. A Play uploader does not need Cloud project Owner or Editor access. Keep its credentials outside the repository and build artifacts; choose managed identity where the eventual runner supports it, or store any required JSON key in the password manager and a protected file outside the checkout. Never paste key contents into a terminal, issue, log or document.
3. In Play Console, open **Users and permissions → Invite new users**, enter the service account email and limit access to the OPAX Android app. Grant **View app information (read only)** and **Release apps to testing tracks**. If the app is still a draft, also grant **Edit and delete draft apps** as needed. No account-wide admin, billing, financial, store-listing or production-release permission is needed for internal-test uploads. See [Google's permission definitions](https://support.google.com/googleplay/android-developer/answer/9844686).
4. Create the app in Play Console and complete the first upload there before automating updates. Confirm the package name, Play App Signing setup and upload signing key with the Android release lane. Complete required Console declarations there, including app access, Target audience and Data safety; the publishing API does not complete legal consents. See [Google's edits prerequisites](https://developers.google.com/android-publisher/edits).
5. For app access, use `play-review@opax.com.au` and the reviewer credential from the password manager, as described in [COMMUNITY.md](COMMUNITY.md#store-reviewer-sign-in). The reviewer path must be deployed and its secret set by an authorized release lane before submitting those sign-in details. No sign-in or secret setup is performed by this draft.

## Proposed artifact and script handoff

Proposed future script: `mobile/scripts/upload-play.mjs` (not created here). Input is an already built and signed `.aab` from the Android release lane, with an explicit absolute artifact path, expected package name, version name, version code and SHA-256. The package name comes from the app configuration, never a guessed value. Keep the upload signing key and service account credentials separate from the artifact and receipt, as with TestFlight drops.

The future script should:

1. Check the artifact, package name, signing and version locally before authenticating. A local dry run should validate inputs without Google calls.
2. Read credentials from a protected external file or managed identity; print only non-secret artifact metadata. Use the Android Publisher OAuth scope and the service account's app-scoped Play permissions.
3. Create an edit, [upload the app bundle](https://developers.google.com/android-publisher/api-ref/rest/v3/edits.bundles/upload), and assign its returned version code to the `internal` testing track with release status `draft`. Preserve other track releases unless explicitly instructed to replace them. [Google's track guide](https://developers.google.com/android-publisher/tracks) describes draft releases.
4. Validate the edit and commit it only after explicit authorization for the upload. Committing even an internal draft writes to Play; never treat it as a dry run. Avoid concurrent Play Console edits, which can invalidate the API edit. See [Google's edit workflow](https://developers.google.com/android-publisher/edits).
5. Save a receipt with package name, version code, artifact checksum, track, draft status and timestamp, with no credentials or tokens. The account owner reviews the draft in Play Console before starting an internal-testing rollout. Production rollout remains a separate action.

This document authorizes no setup, credential creation, API upload or publication.
