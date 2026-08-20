# Adaptive Subagent Router

A global Pi extension that dynamically routes subagent work without embedding any provider or model ID.

## Policy

- Reads the active parent provider/model/thinking level and the current runtime model catalogue for every parent turn.
- Requires a concise routing decision before delegation: whether a child adds value, complexity, lane count/roles, and writer isolation.
- Prefers an authenticated **same-provider** reasoning model whose published total cost is lower than the parent's and whose context window meets `minContextWindow`.
- Selects a thinking level strictly below the parent's current level, respecting the candidate model's `thinkingLevelMap`.
- If no routable lower-cost model exists, lowers the parent model's thinking level when possible; if it cannot be lowered, explicitly reuses the parent model at its current level.
- Never crosses providers automatically or silently infers a different provider/model.
- Limits lanes to 1 / 2 / 3 for simple / standard / complex work. Shared worktrees permit one writer; multiple writers require `worktree: true` on every writer.

Cost is a conservative routing proxy, not a universal intelligence measurement. The provider model catalogue does not publish a provider-neutral capability rank. The fallback to the parent model is intentional when lower-cost routing is unavailable.

## Use

The extension injects the policy into the parent prompt and blocks direct execution calls to `subagent`. The parent should call `adaptive_subagent_launch` after it has made a concise routing decision.

Required parameters:

- `decision`: concise non-chain-of-thought routing summary
- `complexity`: `simple`, `standard`, or `complex`
- `lanes`: narrow lane contracts with role `read` or `write`; use `wave` to serialize dependent stages
- lane `cwd`: optional; defaults to the parent working directory
- lane `output`: optional unique artifact path; defaults to `false` so parallel agents with role-default output names cannot collide

The tool builds the workflow and launches it through the official `pi-subagents` extension RPC. The resulting child model string is generated at runtime as `provider/model:thinking`.

## Reload

This extension is auto-discovered from `~/.pi/agent/extensions/adaptive-subagent-router/index.ts`. Run `/reload` in an existing Pi session after changing it, or start a new Pi session.
