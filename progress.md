# Oracle 策略进度

- 已选择 Oracle 作为第一个且唯一的本阶段功能。
- 理由：只读、风险最低、最接近当前 adaptive 安全模型。
- 已恢复 Git 历史，确认 writer 并非未实现，而是被主动 fail closed 后移除。
- 已创建分支 `feature/oracle-routing`。
- 已核对历史 Node test 模式和当前 route/workflow 数据流。
- 当时确定 Oracle 策略：始终保留父模型并优先 high thinking、默认 fork；该 thinking 策略后续被全局 ceiling 取代。
- Oracle 路由/workflow 预期失败测试已建立：7 项中 5 项按预期失败，证明当前会经济降级 Oracle 且未默认 fork。
- 尝试直接导入 `index.ts` 测试 duty 推断失败：独立 Node 环境无法解析 Pi loader 提供的 `typebox`。不重复该方式；将纯 `inferDuty` 提取到 `routing.ts` 后测试。
- 已实现 Oracle duty、oracle/advisor 自动推断、父模型保护、当时的 high thinking 优先和默认 fork。
- 新增 `routing.test.ts`、`workflow.test.ts`；8 项测试全部通过。
- 六个 runtime TypeScript 文件均通过 Node strip-types 语法检查。
- 独立新 Pi 进程真实验收通过：route 为 `openai-codex/gpt-5.6-sol:high [same-model]`，Oracle 返回 `ORACLE_ADAPTIVE_OK`。
- usage log：run `03cfbb7b-216d-4b29-8557-300e6fda118d` complete，4,024 tokens，约 `$0.031395`。
- child session header 含 `parentSession`，并继承父消息，确认默认 fork；artifact 确认 model high、无文件修改。
- README 英中已同步 Oracle 策略；当前 9 项测试、语法检查和 `git diff --check` 全绿。
- 独立 reviewer 发现两项 medium：Oracle calibration 默认 fresh；既有角色回归测试不足。
- 已先增加失败测试复现 calibration 问题（`fresh !== fork`），再修复为 Oracle calibration 默认 fork。
- 已补 balanced reviewer/high-risk 保护与 economy/scout/research 经济路由回归测试。
- 修复后 12 项测试、六文件语法检查和 `git diff --check` 全绿。
- 最终独立 Pi 验收省略 duty/context，自动得到 oracle duty、fork 和 `gpt-5.6-sol:high`；返回 `ORACLE_FINAL_OK`。
- 最终 run `7e3889aa-e22d-45e4-8a0b-a640f61f214a` complete，2,330 tokens，约 `$0.022343`；child session header 含 parentSession。
- Oracle 功能已提交：`1f138ee feat: add adaptive oracle routing`。

## Worker 阶段
- 已在 Oracle 完成后选择 Worker 作为第二个且唯一的当前功能。
- 策略边界：单 Worker、强制 managed worktree、必须 gate、整个 worktree authority、父 agent 应用 patch。
- 已核实 pi-subagents 的 worktree、gate 和 artifactPaths 公开契约，无需修改基础包。
- 已先建立失败测试，再实现 Worker alias/duty、防绕过、父模型+high、默认 fork、单 worker、强制 worktree+gate、写入 contract 和 handoff 返回。
- 21 项单元/回归测试、六文件语法检查和 `git diff --check` 全绿。
- Worker 真实验收通过：自动 worker duty、默认 fork、父模型 high、host gate passed。
- 父 fixture checkout 保持 clean 且没有 Worker 创建的文件。
- handoff manifest 记录 changed patch（1 file/1 insertion）和 complete cleanup；worktree/branch 已移除。
- run `2cf35c1a-2418-401c-8021-8882324c793f` complete，10,176 tokens，约 `$0.076252`。
- 独立 reviewer 找到 high blocker：未知/自定义 writer 名称可伪装为 research 绕过写入校验。
- 已先补失败测试，再实施完整 agent allowlist 与 agent-duty 强绑定；新增 Worker high unsupported 回归测试。
- 24 项测试通过；负向独立 Pi 实跑确认 `agent=writer` 在 spawn 前拒绝，父 fixture checkout 不变。
- Fresh 独立 reviewer 复审确认 allowlist、duty 绑定、worktree/gate、high fallback 与文档一致，无 blocker，confidence high，needsEscalation false。
- Worker 已提交：`34d78ae feat: add isolated worker routing`。

## 全局 Thinking Ceiling 阶段
- 用户确认：保留经济模型路由，但所有 subagent thinking 不得超过父 thinking。
- 已先新增统一 ceiling 测试并复现 Oracle/economy 从 medium 提升 high 的失败。
- 已移除 Oracle/Worker 自动提升 high；两者现在保留父模型和完全相同的父 thinking。
- 已更新 Oracle/Worker policy 测试、低父 thinking 测试、系统提示和中英文 README。
- 初始 25 项单元/回归测试通过。
- 25 项测试、六文件语法检查和 `git diff --check` 通过。
- 首次双 lane smoke 因 `simple` lane limit 在 spawn 前拒绝；父 fixture 保持 clean，改为 `standard` 重跑。
- 新 Pi 父运行时 `gpt-5.6-sol:low` 下，Oracle 与 Worker 均路由为同模型 `low`；Worker gate、handoff patch 和 cleanup 通过，父 checkout clean。
- run `9aff070e-0e47-4750-b428-e7453e26c984` complete，12,724 tokens，约 `$0.085004`。
- 独立 reviewer 确认所有返回路径满足 ceiling，无 blocker、confidence high、needsEscalation false。
- 已修复 reviewer 的 low 测试缺口：新增经济候选与 same-model fallback 的精确 thinking/strategy 断言；最终 26 项测试通过。
- 当前阶段：最终检查并提交原子 commit。
