# Adaptive Subagent Router

A global [Pi](https://github.com/badlogic/pi-mono) extension that routes subagent work according to task risk, quality policy, lane duty, model cost, context requirements, evidence gates, and writer isolation.

> The current rollout is **read-only**. Writer lanes fail closed until the authority gate is upgraded to use a writer-start baseline and to account for ignored untracked files.

## Why

Subagent delegation often uses one static model for every task. That is simple, but it can waste cost and latency on low-risk reconnaissance while also making it easy to under-protect reviews or high-impact work.

This extension keeps the parent agent in control while adding a runtime policy layer that:

- reads the active parent model and current model catalogue on every turn;
- prefers lower-cost models only when the task policy allows it;
- preserves reviewer quality and high-risk capability by default;
- prevents direct unvalidated `subagent` execution;
- requires explicit risk, duty, evidence, and isolation information;
- records routing decisions and observed execution effects for later optimization.

The extension does not hard-code a provider or model ID and never crosses providers automatically.

## Features

- **Dynamic routing** — selects a route from the active runtime and available model catalogue.
- **Risk-aware quality policies** — `balanced`, `economy`, and `strict`.
- **Thinking-level fallback** — if no cheaper same-provider model is available, lowers the parent thinking level before reusing the parent runtime.
- **Reviewer protection** — balanced non-economy reviewers preserve the parent model and thinking level.
- **Evidence contract** — child lanes report confidence and `needsEscalation`; blockers require command/gate evidence or a reproducible code path.
- **Escalation** — low-confidence child reports can be independently rechecked by the parent runtime.
- **Calibration** — optionally repeats the first read-only lane on the parent runtime for a live comparison.
- **Context selection** — enforces a minimum context window on the selected route.
- **Writer safety checks** — validates authority prefixes, duplicate keys/outputs, writer overlap, and worktree requirements. Writer execution is currently disabled fail-closed.
- **Provider compatibility** — removes optional prompt-cache fields from child-only provider requests while leaving parent requests unchanged.
- **Usage logging** — records privacy-safe launch and completion metadata in durable JSONL.

## Routing strategy

### `balanced` (default)

- Low-risk `scout`/`research` lanes may use a lower-cost same-provider reasoning model.
- Reviewers preserve the parent model and thinking level.
- High and critical risk lanes preserve the parent runtime.
- Medium-risk writers preserve the parent runtime, although all writers are currently rejected by the rollout guard.
- Medium-risk economical routes prefer a closer lower-cost candidate rather than blindly choosing the cheapest candidate.

### `economy`

Cost-first routing is explicit. Lower-cost same-provider models are preferred for every duty, including reviewers. If no eligible cheaper model exists, the router lowers the parent thinking level and finally falls back to the parent runtime.

### `strict`

Always preserves the parent model and current thinking level. Use for release, security, irreversible, or explicitly quality-critical work.

Cost is only a conservative published-cost proxy. It is not a provider-neutral measure of intelligence or quality.

## Installation

The extension is designed for global Pi auto-discovery:

```text
~/.pi/agent/extensions/adaptive-subagent-router/index.ts
```

Its runtime source files are:

```text
cacheCompatibility.ts
index.ts
routing.ts
usageLog.ts
validation.ts
workflow.ts
```

Start a new Pi session or run `/reload` after changing the extension.

## Use

The extension adds the `adaptive_subagent_launch` tool. Before delegation, the parent agent should state a concise routing decision covering:

- why delegation is useful;
- complexity and risk;
- quality policy;
- lane roles and duties;
- evidence/gate requirements;
- writer isolation and authority boundaries.

A conceptual call looks like this:

```json
{
  "decision": "Low-risk read-only reconnaissance can use balanced routing; no writer lanes; report evidence and confidence.",
  "complexity": "standard",
  "risk": "low",
  "qualityPolicy": "balanced",
  "autoEscalate": true,
  "lanes": [
    {
      "key": "recon",
      "agent": "scout",
      "role": "read",
      "duty": "scout",
      "task": "Inspect the target files and report concrete findings with file evidence.",
      "context": "fresh",
      "output": false
    }
  ]
}
```

The extension converts each lane into a `pi-subagents` workflow with an explicit model/thinking route. Direct execution calls to the underlying `subagent` tool are blocked so that routing and isolation checks cannot be skipped.

## Usage logging

Each successful adaptive launch appends a `launch` record, and the process-local `subagent:async-complete` event appends a `completion` record after the run finishes.

Default path:

```text
~/.pi/agent/adaptive-subagent-router/usage.jsonl
```

If `PI_CODING_AGENT_DIR` is set, the log is written under that directory instead:

```text
$PI_CODING_AGENT_DIR/adaptive-subagent-router/usage.jsonl
```

The log contains routing metadata and observed effects such as:

- parent and selected routes;
- complexity, quality policy, escalation/calibration settings;
- completion state and success/failure outcome;
- duration;
- input/output/total tokens when available;
- observed USD cost when available.

Task text is intentionally not logged. Writes are serialized, directory permissions default to `0700`, log permissions default to `0600`, and each append is followed by `sync()` for stronger crash durability. After an extension reload, the logger recovers recent unmatched launches from a bounded log tail and correlates later completions.

Logging failures are reported to stderr but do not block routing.

## Safety and current limitations

- **Writer lanes are disabled.** The previous authority gate compared changes against the current `HEAD`, so a child could hide an out-of-authority change by committing it before the final check. It also did not include ignored untracked files. The router therefore rejects every `role: "write"` lane until a baseline-aware implementation is independently verified.
- `balanced` savings were observed only for a small low-risk read-only factual-scout pilot. They should be treated as an initial operational signal, not a general quality guarantee.
- Published model cost is a routing proxy, not actual intelligence, quality, or total spend.
- Pi extensions are trusted code with full host-process permissions. Install and modify this extension only from a trusted checkout.

## Development checks

The extension uses Pi's TypeScript loader and Node's strip-types support. Useful checks are:

```bash
node --experimental-strip-types --check index.ts routing.ts workflow.ts validation.ts cacheCompatibility.ts usageLog.ts
pi --list-models
```

The extension intentionally keeps runtime source separate from experimental benchmark and test artifacts. Operational observations belong in the JSONL usage log rather than in the installed extension directory.

## License

No license has been declared yet.
