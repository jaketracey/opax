# Old band rules in style.css that nav.css supersedes (web/nav-refactor)

For web-design-system, after both lanes merge: these selectors in `portal/public/style.css` style the old masthead, megamenus, drawer, breadcrumb strip and footer. `nav.css` now draws the band, its panels, the sheet, the trail and the footer by itself.

How this was checked: 20 scenarios (home, sitting weeks, a person page and community, at 1440, 1100, 820 and 390; menus closed, a panel open, the sheet open, the search box open, and the footer in view) were rendered in headless Chrome, every rule below was deleted from `style.css` in the CSSOM, and the page was rendered again. All 20 were pixel-identical (`portal/private/nav-refactor/tools/selfsuff.mjs`).

- **Dead** rules can go at once.
- **Superseded** rules can go once `nav.css` is loaded on every page that wears the band (`index.html`, `home.html`, `community.html`; it is).
- **Shared** rules also draw the mark on `ui-workbench.html`; move them to that page's stylesheet or keep them.
- Keep `html[data-panel="chat"] footer` (the chat's own rule) and the `.ms-row` quick-search rows (a shared component).
- Two tests read these rules and need updating when they go: `test/ui-components.test.mjs` ("the compact band keeps the mark left…", "the Ask launcher is a header icon…").

Line numbers are as of `style.css` on origin/main `9b8158f02`, plus this branch.

### Dead: old markup only, matches nothing on any page (69)

| style.css line | Selector | Inside |
|---:|---|---|
| 449 | `.masthead-name` |  |
| 455 | `.masthead-name` | `@media (prefers-reduced-motion: no-preference)` |
| 465 | `.nav-item` |  |
| 466 | `.nav-link` |  |
| 467 | `.nav-link` |  |
| 474 | `.nav-link:hover` |  |
| 474 | `.nav-link[aria-expanded="true"]` |  |
| 475 | `.nav-link.active` |  |
| 477 | `.nav-link[aria-expanded="true"] .nav-caret` |  |
| 484 | `.megamenu` |  |
| 491 | `.megamenu-wide` |  |
| 492 | `.megamenu .kicker` |  |
| 493 | `.mm-head` |  |
| 494 | `.mm-all` |  |
| 495 | `.mm-grid` |  |
| 497 | `.mm-cols` |  |
| 498 | `.mm-cols > div` |  |
| 499 | `.mm-link` |  |
| 503 | `.mm-link:hover` |  |
| 503 | `.mm-link:focus-visible` |  |
| 504 | `.mm-title` |  |
| 505 | `.mm-link:hover .mm-title` |  |
| 506 | `.mm-blurb` |  |
| 510 | `.mm-link:has(.mm-glyph)` |  |
| 511 | `.mm-glyph` |  |
| 512 | `.mm-note` |  |
| 514 | `.megamenu` | `@media (prefers-reduced-motion: no-preference)` |
| 529 | `.mast-search-toggle` |  |
| 530 | `.mast-search-toggle:hover` |  |
| 531 | `.mast-search-toggle svg` |  |
| 569 | `.drawer-cards` |  |
| 570 | `.drawer-card` |  |
| 575 | `.drawer-card:hover` |  |
| 576 | `.drawer-card.active` |  |
| 577 | `.drawer-card:focus-visible` |  |
| 578 | `.drawer-card-icon` |  |
| 579 | `.drawer-card-title` |  |
| 580 | `.drawer-card-sub` |  |
| 582 | `.drawer-group` |  |
| 583 | `.drawer-group summary.drawer-section` |  |
| 588 | `.drawer-group summary::-webkit-details-marker` |  |
| 589 | `.drawer-group summary::marker` |  |
| 590 | `.drawer-group summary.drawer-section::after` |  |
| 595 | `.drawer-group[open] summary.drawer-section::after` |  |
| 596 | `.drawer-group summary.drawer-section:hover` |  |
| 597 | `.drawer-group summary.drawer-section:focus-visible` |  |
| 598 | `.drawer-group .drawer-list` |  |
| 599 | `.drawer-group .drawer-list .drawer-link` |  |
| 600 | `.drawer-group:has(.drawer-link.active) > summary` |  |
| 602 | `.drawer-group summary.drawer-section::after` | `@media (prefers-reduced-motion: reduce)` |
| 611 | `.drawer-list` |  |
| 612 | `.drawer-link` |  |
| 612 | `.drawer-sub` |  |
| 616 | `.drawer-link` |  |
| 617 | `.drawer-sub` |  |
| 618 | `.drawer-link:hover` |  |
| 618 | `.drawer-sub:hover` |  |
| 619 | `.drawer-link.active` |  |
| 619 | `.drawer-sub.active` |  |
| 620 | `.drawer-kicker` |  |
| 2848 | `.megamenu` | `@media (forced-colors: active)` |
| 2864 | `.mast-search-toggle` | `@media (max-width: 1439px)` |
| 5128 | `.drawer-primary` |  |
| 5968 | `.site-header .nav-link` |  |
| 5969 | `.site-header .nav-link.active` |  |
| 5970 | `.site-header .nav-item` |  |
| 5971 | `.site-header .megamenu` |  |
| 5972 | `.site-header .mast-search-toggle` |  |
| 5975 | `.site-header .nav-link` | `@media (max-width: 1100px)` |

### Superseded: the new band, fully drawn by nav.css (98)

| style.css line | Selector | Inside |
|---:|---|---|
| 384 | `header` |  |
| 396 | `header :focus-visible` |  |
| 397 | `.masthead` |  |
| 398 | `.masthead-id` |  |
| 415 | `.mast-search` |  |
| 416 | `.nav-toggle` |  |
| 417 | `.mast-sugg` |  |
| 433 | `.masthead` |  |
| 439 | `.masthead-id` |  |
| 445 | `.masthead-nav` |  |
| 461 | `.nav-list` |  |
| 476 | `.nav-caret` |  |
| 479 | `.nav-caret` | `@media (prefers-reduced-motion: no-preference)` |
| 521 | `.nav-toggle` |  |
| 527 | `.nav-toggle:hover` |  |
| 528 | `.nav-toggle svg` |  |
| 535 | `.nav-drawer` |  |
| 543 | `.nav-drawer::backdrop` |  |
| 547 | `.nav-drawer[open]` | `@media (prefers-reduced-motion: no-preference)` |
| 548 | `.nav-drawer[open]::backdrop` | `@media (prefers-reduced-motion: no-preference)` |
| 549 | `.nav-drawer.is-closing` | `@media (prefers-reduced-motion: no-preference)` |
| 550 | `.nav-drawer.is-closing::backdrop` | `@media (prefers-reduced-motion: no-preference)` |
| 556 | `.drawer-head` |  |
| 557 | `.drawer-head .kicker` |  |
| 558 | `.drawer-name` |  |
| 561 | `.drawer-search` |  |
| 562 | `.drawer-sugg` |  |
| 567 | `.drawer-sugg .ms-row` |  |
| 603 | `.drawer-close` |  |
| 607 | `.drawer-close .drawer-x` |  |
| 608 | `.drawer-close:hover` |  |
| 609 | `.drawer-close:focus` |  |
| 610 | `.drawer-close:focus-visible` |  |
| 628 | `.crumbs` |  |
| 632 | `.crumbs-list` |  |
| 638 | `.crumbs-list::-webkit-scrollbar` |  |
| 639 | `.crumbs-list li` |  |
| 640 | `.crumbs-list li.crumb-here` |  |
| 641 | `.crumb-sep` |  |
| 642 | `.crumb-label` |  |
| 643 | `.crumbs-list a.crumb-label` |  |
| 644 | `.crumbs-list a.crumb-label:hover` |  |
| 645 | `.crumbs-list a.crumb-label:focus-visible` |  |
| 646 | `.crumb-here .crumb-label` |  |
| 649 | `.spa-ready .prerender-crumbs` |  |
| 649 | `.spa-booting .prerender-crumbs` |  |
| 2783 | `footer` |  |
| 2788 | `.footer-lines` |  |
| 2789 | `.footer-lines p` |  |
| 2790 | `footer a` |  |
| 2791 | `footer a:hover` |  |
| 2793 | `footer :focus-visible` |  |
| 2796 | `footer #stats:empty` |  |
| 2855 | `.mast-search` | `@media (max-width: 1099px)` |
| 2861 | `header` | `@media (max-width: 1439px)` |
| 2862 | `.masthead-nav` | `@media (max-width: 1439px)` |
| 2862 | `.mast-search.ui-input-wrap` | `@media (max-width: 1439px)` |
| 2863 | `.nav-toggle` | `@media (max-width: 1439px)` |
| 2866 | `.masthead` | `@media (max-width: 1439px)` |
| 2866 | `.masthead-id` | `@media (max-width: 1439px)` |
| 2868 | `.masthead-id` | `@media (max-width: 1439px)` |
| 5070 | `footer` | `@media (max-width: 700px)` |
| 5071 | `.footer-lines` | `@media (max-width: 700px)` |
| 5148 | `.masthead-nav` | `@media (min-width: 1440px)` |
| 5148 | `.mast-search` | `@media (min-width: 1440px)` |
| 5753 | `.chat-launcher` |  |
| 5914 | `.site-header .chat-launcher:not([hidden])` | `@media (min-width: 360px) and (max-width: 960px)` |
| 5920 | `.site-header .chat-launcher:hover` | `@media (min-width: 360px) and (max-width: 960px)` |
| 5920 | `.site-header .chat-launcher[aria-expanded="true"]` | `@media (min-width: 360px) and (max-width: 960px)` |
| 5921 | `.site-header .chat-launcher:focus-visible` | `@media (min-width: 360px) and (max-width: 960px)` |
| 5922 | `.site-header .chat-launcher > span` | `@media (min-width: 360px) and (max-width: 960px)` |
| 5923 | `.site-header .chat-launcher svg` | `@media (min-width: 360px) and (max-width: 960px)` |
| 5961 | `.site-header` |  |
| 5962 | `.site-header .masthead` |  |
| 5963 | `.site-header .masthead-id` |  |
| 5966 | `.site-header .masthead-nav` |  |
| 5967 | `.site-header .nav-list` |  |
| 5972 | `.site-header .nav-toggle` |  |
| 5974 | `.site-header .nav-list` | `@media (max-width: 1100px)` |
| 5980 | `.site-header .masthead-nav` | `@media (max-width: 960px)` |
| 5981 | `.site-header .nav-toggle` | `@media (max-width: 960px)` |
| 5982 | `.site-header .nav-toggle svg` | `@media (max-width: 960px)` |
| 5986 | `.header-search-toggle` |  |
| 5987 | `.header-search-toggle:hover` |  |
| 5987 | `.header-search-toggle[aria-expanded="true"]` |  |
| 5988 | `.header-search-toggle svg` |  |
| 5989 | `.header-search-panel` |  |
| 5990 | `.header-search-panel .mast-search.ui-input-wrap` |  |
| 5991 | `.header-search-panel .mast-sugg` |  |
| 5995 | `.site-header .masthead` | `@media (max-width: 960px)` |
| 5996 | `.site-header .masthead-id` | `@media (max-width: 960px)` |
| 5997 | `.site-header .nav-toggle` | `@media (max-width: 960px)` |
| 5998 | `.site-header .header-search-toggle` | `@media (max-width: 960px)` |
| 6001 | `.site-header` | `@media print` |
| 6002 | `.site-header .masthead-nav` | `@media print` |
| 6002 | `.site-header .header-search-toggle` | `@media print` |
| 6002 | `.site-header .nav-toggle` | `@media print` |
| 6002 | `.site-header .chat-launcher` | `@media print` |

### Shared: also styles ui-workbench.html (move to its stylesheet, or keep) (12)

| style.css line | Selector | Inside |
|---:|---|---|
| 399 | `.logo` |  |
| 404 | `.logo-mark` |  |
| 405 | `.logo-mark .logo-land` |  |
| 406 | `.logo-mark .logo-star` |  |
| 407 | `.logo-mark .logo-thread` |  |
| 411 | `.logo:hover .logo-star` |  |
| 2856 | `.logo-mark` | `@media (max-width: 1099px)` |
| 2865 | `.logo-mark` | `@media (max-width: 1439px)` |
| 5964 | `.site-header .logo` |  |
| 5965 | `.site-header .logo-mark` |  |
| 6004 | `.site-header .logo-mark .logo-land` | `@media print` |
| 6005 | `.site-header .logo-mark .logo-star` | `@media print` |
