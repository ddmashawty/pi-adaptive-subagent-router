# Oracle 策略发现

## 已知历史
- Writer 曾实现，`69888a0` 因 authority gate 可绕过而 fail closed；`075e23e` 实现 baseline verifier；`1d4b8cf` 最终移除 writer lane。
- 本阶段只处理 Oracle，不触碰 writer 历史代码。

## Oracle 已知契约
- 本地 pi-subagents `agents/oracle.md`：只读咨询角色，默认 `thinking: high`、`defaultContext: fork`，工具为 read/grep/find/ls/bash。
- 当前 adaptive `inferDuty()` 会把非 reviewer/scout 的 agent 当作 research，可能经济降级 Oracle。
- 当前 duty 类型只有 scout/reviewer/research。

## 已核实
- 当前主线不含测试文件；`backup/writer-authority-075e23e` 有 Node `node:test` 测试模式，可建立新的最小测试骨架。
- 当前分支已从干净 HEAD `920adda` 创建为 `feature/oracle-routing`。
- workflow 的 child `model` 是显式 `provider/id:thinking`，会覆盖 agent 默认模型/thinking，因此 Oracle 必须由 router 明确选出高质量 thinking，不能只依赖 `oracle.md` 的 `thinking: high`。
- `workflow.ts` 可在未显式 context 时为 Oracle 注入 `fork`，显式 fresh/fork 仍应优先。

## Oracle 策略决策
- Oracle 在 economy/balanced/strict 下都保留父模型；其职责是决策一致性，不作为经济型 research。
- Oracle thinking 优先提升至 `high`；父模型不支持 high 时保留父 thinking 并在 route reason 中说明。
- `agent: oracle` 或别名 `advisor` 自动推断为 oracle duty；显式 duty 仍传入 workflow。

## Oracle 最终验证
- 真实启动两次均成功；最终验收省略 duty/context，自动推断 oracle duty 并默认 fork。
- 父运行时 `gpt-5.6-sol:medium` 路由为同模型 `high`，未选择六个可用低成本候选。
- child session header 含 `parentSession` 且输出 `ORACLE_FINAL_OK`、confidence high、needsEscalation false。
- 独立 reviewer 的 calibration/fork 与旧角色回归测试缺口均已修复；12 项测试全绿。

## Worker 契约核实
- 不恢复旧路径级 authority；managed worktree 本身是完整写入边界。
- pi-subagents 文档明确：`runs.run(..., worktree:true)` 会从 clean HEAD 创建 worktree，捕获 patch 和 handoff manifest，清理已捕获的临时 worktree/branch；child `artifactPaths` 为字符串数组。
- `gate` 会规范化为 verified acceptance，且在 `worktree:true` 时运行于 child managed worktree。
- workflow 应只为 Worker 返回 `{ output, artifactPaths, runId }`，保持既有只读 lane 返回字符串，避免 API 回归。
- pi-subagents 公开契约足以实现单 managed-worktree Worker，不需要修改基础包。
- 真实验收已证明：临时父 checkout 无 `worker-output.txt` 且 Git clean；handoff manifest 的 patch.changed=true、1 file/1 insertion，cleanup complete，worktree/branch 均移除。
- host gate 在 worktree 内通过；handoff 与 patch 路径由父会话正常收到。
- 独立 reviewer 发现任意 `writer`/自定义可写 agent 可被默认归为 research 的绕过；已改为完整 builtin allowlist 和 agent-duty 强绑定。
- 负向独立 Pi 验收：`agent=writer,duty=research` 在 spawn 前返回 Unsupported adaptive agent；父 fixture checkout 无文件和 Git 状态变化。
- Worker 在父模型不支持 high 时保留父 thinking；README 用“prefers high”准确描述，并新增测试固定该行为。
