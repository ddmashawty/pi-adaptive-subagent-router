# Adaptive Subagent Router

[English](README.md) | 中文

Adaptive Subagent Router 是一个面向 [Pi](https://github.com/badlogic/pi-mono) 的全局扩展，用于根据任务风险、质量策略、lane 职责、模型成本、上下文要求和证据 gate，动态路由 subagent 工作。

它保留父 agent 的决策权，同时增加运行时策略层：读取当前模型目录，选择合适的路由，校验委派约束，并记录实际执行效果。扩展不绑定具体 provider 或模型 ID，也不会自动跨 provider 路由。

## 开发者预览

本扩展目前处于开发者预览阶段。随着真实使用数据积累，路由策略和日志格式可能继续变化。它只委派**只读** subagent（scout、reviewer、research）；所有文件写入由父 agent 自己完成，不由被委派的 lane 执行。

## 主要功能

- 根据父 agent 当前运行时和模型目录动态路由。
- 支持 `balanced`、`economy`、`strict` 三种质量策略。
- 没有合适低成本模型时，自动降低思考级别作为 fallback。
- balanced 下保护 reviewer 以及 high/critical 风险任务的父运行时。
- 要求子 agent 报告置信度和 `needsEscalation`。
- 可选地由父运行时复核低置信度结果。
- 可选地使用父运行时对第一个只读 lane 进行校准。
- 支持最小上下文窗口要求。
- 校验 lane key 和输出路径唯一性。
- 对 child 请求提供 prompt-cache 兼容性保护。
- 使用隐私安全的 JSONL 记录启动和完成效果。

## 路由策略

### `balanced`（默认）

- 低风险 `scout` 和 `research` lane 可以使用同 provider 的低成本 reasoning 模型；
- reviewer 保留父模型和当前思考级别；
- high/critical 风险任务保留父运行时；
- medium-risk 经济路由优先选择较接近的低成本候选，而不是盲目选择最便宜的模型。

### `economy`

显式成本优先。所有职责，包括 reviewer，都可以使用低成本同 provider 模型。没有合适候选时，先降低父模型思考级别，最后回退到父运行时。

### `strict`

始终保留父模型和当前思考级别。适合发布、安全、不可逆操作或明确要求最高质量的任务。

模型公开成本只是保守代理，不代表模型能力、质量或最终实际花费。

## 依赖

本扩展将执行委派给 **pi-subagents**（Pi 的 subagent 运行时）。它通过 pi-subagents 的 `subagents:rpc:v1` 事件桥 spawn 每个 workflow，因此必须先安装并加载 pi-subagents。

作为 Pi 包安装：

```sh
pi install npm:pi-subagents
```

这会把 `npm:pi-subagents` 写入 `~/.pi/agent/settings.json` 的 `packages` 数组。如果 pi-subagents 未加载，`adaptive_subagent_launch` 会在 5 秒后超时并报 "Timed out waiting for pi-subagents RPC. Ensure the pi-subagents package is loaded."。

## 安装

扩展设计为 Pi 全局自动发现：

```text
~/.pi/agent/extensions/adaptive-subagent-router/index.ts
```

运行时源文件：

```text
cacheCompatibility.ts
index.ts
routing.ts
usageLog.ts
validation.ts
workflow.ts
```

修改后执行 `/reload`，或重新启动 Pi 会话。

## 运行

克隆仓库，然后将扩展目录复制或链接到 Pi 全局扩展目录：

```sh
git clone https://github.com/ddmashawty/pi-adaptive-subagent-router.git
mkdir -p ~/.pi/agent/extensions
ln -sfn "$PWD/pi-adaptive-subagent-router" ~/.pi/agent/extensions/adaptive-subagent-router
```

也可以将六个运行时源文件复制到目标目录。

## 使用方法

扩展注册 `adaptive_subagent_launch` 工具。委派前，父 agent 应说明：

- 为什么需要委派；
- 任务复杂度和风险；
- 质量策略；
- lane 的 duty；
- 证据和 gate 要求。

概念性调用：

```json
{
  "decision": "低风险只读侦察适合 balanced 路由；要求文件证据和置信度。",
  "complexity": "standard",
  "risk": "low",
  "qualityPolicy": "balanced",
  "autoEscalate": true,
  "lanes": [
    {
      "key": "recon",
      "agent": "scout",
      "duty": "scout",
      "task": "检查目标文件并返回带文件证据的具体发现。",
      "context": "fresh",
      "output": false
    }
  ]
}
```

扩展会把每个 lane 转换为 `pi-subagents` workflow，并为每个子任务写入明确的模型和思考级别。底层直接调用 `subagent` 会被阻止，以避免绕过路由和证据检查。

## 使用日志

每次成功启动 adaptive workflow 时写入一条 `launch` 记录；收到 `subagent:async-complete` 后写入一条 `completion` 记录。

默认路径：

```text
~/.pi/agent/adaptive-subagent-router/usage.jsonl
```

如果设置了 `PI_CODING_AGENT_DIR`，日志路径为：

```text
$PI_CODING_AGENT_DIR/adaptive-subagent-router/usage.jsonl
```

日志记录父运行时和最终路由、复杂度、质量策略、升级/校准配置、完成状态、时延、token，以及可获得时的美元成本。日志不会记录任务正文。写入会串行化，目录权限默认 `0700`，文件权限默认 `0600`，每次追加后执行 `sync()`；扩展 reload 后会恢复最近尚未完成的启动记录。

日志失败只会写入 stderr，不会阻塞正常路由。

## 限制与安全说明

### 设计上只读

本扩展不委派文件写入。每个 lane 都是只读 subagent（scout、reviewer 或 research）：它只检查并报告，任何实际修改都由父 agent 自己完成。这从根本上消除了文件 authority 问题——没有 writer lane 需要约束，也就没有可被绕过的 authority 边界。

### 评测范围

此前小样本只读 factual-scout 实验观察到成本和时延下降，但这不能作为普遍质量保证。真实使用中应继续观察任务类型、风险、父/最终路由、token、成本、时延、质量判断、升级结果和文件变更事件。

Pi 扩展拥有宿主进程权限，只应从可信 checkout 安装和修改。

## 开发

本扩展使用 Pi 的 TypeScript loader 和 Node strip-types 支持：

```sh
for f in index.ts routing.ts workflow.ts validation.ts cacheCompatibility.ts usageLog.ts; do
  node --experimental-strip-types --check "$f"
done

pi --list-models
```

实验 benchmark、测试和阶段性报告不属于安装目录的运行时文件；实际运行数据统一写入 JSONL 使用日志。

## License

当前尚未声明 License。
