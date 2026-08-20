# Adaptive Subagent Router

English | [中文](README-zh.md)

Adaptive Subagent Router is a global [Pi](https://github.com/badlogic/pi-mono) extension for routing subagent work by task risk, quality policy, lane duty, model cost, context requirements, and evidence gates.

It keeps the parent agent in control while adding a runtime policy layer that reads the active model catalogue, selects an appropriate route, validates delegation constraints, and records observed execution effects. It does not hard-code a provider or model ID and never crosses providers automatically.

## Developer preview

This extension is currently in developer preview. Routing policy and log formats may change as real usage provides more evidence. It supports read-only scout/reviewer/research/oracle lanes plus at most one `worker` running in a pi-subagents managed Git worktree. Shared-checkout and non-Git workers remain unsupported.

## Features

- Dynamic routing from the active parent runtime and model catalogue.
- Three quality policies: `balanced`, `economy`, and `strict`.
- Lower thinking-level fallback when no eligible lower-cost model exists.
- Parent-runtime protection for balanced reviewers and high/critical-risk work.
- Oracle routing that always preserves the parent model and thinking level, and defaults to fork context.
- Single-worker routing that requires managed worktree isolation and a host-run gate, while preserving patch/handoff artifacts.
- Evidence contracts requiring confidence and `needsEscalation` reporting.
- Optional parent-runtime escalation for low-confidence results.
- Optional read-only calibration against the parent runtime.
- Minimum context-window requirements for selected routes.
- Lane key/output uniqueness validation.
- Child-only prompt-cache compatibility protection.
- Privacy-safe JSONL usage logging with launch and completion records.

## Routing policies

### `balanced` (default)

- Low-risk `scout` and `research` lanes may use a lower-cost same-provider reasoning model.
- Reviewers preserve the parent model and current thinking level.
- No subagent may use a thinking level above the parent.
- Oracle preserves the parent model and thinking level, and defaults to fork context.
- Worker preserves the parent model and thinking level, defaults to fork context, and requires `worktree:true` plus a gate.
- High- and critical-risk lanes preserve the parent runtime.
- Medium-risk economical routing prefers a closer lower-cost candidate instead of blindly selecting the cheapest one.

### `economy`

Explicit cost-first routing. Lower-cost same-provider models may be used for economical duties, including reviewers, but their thinking level remains below the parent. Oracle and worker are exceptions to model downgrading: both preserve the parent model and exact parent thinking level. If no eligible candidate exists for an economical duty, the router lowers the parent thinking level and finally falls back to the parent runtime.

### `strict`

Preserves the parent model and current thinking level. No role, including Oracle or worker, may raise thinking above the parent. Use strict for release, security, irreversible, or explicitly quality-critical work.

Published model cost is only a conservative proxy; it is not a provider-neutral measure of intelligence, quality, or total spend.

## Dependencies

This extension delegates execution to **pi-subagents**, Pi's subagent runtime. It spawns each workflow through pi-subagents' `subagents:rpc:v1` event bridge, so pi-subagents must be installed and loaded first.

Install it as a Pi package:

```sh
pi install npm:pi-subagents
```

This adds `npm:pi-subagents` to the `packages` array in `~/.pi/agent/settings.json`. If pi-subagents is not loaded, `adaptive_subagent_launch` times out after five seconds with "Timed out waiting for pi-subagents RPC. Ensure the pi-subagents package is loaded.".

## Installation

The extension is designed for Pi global auto-discovery:

```text
~/.pi/agent/extensions/adaptive-subagent-router/index.ts
```

Runtime source files:

```text
cacheCompatibility.ts
index.ts
routing.ts
usageLog.ts
validation.ts
workflow.ts
```

After changing the extension, run `/reload` or start a new Pi session.

## Run

Clone the repository, then copy or link the extension directory into the global Pi extensions directory:

```sh
git clone https://github.com/ddmashawty/pi-adaptive-subagent-router.git
mkdir -p ~/.pi/agent/extensions
ln -sfn "$PWD/pi-adaptive-subagent-router" ~/.pi/agent/extensions/adaptive-subagent-router
```

Alternatively, copy the six runtime source files into the target directory.

## Usage

The extension registers the `adaptive_subagent_launch` tool. Before delegating, the parent agent should state:

- why delegation is useful;
- task complexity and risk;
- quality policy;
- lane duties;
- evidence and gate requirements.

A conceptual call looks like this:

```json
{
  "decision": "Low-risk read-only reconnaissance can use balanced routing; require file evidence and confidence.",
  "complexity": "standard",
  "risk": "low",
  "qualityPolicy": "balanced",
  "autoEscalate": true,
  "lanes": [
    {
      "key": "recon",
      "agent": "scout",
      "duty": "scout",
      "task": "Inspect the target files and report concrete findings with file evidence.",
      "context": "fresh",
      "output": false
    }
  ]
}
```

The extension converts each lane into a `pi-subagents` workflow with an explicit model and thinking level. Agent names are fail-closed to `scout`, `reviewer`, `researcher`/`research`, `oracle`/`advisor`, and `worker` plus its builtin implementation aliases; custom agents are rejected because their effective write capabilities are not proven by a name. Direct execution calls to the underlying `subagent` tool are blocked so routing and evidence checks cannot be bypassed.

## Usage logging

Each successful adaptive workflow launch appends a `launch` record. A `completion` record is appended after `subagent:async-complete` is received.

Default path:

```text
~/.pi/agent/adaptive-subagent-router/usage.jsonl
```

When `PI_CODING_AGENT_DIR` is set:

```text
$PI_CODING_AGENT_DIR/adaptive-subagent-router/usage.jsonl
```

Records include the parent and selected routes, complexity, policy, escalation/calibration settings, completion state, duration, tokens, and observed USD cost when available. Task text is not logged. Writes are serialized, directories default to `0700`, files default to `0600`, and each append is followed by `sync()`. Recent unmatched launches are recovered after an extension reload.

Logging failures are reported to stderr but never block routing.

## Limitations and safety

### Read-only lanes and isolated worker

Scout, reviewer, research, and oracle lanes remain read-only. A worker lane is allowed only when all of these fail-closed conditions hold:

- agent names and duties match the built-in allowlist; unsupported/custom agents fail before spawn;
- at most one worker exists in the adaptive workflow;
- the worker uses `worktree:true` in a clean Git repository;
- the caller supplies a non-empty host-run gate;
- calibration sampling is disabled for that workflow;
- the worker owns the whole managed worktree, never a path subset of the parent checkout;
- pi-subagents captures the patch and handoff manifest, removes the temporary worktree/branch after successful capture, and leaves patch application to the parent.

Shared-checkout writers, non-Git writers, multiple workers, path-level authority, and automatic patch application are intentionally unsupported. Managed worktree isolation is an engineering boundary, not an operating-system sandbox against external side effects.

### Evaluation scope

A small read-only factual-scout pilot observed lower cost and latency, but it is not a general quality guarantee. Continue observing task type, risk, parent/final route, tokens, cost, latency, quality judgments, escalation results, and file-change events during real use.

Pi extensions run with host-process permissions. Install and modify this extension only from a trusted checkout.

## Development

The extension uses Pi's TypeScript loader and Node's strip-types support:

```sh
for f in index.ts routing.ts workflow.ts validation.ts cacheCompatibility.ts usageLog.ts; do
  node --experimental-strip-types --check "$f"
done

pi --list-models
```

Tests are repository-only development files and are not runtime entry points. Operational observations belong in the JSONL usage log.

## License

No license has been declared yet.
