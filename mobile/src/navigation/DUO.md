# Duo shell verification

The installed versions are Expo Router 57.0.24 and react-native-screens 4.26.0.
Their NativeTabs, native stack options, native tab host props and native screen
props expose no `verticalBarEdge` property or event. NativeTabs uses UIKit's tab
controller and leaves the bar's axis to the system. `sidebarAdaptable` is now
enabled only on iPad, and the sidebar label configuration call is iPad-only.
No JavaScript code positions the iOS tab bar at the bottom.

UIKit exposes `UITraitCollection.verticalBarEdge` and
`systemTraitsAffectingVerticalBarEdge` from iOS 27.1. The owned OpaxRootBar
module reads this trait from the key window, observes changes and publishes
`unspecified`, `leading` or `trailing`. The podspec guards the new symbols with
`OPAX_VERTICAL_BARS` only when the selected SDK is at least 27.1; the Swift code
also checks the runtime version. The getter reads a locked snapshot and never
waits synchronously for the main thread.

When a vertical bar is preferred, root screens use UIKit's appearance and
titles. The custom horizontal backing is removed. The native backing also
rejects a bar whose measured bounds are vertical before a JS event arrives.
Normal horizontal bars retain their existing collapse behaviour.

Pushed screens keep a horizontal bar at the top for the back pill and title
(24 to 82 pt on the outer display, measured in b65); the status bar, tabs and
bar items move to the rail. `HeaderHeightContext` is that bar's bottom edge
(react-native-screens reports the bar's origin plus its height), so
`useTitleOnScroll` reveals the bar title exactly as on iPhone: hidden while the
page's heading is on screen, faded in once it has gone under the bar (b67).
The title's width keeps no room for trailing items there, as they are on the
rail. Screens without an in-content heading keep their stack title.

Toolbar items use the native item API with both `label` and symbol. Expo's
`useHeaderConfigProps.js` maps `label` to native `title`; an accessibility label
alone does not supply that title. Talk's End call action uses this API on the
vertical rail; the existing horizontal action stays unchanged.

Official references:

- [Expo NativeTabs](https://docs.expo.dev/versions/v57.0.0/sdk/router/native-tabs/)
- [UIKit verticalBarEdge](https://developer.apple.com/documentation/uikit/uitraitcollection/verticalbaredge)

## Launch screen limit

The generated artwork contains only canvas and glyph coordinates, with no device
geometry. `LaunchHandoff` takes its window bounds, safe area and local reserved
regions at runtime. Adaptive displays centre both the lockup and the complete
settled name in the safe content area, use the larger side of an active division
and call `placeClear` for camera clearance. Existing phones retain their original
view-centred native launch coordinates.

The native launch screen cannot guarantee the same placement on Duo with the
current Expo splash configuration. Expo's
`expo-splash-screen/plugin/src/withIosSplashScreenStoryboard.ts` constrains the
image's centre X and centre Y to `EXPO-ContainerView`, not its safe-area guide.
Its fixed 200pt image cannot run OPAX code to query active reserved regions or
choose a clear side. On a 380pt window with left 0 and right 60, the native centre
is x=190 and the safe centre is x=160. A camera or division may move the live
lockup further. This is a real native-to-JS position change, not a seamless
handoff, and is not hidden by fabricated native geometry. A native launch-screen
design decision remains with the lead if this transition is unacceptable.

## Findings for other lanes

These files were inspected and left to their owners:

- `src/features/ask/AskScreen.tsx`: the custom floating composer protects
  only the bottom edge, or no edge while the keyboard is open, and can reach
  under a side bar. (An earlier note here said the sources dock was gated by
  `isPad`; it is not. It docks wherever `splitAllowed` does, on an adaptive
  iPhone as on iPad, sweep 2 item 10.)

## Ask's sources pane is the other way round (sweep 2, item 10)

Every other split (Search, the directories, Bills) puts the narrow list on
the leading side with a draggable divider and the record in the detail pane.
Ask puts the conversation on the leading side and its sources pane on the
trailing side, behind a fixed hairline (`features/ask/AskLayout.tsx`). That
is deliberate: the answer is the content and its sources are secondary, so
they take the narrower pane, and the conversation's width does not move
while the reader is mid-answer. Across a fold the pane takes the trailing
side's width. Keep it that way unless the design lead changes it.

No additional asymmetric-inset arithmetic was found in Today, Your MP or the
split files searched for this shell audit.

## Checks still needed

No native build, simulator or device was run in this lane. The lead must compile
with Xcode 27.2 and verify the SDK guard, vertical-bar trait events, side-bar
appearance, title and overflow labels, native safe-area propagation, live
reserved-region coordinates, Talk's dock clearance and the launch transition.
Real hardware is needed for the always-active outer camera occlusion and active
inner camera, book and laptop poses, both inner orientations and folding
continuity. Jest layout events verify arithmetic and wiring; they do not
establish native pixel layout.
