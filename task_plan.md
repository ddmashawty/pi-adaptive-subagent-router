# Adaptive Router 当前计划：全局 Thinking 上限

## 背景
Oracle 已在 `1f138ee` 完成，Worker 已在 `34d78ae` 完成。当前只处理用户确认的新约束，不规划 Delegate。

## 目标
保留现有模型选择策略，但任何 subagent 的 thinking 不得高于父模型。Oracle 与 Worker 继续保留父模型，并改为严格继承父 thinking，不再自动提升到 `high`。

## 成功标准
- Oracle/Worker 在 economy、balanced、strict 下均使用父模型和父 thinking。
- scout/reviewer/research 的经济路由仍可降低模型或 thinking，但绝不超过父 thinking。
- 对所有 duty 和 policy 有统一 thinking ceiling 回归测试。
- 系统提示、英中 README 与行为一致。
- 单测、语法检查、真实 Pi smoke、独立 review 全部通过。

## 阶段
- [complete] 1. 添加 thinking ceiling 失败测试
- [complete] 2. 实现最小路由修改并同步文档
- [complete] 3. 运行完整单测与静态检查
- [complete] 4. 真实运行 Oracle/Worker 验证父 thinking 不被提升
- [complete] 5. 独立 reviewer 审查并提交原子 commit

## 遇到的错误
- 首次双 lane smoke 使用 `complexity=simple`，被 lane limit 在 spawn 前拒绝；父 checkout 保持 clean。改为 `standard` 后通过。

## 范围约束
- 不改变同 provider、成本和风险路由策略。
- 不修改 pi-subagents。
- 不实现 Delegate 或其他新 agent。
- 不允许任何 subagent thinking 高于父 thinking。
