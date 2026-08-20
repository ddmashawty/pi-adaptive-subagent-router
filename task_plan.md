# 自适应 Subagent 路由器计划

## 目标
实现一个全局 Pi extension：在每次主 agent 准备委派时，依据当前运行时 provider、主模型、主思考强度和可用模型目录，要求主 agent 先形成简短路由决策，再优先选择较低成本/较低能力代理模型与较低思考强度；无低成本候选时降父模型思考强度，无法降档时复用父模型。不得绑定 OpenAI、DeepSeek 或具体模型 ID。

## 阶段
- [complete] 1. 确认 Pi extension 与模型目录 API，并确定可实施的最小强制边界。
- [complete] 2. 实现全局 extension：动态策略提示、运行时候选摘要、子 agent 调用校验。
- [complete] 3. 静态/运行时验证 extension 可加载，检查无固定 provider/model 依赖。
- [complete] 4. 记录配置方式、限制与使用说明。
- [complete] 5. 增加无低成本候选时的降级路由：优先降低父模型思考强度，无法降低时复用父模型。
- [complete] 6. 风险感知路由升级：加入 risk、qualityPolicy、角色策略、证据/gate 约束与结构化路由解释。
- [complete] 7. 抽取纯路由/工作流/隔离校验核心并建立自动回归矩阵；完成新 Pi 进程加载与端到端验证。
- [complete] 8. 独立高风险同级复审、问题闭环、文档同步与提交。
- [complete] 9. 调查并修复带 gate 的父模型 provider/cache 兼容性残余风险。
- [complete] 10. 将 balanced reviewer 统一固定在父模型与当前思考级别，补充低风险 reviewer 回归。
- [complete] 11. 增加可重复的 adaptive-vs-static 离线路由基准与结果判定工具，先验证策略差异再决定是否进行 live A/B。
- [pending] 12. 若进入 live A/B，使用固定任务/seed/预算记录实际 token、成本、延迟、质量和安全事件；离线基准不得替代真实质量结论。

## 决策
- 使用 `~/.pi/agent/extensions/adaptive-subagent-router/`，因此自动作用于所有项目。
- 主 agent 保留任务复杂度、lane 数和角色的最终判断；extension 提供动态策略与可验证的约束。
- 优先在同 provider 内选择成本低于父模型的 reasoning 模型；没有合格候选时不跨 provider。
- 无低成本候选时，先在父模型上选择低于当前值的思考强度；若父模型已无法降档，则复用父模型和当前思考强度，避免无谓拒绝委派。
- 对不同模型仍依据目标模型支持的 level 映射选择；正常降级路径保持低于主 agent，最终同模型兜底是显式例外。
- 同一 worktree 默认单 writer；多个 writer 仅在显式 worktree 隔离时允许。
- 默认质量策略为 balanced：低风险 scout/research 可经济路由；所有 reviewer、高/关键风险和中风险 writer 保留父模型；economy 才允许 reviewer 降级。
- strict 明确复用父模型当前思考级别；economy 保持既有成本优先行为。
- blocker 必须有命令/gate 或精确代码证据；高风险 reviewer 可强制 gate，避免静态猜测被包装成已验证结论。

## 验收
- 不包含写死的 provider 或模型 ID。
- 切换主模型/provider 后，下一回合的策略摘要随运行时目录变化。
- 对 subagent 启动要求显式 lane `model`，并拒绝显式模型与父模型相同或思考强度不低于父级的明显违规调用。
- extension 能被 Pi 加载且不影响普通非 subagent 任务。
- 无低成本候选时，`max/high/...` 能降到合适档位并复用父模型；`off/minimal` 等无法降档时仍能复用父模型，不再直接失败。
- 本地 mock provider 端到端验证：无低成本候选时实际启动 `mock/parent:low`，请求思考参数从 `max` 降为 `low`。
- 风险矩阵回归：balanced 的所有 reviewer、高/关键风险和中风险 writer 保留父运行时；economy/strict 行为明确且可测。
- 工作流回归：JSON 置信度触发升级、A/B calibration、wave 安全生成、writer authority Git gate、重复 key/output 与重叠 authority 拒绝。
- 新 Pi 进程端到端：高风险 reviewer 实际路由 `parent:medium`；低风险 economy scout 实际路由低成本模型并在低置信度时追加父模型 escalation。
- A/B 基准暂以纯路由决策为第一阶段；live A/B 必须固定任务、seed、预算并记录实际成本、延迟、质量和安全事件。
