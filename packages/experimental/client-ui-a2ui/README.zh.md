---
description: "为持久 A2UI 结果提供浏览器准入、完成 Turn 渲染和 Action 回传。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-a2ui

[English](README.md) | 中文

## 概述

将此浏览器插件与 `dsh-a2ui` 配套使用，以准入重放的 `a2ui/v1` 元数据、将格式错误或失败的工具结果保留为可见降级，并在完成 Turn 下方渲染合法 Surface。Button Action 通过原子文本提交动作，以有界结构化 JSON 回传。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [哪些交互留在本地](#what-stays-local)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在实验 Bundle 中将此 Client 插件挂载到对应 Host 工具之后。本包没有配置字段。keyed Tool View 只在插件活跃时替换通用行；卸载插件会移除注册并恢复原生通用降级显示。

历史元数据不可信。轻量准入先校验帧并分离无损 JSON，再加载懒加载渲染器 chunk。渲染器独立使用 SDK 严格校验。调用失败或信封被拒绝时，本包会在本地化告警旁保留面向模型的原始结果文本。

-----

<a id="understand-the-implementation"></a>
## 理解实现

`src/client/metadata.ts` 在不导入 A2UI SDK 的情况下负责轻量帧准入。`A2uiToolRow.tsx` 渲染工具生命周期和降级，不重复渲染 Surface。Turn 投影把持久结果发布给 `A2uiTurnTail.tsx`，由它懒加载严格 SDK 渲染器。每张已提交卡片拥有并清理自己的处理器；共享 SDK 样式使用已提交的 insertion-effect 生命周期。

-----

<a id="what-stays-local"></a>
## 哪些交互留在本地

修改绑定值与切换容器都不会产生 Turn：`TextField`、`CheckBox`、`ChoicePicker` 与 `Slider` 把 `@path` 绑定写入卡片的数据模型，`ChildList` 模板据此重新展开，`Tabs` 自行切换面板。浏览器实测：在绑定 `/owner` 的 `TextField` 中输入姓名，读取同一路径的兄弟 `Text` 随之变化，而 Turn 数量保持为一。

Basic Catalog 的 `Button` 始终会到达 Agent。业务目录的 `ActionButton` 新增用于纯显示变化的 `local:set` 与 `local:toggle`，其 `agent` 变体则复用现有事件通道。视图状态使用本地动作，业务操作或模型决策使用 Agent 动作。

<a id="model-experience"></a>
## 模型体验

### 浏览器展示

#### 模型看到什么

模型不会看到本浏览器包添加的内容。Host 的 `dsh-a2ui` 包拥有 `a2ui_render` schema 和面向模型的结果文本；本包只读取其持久化元数据。

#### Token 影响

除 Host 工具外不增加 Token。

#### KV Cache 影响

仅浏览器展示，不会改变缓存复用。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **两个目录**——懒加载渲染器绘制 Basic Catalog，以及一个业务目录（`https://dsh.dev/a2ui/catalogs/task/v1`），后者新增 `ActionButton`、`DataTable`、`Progress`、`TaskCard`、`StatusBadge` 与 `Statistic`。`DataTable` 把有界标量行渲染为支持横向滚动和文本截断的语义化表格；排序、筛选、选择和行级动作仍留待后续。`ActionButton` 的本地 set/toggle 操作不产生 Turn，Agent 变体则走普通动作通道。业务样式固化在本包的 CSS Modules 与 `--dsw-*` token 中，Surface 无法自行选择颜色或间距。
- **仅支持消息式 Action 回传**——完成 Turn 的按钮通过原生会话输入提交 `userMessage`，缺失时使用稳定的动作名；尚不单独持久化结构化 A2UI Action 事件。
- **仅做轻量准入**——帧检查不能替代官方 SDK 校验。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
