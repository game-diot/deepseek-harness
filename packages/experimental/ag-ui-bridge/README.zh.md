---
description: "与原生协议并行的实验性鉴权 AG-UI SSE 端点，把 DSH Agent Run 翻译成 AG-UI 1.0 事件。"
kind: "package-reference"
---

# @deepseek-ai/dsh-ag-ui-bridge

[English](README.md) | 中文

## 概述

此实验性 Host 插件在不改变原生 DSH Web、Session 和 Agent Loop 链路的前提下，公开一个需鉴权的 AG-UI SSE Run 端点。它把一个已鉴权 Principal 与外部 Thread 组成的二元组映射到 Bridge 自己拥有的 Agent，并将已认领 Turn 和实时 Assistant Frame 翻译成 AG-UI 1.0 事件。

## 目录

- [使用本包](#use-this-package)
- [行为](#behavior)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

只在实验 Profile 中挂载，设置必填的 `provider` 和 `model`，并按需配置 `path`、`maxBodyBytes`、`maxThreads`、`maxHistoryBytes` 与 `sessionCwd`。`sessionCwd` 是 Bridge 创建 Session 时记录的项目目录；不设置时 Session 会落到存储的无 cwd 分区，Web 的 Workspace 视图无法打开。命名路由要求已鉴权 Peer，只接受 `POST`，校验 `RunAgentInput`，拒绝同一 Thread 的并发 Run，并在插件卸载时清理所有 Bridge 拥有的 Agent。

设置 `demo: true` 会在 `<path>/demo` 提供一个自包含页面：它向本端点提交请求、显示原始事件流，并用普通 DOM 渲染宿主准入的 A2UI Basic Catalog 子集。它用于在浏览器里观察 Bridge，不是产品渲染器，默认关闭。

<a id="behavior"></a>
## 行为

每个 Run 携带 Bridge 已产出的 Thread 历史，再加一条新的用户文本消息，并要求 Tools、Context、State 和 Forwarded Props 为空；不支持的字段以 HTTP 400 失败。Bridge 记录自己发布的每条消息，并按 `id`、`role`、文本、`toolCallId` 以及 Tool 调用的 id/name/arguments 比对回放前缀，因此分叉会以 HTTP 409 失败，而不是让 Thread 静默分岔。未发布任何消息事件的 Run 会保留其用户消息记录，Client 可重发同一条消息；Bridge 会丢弃记录中的那一份并重新运行。它映射 `RUN_STARTED`、流式文本、流式 Tool 参数、仅针对 Client 已看到开启的 Tool 调用的持久 `TOOL_CALL_RESULT`、当 Tool 结果携带 `protocol: a2ui/v1` 元数据时的 `a2ui` 命名 `CUSTOM` 事件、`RUN_FINISHED` 和 `RUN_ERROR`。对外错误使用稳定消息和错误码，Host 日志保留内部诊断。HTTP Client 断连会取消活跃 DSH Turn，但不会收到合成的终止事件。

<a id="model-experience"></a>
## 模型体验

### 协议适配器

#### 模型看到什么

模型通过普通且持久的 DSH `user/message` 路径看到有界归属前缀（已鉴权 Principal、外部 Thread 和 Run id）以及随后的准入用户文本。Bridge 不增加 System Prompt 或 Tool Schema。

#### Token 影响

只有提交的用户消息产生 Token。

#### KV Cache 影响

Bridge 不改变可复用 Prompt 前缀。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **历史只来自本 Bridge** — Thread 历史只在该进程产出后存在。对未知 Thread 回放任何历史以 `DSH_AG_UI_HISTORY_UNREPLAYABLE` 失败；回放前缀与记录不一致以 `DSH_AG_UI_HISTORY_DIVERGED` 失败；超过 `maxHistoryBytes` 的请求以 `DSH_AG_UI_HISTORY_TOO_LARGE` 失败。
- **中断的流会终结该 Thread** — 一旦 Run 已写出事件而响应随后中断，Client 无法重现已投递前缀，因此 Bridge 会解除该绑定、释放其 `maxThreads` 名额，后续 Run 以 `DSH_AG_UI_HISTORY_UNUSABLE` 失败。背压按写入失败处理：Bridge 取消该 Run 并终结 Thread，而不是留下无法校验的部分历史。
- **进程内 Thread 绑定** — 按 Principal 隔离的绑定不会跨进程重启保留，也还没有把外部 Thread 标识持久映射到 DSH Session。
- **延期的协议面** — AG-UI 的 State 快照与增量、Interrupt、多模态输入、客户端 Tools 以及 protobuf 传输均未支持。
- **A2UI 走 Tool 数据** — 规范化 Surface 消息在 Tool 结果之后以 `a2ui` 命名 `CUSTOM` 事件到达；没有使用 AG-UI 的 State 或 Activity 通道，且 demo 页面只渲染本宿主准入的 Basic Catalog 子集。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

`run-history.ts` 必须与官方 Client 从这些事件重建消息的方式保持一致：Assistant 消息在存在 `parentMessageId` 时以其为键（否则用 `toolCallId`），Tool 参数按 `toolCallId` 累积，Tool 结果落在独立的 `tool` 消息中。已用 `@ag-ui/client@1.0.5` 的 `runAgent` 覆盖文本先行、Tool 先行和多轮 Turn 验证。

</details>
