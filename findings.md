# Delegate 策略发现

## 已核实契约
- 内置 `delegate` 是轻量通用执行 agent，继承项目上下文，工具 allowlist 为 `read, grep, find, ls, bash, edit, write, contact_supervisor`。
- Delegate 有实际写工具，不能归入 read-only research；仅靠提示词不是权限边界。
- Delegate 的内置工具不含 `subagent`，因此不会获得 child-safe 嵌套 fanout；无需修改 pi-subagents。
- Delegate frontmatter 未声明默认 fork，但描述强调接近父会话；adaptive 策略应显式默认 fork，同时允许调用方显式 fresh。
- pi-subagents 的 managed worktree、gate、artifactPaths 与 cleanup 契约已由 Worker 阶段验证，可复用于 Delegate。

## 初始策略决定
- Delegate 与 Worker 均视为写入 lane，两者合计最多一个。
- Delegate 始终保留父模型与父 thinking，满足全局 ceiling。
- 强制 worktree、gate、禁 calibration，并返回 handoff artifact 引用。

## 真实验收
- 新 Pi 父运行时 `openai-codex/gpt-5.6-sol:low`，`qualityPolicy=economy`，省略 duty/context 后自动得到 delegate duty、默认 fork，并保留同模型 `low`。
- Delegate 在 managed worktree 创建 `delegate-output.txt`，host gate passed；handoff patch.changed=true（1 file/1 insertion）。
- cleanup complete，临时 worktree/branch 均移除；父 fixture 不存在该文件且 Git clean。
- 内置 Delegate 定义已静态确认不含 `subagent` 工具；真实 session 也未发生嵌套 spawn。

## Reviewer Blocker 根因
- pi-subagents 的 builtin 优先级最低，同名 user/project agent 会覆盖 `delegate`；仅按名称 allowlist 无法证明最终解析来源或有效工具。
- pi-subagents 公开 preflight contract 可返回 resolved agent `source`、shadowed candidates、effectiveAllowlist 和 fanoutAuthorized，适合在 RPC spawn 前 fail closed。
- 当前 `tool_call` hook 对所有 `action` 放行；但 `schedule.create/resume/run/run-due`、`resume` 和 `refine` 具有启动或恢复执行的效果，并非纯管理读取。
- 根因不是 Delegate route 本身，而是 adaptive 层只验证声明名称、且把“action”误等同于“非执行管理”。

## Blocker 修复验证
- 所有 lane 在 RPC spawn 前调用 pi-subagents 公开 launch-contract preflight，并要求 resolved source 为 `builtin`；Delegate 额外要求显式 allowlist、无 fanout、无 MCP/工具扩展、无 allowlist 扩张。
- tool hook 现在阻止普通执行、任何携带 workflowScript 的 action，以及 `schedule.create/resume/run/run-due`、`resume`、`refine`；只读状态与非执行控制仍可用。
- 同名 project `.pi/agents/delegate.md`（tools 含 subagent/write/bash）真实负向测试在 spawn 前返回 resolved source project，未创建目标文件，父 fixture clean。
- `schedule.create` 真实负向测试被 tool hook 阻止，无 schedule artifact、无 BYPASS 文件。
- 修复后 builtin Delegate 正向复验仍为父模型 `low`，gate/handoff 正常且父 checkout clean。
- 第二次 reviewer 发现 `configuredExtensions` 未纳入 Delegate 工具契约；已先补失败测试，再要求该数组为空，覆盖 agent `extensions`/`subagentOnlyExtensions`。
- 实测从 `/tmp` symlink 加载会因相对 preflight 路径失败；README 已移除 symlink 安装建议，明确要求直接 clone/copy 到 Pi 标准全局扩展目录。
- 第三次 reviewer 发现 pi-subagents 会 trim action 而 hook 未 trim 的旁路；已按底层相同规范化顺序补空白变体测试并修复。
- 真实 padded `" schedule.create "` 负向验收被阻止，无 schedule artifact 或文件副作用。
- 第四次 reviewer 发现 direct `steer` 默认 recovery 可 pause-and-resume replacement；现只允许显式 `steeringRecovery:false`。
- execution action 策略已从易漏项 blacklist 改为完整非执行 allowlist；`project.open` 和未知未来 action 也默认阻止。
- 最终 acceptance reviewer 对照完整 pi-subagents action 表确认 allowlist 中无明确启动/恢复模型的 action；preflight/tool 契约闭合，无 blocker，needsEscalation false。
