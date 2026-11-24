---
description: "Browser admission, completed-Turn rendering, and action return for durable A2UI results."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-a2ui

English | [中文](README.zh.md)

## Summary

Use this browser plugin beside `dsh-a2ui` to admit replayed `a2ui/v1` metadata, retain malformed or failed Tool results as visible fallbacks, and render valid Surfaces below the completed Turn. Button actions return as bounded structured JSON through the native atomic text-submission action.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this Client plugin in an experimental bundle after its Host tool. It has no configuration fields. The keyed Tool View replaces the generic row only while this plugin is active; unloading the plugin removes the registration and restores the native generic fallback.

Historical metadata is untrusted. Lightweight admission checks framing and detaches lossless JSON before the lazy renderer chunk loads. The renderer uses the SDK's strict validation independently. A failed call or rejected envelope keeps the original model-facing result text visible beside a localized alert.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

`src/client/metadata.ts` owns lightweight framing admission without importing the A2UI SDK. `A2uiToolRow.tsx` renders Tool lifecycle and fallbacks without a duplicate Surface. The Turn projection publishes durable results to `A2uiTurnTail.tsx`, which lazy-loads the strict SDK renderer. Each committed card owns and disposes its processor; shared SDK styles use committed insertion-effect lifetimes.

-----

<a id="model-experience"></a>
## Model Experience

### Browser presentation

#### What the model sees

The model sees nothing from this browser package. The Host `dsh-a2ui` package owns the `a2ui_render` schema and model-facing result text; this package only reads its persisted metadata.

#### Token effect

Zero additional tokens beyond the Host tool.

#### KV Cache effect

The browser-only presentation does not alter cache reuse.

## What stays local

Editing a bound value and switching a container update the Surface without a Turn: `TextField`, `CheckBox`, `ChoicePicker`, and `Slider` write their `@path` binding into the card's data model, `ChildList` templates re-expand from it, and `Tabs` switches its own panel. Verified in the browser: typing a name into a `TextField` bound to `/owner` changed a sibling `Text` reading the same path while the Turn count stayed at one.

A `Button` always reaches the Agent. The v1.0 `Action` union admits only `event` and `functionCall`, so an action that merely changes what the Surface shows still costs a Turn. Compose such controls from bindings instead of buttons, or accept the Turn and let the Agent render the successor Surface.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Two catalogs** — the lazy renderer draws the Basic Catalog and one business catalog (`https://dsh.dev/a2ui/catalogs/task/v1`) that adds `TaskCard`, `StatusBadge`, and `Statistic`. Business styling lives in this package's CSS Modules and `--dsw-*` tokens, so a Surface cannot choose colours or spacing.
- **Message action return only** — completed-Turn buttons submit `userMessage`, or a stable action-name fallback, through the native conversation input; structured A2UI action events are not persisted separately.
- **Lightweight admission only** — the framing check does not replace official SDK validation.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
