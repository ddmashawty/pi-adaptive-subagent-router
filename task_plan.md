# Adaptive Agent 顺序实施计划

## 已完成：Oracle

Oracle 策略已在 commit `1f138ee` 完成；12 项测试和真实运行通过。

---

# 当前唯一计划：Worker 自适应策略

## 目标
仅实现一个安全、可验证的 adaptive Worker：单 writer、强制 pi-subagents managed worktree、必须提供 host gate，最终由父 agent 接收 patch/handoff；完成前不规划或实现 Delegate。

## 成功标准
- `agent: worker` 自动推断为 worker duty，其他 agent 不能冒充或绕过。
- Worker 始终保留父模型并优先 high thinking，默认 fork。
- 每个 adaptive workflow 最多一个 Worker；Worker 必须 `worktree:true` 且必须提供 gate。
- Worker 使用写入质量契约，不再收到 read-only 指令。
- 真实 Worker 在 managed worktree 修改测试文件，gate 通过，父 checkout 不被修改。
- 结果保留可定位的 patch/handoff artifact。
- 既有 Oracle/scout/research/reviewer 测试无回归。

## 阶段
- [complete] 1. 核对当前 pi-subagents worktree result/handoff 与 gate 契约
- [complete] 2. 编写 Worker 路由、校验、workflow 失败测试
- [complete] 3. 实现最小 Worker duty、单写者和 managed-worktree 策略
- [complete] 4. 运行单元测试、语法检查与既有回归
- [complete] 5. 真实启动 Worker，验证 worktree 写入、gate、父 checkout 不变和 patch/handoff
- [complete] 6. 独立 reviewer 审查，修复发现并提交原子 commit
- [pending] 7. Worker 完成后再创建 Delegate 独立计划

## 范围约束
- 不修改 `pi-subagents`，除非阶段 1 证明公开契约不足并先向用户说明。
- 不恢复旧的路径级 authority/baseline verifier。
- Worker 的 authority 是其整个 managed worktree；父 agent 决定是否应用 patch。
- 不支持共享 cwd Worker、非 Git Worker、多 Writer 或自动应用 patch。
- 不实现 Delegate。
- 不改变 provider 不跨越原则。

## 遇到的错误
| 错误 | 次数 | 处理 |
|---|---:|---|
| 项目规划文件不存在 | 1 | 在 adaptive 项目根目录重新创建 |
