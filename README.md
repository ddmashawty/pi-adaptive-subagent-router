# Adaptive Subagent Router

English | [中文](README-zh.md)

Adaptive Subagent Router is a global [Pi](https://github.com/badlogic/pi-mono) extension for routing subagent work by task risk, quality policy, lane duty, model cost, context requirements, and evidence gates.

It keeps the parent agent in control while adding a runtime policy layer that reads the active model catalogue, selects an appropriate route, validates delegation constraints, and records observed execution effects. It does not hard-code a provider or model ID and never crosses providers automatically.

## Developer preview

This extension is currently in developer preview. Routing policy and log formats may change as real usage provides more evidence. It supports read-only scout/reviewer/research/oracle lanes plus at most one writing lane (`worker` or `delegate`) running in a pi-subagents managed Git worktree. Shared-checkout and non-Git writers remain unsupported.

## Features

- Dynamic routing from the active parent runtime and model catalogue.
- Three quality policies: `balanced`, `economy`, and `strict`.
- Lower thinking-level fallback when no eligible lower-cost model exists.
- Parent-runtime protection for balanced reviewers and high/critical-risk work.
- Oracle routing that always preserves the parent model and thinking level, and defaults to fork context.
- Single writing-lane routing for Worker or Delegate that requires managed worktree isolation and a host-run gate, while preserving patch/handoff artifacts.
- Evidence contracts requiring confidence and `needsEscalation` reporting.
- Optional parent-runtime escalation for low-confidence results.
- Optional read-only calibration against the parent runtime.
- Minimum context-window requirements for selected routes.
- Lane key/output uniqueness validation.
- Pre-spawn pi-subagents launch-contract checks that reject non-builtin shadow agents and widened Delegate tools.
- A fail-closed non-executing management-action allowlist; direct/scheduled/resumed/refinement/project-pane execution is blocked, and steer requires `steeringRecovery:false`.
- Child-only prompt-cache compatibility protection.
- Privacy-safe JSONL usage logging with launch and completion records.

## Routing policies

### `balanced` (default)

- Low-risk `scout` and `research` lanes may use a lower-cost same-provider reasoning model.
- Reviewers preserve the parent model and current thinking level.
- No subagent may use a thinking level above the parent.
- Oracle preserves the parent model and thinking level, and defaults to fork context.
- Worker and Delegate preserve the parent model and thinking level, default to fork context, and require the single `worktree:true` writing slot plus a gate.
- High- and critical-risk lanes preserve the parent runtime.
- Medium-risk economical routing prefers a closer lower-cost candidate instead of blindly selecting the cheapest one.

### `economy`

Explicit cost-first routing. Lower-cost same-provider models may be used for economical duties, including reviewers, but their thinking level remains below the parent. Oracle, Worker, and Delegate are exceptions to model downgrading: all preserve the parent model and exact parent thinking level. If no eligible candidate exists for an economical duty, the router lowers the parent thinking level and finally falls back to the parent runtime.

### `strict`

Preserves the parent model and current thinking level. No role, including Oracle, Worker, or Delegate, may raise thinking above the parent. Use strict for release, security, irreversible, or explicitly quality-critical work.

Published model cost is only a conservative proxy; it is not a provider-neutral measure of intelligence, quality, or total spend.

## Dependencies

This extension depends on [**nicobailon/pi-subagents**](https://github.com/nicobailon/pi-subagents), Pi's subagent runtime. It uses pi-subagents' public launch-contract preflight before spawning each workflow through the `subagents:rpc:v1` event bridge, so pi-subagents must be installed and loaded first.

Adaptive Subagent Router is built on the foundation provided by pi-subagents. We extend our sincere appreciation and respect to Nico Bailon and all contributors for creating and maintaining the project.

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
executionPolicy.ts
index.ts
launchPolicy.ts
routing.ts
usageLog.ts
validation.ts
workflow.ts
```

After changing the extension, run `/reload` or start a new Pi session.

## Run

Clone the repository directly into the global Pi extensions directory:

```sh
mkdir -p ~/.pi/agent/extensions
git clone https://github.com/ddmashawty/pi-adaptive-subagent-router.git \
  ~/.pi/agent/extensions/adaptive-subagent-router
```

Alternatively, copy the eight runtime source files into the target directory. Do not symlink this extension from an arbitrary external path: its preflight bridge intentionally resolves the installed pi-subagents public API through Pi's standard `~/.pi/agent/npm` package layout.

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

The extension converts each lane into a `pi-subagents` workflow with an explicit model and thinking level. Agent names are fail-closed to `scout`, `reviewer`, `researcher`/`research`, `oracle`/`advisor`, `worker` plus its builtin implementation aliases, and `delegate`. Before spawn, pi-subagents preflight must resolve every name to the bundled builtin; same-name package/user/project shadows are rejected. Delegate must additionally retain its explicit non-fanout tool contract. Direct execution and any management action outside a reviewed non-executing allowlist are blocked. This includes execution-capable `schedule`, `resume`, `refine`, and `project.open`; `steer` is allowed only with `steeringRecovery:false`, preventing pause-and-resume replacement execution.

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

### Read-only lanes and isolated writing lanes

Scout, reviewer, research, and oracle lanes remain read-only. Worker and Delegate have write-capable builtin tool allowlists, so either is allowed only when all of these fail-closed conditions hold:

- agent names and duties match the built-in allowlist, and launch preflight proves the selected definition source is `builtin`; unsupported/custom/same-name shadow agents fail before spawn;
- at most one writing lane exists in the adaptive workflow, counting Worker and Delegate together;
- the writing lane uses `worktree:true` in a clean Git repository;
- the caller supplies a non-empty host-run gate;
- calibration sampling is disabled for that workflow;
- the writing lane owns the whole managed worktree, never a path subset of the parent checkout;
- pi-subagents captures the patch and handoff manifest, removes the temporary worktree/branch after successful capture, and leaves patch application to the parent;
- Delegate keeps its builtin explicit tool allowlist, with no configured/subagent-only extensions, MCP/tool-extension widening, or nested subagent fanout.

Shared-checkout writers, non-Git writers, multiple writing lanes, path-level authority, and automatic patch application are intentionally unsupported. Managed worktree isolation is an engineering boundary, not an operating-system sandbox against external side effects. The model-facing hook blocks creating, resuming, or manually running schedules while adaptive routing is active; schedules owned and triggered externally remain outside this extension's lifecycle ownership. Unknown future management actions fail closed until explicitly classified as non-executing.

### Evaluation scope

A small read-only factual-scout pilot observed lower cost and latency, but it is not a general quality guarantee. Continue observing task type, risk, parent/final route, tokens, cost, latency, quality judgments, escalation results, and file-change events during real use.

Pi extensions run with host-process permissions. Install and modify this extension only from a trusted checkout.

## Development

The extension uses Pi's TypeScript loader and Node's strip-types support:

```sh
for f in index.ts routing.ts workflow.ts validation.ts cacheCompatibility.ts usageLog.ts launchPolicy.ts executionPolicy.ts; do
  node --experimental-strip-types --check "$f"
done

pi --list-models
```

Tests are repository-only development files and are not runtime entry points. Operational observations belong in the JSONL usage log.

## License

No license has been declared yet.
