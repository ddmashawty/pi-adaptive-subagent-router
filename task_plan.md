# Adaptive Router 当前唯一计划：Delegate 策略

## 已完成
- Oracle：`1f138ee`
- Worker：`34d78ae`
- 全局 subagent thinking ceiling：`eacce1b`

## 目标
为最后一个尚无专用策略的内置 agent `delegate` 增加 fail-closed adaptive 路由。Delegate 具有 bash/edit/write 权限，因此必须按写入 lane 隔离，而不能当作 research 或只读 lane。

## 成功标准
- `agent: delegate` 自动且只能映射到 `delegate` duty，其他 agent 不能冒充。
- Delegate 保留父模型和完全相同的父 thinking，默认 fork，绝不超过父 thinking。
- Worker 与 Delegate 合计最多一个写入 lane。
- Delegate 强制 `worktree:true`、非空 host gate，禁止 calibration。
- Delegate 收到 managed-worktree 执行契约，不收到 read-only 指令。
- Delegate 结果保留 `{ output, artifactPaths, runId }`；只读 lane API 不变。
- 真实 Delegate 在 managed worktree 写入并通过 gate，父 checkout 不变，handoff/cleanup 完整。
- Oracle、Worker 和既有只读路由无回归。

## 阶段
- [complete] 1. 核对 Delegate agent、工具与 child-safety 契约
- [complete] 2. 添加 routing/validation/workflow 失败测试
- [complete] 3. 实现最小 Delegate duty 与隔离策略
- [complete] 4. 运行完整单测和静态检查
- [complete] 5. 真实 Delegate managed-worktree smoke
- [complete] 6. 独立 reviewer 审查、修复所有 high blocker 并提交原子 commit

## Reviewer 后新增安全门槛
- resolved agent 必须由 pi-subagents preflight 证明为 bundled builtin；同名 user/project/package shadow fail closed。
- Delegate effective tools 必须保持显式、非 fanout 且不含工具扩展/MCP 扩张。
- 底层 schedule/resume/refine 等 execution-capable action 不得绕过 adaptive tool。

## 范围约束
- 不修改 pi-subagents。
- 不允许 Delegate 在共享 checkout 或非 Git cwd 写入。
- 不允许 Worker 与 Delegate 同时存在于一个 adaptive workflow。
- 不自动应用 patch。
- 不赋予 Delegate 嵌套 subagent 能力；遵循其内置工具 allowlist。
- 保持同 provider 与全局 thinking ceiling。
