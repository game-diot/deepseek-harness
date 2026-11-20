---
description: "用于校验有界 A2UI v1 Basic Catalog 消息并将其持久化给 Client 渲染器的实验性模型工具。"
kind: "package-reference"
---

# @deepseek-ai/dsh-a2ui

[English](README.md) | 中文

## 概述

使用本包通过 `a2ui_render` 接收模型生成的 A2UI v1 消息。Host 会校验受限 Basic Catalog 子集、组件引用和部署上限，再把规范化消息作为工具结果元数据持久化。本包不渲染卡片；Client 插件必须独立校验并渲染这些元数据。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在工具注册表旁挂载插件：

```yaml
- name: '@deepseek-ai/dsh-a2ui'
  config:
    maxMessages: 8
    maxComponents: 100
    maxBytes: 65536
```

工具接受 A2UI v1 的 `createSurface`、`updateComponents`、`updateDataModel` 和 `deleteSurface` 消息。第一版子集只允许 Basic Catalog 的 `Card`、`Column`、`Text` 和 `Button` 组件。组件列表不能为空；每个 Surface 必须包含规范的 `root`，拒绝重复 id、缺失引用、循环和不可达组件，并在组件更新后重新校验完整组件图。组件和 Surface id 使用 Unicode 标识符语法。Button Action context 值允许 JSON 字面量、数组、普通对象和 `@path` 绑定；函数调用不属于该子集。

`maxMessages` 限制单次调用的消息数，`maxComponents` 限制单次调用携带的组件总数，`maxBytes` 限制校验后规范化信封的 UTF-8 大小。非法输入以 code 为 `INVALID_ARGS` 的 `ToolArgsError` 失败；不会发布部分元数据。

### 安全属性

消息是数据，不是可执行代码。允许的字段不能携带 JavaScript、HTML、自定义组件实现、网络请求或任意 Catalog 名称。未来的 Client 渲染器仍须在创建 `MessageProcessor` 前校验持久化元数据；Host 接受不代表历史记录或外部记录可信。

-----

<a id="understand-the-implementation"></a>
## 理解实现

`src/schema.ts` 校验模型生成的消息，并关闭每个 `createSurface` 的组件引用。`src/index.ts` 执行部署上限，返回规范化 JSON 信封，并通过 `presentationMeta` 投影同一个信封。工具流水线将该元数据持久化到 `tool/result`，Client 渲染器无需解析面向模型的文本即可重放界面。

规范化值和元数据使用 `protocol: "a2ui/v1"` 鉴别字段。面向模型的结果只包含简短计数确认，不重复界面描述。

-----

<a id="model-experience"></a>
## 模型体验

### 工具 schema

#### 模型看到什么

模型会看到 `a2ui_render(messages)`，其中描述允许的 A2UI v1 Basic Catalog 消息。生成的[工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-a2ui)是 schema 的穷尽式参考。

#### Token 影响

工具可见时产生固定 schema 成本。

#### KV Cache 影响

工具定义与可见性不变时，前缀保持稳定。

### 工具结果与任务上下文

#### 模型看到什么

成功调用会报告接受的 A2UI 更新数量。拒绝的调用会报告结构化非法参数错误。规范化消息会保留给程序化调用和可重放 UI 元数据，但不会重复进入面向模型的结果文本。

#### Token 影响

简短确认文本的成本小且有界。校验失败文本随被拒绝字段或上限变化。

#### KV Cache 影响

仅追加；每个结果位于可复用请求前缀之后。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **独立 Client 渲染器**——本 Host 包持久化元数据；可选 `dsh-client-ui-a2ui` 包负责渲染。
- **受限协议子集**——Basic Catalog v1.0 的全部组件及其目录字段与数据模型绑定均已准入。渲染器 `checks`、数据驱动 `ChildList` 模板与 AG-UI 状态快照/增量仍延期；任意 CSS、内嵌 HTML 与动画按设计不在目录内，目录的样式面只有 `variant`、`weight`、`justify`、`align`、`fit`、`axis`、`direction`。
- **基于消息的 Action 回传**——可选 Client 通过原生用户消息提交有界结构化 Action；目前没有专用 Session 事件。
- **没有 Markdown 渲染器**——该子集中的 Text 保持纯文本。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
