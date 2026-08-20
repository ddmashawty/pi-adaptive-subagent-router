import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	costScore,
	inferDuty,
	lowerCostCandidates,
	modelRef,
	selectRoute,
	type Complexity,
	type LaneDuty,
	type QualityPolicy,
	type Risk,
	type RuntimeModel,
	type ThinkingLevel,
} from "./routing.ts";
import { validateLanes } from "./validation.ts";
import { stripSubagentPromptCacheFields } from "./cacheCompatibility.ts";
import { buildWorkflow } from "./workflow.ts";
import { appendCompletionLog, appendUsageLog, launchedRun, pendingUsageRuns } from "./usageLog.ts";

const LANE_LIMIT: Record<Complexity, number> = { simple: 1, standard: 2, complex: 3 };
const RPC_PROTOCOL_VERSION = 1;
const RPC_REQUEST_EVENT = "subagents:rpc:v1:request";
const RPC_REPLY_PREFIX = "subagents:rpc:v1:reply:";

function candidateSummary(parent: RuntimeModel, models: RuntimeModel[]): string {
	const candidates = lowerCostCandidates(parent, models, 0)
		.slice(0, 8)
		.map((candidate) => `${candidate.provider}/${candidate.id} (cost=${costScore(candidate).toFixed(3)})`);
	return candidates.length ? candidates.join(", ") : "none";
}

async function rpcSpawn(pi: ExtensionAPI, params: Record<string, unknown>): Promise<unknown> {
	const requestId = randomUUID();
	return await new Promise<unknown>((resolve, reject) => {
		const timer = setTimeout(() => {
			unsubscribe?.();
			reject(new Error("Timed out waiting for pi-subagents RPC. Ensure the pi-subagents package is loaded."));
		}, 5_000);
		const unsubscribe = pi.events.on(`${RPC_REPLY_PREFIX}${requestId}`, (reply: unknown) => {
			clearTimeout(timer);
			unsubscribe?.();
			const message = reply as { success?: boolean; data?: unknown; error?: { message?: string } };
			if (message.success) resolve(message.data);
			else reject(new Error(message.error?.message ?? "pi-subagents RPC spawn failed."));
		});
		pi.events.emit(RPC_REQUEST_EVENT, {
			version: RPC_PROTOCOL_VERSION,
			requestId,
			method: "spawn",
			params: { ...params, async: true },
			source: { extension: "adaptive-subagent-router" },
		});
	});
}

const laneSchema = Type.Object({
	key: Type.String({ minLength: 1, description: "Stable lane key." }),
	agent: Type.String({ minLength: 1, description: "Subagent role, for example scout, reviewer, researcher, oracle, or worker." }),
	task: Type.String({ minLength: 1, description: "Narrow task contract for this lane." }),
	duty: Type.Optional(Type.String({ enum: ["scout", "reviewer", "oracle", "worker", "research"], description: "Routing duty. Defaults from the agent name." })),
	risk: Type.Optional(Type.String({ enum: ["low", "medium", "high", "critical"], description: "Lane-specific risk override." })),
	gate: Type.Optional(Type.String({ minLength: 1, description: "Host verification command. Required for critical reviewer lanes." })),
	wave: Type.Optional(Type.Integer({ minimum: 1, maximum: 99, description: "Waves 1-99 run serially; lanes in one wave run in parallel." })),
	context: Type.Optional(Type.String({ enum: ["fresh", "fork"] })),
	worktree: Type.Optional(Type.Boolean({ description: "Required for the single worker lane; runs it in a managed Git worktree." })),
	cwd: Type.Optional(Type.String({ minLength: 1, description: "Lane working directory; defaults to the parent cwd." })),
	output: Type.Optional(Type.Unsafe({ anyOf: [{ type: "string", minLength: 1 }, { type: "boolean", enum: [false] }], description: "Unique output path, or false. Defaults to false to prevent agent-default path collisions." })),
});

