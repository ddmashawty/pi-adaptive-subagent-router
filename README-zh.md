# Adaptive Subagent Router

[English](README.md) | 中文

Adaptive Subagent Router 是一个面向 [Pi](https://github.com/badlogic/pi-mono) 的全局扩展，用于根据任务风险、质量策略、lane 职责、模型成本、上下文要求和证据 gate，动态路由 subagent 工作。

它保留父 agent 的决策权，同时增加运行时策略层：读取当前模型目录，选择合适的路由，校验委派约束，并记录实际执行效果。扩展不绑定具体 provider 或模型 ID，也不会自动跨 provider 路由。

## 开发者预览

本扩展目前处于开发者预览阶段。随着真实使用数据积累，路由策略和日志格式可能继续变化。它支持只读的 scout/reviewer/research/oracle lane，以及最多一个运行在 pi-subagents 托管 Git worktree 中的写入 lane（`worker` 或 `delegate`）。共享 checkout 和非 Git writer 仍不支持。

## 主要功能

- 根据父 agent 当前运行时和模型目录动态路由。
- 支持 `balanced`、`economy`、`strict` 三种质量策略。
- 没有合适低成本模型时，自动降低思考级别作为 fallback。
- balanced 下保护 reviewer 以及 high/critical 风险任务的父运行时。
- Oracle 始终保留父模型和父 thinking，并默认使用 fork 上下文。
- Worker 或 Delegate 的单写入 lane 路由强制 managed worktree 和 host gate，并保留 patch/handoff 工件。
- 要求子 agent 报告置信度和 `needsEscalation`。
- 可选地由父运行时复核低置信度结果。
- 可选地使用父运行时对第一个只读 lane 进行校准。
- 支持最小上下文窗口要求。
- 校验 lane key 和输出路径唯一性。
- spawn 前使用 pi-subagents launch-contract 检查，拒绝非 builtin shadow agent 和被扩张的 Delegate 工具。
- 管理 action 使用 fail-closed 非执行 allowlist；阻止直接/scheduled/resume/refinement/project-pane 执行，steer 必须设置 `steeringRecovery:false`。
- 对 child 请求提供 prompt-cache 兼容性保护。
- 使用隐私安全的 JSONL 记录启动和完成效果。

## 路由策略

### `balanced`（默认）

- 低风险 `scout` 和 `research` lane 可以使用同 provider 的低成本 reasoning 模型；
- reviewer 保留父模型和当前思考级别；
- 任何 subagent 的 thinking 都不得高于父模型；
- Oracle 保留父模型和父 thinking，并默认使用 fork 上下文；
- Worker 和 Delegate 保留父模型和父 thinking、默认使用 fork，并共享唯一的 `worktree:true` 写入名额且必须提供 gate；
- high/critical 风险任务保留父运行时；
- medium-risk 经济路由优先选择较接近的低成本候选，而不是盲目选择最便宜的模型。

### `economy`

显式成本优先。经济型职责（包括 reviewer）可以使用低成本同 provider 模型，但 thinking 仍低于父模型；Oracle、Worker 和 Delegate 是模型降级的例外，三者都保留父模型和完全相同的父 thinking。经济型职责没有合适候选时，先降低父模型思考级别，最后回退到父运行时。

### `strict`

保留父模型和当前思考级别。任何角色（包括 Oracle、Worker 和 Delegate）都不得将 thinking 提升至父模型之上。适合发布、安全、不可逆操作或明确要求最高质量的任务。

模型公开成本只是保守代理，不代表模型能力、质量或最终实际花费。

## 依赖

本扩展依赖 [**nicobailon/pi-subagents**](https://github.com/nicobailon/pi-subagents)（Pi 的 subagent 运行时）。每次 spawn 前先使用 pi-subagents 公开 launch-contract preflight，再通过 `subagents:rpc:v1` 事件桥启动 workflow，因此必须先安装并加载 pi-subagents。

Adaptive Subagent Router 建立在 pi-subagents 提供的基础之上。谨向项目作者 Nico Bailon 以及所有贡献者致以诚挚的感谢与敬意，感谢他们创建并持续维护这一项目。

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
executionPolicy.ts
index.ts
launchPolicy.ts
routing.ts
usageLog.ts
validation.ts
workflow.ts
```

修改后执行 `/reload`，或重新启动 Pi 会话。

## 运行

将仓库直接克隆到 Pi 全局扩展目录：

```sh
mkdir -p ~/.pi/agent/extensions
git clone https://github.com/ddmashawty/pi-adaptive-subagent-router.git \
  ~/.pi/agent/extensions/adaptive-subagent-router
```

也可以将八个运行时源文件复制到目标目录。不要从任意外部路径 symlink 本扩展：preflight bridge 会有意通过 Pi 标准的 `~/.pi/agent/npm` 包布局解析已安装的 pi-subagents 公开 API。

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

扩展会把每个 lane 转换为 `pi-subagents` workflow，并为每个子任务写入明确的模型和思考级别。Agent 名称采用 fail-closed allowlist：`scout`、`reviewer`、`researcher`/`research`、`oracle`/`advisor`、`worker` 及其内置实现别名，以及 `delegate`。spawn 前，pi-subagents preflight 必须证明每个名称最终解析为 bundled builtin；同名 package/user/project shadow 会被拒绝。Delegate 还必须保持显式非 fanout 工具契约。底层直接执行以及不在已审查非执行 allowlist 中的管理 action 都会被阻止，其中包括具有执行能力的 `schedule`、`resume`、`refine` 和 `project.open`；`steer` 只有在 `steeringRecovery:false` 时允许，从而禁止 pause-and-resume replacement 执行。

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

### 只读 lane 与隔离写入 lane

Scout、reviewer、research 和 oracle lane 仍然只读。Worker 和 Delegate 的内置工具 allowlist 都具备写入能力，因此只有在以下 fail-closed 条件全部满足时才允许启动任一角色：

- agent 名称和 duty 必须匹配内置 allowlist，且 launch preflight 必须证明选中的定义来源为 `builtin`；不支持、自定义或同名 shadow agent 在 spawn 前失败；
- 一个 adaptive workflow 最多一个写入 lane，Worker 与 Delegate 合并计数；
- 写入 lane 必须在 clean Git 仓库中使用 `worktree:true`；
- 调用方必须提供非空 host gate；
- 该 workflow 不得启用 calibration sampling；
- 写入 lane 拥有整个 managed worktree，而不是父 checkout 中的路径子集；
- pi-subagents 捕获 patch 和 handoff manifest，成功捕获后清理临时 worktree/branch，是否应用 patch 由父 agent 决定；
- Delegate 保持其内置显式工具 allowlist，不允许 configured/subagent-only extension、MCP/工具扩展或嵌套 subagent fanout。

共享 checkout writer、非 Git writer、多写入 lane、路径级 authority 和自动应用 patch 均明确不支持。Managed worktree 是工程隔离边界，不是防止外部副作用的操作系统沙箱。Adaptive routing 激活时，面向模型的 hook 会阻止创建、恢复或手动运行 schedule；由外部拥有和触发的 schedule 不属于本扩展的生命周期控制范围。未来未知的管理 action 默认 fail closed，直到被明确分类为非执行操作。

### 评测范围

此前小样本只读 factual-scout 实验观察到成本和时延下降，但这不能作为普遍质量保证。真实使用中应继续观察任务类型、风险、父/最终路由、token、成本、时延、质量判断、升级结果和文件变更事件。

Pi 扩展拥有宿主进程权限，只应从可信 checkout 安装和修改。

## 开发

本扩展使用 Pi 的 TypeScript loader 和 Node strip-types 支持：

```sh
for f in index.ts routing.ts workflow.ts validation.ts cacheCompatibility.ts usageLog.ts launchPolicy.ts executionPolicy.ts; do
  node --experimental-strip-types --check "$f"
done

pi --list-models
```

测试是仅用于仓库开发的文件，不属于运行时入口；实际运行数据统一写入 JSONL 使用日志。

## License

当前尚未声明 License。
