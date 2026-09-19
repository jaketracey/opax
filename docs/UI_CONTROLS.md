# Shared controls

Reference: [UI_DESIGN_LANGUAGE.md](UI_DESIGN_LANGUAGE.md). The workbench is committed for local review and excluded from deployment by `public/.assetsignore`. Serve `portal/public` with `python3 -m http.server 8790 --directory portal/public`, then open `/ui-workbench.html`.

The migration covers home, Ask, search, shared entity directories, declared-interest filters, community forms, supplier and agency filters/actions, and the connections filter bar. Feature-specific profile, report and map controls remain for later migration.

The sentence-style question builder is intentionally exempt: its inline underlined fields and “Ask this” action retain their original treatment. Mode selection uses a default 48px segmented control above 700px and a labelled shared select at smaller widths; both reflect the same saved selection. The free-text Ask form uses shared controls.

## Ownership

`portal/public/ui-controls.css` owns control appearance and states. Load it after `style.css`. Components use native HTML with opt-in classes; no framework or JavaScript is required for basic controls. The workbench's script only implements its demonstrations. Feature modules keep their existing event handlers, URL state and lifecycle.

Do not combine `.ui-button` with legacy `.primary`, `.secondary`, `.action-btn` or `.supplier-button`. Remove the legacy class/rules when migrating a control. Feature styles may position a control but should not redefine its font, padding, radius or height.

## Recipes

```html
<button class="ui-button" data-variant="primary" type="submit">Search</button>
<button class="ui-button" type="button">Show more</button>
<button class="ui-button" data-variant="quiet" type="reset">Clear</button>
<button class="ui-button" data-variant="danger" type="button">Delete draft</button>
<a class="ui-button" href="/subject/electorate">Browse electorates</a>
```

Default is the outlined secondary treatment. Use buttons for actions and anchors with real destinations for navigation. Add `.ui-icon-button` for an icon-only button and supply an accessible name. Decorative SVGs use `aria-hidden="true"`. `.ui-full` fills the available width.

Use `disabled` for unavailable native buttons; for loading, also set `aria-busy="true"`. Keep the original text so the accessible name and width remain stable. Announce progress/completion in a nearby status region. Remove both attributes after completion or failure. Do not use `aria-disabled` alone to disable an anchor: choose an appropriate unavailable presentation instead.

```html
<div class="ui-field">
  <label for="supplier-query">Find a supplier</label>
  <input class="ui-input" id="supplier-query" type="search"
         aria-describedby="supplier-hint" placeholder="Name or ABN">
  <p class="ui-hint" id="supplier-hint">Search the available source records.</p>
</div>
```

An implicit `<label class="ui-field">Label<input class="ui-input"></label>` is also supported for simple fields without additional text. Native selects and textareas use `.ui-input`. Hints use `.ui-hint`; errors use `.ui-error` with `aria-invalid="true"` and `aria-describedby` on the field. Supply unique IDs per mounted instance. Required fields must use native `required` and a visible indication in the label. Read-only and disabled are distinct states.

`.ui-input-wrap` groups a field with a decorative `.ui-control-icon` or a trailing icon button. The feature owns clear/reveal behaviour; the button needs a specific accessible name. Native search clearing is preserved.

```html
<label class="ui-choice"><input type="checkbox">Include former members</label>
<label class="ui-choice"><input type="radio" name="order" value="newest">Newest first</label>
<label class="ui-choice"><input type="checkbox" role="switch">Show source details</label>
```

Use a fieldset/legend to name related choices. `.ui-segmented` wraps `.ui-button` toggle controls with `aria-pressed`; its owner updates the selected state and affected content. This is a group of buttons, not a tab implementation. Use native radio groups when the value belongs to a form. Do not apply tab roles without implementing tab keyboard and panel behaviour.

## Sizes and surfaces

Set `data-ui-size="compact|default|large"` on a control or containing group. Defaults are 40/48/56px minimum heights, paired across buttons and fields. Compact grows to 44px for coarse pointers. Controls can grow for wrapped labels and zoom rather than clipping into a fixed height.

For `.ui-segmented`, the size describes the **entire control**, including padding and borders: compact 40px, default 48px, large 56px. Set the size on the group (or inherit it from its container), not on individual segments. Inner buttons subtract the group's 10px vertical inset. Compact follows the existing 44px mobile/touch adjustment.

`.ui-actions` lays out a wrapping group of actions. `.ui-toolbar` combines `.ui-field` children and buttons with shared spacing; filtering behaviour stays with the feature. `.ui-inverse` provides tokens for a navy surface; its container owns the actual background.

Focus, reduced motion and forced-colour treatments live in the shared stylesheet. Validate desktop/mobile, keyboard access, long labels, zoom and error/disabled/loading cases when migrating.

Run `node scripts/stamp_assets.mjs` after changes. It stamps the new stylesheet in the application and all workbench assets. Existing feature tests can be run with `node --test test/supplier-ui.test.mjs test/agencies.test.mjs test/supplier-router.test.mjs` from `portal/`.

## Filter chips and tags

Use a native `button.ui-filter-chip` for an applied filter. The entire chip removes the filter; provide an accessible name such as “Remove the parliament filter, Victoria”. Wrap the key/value in `.ui-filter-chip__text`, with `.ui-filter-chip__key` and `.ui-filter-chip__value` inside, followed by a decorative 16px close SVG. Long values wrap. Chips are 40px minimum, growing to 44px on mobile/touch; do not combine them with `.ui-button`.

Use `a.ui-tag` with a real topic URL for linked metadata, or `span.ui-tag` for plain metadata. Tags have a bronze wash, a decorative hash marker and no action outline. Linked tags underline on hover and share the focus ring. The compact visual size is 28px minimum, growing to a 44px hit target on mobile/touch. Do not use a tag for submitting a form or removing a filter.

Search and Ask use the shared filter chips; search-result topic links use shared tags. Both are demonstrated at `/ui-workbench#filters-tags`, including removal/reset, long labels, links and plain text.

## Map categories

`.ui-map-filters` is a wrapping row of `.ui-filter-chip.ui-map-filter` controls. They share the applied-filter fill, border, radius, padding and 40px/44px sizing. Counts are plain text, without a separate badge. Use `.ui-map-filter__dot` for the decorative legend colour (`aria-hidden="true"`), a text label, and `.ui-map-filter__count` for its count. Labels carry category meaning independently of colour.

The new homepage filters its embedded map in place with native buttons and `aria-pressed`. The legacy app helper also supports anchors to `/money?industry=…`. For filtering a map in place, use native buttons with `aria-pressed` and update the map and state together. The workbench demonstrates both forms, including selected and disabled states; its counts are illustrative.
