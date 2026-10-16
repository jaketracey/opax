# Senate video in the apps: plan only

16 October 2026, lane `feat/senate-video`. Nothing here is built. The iOS and Android apps are unchanged, and `/privacy` says so.

## What the web has now

- **Data.** `portal/public/video/senate.json` is a static file with `meta.schema: 1`. It holds one row per Senate YouTube upload: `id`, `title`, `published`, `kind` (`question_time`, `first_speech` or `other`), `date` (the sitting date from the title, or null), `chamber: "senate"`, `person_slug` (first speeches only, null when the roster match failed closed) and `url` (the YouTube watch page). The nightly accumulates it from the channel feed. See [scripts/senate_video/](../../../scripts/senate_video/).
- **Surfaces.**
  - Sitting week: one "Senate Question Time" card per sitting day.
  - Person page: a "First speech" card.
  - Sitting index: a "Video" marker.
- **Player.** The card loads nothing from Google until it is pressed. Then it frames `https://www.youtube-nocookie.com/embed/<id>?autoplay=1`.

## Recommendation for the apps: link out first (1.x)

Use a "Watch on YouTube" row that opens the watch URL. On iOS it opens with `Linking.openURL`, so the YouTube app or Safari plays it. Android uses the same intent. There is no in-app player.

- **Why.**
  - Neither App Store label (TWELVE_PLUS, App Privacy, which is web-only, "Data not collected" for third parties) nor the Play data-safety form changes. Nothing from Google runs inside the app.
  - It needs no WebView dependency and no new native build risk.
  - The tap is the reader's own choice to leave the app, as the web's press is.
- **Where.**
  1. **Person screen:** a "First speech" row under the identity block, shown only when `person_slug` equals the screen's slug. The row shows the title, the sitting date and "Australian Senate · YouTube", with a play glyph and a trailing external-link icon. Its accessibility label is "Watch on YouTube: <title>", with the hint "Opens YouTube".
  2. **Bills tracker → sitting week (if the app gains the sitting hub):** one row per sitting day with Question Time.
- **Decoder.** It must be strict but forgiving, in the way `/api/resource` taught us (an empty `url` once made the iOS decoder reject a whole record, 8 Oct):
  - accept `date: null` and `person_slug: null`;
  - ignore unknown `kind` values and unknown keys;
  - drop a row whose `id` fails `^[A-Za-z0-9_-]{11}$`, without failing the whole file;
  - build the URL from the id and never trust `url` blindly.
- **Fetch.** Fetch the static `/video/senate.json` through the bounded offline cache, with the usual "As at" line from `meta.updated`. A new API route is not needed.
- **Tests.**
  - A fixture-pinned response with a QT row, a matched first speech, an unmatched first speech and a malformed id. Fixtures use invented names.
  - A Maestro journey: open the person screen, check the row is visible, tap it and check the external-open intent fires. The journey must not depend on YouTube loading.

## Later, only with Jake's approval: an in-app player

This would use `react-native-webview` with `youtube-nocookie.com`, click to play, with no thumbnail before the press. Before shipping:

- **Store disclosures.** Re-answer App Privacy and Play data safety: the YouTube player inside the app is a third-party SDK-like surface that can collect usage data. Add an app paragraph to `/privacy`.
- **Data API.** If the app ever calls the Data API itself, YouTube API Services policies apply to the app as an API client. That means a privacy-policy notice, no player modification, and no caching of video.
- **Autoplay and audio.** No sound before a press. The rule never to touch device volume applies to QA too: use muted simulators and no speech.
- **Android parity.** The same WebView path, plus `allowsInlineMediaPlayback` and the equivalent fullscreen handling on both platforms.

## Terms carried over from the web

- Show whole uploads as the Senate titled them, never clips.
- Keep video beside the factual record.
- No advertising, sponsorship or campaign framing near a player.

These come from the Senate's 2013 broadcasting resolution and YouTube's embed terms. See the Parliamentary video row in [COVERAGE.md](../../COVERAGE.md#parliamentary-video).
