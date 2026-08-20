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
