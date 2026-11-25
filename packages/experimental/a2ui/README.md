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

The tool accepts A2UI v1 `createSurface`, `updateComponents`, `updateDataModel`, and `deleteSurface` messages. `createSurface` admits every Basic Catalog v1.0 component plus the package's three business components under their own Catalog id. Component lists are non-empty; each Surface contains the canonical `root`, rejects duplicate ids, missing references, cycles, and unreachable components, and revalidates the complete graph after component updates. Component and surface ids are bounded non-control strings. Button action context values admit JSON literals, arrays, literal objects, and `@path` bindings; this implementation admits only the `event` Action variant, while `functionCall` remains deferred.

`maxMessages` limits messages in one call, `maxComponents` limits the total components carried by that call, and `maxBytes` limits the UTF-8 size of the canonical envelope after validation. Invalid input fails as `ToolArgsError` with code `INVALID_ARGS`; no partial metadata is published.

### Security properties

Messages are data, not executable code. The admitted fields cannot carry JavaScript, HTML, custom component implementations, network requests, or arbitrary Catalog names. The future Client renderer remains responsible for validating persisted metadata before creating a `MessageProcessor`; Host acceptance does not make historical or external records trusted.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

`src/schema.ts` validates model-generated messages and closes component references for each `createSurface`. `src/index.ts` enforces deployment limits, returns the canonical JSON envelope, and projects that same envelope through `presentationMeta`. The Tool pipeline persists this metadata on `tool/result`, so a Client renderer can replay the interface without parsing model-facing prose.

The canonical value and metadata use the discriminator `protocol: "a2ui/v1"`. The model-facing result contains only a short count acknowledgement; it does not repeat the interface description.

-----

<a id="business-catalog"></a>
## Business catalog

Besides the Basic Catalog, the validator admits one business catalog, `https://dsh.dev/a2ui/catalogs/task/v1`, with five components for task and metric interfaces:

| Component | Fields |
|---|---|
| `ActionButton` | `label`, `variant` (`default`/`primary`/`danger`/`borderless`), `action` (`local:set`, `local:toggle`, or `agent`) |
| `Progress` | `label`, optional `value`/`max`, `tone`; missing `value` renders indeterminate progress |
| `StatusBadge` | `label`, `tone` (`neutral`/`info`/`success`/`warning`/`danger`) |
| `Statistic` | `label`, `value`, `trend` (`direction`, `text`), `tone` |
| `TaskCard` | `title`, `owner`, `priority` (`high`/`medium`/`low`), `status` (`todo`/`doing`/`done`), `child` |

A Surface that names the Basic Catalog still refuses them, so a third-party renderer without this catalog keeps drawing every Surface it is sent. `TaskCard.child` names one component placed in the card's action area, so a `Row` of `Button`s sits inside the card. `ActionButton` applies `local:set` and `local:toggle` through the owning Surface data model without contacting the Agent; its `agent` variant dispatches one ordinary A2UI event.

<a id="model-experience"></a>
## Model Experience

### Tool schemas

#### What the model sees

The model sees `a2ui_render(messages)`, describing the admitted A2UI v1 Basic Catalog messages. The generated [tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-a2ui) is the exhaustive schema reference.

#### Token effect

Fixed schema cost while the tool is visible.

#### KV Cache effect

Prefix-stable while the tool definition and visibility remain unchanged.

### Prompt section

#### What the model sees

A prompt section registered at the `TOOL_A2UI` order tells the model that interactive interfaces belong in `a2ui_render`: a card, form, table, checklist, wizard, or dashboard panel is drawn through the tool, and asking for one does not mean writing generator scripts, HTML, CSS, or JavaScript or starting a preview server. Writing files stays reserved for code the user keeps in their project.

#### Token effect

A fixed short paragraph per request while the plugin is mounted.

#### KV Cache effect

Prefix-stable: the section text does not vary between requests.

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
- **Restricted protocol subset** — every Basic Catalog v1.0 component is admitted with its catalog fields, data-model bindings, and data-driven `ChildList` templates, plus renderer-side `checks` on the checkable components. Checks accept only the catalog's `required`, `regex`, `length`, `numeric`, `email`, `and`, `or`, and `not`; the regex dialect rejects backreferences, lookarounds, named groups, and Unicode property escapes, and the formatting and action functions stay deferred. AG-UI state snapshots/deltas stay deferred too; arbitrary CSS, inline HTML, and animation are deliberately outside the catalog, whose styling surface is limited to `variant`, `weight`, `justify`, `align`, `fit`, `axis`, and `direction`.

- **Template bindings are relative** — inside a `ChildList` template the renderer resolves bindings against the data-model item, so an absolute path renders empty; the Host rejects it instead of shipping a silent blank cell.

- **Message-based action return** — the optional Client submits bounded structured actions through native user messages; no dedicated Session event exists yet.
- **Inline Markdown only** — the renderers support `strong`, `emphasis`, and `code` spans plus line breaks; HTML, images, and links stay literal text, matching the catalog's stated Markdown limits.
- **Surface theme tokens** — `createSurface.metadata.extensions.dsh_theme` carries closed `tone` (`neutral`/`info`/`success`/`warning`/`danger`), `density` (`compact`/`comfortable`/`spacious`), and `textScale` (`sm`/`md`/`lg`) tokens, which renderers map onto catalog spacing, type, and accent values. Free-form colours, sizes, and CSS stay rejected.
- **Action approval** — configure `approvalActions` with the Button action names a renderer must confirm. Matched names are recorded in the Tool result metadata as `approval`, and the Client shows a confirmation step before it submits the action.
- **Incremental updates compose complete successors when enabled** — with `allowIncremental` the tool remembers each Session's Surfaces (up to 32) and turns `updateComponents`, `updateDataModel`, and `deleteSurface` into a complete `createSurface` any renderer can draw from scratch, so a stateless client renders the same result. It defaults to `false`, where such a call instead fails with guidance to send a complete `createSurface`.
- **Incremental messages are shape-checked** — the tool remembers up to 32 surface ids per Session, so `updateComponents`, `updateDataModel`, and `deleteSurface` may target a surface an earlier call created. For those cross-call messages only component shapes are validated, because this call holds no graph for the surface; the Client renderer enforces the full graph. The memory is process-lifetime and per Session.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
