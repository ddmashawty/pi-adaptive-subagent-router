# Adaptive Subagent Router

A global Pi extension that routes subagent work by **risk, quality policy, lane duty, evidence requirements, cost, context size, and writer isolation** without embedding any provider or model ID.

> **Current rollout:** globally enabled for **read-only lanes only**. Writer lanes fail closed until writer-start-baseline authority enforcement is implemented and verified. This does not affect normal Pi work that does not delegate.

## Routing policy

The router reads the active parent runtime and current model catalogue on every turn. It never crosses providers automatically.

### Quality policies

- `balanced` (default):
  - low-risk scout/research lanes may use a lower-cost same-provider reasoning model;
  - medium-risk economical routes choose the closest lower-cost candidate rather than the cheapest;
  - every reviewer lane and all high/critical lanes preserve the parent model and thinking level;
  - medium-risk writer lanes preserve the parent model and thinking level.
- `economy`: explicit cost-first behavior for every duty, including reviewers: lower-cost model → parent model with lower thinking → parent runtime fallback.
- `strict`: always preserves the parent model and current thinking level. Use for release, security, irreversible operations, or explicit quality gates.

Cost remains a conservative proxy, not a provider-neutral intelligence score.

### Child provider compatibility

Subagent child requests defensively omit optional `prompt_cache_key` and `prompt_cache_retention` fields. This avoids the observed provider/model compatibility failure before a child can produce output; the parent session's cache behavior is unchanged. Depending on the provider, child runs may use a default or uncached path and may receive fewer prompt-cache hits.

### Role, evidence, and escalation

Each lane declares `role` (`read|write`) and may declare `duty` (`scout|reviewer|worker|research`) plus a lane-specific `risk`.

- Every child receives a quality contract requiring confidence and `needsEscalation` reporting.
- Blockers must be backed by gate/command evidence or an exact reproducible code path; otherwise they must be labelled unverified.
- Critical reviewer lanes require a host `gate` command.
- `autoEscalate` defaults on for high/critical work. Reports containing low confidence or `needsEscalation: true` are rechecked using the parent runtime with a bounded turn budget while retaining repository verification tools.
- `calibrationSample: true` repeats the first **read-only** lane on the parent runtime for explicit A/B quality comparison.

### Isolation

- Limits lanes to 1 / 2 / 3 for simple / standard / complex work.
- Shared worktrees permit one writer.
- Every writer declares one or more relative file/directory `authority` prefixes.
- The router appends a Git-based host gate that rejects tracked or untracked changes outside those prefixes; a supplied lane gate is composed before this authority gate.
- Multiple writers require `worktree:true`; resolved authority prefixes are rejected when equal or nested, reducing merge-conflict risk.
- Lane keys and explicit output paths must be unique.
- `cwd` defaults to the parent working directory and `output` defaults to `false` to prevent role-default output collisions.

## Use

The extension blocks direct execution calls to `subagent`. Call `adaptive_subagent_launch` after stating a concise routing decision.

Top-level parameters:

- `decision`: concise summary of delegation value, risk/quality choice, lane count, evidence plan, and isolation
- `complexity`: `simple | standard | complex`
- `risk`: `low | medium | high | critical` (default `medium`)
- `qualityPolicy`: `economy | balanced | strict` (default `balanced`)
- `minContextWindow`: optional minimum child context window
- `autoEscalate`: optional override; defaults on for high/critical lanes
- `calibrationSample`: optional read-only parent-model A/B sample
- `lanes`: one to three narrow lane contracts

Lane parameters:

- required: `key`, `agent`, `task`, `role`
- optional for readers: `duty`, `risk`, `gate`, `wave` (1–99), `context`, `worktree`, `cwd`, `output`
- required for writers: non-empty `authority` file/directory prefixes

The tool returns a structured explanation for every lane: selected model/thinking, strategy, risk, duty, quality policy, eligible lower-cost count, and routing reasons.

## Verification

```bash
node --experimental-strip-types --test routing.test.ts workflow.test.ts validation.test.ts cacheCompatibility.test.ts benchmark.test.ts
node --experimental-strip-types --check index.ts routing.ts workflow.ts validation.ts benchmark.ts
node --experimental-strip-types benchmark.ts
pi --list-models
```

The benchmark command is an offline policy comparison only: it compares adaptive routing with a static parent-runtime baseline and reports published model-cost deltas. It does not measure child quality, actual token spend, or latency; those require a paired live A/B harness.

End-to-end checks should use a new Pi process so it loads the changed extension. Verify at least:

1. high-risk balanced reviewer + gate → parent runtime;
2. low-risk economy scout → lower-cost route;
3. low-confidence child + `autoEscalate:true` → parent-runtime escalation run.

## Reload

This extension is auto-discovered from `~/.pi/agent/extensions/adaptive-subagent-router/index.ts`. Run `/reload` in an existing Pi session after changing it, or start a new Pi session.
