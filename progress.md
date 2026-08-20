# 进度

## 2026-06-15
- 已确认需求：子 agent 的数量、模型和思考强度应每次按任务动态路由；不得绑定某个厂商或具体模型。
- 已完成设计选择：全局 extension + 动态提示/候选摘要 + 启动校验，而非静态 `subagents.defaultModel` 或 agent override。
- 已实现 `index.ts`：每回合从运行时模型目录生成同 provider、低成本候选摘要；直接 subagent 执行调用被阻止；`adaptive_subagent_launch` 通过 pi-subagents RPC 生成并异步启动带显式模型和思考后缀的 workflow。
- 已新增 README，说明运行时策略、成本代理的限制和使用方法。
- `pi --list-models` auto-discovery smoke test 已成功：extension 可被 jiti 加载，stderr 为空。
- 静态检查已确认 extension 源码不含 OpenAI、DeepSeek 或具体模型 ID，且包含运行时模型目录、pi-subagents RPC、路由工具与严格低于父级的思考检查。
- `npx tsc` 未执行类型检查：环境没有 TypeScript 编译器，npx 解析到同名占位包；已记录为环境限制。
- 静态扫描第一次失败：`sol` 子串匹配到了普通词（如 `resolve` / `isolation`），属于测试正则过宽，不是代码包含模型 ID。将以仅扫描 `index.ts` 和单词边界重跑。
- 精确静态检查和 auto-discovery smoke test 均已通过。
- 在 `~/lol-live` 首次真实并行 scout 测试发现两个 scout 继承同一 `context.md` 输出，pi-subagents 预检拒绝启动。已修复：lane 支持 `cwd/output`，默认继承父 cwd 且 `output:false`，避免默认产物冲突；新 Pi 进程加载验证通过。

## 2026-08-19
- 用户要求：无成本更低模型时，不应直接失败，应先降低父模型思考强度，无法降档时复用同一模型。
- 已确定实现顺序：低成本同 provider → 父模型低思考档 → 父模型当前思考档。
- 已完成：修改路由策略、system prompt/README、回归测试和 Pi 运行验证。
- 回归脚本第一次对“候选模型所有档位禁用”的预期写错：`off` 是统一可用的关闭思考档，因此该候选仍可合法以 `off` 路由；将测试改为接受该低成本降档结果。
- 已完成 `index.ts` 与 README 更新：低成本候选优先，其次父模型降思考，最后同模型同思考兜底；`minContextWindow` 只约束最终选中的模型。
- 验证通过：strip-types 语法检查、mock 路由回归、mock Pi RPC 端到端、Pi auto-discovery 和显式加载 smoke test。

## 2026-08-19 风险感知路由升级

- [x] 为全局 extension 初始化 Git 仓库并提交原始基线，保证可回滚。
- [x] 新增 `risk`、lane risk override、`duty` 与 `qualityPolicy=economy|balanced|strict`。
- [x] balanced 默认策略落地：低风险侦察可降级；中风险 reviewer/writer、高/关键风险保留父模型当前思考级别。
- [x] 每 lane 独立路由并返回结构化 reason、strategy、eligibleLowerCost、risk/duty/policy。
- [x] critical reviewer 强制 gate；所有 child 注入 confidence/needsEscalation 与 blocker 证据契约。
- [x] 自动 escalation：低置信度/needsEscalation 报告由父运行时复核；新增 turn budget。可选 calibrationSample 对首个只读 lane 运行父模型 A/B 对照。
- [x] 输出/隔离加固：唯一 lane key/output、writer 必填相对 authority、多 writer worktree、authority 重叠拒绝、自动 Git 越界 gate。
- [x] 抽取 `routing.ts`、`workflow.ts`、`validation.ts`，新增 15 项 Node strip-types 回归。
- [x] 初次端到端：高风险 balanced reviewer 实际选择父 `gpt-5.6-sol:medium`；低风险 economy scout 实际选择 `gpt-5.6-luna:minimal`。
- [x] 自动升级端到端：低置信度 scout 后追加父模型 reviewer，workflow 共 2 个 child run。
- [!] 独立同级 reviewer 首轮发现 4 项 major：JSON 引号触发遗漏、wave 标识符注入、escalation 工具能力表述、writer authority 未实际 gate；逐项修复并补测试。
- [!] 一次带 gate 的同父模型 reviewer 因 `prompt_cache_retention` provider 兼容错误无输出；不带 gate 重试成功，记录为外部残余风险。
- [x] 最终验证：15 项测试、4 个源文件 strip-types 语法检查、Pi auto-discovery `--list-models` 全通过。

