# Live A/B Report — first paired batch

## Scope

- Experiment: `live-ab-pilot-2026-08-20`
- Parent runtime: `openai-codex/gpt-5.6-luna:max`
- CWD: `/home/u2734/.pi/agent/extensions/adaptive-subagent-router`
- Conditions: `balanced` (adaptive) vs `strict` (static-parent)
- Fixed parameters: `complexity=complex`, `risk=low`, three parallel read-only lanes, `autoEscalate=false`, `calibrationSample=false`, no gate, no writes.
- Suites: three review tasks and three exact-facts scout tasks. Task wording was paired between conditions.
- Quality rubric: required facts, file/line evidence, verified-vs-static distinction, confidence and `needsEscalation=false`.

This is the first paired batch, not a statistically powered final result. Child usage/cost comes from runner `meta.json`; latency uses workflow `status.json` start/end and child duration.

## Measured results

| Suite | Condition | Actual child route | Child tokens (in+out) | Child cost | Workflow wall | Max child duration | Completion |
|---|---|---|---:|---:|---:|---:|---|
| Review (3) | balanced | 3 × `gpt-5.6-luna:max` | 144,320 | $0.07712976 | 493.38 s | 493.21 s | 3/3 |
| Review (3) | strict/static-parent | 3 × `gpt-5.6-luna:max` | 133,923 | $0.07206960 | 371.96 s | 371.71 s | 3/3 |
| Scout (3) | balanced | 3 × `gpt-5.6-luna:medium` | 53,359 | $0.01693624 | 51.39 s | 51.13 s | 3/3 |
| Scout (3) | strict/static-parent | 3 × `gpt-5.6-luna:max` | 66,832 | $0.02449144 | 96.65 s | 96.46 s | 3/3 |

### Relative differences in this batch

Compared with strict/static-parent:

- **Scout balanced:** token -20.16%, cost -30.85%, workflow wall -46.83%.
- **Review balanced:** token +7.76%, cost +7.02%, workflow wall +32.64%. Both conditions selected the same parent route, so this is not attributable to adaptive down-routing; the difference is run variance/long-tail behavior.

## Quality results

- Review core rubric: **balanced 3/3, strict 3/3**.
  - `review-routing`: both correctly preserved all non-economy reviewer risk levels and identified the economy exception.
  - `review-benchmark`: both correctly identified the nine cases, adaptive/static pairing, published model-cost proxy, and non-measured quality/token/latency limits.
  - `review-isolation`: both covered the core authority behavior; balanced additionally found a verified HEAD/commit bypass that strict omitted.
- Scout exact-facts rubric: **balanced 3/3, strict 3/3**. Both conditions returned the requested file evidence; no correctness regression was observed in this small suite.
- All 12 child meta artifacts report `exitCode=0`, `acceptance=attested`, and no file mutation.

## Verified findings surfaced by the live review

1. `workflow.ts:18` checks changes relative to the current `HEAD` rather than a writer-start baseline. A writer that commits an out-of-authority change before the gate may hide it from the final diff.
2. `workflow.ts:18` uses `git ls-files --others --exclude-standard`; ignored untracked files outside authority are not checked.
3. `validation.ts:34-35` requires `worktree:true` for every multi-writer setup even when writers are placed in serial waves.

These are residual isolation findings, not failures of the read-only A/B lanes. They prevent claiming that writer isolation is fully verified until separately fixed/tested.

## Methodology issues

- The first balanced review parent process timed out while trying to read and concatenate child artifacts after the workflow had already completed. The workflow itself completed; its status/meta metrics are used here, not the parent shell timeout.
- One earlier live smoke used an output contract that conflicted with the reviewer acceptance contract and detached. It is excluded from this report.
- `seed` is an experiment identifier only; the current Pi path does not expose a controllable model RNG seed.

## Interpretation and next step

This batch supports two narrow conclusions:

1. The reviewer policy is working as intended: balanced reviewers stayed at the parent model, so review quality is not traded for routing savings.
2. For these low-risk factual scout tasks, balanced reduced thinking from `max` to `medium` and showed lower token/cost/latency with no rubric regression in the first batch.

It does **not** establish a general quality guarantee or a final 15% product-level win. Continue with at least 20 paired tasks/repetitions across varied review and scout work, preserve the same rubric, and report confidence intervals before making a go/no-go decision.

## Artifact roots

- Balanced review workflow: `/tmp/pi-subagents-uid-1000/async-subagent-runs/e4901ed9-64f2-4970-b903-7357a2d6dacd/`
- Strict review workflow: `/tmp/pi-subagents-uid-1000/async-subagent-runs/10392e9f-13f8-4ec0-b83a-415940e5f9db/`
- Balanced scout workflow: `/tmp/pi-subagents-uid-1000/async-subagent-runs/cd63c66b-7a47-4611-a44a-998c627391ce/`
- Strict scout workflow: `/tmp/pi-subagents-uid-1000/async-subagent-runs/6c2893cb-d751-4391-a9d2-7db08385498a/`
- Independent quality scoring workflow: `/tmp/pi-subagents-uid-1000/async-subagent-runs/cea9fa16-42ac-4134-a4da-44e42f2a74a4/`