export default function adaptiveSubagentRouter(pi: ExtensionAPI) {
	const trackedRuns = pendingUsageRuns();
	pi.events.on("subagent:async-complete", (event: unknown) => {
		if (!event || typeof event !== "object") return;
		const runId = (event as { runId?: unknown }).runId;
		if (typeof runId !== "string") return;
		const asyncDir = trackedRuns.get(runId);
		if (asyncDir === undefined && !trackedRuns.has(runId)) return;
		trackedRuns.delete(runId);
		void appendCompletionLog(runId, asyncDir, event);
	});
	pi.on("before_provider_request", (event) => {
		if (process.env.PI_SUBAGENT_CHILD !== "1") return;
		return stripSubagentPromptCacheFields(event.payload, true);
	});
	pi.on("before_agent_start", (event, ctx) => {
		const parent = ctx.model as RuntimeModel;
		const thinking = ctx.thinkingLevel as ThinkingLevel;
		if (!parent || !thinking) return;
		const candidates = candidateSummary(parent, ctx.modelRegistry.getAvailable() as RuntimeModel[]);
		return {
			systemPrompt: `${event.systemPrompt}\n\n## Adaptive subagent routing (enforced)\nBefore delegating, state a concise decision covering independent value, complexity, risk, quality policy, lane duties, and evidence/gates. Do not reveal private chain-of-thought.\n\nParent runtime: ${parent.provider}/${parent.id}:${thinking}. Same-provider lower-cost candidates: ${candidates}. Default to qualityPolicy=balanced: economical routing is allowed for low-risk scout/research lanes, but every reviewer, oracle, worker, and high/critical risk lane preserves the parent runtime. No subagent may exceed the parent thinking level. Oracle keeps the parent model and thinking, and defaults to fork context. Worker keeps the parent model and thinking, defaults to fork, and requires one managed worktree plus a gate. Use economy only when cost is the explicit priority; use strict for release, security, irreversible, or user-designated quality gates. Never cross providers automatically.\n\nReviewer findings must distinguish verified evidence from static suspicion. Critical reviewer lanes require a gate command. For execution, call adaptive_subagent_launch, not subagent directly.`
		};
	});

	pi.on("tool_call", (event) => {
		if (event.toolName !== "subagent") return;
		const input = event.input as { action?: string; workflowScript?: string; agent?: string };
		if (input.action || (!input.workflowScript && !input.agent)) return;
		return {
			block: true,
			reason: "Adaptive routing is enabled. Make a routing decision and call adaptive_subagent_launch so provider/model/thinking constraints can be checked.",
		};
	});

	pi.registerTool({
		name: "adaptive_subagent_launch",
		label: "Adaptive Subagent Launch",
		description: "Launch a risk-aware dynamically routed workflow for read-only lanes or one managed-worktree worker. Balances task complexity, risk, lane duty, evidence gates, quality policy, and cost.",
		parameters: Type.Object({
			decision: Type.String({ minLength: 12, description: "Concise routing decision covering delegation value, risk/quality choice, lane count, and evidence plan." }),
			complexity: Type.String({ enum: ["simple", "standard", "complex"] }),
			risk: Type.Optional(Type.String({ enum: ["low", "medium", "high", "critical"], description: "Overall task risk; defaults to medium." })),
			qualityPolicy: Type.Optional(Type.String({ enum: ["economy", "balanced", "strict"], description: "economy favors cost, balanced is risk-aware default, strict preserves the parent runtime." })),
			calibrationSample: Type.Optional(Type.Boolean({ description: "Run the first read lane again on the parent runtime for explicit A/B quality calibration." })),
			autoEscalate: Type.Optional(Type.Boolean({ description: "Escalate low-confidence/needsEscalation reports to the parent runtime. Defaults on for high/critical risk." })),
			minContextWindow: Type.Optional(Type.Integer({ minimum: 0, description: "Minimum context window required by every child; defaults to 0." })),
			lanes: Type.Array(laneSchema, { minItems: 1, maxItems: 3, description: "One to three narrow lanes. Lanes sharing a wave run in parallel." }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const parent = ctx.model as RuntimeModel;
			const parentThinking = ctx.thinkingLevel as ThinkingLevel;
			if (!parent || !parentThinking) throw new Error("No active parent model or thinking level is available.");
			if (params.lanes.length > LANE_LIMIT[params.complexity]) {
				throw new Error(`${params.complexity} work permits at most ${LANE_LIMIT[params.complexity]} lane(s); split the work into serial phases instead.`);
			}
			const lanesWithDuties = params.lanes.map((lane) => ({
				...lane,
				duty: inferDuty(lane.agent, lane.duty as LaneDuty | undefined),
			}));
			validateLanes(lanesWithDuties, params.calibrationSample ?? false);

			const defaultRisk = (params.risk ?? "medium") as Risk;
			const qualityPolicy = (params.qualityPolicy ?? "balanced") as QualityPolicy;
			const models = ctx.modelRegistry.getAvailable() as RuntimeModel[];
			const routes = lanesWithDuties.map((lane) => {
				const duty = lane.duty;
				const risk = (lane.risk ?? defaultRisk) as Risk;
				if (risk === "critical" && duty === "reviewer" && !lane.gate) {
					throw new Error(`Critical reviewer lane "${lane.key}" requires a gate command.`);
				}
				const selected = selectRoute(parent, models, parentThinking, {
					complexity: params.complexity as Complexity,
					risk,
					qualityPolicy,
					duty,
					minContextWindow: params.minContextWindow ?? 0,
				});
				if (!selected) {
					throw new Error(`No route satisfies lane "${lane.key}" context requirements for ${parent.provider}/${parent.id}:${parentThinking}.`);
				}
				return {
					key: lane.key,
					model: modelRef(selected.model, selected.thinking),
					strategy: selected.strategy,
					risk,
					duty,
					qualityPolicy,
					reason: selected.reason,
					eligibleLowerCost: selected.eligibleLowerCost,
				};
			});
			const normalizedLanes = lanesWithDuties.map((lane, index) => ({
				...lane,
				risk: routes[index]!.risk,
				duty: routes[index]!.duty,
			}));
			const autoEscalate = params.autoEscalate ?? routes.some((route) => route.risk === "high" || route.risk === "critical");
			const workflowScript = buildWorkflow(
				normalizedLanes as Array<Record<string, unknown>>,
				routes,
				ctx.cwd,
				{
					escalation: { enabled: autoEscalate, model: modelRef(parent, parentThinking) },
					calibration: { enabled: params.calibrationSample ?? false, model: modelRef(parent, parentThinking) },
				},
			);
			const result = await rpcSpawn(pi, { workflowScript, async: true });
			const launched = launchedRun(result);
			if (launched) trackedRuns.set(launched.runId, launched.asyncDir);
			await appendUsageLog({
				event: "launch",
				runId: launched?.runId,
				asyncDir: launched?.asyncDir,
				parent: `${parent.provider}/${parent.id}:${parentThinking}`,
				complexity: params.complexity,
				qualityPolicy,
				autoEscalate,
				calibrationSample: params.calibrationSample ?? false,
				routes,
			});
			const summary = routes.map((route) => `${route.key}→${route.model} [${route.strategy}]`).join(", ");
			return {
				content: [{ type: "text", text: `Launched ${params.lanes.length} risk-aware lane(s): ${summary}. Decision: ${params.decision}` }],
				details: {
					decision: params.decision,
					parent: `${parent.provider}/${parent.id}:${parentThinking}`,
					qualityPolicy,
					defaultRisk,
					autoEscalate,
					calibrationSample: params.calibrationSample ?? false,
					routes,
					lanes: params.lanes,
					result,
				},
			};
		},
	});
}
