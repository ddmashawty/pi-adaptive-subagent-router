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
