import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
type Complexity = "simple" | "standard" | "complex";
type LaneRole = "read" | "write";
type RouteStrategy = "lower-cost" | "same-model-lower-thinking" | "same-model";

type RuntimeModel = {
	id: string;
	provider: string;
	reasoning: boolean;
	input: string[];
	contextWindow: number;
	cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
	thinkingLevelMap?: Partial<Record<ThinkingLevel, string | null>>;
};

const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const COMPLEXITY_TARGET: Record<Complexity, ThinkingLevel> = {
	simple: "minimal",
	standard: "low",
	complex: "medium",
};
const LANE_LIMIT: Record<Complexity, number> = { simple: 1, standard: 2, complex: 3 };
const RPC_PROTOCOL_VERSION = 1;
const RPC_REQUEST_EVENT = "subagents:rpc:v1:request";
const RPC_REPLY_PREFIX = "subagents:rpc:v1:reply:";

function thinkingRank(level: ThinkingLevel): number {
	return THINKING_LEVELS.indexOf(level);
}

function costScore(model: RuntimeModel): number {
	const { input, output, cacheRead, cacheWrite } = model.cost;
	return input + output + cacheRead + cacheWrite;
}

function supportsThinking(model: RuntimeModel, level: ThinkingLevel): boolean {
	if (level === "off") return true;
	if (!model.reasoning) return false;
	const configured = model.thinkingLevelMap?.[level];
	if (configured === null) return false;
	// Pi's default mapping supports levels through high when the map omits them.
	return thinkingRank(level) <= thinkingRank("high");
}

function selectThinking(model: RuntimeModel, parentThinking: ThinkingLevel, complexity: Complexity): ThinkingLevel | undefined {
	const parentRank = thinkingRank(parentThinking);
	if (parentRank <= 0) return undefined;
	const desiredRank = Math.min(thinkingRank(COMPLEXITY_TARGET[complexity]), parentRank - 1);
	for (let rank = desiredRank; rank >= 0; rank -= 1) {
		const level = THINKING_LEVELS[rank]!;
		if (supportsThinking(model, level)) return level;
	}
	return undefined;
}

type SelectedRoute = {
	model: RuntimeModel;
	thinking: ThinkingLevel;
	strategy: RouteStrategy;
};

function selectRoute(
	parent: RuntimeModel,
	models: RuntimeModel[],
	minContextWindow: number,
	parentThinking: ThinkingLevel,
	complexity: Complexity,
): SelectedRoute | undefined {
	const parentRank = thinkingRank(parentThinking);
	if (parentRank < 0) return undefined;

	for (const candidate of lowerCostCandidates(parent, models, minContextWindow)) {
		const thinking = selectThinking(candidate, parentThinking, complexity);
		if (thinking && thinkingRank(thinking) < parentRank) {
			return { model: candidate, thinking, strategy: "lower-cost" };
		}
	}

	if (parent.contextWindow < minContextWindow) return undefined;
	const fallbackThinking = selectThinking(parent, parentThinking, complexity);
	if (fallbackThinking && thinkingRank(fallbackThinking) < parentRank) {
		return { model: parent, thinking: fallbackThinking, strategy: "same-model-lower-thinking" };
	}

	return { model: parent, thinking: parentThinking, strategy: "same-model" };
}

function lowerCostCandidates(parent: RuntimeModel, models: RuntimeModel[], minContextWindow: number): RuntimeModel[] {
	const parentCost = costScore(parent);
	if (!Number.isFinite(parentCost) || parentCost <= 0) return [];
	return models
		.filter((model) =>
			model.provider === parent.provider
			&& model.id !== parent.id
			&& model.reasoning
			&& model.input.includes("text")
			&& model.contextWindow >= minContextWindow
			&& Number.isFinite(costScore(model))
			&& costScore(model) > 0
			&& costScore(model) < parentCost,
		)
		.sort((left, right) => costScore(left) - costScore(right) || right.contextWindow - left.contextWindow || left.id.localeCompare(right.id));
}

function modelRef(model: RuntimeModel, thinking: ThinkingLevel): string {
	return `${model.provider}/${model.id}:${thinking}`;
}

function candidateSummary(parent: RuntimeModel, models: RuntimeModel[], parentThinking: ThinkingLevel): string {
	const candidates = lowerCostCandidates(parent, models, 0)
		.map((candidate) => {
			const thinking = selectThinking(candidate, parentThinking, "complex");
			return thinking ? `${modelRef(candidate, thinking)} (cost=${costScore(candidate).toFixed(3)})` : undefined;
		})
		.filter((value): value is string => value !== undefined)
		.slice(0, 8);
	return candidates.length ? candidates.join(", ") : "none";
}

