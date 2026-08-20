import {
	costScore,
	modelRef,
	selectRoute,
	type LaneDuty,
	type LaneRole,
	type QualityPolicy,
	type Risk,
	type RouteRequest,
	type RouteStrategy,
	type RuntimeModel,
	type ThinkingLevel,
} from "./routing.ts";

export type BenchmarkCondition = "adaptive" | "static-parent";

export type BenchmarkCase = {
	id: string;
	seed: number;
	request: RouteRequest;
};

export type BenchmarkRow = {
	caseId: string;
	seed: number;
	condition: BenchmarkCondition;
	role: LaneRole;
	duty: LaneDuty;
	risk: Risk;
	qualityPolicy: QualityPolicy;
	route: string;
	strategy: RouteStrategy;
	modelCost: number;
	parentModelCost: number;
	publishedModelCostDelta: number;
	preservesParent: boolean;
	expectsParent: boolean;
	reviewerProtectionFailure: boolean;
};

export type BenchmarkSummary = {
	totalCases: number;
	protectedCases: number;
	protectedCaseFailures: string[];
	protectedReviewerCases: number;
	reviewerProtectionFailures: string[];
	strategyCounts: Record<RouteStrategy, number>;
	publishedModelCostDelta: number;
};

export type BenchmarkReport = {
	parent: string;
	parentThinking: ThinkingLevel;
	rows: BenchmarkRow[];
	summary: BenchmarkSummary;
};

function fixtureModel(id: string, totalCost: number, contextWindow = 128_000, provider = "provider-a"): RuntimeModel {
	return {
		id,
		provider,
		reasoning: true,
		input: ["text"],
		contextWindow,
		cost: { input: totalCost / 2, output: totalCost / 2, cacheRead: 0, cacheWrite: 0 },
	};
}

export function defaultBenchmarkInput(): {
	parent: RuntimeModel;
	models: RuntimeModel[];
	parentThinking: ThinkingLevel;
	cases: BenchmarkCase[];
} {
	const parent = fixtureModel("parent", 100);
	const closer = fixtureModel("closer", 70, 200_000);
	const cheapest = fixtureModel("cheap", 10, 200_000);
	const foreign = fixtureModel("foreign", 1, 200_000, "provider-b");
	const standard = (id: string, seed: number, risk: Risk, duty: LaneDuty, qualityPolicy: QualityPolicy, role: LaneRole = "read"): BenchmarkCase => ({
		id,
		seed,
		request: {
			complexity: "standard",
			risk,
			qualityPolicy,
			role,
			duty,
			minContextWindow: 0,
		},
	});

	return {
		parent,
		models: [parent, cheapest, closer, foreign],
		parentThinking: "medium",
		cases: [
			standard("balanced-low-scout", 1, "low", "scout", "balanced"),
			standard("balanced-medium-research", 2, "medium", "research", "balanced"),
			standard("balanced-low-reviewer", 3, "low", "reviewer", "balanced"),
			standard("balanced-medium-reviewer", 4, "medium", "reviewer", "balanced"),
			standard("balanced-high-reviewer", 5, "high", "reviewer", "balanced"),
			standard("balanced-critical-reviewer", 6, "critical", "reviewer", "balanced"),
			standard("balanced-high-writer", 7, "high", "worker", "balanced", "write"),
			standard("economy-low-reviewer", 8, "low", "reviewer", "economy"),
			standard("strict-low-scout", 9, "low", "scout", "strict"),
		],
	};
}

export function expectsParent(request: RouteRequest): boolean {
	if (request.qualityPolicy === "strict") return true;
	if (request.qualityPolicy !== "balanced") return false;
	if (request.duty === "reviewer") return true;
	if (request.risk === "high" || request.risk === "critical") return true;
	return request.risk === "medium" && request.role === "write";
}

function staticParentRoute(parent: RuntimeModel, parentThinking: ThinkingLevel) {
	return {
		model: parent,
		thinking: parentThinking,
		strategy: "same-model" as const,
	};
}

function buildRow(
	benchmarkCase: BenchmarkCase,
	condition: BenchmarkCondition,
	parent: RuntimeModel,
	parentThinking: ThinkingLevel,
	route: { model: RuntimeModel; thinking: ThinkingLevel; strategy: RouteStrategy },
): BenchmarkRow {
	const preservesParent = route.model.id === parent.id && route.model.provider === parent.provider && route.thinking === parentThinking;
	const expectsParentForCase = expectsParent(benchmarkCase.request);
	const reviewerProtectionFailure = benchmarkCase.request.duty === "reviewer"
		&& benchmarkCase.request.qualityPolicy !== "economy"
		&& !preservesParent;
	return {
		caseId: benchmarkCase.id,
		seed: benchmarkCase.seed,
		condition,
		role: benchmarkCase.request.role,
		duty: benchmarkCase.request.duty,
		risk: benchmarkCase.request.risk,
		qualityPolicy: benchmarkCase.request.qualityPolicy,
		route: modelRef(route.model, route.thinking),
		strategy: route.strategy,
		modelCost: costScore(route.model),
		parentModelCost: costScore(parent),
		publishedModelCostDelta: costScore(parent) - costScore(route.model),
		preservesParent,
		expectsParent: expectsParentForCase,
		reviewerProtectionFailure,
	};
}

function emptyStrategyCounts(): Record<RouteStrategy, number> {
	return { "lower-cost": 0, "same-model-lower-thinking": 0, "same-model": 0 };
}

export function runOfflineBenchmark(
	parent: RuntimeModel,
	models: RuntimeModel[],
	parentThinking: ThinkingLevel,
	cases: readonly BenchmarkCase[],
): BenchmarkReport {
	const rows: BenchmarkRow[] = [];
	for (const benchmarkCase of cases) {
		const adaptive = selectRoute(parent, models, parentThinking, benchmarkCase.request);
		if (!adaptive) throw new Error(`No adaptive route for benchmark case "${benchmarkCase.id}".`);
		rows.push(buildRow(benchmarkCase, "adaptive", parent, parentThinking, adaptive));
		rows.push(buildRow(benchmarkCase, "static-parent", parent, parentThinking, staticParentRoute(parent, parentThinking)));
	}

	const adaptiveRows = rows.filter((row) => row.condition === "adaptive");
	const protectedRows = adaptiveRows.filter((row) => row.expectsParent);
	const reviewerRows = adaptiveRows.filter((row) => row.duty === "reviewer" && row.qualityPolicy !== "economy");
	const strategyCounts = emptyStrategyCounts();
	for (const row of adaptiveRows) strategyCounts[row.strategy] += 1;
	return {
		parent: modelRef(parent, parentThinking),
		parentThinking,
		rows,
		summary: {
			totalCases: cases.length,
			protectedCases: protectedRows.length,
			protectedCaseFailures: protectedRows.filter((row) => !row.preservesParent).map((row) => row.caseId),
			protectedReviewerCases: reviewerRows.length,
			reviewerProtectionFailures: reviewerRows.filter((row) => row.reviewerProtectionFailure).map((row) => row.caseId),
			strategyCounts,
			publishedModelCostDelta: adaptiveRows.reduce((total, row) => total + row.publishedModelCostDelta, 0),
		},
	};
}

export function formatBenchmarkReport(report: BenchmarkReport): string {
	return JSON.stringify(report, null, 2);
}

if (process.argv[1]?.endsWith("/benchmark.ts")) {
	const input = defaultBenchmarkInput();
	console.log(formatBenchmarkReport(runOfflineBenchmark(input.parent, input.models, input.parentThinking, input.cases)));
}
