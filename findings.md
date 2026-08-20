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

## Provider/cache 兼容性闭环（2026-08-20）

- 已读取失败 artifact：child 在首个模型请求前失败（`toolCount=0`、usage 全 0），且 acceptance `verifyRuns=[]`，所以不是 gate shell 命令的失败。
- provider 边界诊断确认当前 Pi 0.84.2 的 `openai-codex-responses` child payload 不含 `prompt_cache_retention`，但含 `prompt_cache_key`；因此旧错误不能被静态归因于当前 gate 命令，保守分类为 provider 对可选 prompt-cache 参数的兼容/间歇性失败。
- 当前扩展新增 child-only payload 防护：同时移除 `prompt_cache_key` 与 `prompt_cache_retention`，不修改父会话请求，也不原地修改 payload；父模型/子模型/普通 provider 字段保持不变。
- 历史新 Pi 进程实测 Sol parent + gated reviewer：移除 prompt-cache 字段后 child 成功完成模型请求并产生输出；本次合成任务因未提供完整 acceptance-report 被 acceptance 拒绝，但不再出现 provider cache 错误。该测试证明防护不阻断请求，不宣称已证明 provider 错误可稳定复现。
- 最终抽取为 `cacheCompatibility.ts` 后，真实 Pi `reviewer` child（`openai-codex/gpt-5.6-luna:max`）完成了当前扩展的 gated acceptance；host gate 通过 17 项测试、`index.ts` 语法检查及 `pi --list-models`，acceptance status/evidence 均为 `verified`。
- 明确代价：child 可能少用 prompt cache；这是为避免高风险 reviewer 在产生任何证据前被 provider 拒绝的可靠性取舍。

## 用户决策与后续评测（本轮）

- 用户明确要求 review 优先保证模型智慧程度，因此 `balanced` 下 reviewer 不应因低风险声明而自动降级；只有显式 `economy` 才允许 reviewer 走成本优先路径。
- 评测先实现离线路由 A/B：固定同一模型目录和任务元数据，比较 adaptive 选择与静态父模型/固定低成本基线的路由差异、保护规则和理论成本；不把离线差异冒充质量收益。
- live A/B 的必要字段：task/seed/condition、最终路由、实际 token/成本/延迟、正确性、证据等级、gate/authority 事件、escalation/calibration 触发及失败原因。
- 建议验收：质量不下降，且成本或延迟至少下降 15%；任何 reviewer 质量或 writer 安全回归都判失败。
- 审查发现并已修正：`index.ts` 的注入提示曾遗漏 low-risk reviewer；离线 fixture 曾只覆盖 low/medium reviewer，现已补齐 high/critical。
- 调试记录：首次 benchmark 断言把非 economy reviewer 数量误写为 3，实际 fixture 当时只有 2；依据测试输出确认是断言/fixture 不一致，随后扩展 fixture 到四种 reviewer 风险并更新期望值。
- 新 Pi 进程 live route smoke：low-risk `balanced` reviewer 实际路由到父 `openai-codex/gpt-5.6-luna:max`（`same-model`，reason 为 reviewer quality priority）；显式 `economy` reviewer 实际降到同模型 `:minimal`（`same-model-lower-thinking`）。这只证明路由选择，不证明质量或实际节省。
- 一次要求 child 只返回固定 JSON 的 live smoke 与 pi-subagents acceptance-report 契约冲突，child 请求 supervisor 后 detached；后续 live harness 应让任务输出契约与 acceptance 契约一致。

## 首轮完整路径 live A/B（2026-08-20）

- 固定父模型 `openai-codex/gpt-5.6-luna:max`、complex/low、3 条并行只读 lane、无 calibration/escalation/gate；balanced 与 strict 使用相同任务文本。
- Review suite：balanced/strict 都路由到 parent max，核心 rubric 各 3/3；balanced cost `$0.07712976`、144,320 child tokens、workflow 493.38s；strict cost `$0.07206960`、133,923 tokens、371.96s。因路由相同，差异不归因于 adaptive；balanced isolation 输出额外发现 HEAD/commit gate bypass。
- Scout suite：balanced 路由到 parent medium，strict 到 parent max；两边核心 rubric 各 3/3。balanced cost `$0.01693624`、53,359 tokens、51.39s；strict cost `$0.02449144`、66,832 tokens、96.65s。首轮相对 strict 为 token -20.16%、cost -30.85%、workflow wall -46.83%。
- 独立 quality scorer 读取 12 个 output/meta，确认所有 child `exitCode=0`、acceptance attested、无文件修改；结论为首轮质量通过，但样本不足以给出最终统计保证。
- 新发现的安全残余：`workflow.ts:18` 使用当前 HEAD 而非 writer-start baseline，且 `--exclude-standard` 忽略 ignored untracked；需单独修复/验证，不能把当前 writer isolation 宣称为已完全验证。
- 详细报告：`live-ab-report.md`。完整评测仍需至少 20 个 paired tasks/repetitions 和置信区间。

## 只读灰度结论（本轮）

- 用户决定不为部署前结论扩充到 20+ paired tasks/repetitions；采用真实使用中的持续观测替代。
- 两项独立只读审查一致认为：只读低风险 scout 可小范围上线；首轮 3 对 exact-fact scout 两边 rubric 均为 3/3，balanced 相对 strict 的 token/cost/wall 分别为 -20.16%/-30.85%/-46.83%。这只支持该任务类，不能外推为总体质量保证。
- reviewer 的 balanced 路由保留父模型/思考级别已有路由与基准回归覆盖；首轮 review 没有成本/时延收益主张。
- `workflow.ts:18` 的 authority gate 对当前 HEAD 比较，out-of-authority 文件若由 child commit 则不可见；`--exclude-standard` 也遗漏 ignored untracked。为防止将声明性隔离误作安全边界，发布期 writer lane 已在 `validation.ts` fail-closed；该限制必须保留至独立修复和验证完成。
- 使用期最小观测字段：任务类/风险/role-duty/qualityPolicy、父与最终 route、token/实际成本/时延、完成/失败原因、rubric 或人工质量判断、confidence/needsEscalation、gate/authority 事件与是否有文件变更。
