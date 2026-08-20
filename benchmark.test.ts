import assert from "node:assert/strict";
import test from "node:test";
import { defaultBenchmarkInput, formatBenchmarkReport, runOfflineBenchmark } from "./benchmark.ts";

function report() {
	const input = defaultBenchmarkInput();
	return runOfflineBenchmark(input.parent, input.models, input.parentThinking, input.cases);
}

test("offline benchmark protects every non-economy reviewer", () => {
	const result = report();
	assert.deepEqual(result.summary.reviewerProtectionFailures, []);
	assert.deepEqual(result.summary.protectedCaseFailures, []);
	assert.equal(result.rows.find((row) => row.caseId === "balanced-low-reviewer" && row.condition === "adaptive")?.route, "provider-a/parent:medium");
	assert.equal(result.rows.find((row) => row.caseId === "economy-low-reviewer" && row.condition === "adaptive")?.strategy, "lower-cost");
});

test("offline benchmark pairs adaptive routes with a static parent baseline", () => {
	const result = report();
	const adaptive = result.rows.filter((row) => row.condition === "adaptive");
	const staticParent = result.rows.filter((row) => row.condition === "static-parent");
	assert.equal(adaptive.length, staticParent.length);
	assert.equal(result.summary.totalCases, adaptive.length);
	assert.ok(result.summary.publishedModelCostDelta > 0);
	assert.ok(adaptive.some((row) => row.strategy === "lower-cost"));
	assert.ok(adaptive.some((row) => row.strategy === "same-model"));
	assert.deepEqual(
		adaptive.map((row) => row.caseId),
		staticParent.map((row) => row.caseId),
	);
});

test("offline benchmark output is machine-readable and explicit about its baseline", () => {
	const result = report();
	const parsed = JSON.parse(formatBenchmarkReport(result)) as typeof result;
	assert.equal(parsed.parent, "provider-a/parent:medium");
	assert.equal(parsed.rows.filter((row) => row.condition === "static-parent").every((row) => row.preservesParent), true);
	assert.equal(parsed.summary.protectedReviewerCases, 4);
});
