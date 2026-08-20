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

## 最终验证
- 真实启动两次均成功；最终验收省略 duty/context，自动推断 oracle duty 并默认 fork。
- 父运行时 `gpt-5.6-sol:medium` 路由为同模型 `high`，未选择六个可用低成本候选。
- child session header 含 `parentSession` 且输出 `ORACLE_FINAL_OK`、confidence high、needsEscalation false。
- 独立 reviewer 的 calibration/fork 与旧角色回归测试缺口均已修复；12 项测试全绿。
