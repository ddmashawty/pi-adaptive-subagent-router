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
