---
description: "Experimental model-facing tool that validates bounded A2UI v1 Basic Catalog messages and persists them for a Client renderer."
kind: "package-reference"
---

# @deepseek-ai/dsh-a2ui

English | [中文](README.zh.md)

## Summary

Use this package to admit model-authored A2UI v1 messages through `a2ui_render`. The Host validates a restricted Basic Catalog subset, component references, and deployment limits before persisting the canonical messages as Tool result metadata. This package does not render a card; a Client plugin must validate and render the metadata independently.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin beside the tool registry:

```yaml
- name: '@deepseek-ai/dsh-a2ui'
  config:
    maxMessages: 8
    maxComponents: 100
    maxBytes: 65536
```

The tool accepts A2UI v1 `createSurface`, `updateComponents`, `updateDataModel`, and `deleteSurface` messages. The first subset admits only the Basic Catalog `Card`, `Column`, `Text`, and `Button` components. Component lists are non-empty; each Surface contains the canonical `root`, rejects duplicate ids, missing references, cycles, and unreachable components, and revalidates the complete graph after component updates. Component and surface ids use Unicode identifier syntax. Button action context values admit JSON literals, arrays, literal objects, and `@path` bindings; function calls are outside this subset.

`maxMessages` limits messages in one call, `maxComponents` limits the total components carried by that call, and `maxBytes` limits the UTF-8 size of the canonical envelope after validation. Invalid input fails as `ToolArgsError` with code `INVALID_ARGS`; no partial metadata is published.

### Security properties

Messages are data, not executable code. The admitted fields cannot carry JavaScript, HTML, custom component implementations, network requests, or arbitrary Catalog names. The future Client renderer remains responsible for validating persisted metadata before creating a `MessageProcessor`; Host acceptance does not make historical or external records trusted.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

`src/schema.ts` validates model-generated messages and closes component references for each `createSurface`. `src/index.ts` enforces deployment limits, returns the canonical JSON envelope, and projects that same envelope through `presentationMeta`. The Tool pipeline persists this metadata on `tool/result`, so a Client renderer can replay the interface without parsing model-facing prose.

The canonical value and metadata use the discriminator `protocol: "a2ui/v1"`. The model-facing result contains only a short count acknowledgement; it does not repeat the interface description.

-----

<a id="model-experience"></a>
## Model Experience

### Tool schemas

#### What the model sees

The model sees `a2ui_render(messages)`, describing the admitted A2UI v1 Basic Catalog messages. The generated [tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-a2ui) is the exhaustive schema reference.

#### Token effect

Fixed schema cost while the tool is visible.

#### KV Cache effect

Prefix-stable while the tool definition and visibility remain unchanged.

### Tool results and task context

#### What the model sees

A successful call reports how many A2UI updates were accepted. A rejected call reports a structured invalid-argument failure. The canonical messages are retained for programmatic calls and the replayable UI metadata, but are not duplicated into model-facing result text.

#### Token effect

The short acknowledgement has a small bounded cost. Failed validation text varies with the rejected field or limit.

#### KV Cache effect

Append-only; each result follows the reusable request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Separate Client renderer** — this Host package persists metadata; the optional `dsh-client-ui-a2ui` package renders it.
- **Restricted protocol subset** — every Basic Catalog v1.0 component is admitted with its catalog fields and data-model bindings. Renderer-side `checks`, data-driven `ChildList` templates, and AG-UI state snapshots/deltas stay deferred; arbitrary CSS, inline HTML, and animation are deliberately outside the catalog, whose styling surface is limited to `variant`, `weight`, `justify`, `align`, `fit`, `axis`, and `direction`.
- **Message-based action return** — the optional Client submits bounded structured actions through native user messages; no dedicated Session event exists yet.
- **Inline Markdown only** — the renderers support `strong`, `emphasis`, and `code` spans plus line breaks; HTML, images, and links stay literal text, matching the catalog's stated Markdown limits.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
