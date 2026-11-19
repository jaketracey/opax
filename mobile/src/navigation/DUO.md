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

On a pushed record page the status bar, tabs, back button and bar items move
to the rail, and the title sits in a band at the top (24 to 82 pt on the outer
display, measured in b65). `HeaderHeightContext` is that band's bottom edge
(react-native-screens reports the bar's origin plus its height). A plain
string title there drew a small title above the page's own heading at rest:
the double title of b67. `useTitleOnScroll` now reveals the bar title exactly
as on iPhone: hidden while the page's heading is on screen, faded in once it
has gone under the bar. On the outer display UIKit folds the band away once the
page scrolls (captured before and after b67), so there the page shows only its
own heading. The title's width keeps no room for trailing items, as they are on
the rail. Screens without an in-content heading (Ask, search results) keep
their stack title, which UIKit draws in the band.

## The title stays pinned (build 92)

The folding described in this file is UIKit's bar minimisation: from iOS 27 a
navigation bar beside a vertical bar minimises as its page scrolls down and
returns on the way up (`UINavigationItem.barMinimizeBehavior`, automatic).
On build 91 every page lost its title on the way down and kept an empty strip
in its place. The native switch is `barMinimizeBehavior = .never`, which
react-native-screens 4.26 does not expose (`minimizeBehavior` on NativeTabs
is the tab bar's and does not change this: tried on the simulator).

`TitlePin` (`title-pin.tsx`, the tab stacks' `screenLayout`) stops it from
JS. UIKit minimises the bar for one scroll view, found from the page's first
view down through first children. Beside a vertical bar the page's first
child is an empty view, so UIKit finds none and the band stays: the title
holds at the top (the large title on a root, the inline one on a pushed
page) and the page passes under it. Sheets and modals are left alone, and
nothing is added on any layout without a vertical bar.

What it costs on the rail, since react-native-screens finds the scroll view
the same way:

- `scrollEdgeEffects` no longer reach the scroll view there, so UIKit's
  edges are its defaults. The page's own fade is the edge under the title:
  Screen and `ClearBarRest` draw it on the rail too, whole down to the bar's
  foot (`RAIL_FADE_COVER`), where UIKit's default edge otherwise showed as a
  faint band.
- A pushed page with neither (its own list and no fade) must take the solid
  bar on the rail (`railSearchRoutes` in `stack/index.tsx`), or its rows run
  through the title. Largest grants and a seat's grants do.

If react-native-screens gains the option, or the app's patch sets
`navigationItem.barMinimizeBehavior = .never` (iOS 27) in
`RNSScreenStackHeaderConfig.mm`, remove `TitlePin`: UIKit's own soft edge
comes back and the rules above are not needed.

The paragraphs below were written while the band still folded. They stand as
the history of each rule; where they say the band folds away, it no longer
does.

Once that band folds away, UIKit keeps the top safe area (24 pt) as bar. Under
an opaque bar the page was laid out below it, so its heading scrolled under a
24 pt strip and was cut off, and at rest the top 14 pt showed the system's grey
(UIKit's bar background stops 10 pt above the band). Today, under a clear bar,
ran to the top edge (b69, captured on the outer display). Pages pushed in a
tab's stack now run under a clear bar beside a vertical bar
(`useStackChrome({ tabStack: true })`), with a soft top edge: UIKit insets the
scroll view below the band at rest (adjusted top 82, then 24). Reduce Transparency and
Increase Contrast keep the solid bar, as on the tab roots (`useRailBar`), and
that bar is backed with the page's ground on pushed pages and tab roots alike,
so the grey strip does not return. The 24 pt strip over scrolled content does:
it is what a solid bar is.

Pages that keep a solid, backed bar on the rail (`solidRailBar`, `barBacking`):
the directory and Just declared, whose search field holds the band open and
whose sticky section headers React Native pins at the scroll view's top edge,
under a clear bar; and the money map, which does not scroll. Sheets and modal
stacks (Account, Talk) keep the opaque bar too: their bar items sit over the
sheet's trailing edge, and under a clear bar the text ran beneath them. A page
pushed in a tab's stack that does not scroll, or pins a header under a band
that stays, must set `headerTransparent: false` itself.

A scroll view that mounts after its page is on screen (the party page swaps a
skeleton `Screen` for the loaded one) is a race with the push under the clear
bar: about one open in six from a scrolled page it was left 24 pt past rest,
its heading under the band's edge. `useClearBarRest` (in `Screen`, and the
people lists through `ClearBarRest`) puts such a view back at rest, once,
while it settles (under a second from mount) and before the reader moves it.
Only a page beside a vertical bar reads the stack's options for this
(`use(DescriptorsContext)` after the bar check): on iPhone and iPad a page
neither subscribes to them nor re-renders when another page sets options. A fixed
state in a plain View uses `FixedPage`, which clears the band.

A tab root whose bar holds a search field (Bills, Search, the large-title
lists such as Leads) is solid on the rail too (`useRootBarAppearance`,
`railSolid`). The field is stacked below the title band there, and UIKit's
scroll edge, soft or hard, covers the band alone: rows ran through the glass
field under a covered title (Bills, b73). The band does not fold away while
it holds a field, so a solid bar on the page's ground brings no strip back:
the title and the field are one surface and the list ends at the field.
Screen's pinned band (Search's scope row) uses React Native's own sticky
header under that bar (`useRailSolidRoot`), since the scroll view then starts
below it. Pushed pages need nothing: once their band folds the field sits in
the bar, which covers it. iPhone and iPad are unchanged, and so is Android,
whose toolbar is opaque with the field inside it.

The solid bar and its backing take the page's own ground. A large-title list
on the darker grouped ground (Leads) has its bar owned by `RouteOptions`,
which knows no ground, so its Screen shares the ground with the owner; in
paper it was a strip over the darker page at rest.

Under the clear rail bar the page is the ground, so no page colours that bar
or draws its hairline (`clearBarStyle`, applied by `Screen` and by
`RouteOptions`). UIKit paints a coloured bar from 14 pt down to the band's
foot: the glossary's paper bar was a paper band over the darker page at rest,
and the bar's hairline crossed the electorate map at 24 pt once the band had
folded (b73, where the hard scroll edge also drew a lighter band above it).
The lighter patch at the rail end of that line is the top of the rail's own
glass, which is the system's.

Known, not fixed: the reference pages in the Account sheet (Methods, Datasets,
Portraits, Photo credits) keep their opaque paper bar, and scrolled content
shows in the 16 pt above it. A sheet cannot take the backing view.

Known, not fixed: Search opened by a link from a page in another tab draws
its title over the field on the rail (captured before and after this change).

Toolbar items use the native item API with both `label` and symbol. Expo's
`useHeaderConfigProps.js` maps `label` to native `title`; an accessibility label
alone does not supply that title. Talk's End call action uses this API on the
vertical rail; the existing horizontal action stays unchanged.

Official references:

- [Expo NativeTabs](https://docs.expo.dev/versions/v57.0.0/sdk/router/native-tabs/)
- [UIKit verticalBarEdge](https://developer.apple.com/documentation/uikit/uitraitcollection/verticalbaredge)

## Launch screen

Expo's `expo-splash-screen/plugin/src/withIosSplashScreenStoryboard.ts` pins
the native lockup's centre X and centre Y to `EXPO-ContainerView`, the whole
window, not its safe-area guide, and its fixed 200pt image cannot run OPAX code
to find a reserved region. On the closed Duo's 380pt outer window with a 60pt
trailing rail, the native centre is x=190 and the safe centre x=160.

`splashLayout` (`src/launch/choreography.ts`) therefore draws the cover's first
frame where the storyboard does, centred on the window, on every device, so
`hideNativeSplash` swaps like for like. Until b67 adaptive displays centred the
first frame in the safe area instead, and the logo jumped half the rail's width
to the left at handoff (Jake, b67). The settled name still centres in the safe
content area, takes the larger side of an active division and calls
`placeClear` for camera clearance: the unfold carries the lockup from the
window's centre to the content's, and crossfades instead when that travel would
cross a reserved region. The short sequence holds the lockup where the native
splash had it until it fades, over a camera or fold if the native splash was
over one.

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