## 2026-08-20 provider/cache 兼容性调查

- [x] 从 `/tmp/pi-subagents-uid-1000/artifacts/643ff2ba-8c76-43e6-97d0-2a38c39aaf48_reviewer_0_meta.json` 确认失败边界：父模型 `openai-codex/gpt-5.6-sol:medium`，首次请求即失败，`toolCount=0`、usage 全 0，错误为 `Codex error: prompt_cache_retention is not supported on this model`。
- [x] 对比 pi-subagents 源码确认 `gate` 先转为 explicit verified acceptance，并把 acceptance prompt 追加到 child task；验证命令尚未执行时 child 已失败。
- [x] 对比当前 `@earendil-works/pi-ai`：`openai-codex-responses` 请求构造不包含 `prompt_cache_retention`，而通用 `openai-responses` 会按 cache retention 构造该字段；实际 child provider/API 仍需边界诊断确认。
- [x] 记录 gated 与 non-gated child 的 provider payload 元数据并形成单一根因假设：当前 Codex child 的可见 payload 只有 `prompt_cache_key`，旧 `prompt_cache_retention` 错误归类为 provider/cache 兼容风险，不能归因于 gate shell。
- [x] 新增 child-only prompt-cache payload 防护，移除 `prompt_cache_key`/`prompt_cache_retention`，保留父会话缓存行为。
- [x] 新增纯函数回归测试，覆盖非原地修改、父 payload 隔离、无关 payload 和非对象 payload。
- [x] 历史新 Pi 进程验证防护后的 Sol parent + gated reviewer 可完成模型请求；合成 acceptance 报告不完整导致 acceptance reject，已与 provider 请求成功区分记录。
- [x] 最终抽取模块经真实 Pi Luna reviewer + gated acceptance 验证；host gate 的 17 项测试、语法检查和 `pi --list-models` 均通过，acceptance status/evidence 为 `verified`。
- [x] 移除不适用的裸 Node `index.test.ts`：扩展的 `typebox` 依赖由 Pi 运行时解析，直接从扩展目录导入会产生环境性 `ERR_MODULE_NOT_FOUND`；hook 行为由纯函数回归测试和真实 Pi 集成 gate 覆盖。

## 2026-08-20 review 优先与 A/B 基准

- [x] 用户确认 review 任务优先保证模型智慧程度；balanced reviewer 将统一保留父模型与当前思考级别，economy 保留为显式成本优先例外。
- [x] 补充 low/medium/high/critical reviewer 路由回归与离线 adaptive-vs-static 基准。
- [x] 运行 20 项全量测试、源文件 strip-types 检查、benchmark CLI 和 Pi 加载 smoke test。
- [x] 只读 reviewer 复核：无 blocker/major；修正 system prompt 文案遗漏和 reviewer 风险覆盖缺口；reviewer 无 shell 权限，最终 gate 由父会话执行。
- [x] 新 Pi 进程 live route smoke：balanced low-risk reviewer 保留父 `max`，显式 economy reviewer 降为同模型 `minimal`；仅验证 route，不推断质量/实际成本。
- [!] 一次固定 JSON live smoke 与 acceptance-report 契约冲突并 detached；已记录为后续 live A/B harness 的输出契约风险。
- [x] 首轮完整路径 live A/B：review balanced/strict 各 3 个 reviewer tasks，scout balanced/strict 各 3 个 scout tasks；记录 route、child token/cost、workflow/child latency、artifact completion 和 rubric 质量。
- [x] 首轮结果：scout balanced 路由 `max→medium`，相对 strict token -20.16%、cost -30.85%、workflow wall -46.83%，两边质量 rubric 均 3/3；review 两边均保留 `max`，质量 rubric 均 3/3，但 balanced isolation 发现 strict 漏掉的 HEAD/commit gate bypass。
- [!] live review 暴露 writer authority 残余 blocker：当前 HEAD 基线与 ignored untracked 文件可能绕过 gate；详见 `live-ab-report.md`，不在本轮 read-only A/B 中修复。
