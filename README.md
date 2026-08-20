# Adaptive Subagent Router

English | [中文](README-zh.md)

Adaptive Subagent Router is a global [Pi](https://github.com/badlogic/pi-mono) extension for routing subagent work by task risk, quality policy, lane duty, model cost, context requirements, and evidence gates.

It keeps the parent agent in control while adding a runtime policy layer that reads the active model catalogue, selects an appropriate route, validates delegation constraints, and records observed execution effects. It does not hard-code a provider or model ID and never crosses providers automatically.

## Developer preview

This extension is currently in developer preview. Routing policy and log formats may change as real usage provides more evidence. It delegates **read-only** subagent work only (scout, reviewer, research); all file writes are performed by the parent agent, not by delegated lanes.

## Features

- Dynamic routing from the active parent runtime and model catalogue.
- Three quality policies: `balanced`, `economy`, and `strict`.
- Lower thinking-level fallback when no eligible lower-cost model exists.
- Parent-runtime protection for balanced reviewers and high/critical-risk work.
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
- High- and critical-risk lanes preserve the parent runtime.
- Medium-risk economical routing prefers a closer lower-cost candidate instead of blindly selecting the cheapest one.

### `economy`

Explicit cost-first routing. Lower-cost same-provider models may be used for every duty, including reviewers. If no eligible candidate exists, the router lowers the parent thinking level and finally falls back to the parent runtime.

### `strict`

Always preserves the parent model and current thinking level. Use it for release, security, irreversible, or explicitly quality-critical work.

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

The extension converts each lane into a `pi-subagents` workflow with an explicit model and thinking level. Direct execution calls to the underlying `subagent` tool are blocked so routing and evidence checks cannot be bypassed.

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

### Read-only by design

This extension does not delegate file writes. Every lane is a read-only subagent (scout, reviewer, or research): it inspects and reports, and the parent agent applies any changes itself. This removes the file-authority problem entirely — there is no writer lane to constrain, so there is no authority boundary to bypass.

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

Experimental benchmarks, tests, and interim reports are intentionally not part of the installed runtime directory. Operational observations belong in the JSONL usage log.

## License

No license has been declared yet.
