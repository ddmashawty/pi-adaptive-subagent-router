# 发现

- 当前 Pi extension API 在 `before_agent_start` 可读取 `ctx.model`、`ctx.thinkingLevel`、`ctx.modelRegistry` 和 `ctx.scopedModels`，并可追加 system prompt。
- Pi extension 的 `tool_call` 事件可读取/修改/阻止工具调用。因此可对 `subagent` 调用做策略校验。
- `pi-subagents` 的 `workflowScript` 是任意 JavaScript 字符串；不应声称可以从任意脚本可靠静态理解所有 lane。最小可靠约定是：受策略约束的启动必须在每个 `runs.run`/`runs.all` 项中显式文字指定 `model: "provider/id:thinking"`。
- 模型目录没有跨厂商统一的能力等级字段。自动“较弱模型”只能采用同 provider、可用性、reasoning 支持、上下文需求与成本元数据作为保守代理；无合格候选时不自动委派。
- 思考强度可按统一顺序相对比较，并根据候选模型的 `thinkingLevelMap` 选择低于父级的可用档位。
- 验证时发现当前环境没有 `typescript` 编译器；`npx tsc` 下载到的是同名占位包而非 TypeScript。该失败是验证环境缺少编译器，不是 extension 加载错误。改用 Pi 的 auto-discovery smoke test（`pi --list-models`）验证 jiti 已成功加载 extension。

## 无低成本模型时的降级路由（2026-08-19）

- 原实现没有同 provider 且成本更低的 reasoning 模型时直接拒绝委派；当前真实 `openai-codex/gpt-5.6-luna:max` 会触发该路径。
- 新策略按顺序尝试：低成本同 provider 模型 → 父模型的较低思考强度 → 父模型与当前思考强度。
- 最后一种是明确的同模型兜底，只在没有可用更低思考档位时使用；不自动跨 provider。
- `minContextWindow` 只应约束最终选中的模型：低成本候选满足上下文要求时，即使父模型上下文更小，也应优先使用该候选；只有复用父模型时才检查父模型上下文。

## 风险感知升级（2026-08-19）

- 仅按 complexity+cost 会错误降级“代码量小但后果高”的任务；默认 balanced 现按 risk+duty+role 决定是否保留父运行时。
- 三档策略：economy 明确成本优先；balanced 对低风险 scout/research 经济路由、对中风险 reviewer/writer 和高/关键风险保留父运行时；strict 始终保留父模型与思考级别。
- 自动升级必须兼容自然文本和 JSON（如 `{"confidence":"low"}`）；工作流正则已覆盖引号形式，并有可执行工作流测试。
- wave 值不能直接拼进 JavaScript 标识符；现改用顺序 `waveResultN`，公共 schema 同时限制 1–99。
- “writer authority” 仅声明不够：现要求相对路径前缀、拒绝跨 lane 等同/嵌套范围，并自动组合 Git host gate，检查 tracked/untracked 变更是否越界。
- escalation reviewer 保留仓库工具并使用 turnBudget；如果完全阻断工具，就无法真正复核代码证据。
- 新 Pi 端到端证明：高风险 balanced reviewer 路由到父 `medium`；低风险 economy scout 路由到低成本模型，输出低置信度后自动追加父模型 reviewer。
- 一次带 gate 的同父模型 reviewer 子进程因 provider 返回 `prompt_cache_retention is not supported on this model` 而无输出；相同路由不带 gate 随后成功。该现象属于 pi-subagents/provider 组合的残余兼容风险，路由器本身已保留结构化失败结果。