function escapeForScript(value: unknown): string {
	return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildWorkflow(lanes: Array<Record<string, unknown>>, routes: Array<{ model: string }>, defaultCwd: string): string {
	const waves = new Map<number, Array<Record<string, unknown>>>();
	lanes.forEach((lane, index) => {
		const wave = typeof lane.wave === "number" ? lane.wave : 1;
		const item = {
			key: lane.key,
			agent: lane.agent,
			task: lane.task,
			model: routes[index]!.model,
			context: lane.context,
			worktree: lane.worktree,
			cwd: lane.cwd ?? defaultCwd,
			output: lane.output ?? false,
		};
		const current = waves.get(wave) ?? [];
		current.push(item);
		waves.set(wave, current);
	});

	const lines = ["const results = [];"];
	for (const [wave, items] of [...waves.entries()].sort(([left], [right]) => left - right)) {
		lines.push(`const wave${wave} = await runs.all(${escapeForScript(items)});`);
		lines.push(`results.push(...wave${wave});`);
	}
	lines.push("return results.map((result) => result.output);");
	return lines.join("\n");
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
	agent: Type.String({ minLength: 1, description: "Subagent role, for example scout, reviewer, or worker." }),
	task: Type.String({ minLength: 1, description: "Narrow task contract for this lane." }),
	role: Type.String({ enum: ["read", "write"], description: "Whether this lane may modify project files." }),
	wave: Type.Optional(Type.Integer({ minimum: 1, description: "Waves run serially; lanes in one wave run in parallel." })),
	context: Type.Optional(Type.String({ enum: ["fresh", "fork"] })),
	worktree: Type.Optional(Type.Boolean({ description: "Required for concurrent writers in isolated Git worktrees." })),
	cwd: Type.Optional(Type.String({ minLength: 1, description: "Lane working directory; defaults to the parent cwd." })),
	output: Type.Optional(Type.Unsafe({ anyOf: [{ type: "string", minLength: 1 }, { type: "boolean", enum: [false] }], description: "Unique output path, or false. Defaults to false to prevent role-default path collisions." })),
});

export default function adaptiveSubagentRouter(pi: ExtensionAPI) {
	pi.on("before_agent_start", (event, ctx) => {
		const parent = ctx.model as RuntimeModel;
		const thinking = ctx.thinkingLevel as ThinkingLevel;
		if (!parent || !thinking) return;
		const candidates = candidateSummary(parent, ctx.modelRegistry.getAvailable() as RuntimeModel[], thinking);
		return {
			systemPrompt: `${event.systemPrompt}\n\n## Adaptive subagent routing (enforced)\nBefore delegating, make a short routing decision: whether a child adds independent value; task complexity; lane count/roles; and whether writes can be isolated. Do not reveal private chain-of-thought—state only the concise decision.\n\nParent runtime: ${parent.provider}/${parent.id}:${thinking}. Eligible same-provider lower-cost candidates at this moment: ${candidates}. Prefer a same-provider reasoning model whose cost metadata is lower than the parent and use a thinking level strictly below ${thinking}. If no eligible lower-cost model exists, use the parent model with a lower supported thinking level when possible; if it cannot be lowered, reuse the parent model at the current thinking level. Do not cross providers automatically.\n\nFor execution, call the adaptive_subagent_launch tool, not subagent directly. Give it lanes only after the routing decision. Keep one writer per shared worktree; multiple writers require worktree:true and non-overlapping work.`
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
		description: "Launch a dynamically routed subagent workflow. Prefers a same-provider lower-cost model, then lowers the parent thinking level, then reuses the parent model when necessary. Use only after deciding task complexity and lanes.",
		parameters: Type.Object({
			decision: Type.String({ minLength: 1, description: "Concise routing decision: why delegation, complexity, lane count, and writer-isolation conclusion." }),
			complexity: Type.String({ enum: ["simple", "standard", "complex"] }),
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
			const writerLanes = params.lanes.filter((lane) => lane.role === "write");
			if (writerLanes.length > 1 && writerLanes.some((lane) => lane.worktree !== true)) {
				throw new Error("Multiple writer lanes require worktree:true for every writer and non-overlapping authority boundaries.");
			}
			const selectedRoute = selectRoute(
				parent,
				ctx.modelRegistry.getAvailable() as RuntimeModel[],
				params.minContextWindow ?? 0,
				parentThinking,
				params.complexity,
			);
			if (!selectedRoute) {
				throw new Error(`No routable same-provider or parent-model fallback is available for ${parent.provider}/${parent.id}:${parentThinking}.`);
			}
			const route = {
				model: modelRef(selectedRoute.model, selectedRoute.thinking),
				strategy: selectedRoute.strategy,
			};
			const workflowScript = buildWorkflow(params.lanes as Array<Record<string, unknown>>, params.lanes.map(() => route), ctx.cwd);
			const result = await rpcSpawn(pi, { workflowScript, async: true });
			return {
				content: [{ type: "text", text: `Launched ${params.lanes.length} routed lane(s) with ${route.model}. Decision: ${params.decision}` }],
				details: { decision: params.decision, parent: `${parent.provider}/${parent.id}:${parentThinking}`, route, lanes: params.lanes, result },
			};
		},
	});
}
