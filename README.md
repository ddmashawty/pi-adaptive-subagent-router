# Adaptive Subagent Router

一个面向 Pi 的全局扩展，用于根据任务风险、质量策略、lane 职责、模型成本、上下文窗口、证据要求和 writer 隔离策略，动态路由 subagent 工作。

A global [Pi](https://github.com/badlogic/pi-mono) extension that routes subagent work according to task risk, quality policy, lane duty, model cost, context requirements, evidence gates, and writer isolation.

> 当前版本处于**只读灰度阶段**。所有 writer lane 会 fail-closed；待 writer authority gate 完成 writer-start baseline 和 ignored untracked 文件处理后再开放写入。
>
> The current rollout is **read-only**. Writer lanes fail closed until the authority gate supports a writer-start baseline and ignored untracked files.

## 开发目的 | Purpose

传统的 subagent 委派通常为所有任务固定使用同一个模型，容易在低风险任务上浪费成本和延迟，也可能错误降级 reviewer 或高风险任务。

Subagent delegation often uses one static model for every task. This can waste cost and latency on low-risk work, while also making it easy to under-protect reviews or high-impact tasks.

本扩展在不替代主 agent 决策的前提下增加动态策略：读取父运行时和模型目录，根据风险选择路由，校验证据与隔离要求，并记录真实执行效果。

The extension keeps the parent agent in control while adding a runtime policy layer that reads the active model catalogue, selects routes by risk, validates evidence and isolation requirements, and records observed execution effects.

扩展不绑定具体 provider 或模型 ID，也不会自动跨 provider 路由。

It does not hard-code a provider or model ID and never crosses providers automatically.

## 主要功能 | Features

- **动态路由 | Dynamic routing**：根据当前父运行时和可用模型目录选择路由。
- **风险感知策略 | Risk-aware policies**：支持 `balanced`、`economy` 和 `strict`。
- **思考级别降级 | Thinking fallback**：没有合适的低成本模型时，先降低父模型思考级别，再回退到父运行时。
- **Reviewer 保护 | Reviewer protection**：balanced 下的非 economy reviewer 保留父模型和当前思考级别。
- **证据约束 | Evidence contract**：要求子 agent 报告置信度和 `needsEscalation`；blocker 必须有命令/gate 证据或可复现代码路径。
- **自动升级复核 | Escalation**：低置信度结果可由父运行时重新核查。
- **只读校准 | Calibration**：可选地使用父模型重复第一个只读 lane，进行实际质量对照。
- **上下文约束 | Context requirements**：支持为最终模型指定最小上下文窗口。
- **隔离校验 | Isolation checks**：校验 lane key、输出路径、writer authority、authority 重叠和 worktree 要求。
- **Provider 兼容处理 | Provider compatibility**：仅对 child 请求移除可能导致兼容问题的 prompt-cache 字段。
- **使用日志 | Usage logging**：以隐私安全的 JSONL 记录路由和执行效果。

## 路由策略 | Routing policies

### `balanced`（默认 | default）

中文：

- 低风险 `scout`/`research` 可以使用同 provider 的低成本 reasoning 模型；
- reviewer 保留父模型和当前思考级别；
- high/critical 风险任务保留父运行时；
- medium-risk writer 保留父运行时，但当前所有 writer 仍被灰度保护直接拒绝；
- medium-risk 经济路由优先选择较接近的低成本候选。

English:

- Low-risk `scout`/`research` lanes may use a lower-cost same-provider reasoning model.
- Reviewers preserve the parent model and thinking level.
- High and critical risk lanes preserve the parent runtime.
- Medium-risk writers preserve the parent runtime, although all writers are currently rejected by the rollout guard.
- Medium-risk economical routing prefers a closer lower-cost candidate instead of blindly selecting the cheapest one.

### `economy`

中文：显式成本优先。所有职责，包括 reviewer，都可以使用低成本同 provider 模型；没有合适候选时先降低父模型思考级别，最后回退到父运行时。

English: Explicit cost-first routing. Lower-cost same-provider models may be used for every duty, including reviewers. If no eligible candidate exists, the router lowers the parent thinking level and finally falls back to the parent runtime.

### `strict`

中文：始终保留父模型和当前思考级别，适合发布、安全、不可逆操作或明确要求最高质量的任务。

English: Always preserves the parent model and current thinking level. Use it for release, security, irreversible, or explicitly quality-critical work.

模型公开成本只是保守代理，不代表模型能力、质量或最终实际花费。

Published model cost is only a conservative proxy; it is not a provider-neutral measure of intelligence, quality, or total spend.

## 安装 | Installation

扩展设计为 Pi 全局自动发现：

The extension is designed for Pi global auto-discovery:

```text
~/.pi/agent/extensions/adaptive-subagent-router/index.ts
```

当前运行时源文件 | Runtime source files:

```text
cacheCompatibility.ts
index.ts
routing.ts
usageLog.ts
validation.ts
workflow.ts
```

修改后执行 `/reload`，或重新启动 Pi 会话。

Run `/reload` after changes, or start a new Pi session.

## 使用方法 | Usage

扩展注册 `adaptive_subagent_launch` 工具。委派前，父 agent 应说明为什么需要委派、任务复杂度和风险、质量策略、lane 职责、证据/gate 要求以及 writer 隔离边界。

The extension registers the `adaptive_subagent_launch` tool. Before delegating, the parent should state why delegation is useful, task complexity and risk, quality policy, lane duties, evidence/gate requirements, and writer isolation boundaries.

概念性调用 | Conceptual call:

```json
{
  "decision": "低风险只读侦察适合 balanced 路由；不启用 writer；要求文件证据和置信度。",
  "complexity": "standard",
  "risk": "low",
  "qualityPolicy": "balanced",
  "autoEscalate": true,
  "lanes": [
    {
      "key": "recon",
      "agent": "scout",
      "role": "read",
      "duty": "scout",
      "task": "检查目标文件并返回带文件证据的具体发现。",
      "context": "fresh",
      "output": false
    }
  ]
}
```

扩展会把每个 lane 转换为 `pi-subagents` workflow，并为每个子任务写入明确模型和思考级别。底层直接调用 `subagent` 会被阻止，以避免绕过路由、证据和隔离检查。

The extension converts each lane into a `pi-subagents` workflow with an explicit model and thinking level. Direct execution calls to the underlying `subagent` tool are blocked so routing, evidence, and isolation checks cannot be bypassed.

## 使用日志 | Usage logging

每次成功启动 adaptive workflow 时写入一条 `launch` 记录；收到 `subagent:async-complete` 后写入一条 `completion` 记录。

Each successful adaptive workflow launch appends a `launch` record. A `completion` record is appended after `subagent:async-complete` is received.

默认路径 | Default path:

```text
~/.pi/agent/adaptive-subagent-router/usage.jsonl
```

设置 `PI_CODING_AGENT_DIR` 后，日志位于 `$PI_CODING_AGENT_DIR/adaptive-subagent-router/usage.jsonl`。

When `PI_CODING_AGENT_DIR` is set, the log is written to `$PI_CODING_AGENT_DIR/adaptive-subagent-router/usage.jsonl`.

记录内容 | Recorded fields:

- 父运行时和最终路由 | parent runtime and selected routes；
- 复杂度、质量策略、升级和校准配置 | complexity, quality policy, escalation and calibration settings；
- 完成状态、成功/失败结果 | completion state and success/failure outcome；
- 执行时延 | duration；
- 可获得时的输入、输出和总 token | input, output, and total tokens when available；
- 可获得时的美元成本 | observed USD cost when available。

日志不会记录任务正文。写入串行化，目录权限默认 `0700`，文件权限默认 `0600`，每次追加后执行 `sync()`。扩展 reload 后，会从最近的有限日志尾部恢复尚未完成的启动记录。

Task text is not logged. Writes are serialized, directories default to `0700`, files default to `0600`, and each append is followed by `sync()`. After an extension reload, recent unmatched launches are recovered from a bounded log tail.

日志失败只会写入 stderr，不会阻塞正常路由。

Logging failures are reported to stderr but never block routing.

## 当前限制与安全说明 | Limitations and safety

### Writer 暂不可用 | Writers are currently disabled

当前 writer authority gate 曾经只比较当前 `HEAD` 的变更，因此子 agent 如果在最终 gate 前提交越权文件，可能隐藏该变更；旧逻辑也不会检查 ignored untracked 文件。

The previous writer authority gate compared changes against the current `HEAD`, allowing a child to hide an out-of-authority change by committing before the final check. It also missed ignored untracked files.

因此当前版本对所有 `role: "write"` lane 直接拒绝。完成 writer-start baseline authority gate 并经过独立验证后，才会重新开放 writer。

The current release therefore rejects every `role: "write"` lane. Writers will be reconsidered only after a writer-start baseline authority gate is implemented and independently verified.

### 评测结论范围 | Evaluation scope

此前小样本只读 factual-scout 实验观察到成本和延迟下降，但样本不足以构成普遍质量保证。实际使用时应继续观察任务类型、风险、父/最终路由、token、成本、时延、质量判断、升级结果以及文件变更事件。

A small read-only factual-scout pilot observed lower cost and latency, but it is not a general quality guarantee. In production use, continue observing task type, risk, parent/final route, tokens, cost, latency, quality judgments, escalation results, and file-change events.

其他限制 | Other limitations:

- 模型公开成本不等于模型能力或实际总成本 | published model cost is not model capability or total actual spend；
- Pi 扩展拥有宿主进程权限，只应从可信来源安装和修改 | Pi extensions have host-process permissions and should only be installed from trusted sources；
- 当前扩展依赖 Pi TypeScript loader 和 `pi-subagents` RPC | the extension depends on Pi's TypeScript loader and `pi-subagents` RPC。

## 开发检查 | Development checks

```bash
for f in index.ts routing.ts workflow.ts validation.ts cacheCompatibility.ts usageLog.ts; do
  node --experimental-strip-types --check "$f"
done

pi --list-models
```

实验 benchmark、测试和阶段性报告不属于安装目录的运行时文件；实际运行数据统一写入 JSONL 使用日志。

Experimental benchmarks, tests, and interim reports are not part of the installed runtime directory. Operational data is written to the JSONL usage log.

## License

当前尚未声明 License。

No license has been declared yet.
