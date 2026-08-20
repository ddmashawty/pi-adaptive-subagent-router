# Oracle 自适应策略实施计划

## 目标
仅为 `oracle` 增加完整、可验证的 adaptive 路由支持。Oracle 完成并通过真实运行测试前，不规划或实现 Worker、Delegate。

## 成功标准
- `adaptive_subagent_launch` 可显式选择 `oracle` duty。
- balanced/strict 下 Oracle 保留父模型，不被当作 research 经济降级。
- Oracle 默认使用 fork 上下文，并保持高质量 thinking 策略。
- 现有 scout/research/reviewer 行为不回归。
- 单元测试、TypeScript 语法检查和真实 Oracle adaptive 启动均通过。

## 阶段
- [complete] 1. 核对当前源码、历史测试模式和 pi-subagents Oracle 契约
- [complete] 2. 编写 Oracle 路由失败测试
- [complete] 3. 实现最小 Oracle duty、校验和 workflow 默认值
- [complete] 4. 运行单元测试与静态检查
- [complete] 5. 通过 adaptive 工具真实启动 Oracle 并验证模型、thinking、context、结果
- [complete] 6. 独立 review，修复发现并提交原子 commit
- [complete] 7. Oracle 完成后再决定下一个 agent；不提前实施

## 范围约束
- 不修改 `pi-subagents`。
- 不恢复 writer/authority 代码。
- 不实现 Worker 或 Delegate。
- 不改变现有 provider 不跨越原则。
- 网页或外部内容仅写入 findings.md。

## 遇到的错误
| 错误 | 次数 | 处理 |
|---|---:|---|
| 项目规划文件不存在 | 1 | 在 adaptive 项目根目录重新创建 |
