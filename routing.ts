export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type Complexity = "simple" | "standard" | "complex";
export type Risk = "low" | "medium" | "high" | "critical";
export type QualityPolicy = "economy" | "balanced" | "strict";
export type LaneDuty = "scout" | "reviewer" | "oracle" | "worker" | "delegate" | "research";
export type RouteStrategy = "lower-cost" | "same-model-lower-thinking" | "same-model";

export type RuntimeModel = {
	id: string;
	provider: string;
	reasoning: boolean;
	input: string[];
	contextWindow: number;
	cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
	thinkingLevelMap?: Partial<Record<ThinkingLevel, string | null>>;
};

export type RouteRequest = {
	complexity: Complexity;
	risk: Risk;
	qualityPolicy: QualityPolicy;
	duty: LaneDuty;
	minContextWindow: number;
};

export type SelectedRoute = {
	model: RuntimeModel;
	thinking: ThinkingLevel;
	strategy: RouteStrategy;
	reason: string[];
	eligibleLowerCost: number;
};

export const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const COMPLEXITY_TARGET: Record<Complexity, ThinkingLevel> = {
	simple: "minimal",
	standard: "low",
	complex: "medium",
};
const RISK_RANK: Record<Risk, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function thinkingRank(level: ThinkingLevel): number {
	return THINKING_LEVELS.indexOf(level);
}

export function costScore(model: RuntimeModel): number {
	const { input, output, cacheRead, cacheWrite } = model.cost;
	return input + output + cacheRead + cacheWrite;
}

export function supportsThinking(model: RuntimeModel, level: ThinkingLevel): boolean {
	if (level === "off") return true;
	if (!model.reasoning) return false;
	const configured = model.thinkingLevelMap?.[level];
	if (configured === null) return false;
	return thinkingRank(level) <= thinkingRank("high");
}

export function inferDuty(agent: string, explicit?: LaneDuty): LaneDuty {
	const trimmed = agent.trim();
	if (trimmed !== agent) throw new Error(`Unsupported adaptive agent "${agent}": surrounding whitespace is not allowed.`);
	const normalized = trimmed.toLowerCase();
	let inferred: LaneDuty | undefined;
	if (normalized === "scout") inferred = "scout";
	else if (normalized === "reviewer") inferred = "reviewer";
	else if (normalized === "researcher" || normalized === "research") inferred = "research";
	else if (normalized === "oracle" || normalized === "advisor") inferred = "oracle";
	else if (["worker", "developer", "coder", "implementer", "develop"].includes(normalized)) inferred = "worker";
	else if (normalized === "delegate") inferred = "delegate";
	if (!inferred) {
		throw new Error(`Unsupported adaptive agent "${agent}". Allowed agents: scout, reviewer, researcher, oracle/advisor, worker and worker aliases, delegate.`);
	}
	if (explicit && explicit !== inferred) {
		throw new Error(`Adaptive duty "${explicit}" does not match agent "${agent}" (expected "${inferred}").`);
	}
	return inferred;
}

function selectLowerThinking(model: RuntimeModel, parentThinking: ThinkingLevel, complexity: Complexity): ThinkingLevel | undefined {
	const parentRank = thinkingRank(parentThinking);
	if (parentRank <= 0) return undefined;
	const desiredRank = Math.min(thinkingRank(COMPLEXITY_TARGET[complexity]), parentRank - 1);
	for (let rank = desiredRank; rank >= 0; rank -= 1) {
		const level = THINKING_LEVELS[rank]!;
		if (supportsThinking(model, level)) return level;
	}
	return undefined;
}

export function lowerCostCandidates(parent: RuntimeModel, models: RuntimeModel[], minContextWindow: number): RuntimeModel[] {
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

function shouldPreserveParent(request: RouteRequest): string | undefined {
	if (request.qualityPolicy === "strict") return "strict quality policy";
	if (request.qualityPolicy === "economy") return undefined;
	if (RISK_RANK[request.risk] >= RISK_RANK.high) return `${request.risk} risk`;
	if (request.duty === "reviewer") return "reviewer quality priority";
	return undefined;
}

export function selectRoute(
	parent: RuntimeModel,
	models: RuntimeModel[],
	parentThinking: ThinkingLevel,
	request: RouteRequest,
): SelectedRoute | undefined {
	const parentRank = thinkingRank(parentThinking);
	if (parentRank < 0) return undefined;
	const candidates = lowerCostCandidates(parent, models, request.minContextWindow);
	if (request.duty === "oracle" || request.duty === "worker" || request.duty === "delegate") {
		if (parent.contextWindow < request.minContextWindow) return undefined;
		const roleReasons = request.duty === "oracle"
			? ["oracle decision-consistency priority", "preserve parent model for inherited-context consultation"]
			: request.duty === "worker"
				? ["worker implementation safety priority", "preserve parent model for managed-worktree implementation"]
				: ["delegate parent-continuity priority", "preserve parent model for isolated delegated execution"];
		return {
			model: parent,
			thinking: parentThinking,
			strategy: "same-model",
			reason: [
				...roleReasons,
				`preserve parent thinking ${parentThinking}; subagents never exceed the parent thinking level`,
			],
			eligibleLowerCost: candidates.length,
		};
	}
	const preserveReason = shouldPreserveParent(request);
	if (preserveReason) {
		if (parent.contextWindow < request.minContextWindow) return undefined;
		return {
			model: parent,
			thinking: parentThinking,
			strategy: "same-model",
			reason: [preserveReason, "preserve parent capability and thinking level"],
			eligibleLowerCost: candidates.length,
		};
	}

	const ordered = request.qualityPolicy === "balanced" && request.risk === "medium"
		? [...candidates].reverse()
		: candidates;
	for (const candidate of ordered) {
		const thinking = selectLowerThinking(candidate, parentThinking, request.complexity);
		if (thinking && thinkingRank(thinking) < parentRank) {
			return {
				model: candidate,
				thinking,
				strategy: "lower-cost",
				reason: [
					`${request.qualityPolicy} policy permits economical routing`,
					`same provider and lower published cost (${costScore(candidate).toFixed(3)} < ${costScore(parent).toFixed(3)})`,
					`thinking ${thinking} is below parent ${parentThinking}`,
				],
				eligibleLowerCost: candidates.length,
			};
		}
	}

	if (parent.contextWindow < request.minContextWindow) return undefined;
	const fallbackThinking = selectLowerThinking(parent, parentThinking, request.complexity);
	if (fallbackThinking && thinkingRank(fallbackThinking) < parentRank) {
		return {
			model: parent,
			thinking: fallbackThinking,
			strategy: "same-model-lower-thinking",
			reason: ["no eligible lower-cost candidate", `lower parent thinking from ${parentThinking} to ${fallbackThinking}`],
			eligibleLowerCost: candidates.length,
		};
	}
	return {
		model: parent,
		thinking: parentThinking,
		strategy: "same-model",
		reason: ["no eligible lower-cost or lower-thinking route", "reuse parent runtime as safe fallback"],
		eligibleLowerCost: candidates.length,
	};
}

export function modelRef(model: RuntimeModel, thinking: ThinkingLevel): string {
	return `${model.provider}/${model.id}:${thinking}`;
}
