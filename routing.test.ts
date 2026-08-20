import assert from "node:assert/strict";
import test from "node:test";
import { inferDuty, selectRoute, thinkingRank, type RuntimeModel } from "./routing.ts";

const parent: RuntimeModel = {
	id: "parent",
	provider: "provider",
	reasoning: true,
	input: ["text"],
	contextWindow: 200_000,
	cost: { input: 10, output: 10, cacheRead: 1, cacheWrite: 1 },
};

const economy: RuntimeModel = {
	id: "economy",
	provider: "provider",
	reasoning: true,
	input: ["text"],
	contextWindow: 200_000,
	cost: { input: 1, output: 1, cacheRead: 0.1, cacheWrite: 0.1 },
};

test("oracle and advisor names infer oracle duty", () => {
	assert.equal(inferDuty("oracle"), "oracle");
	assert.equal(inferDuty("advisor"), "oracle");
	assert.equal(inferDuty("oracle", "oracle"), "oracle");
});

test("oracle duty cannot be assigned to a different agent or bypassed explicitly", () => {
	assert.throws(() => inferDuty("worker", "oracle"), /does not match agent/i);
	assert.throws(() => inferDuty("oracle", "research"), /does not match agent/i);
});

test("worker aliases infer worker duty and cannot bypass it", () => {
	for (const agent of ["worker", "developer", "coder", "implementer", "develop"]) {
		assert.equal(inferDuty(agent), "worker");
	}
	assert.throws(() => inferDuty("scout", "worker"), /does not match agent/i);
	assert.throws(() => inferDuty("worker", "research"), /does not match agent/i);
});

test("unsupported, custom, writer, and whitespace-padded agent names fail closed", () => {
	for (const agent of ["writer", "custom-writer", "worker ", "code-analysis.scout"]) {
		assert.throws(() => inferDuty(agent), /unsupported adaptive agent/i);
	}
});

test("every supported read-only agent is duty-bound", () => {
	assert.equal(inferDuty("scout"), "scout");
	assert.equal(inferDuty("reviewer"), "reviewer");
	assert.equal(inferDuty("researcher"), "research");
	assert.throws(() => inferDuty("reviewer", "research"), /does not match agent/i);
});

for (const qualityPolicy of ["economy", "balanced", "strict"] as const) {
	test(`oracle preserves the parent model and thinking under ${qualityPolicy}`, () => {
		const route = selectRoute(parent, [parent, economy], "medium", {
			complexity: "standard",
			risk: "low",
			qualityPolicy,
			duty: "oracle",
			minContextWindow: 0,
		});
		assert.equal(route?.model.id, "parent");
		assert.equal(route?.thinking, "medium");
		assert.equal(route?.strategy, "same-model");
		assert.match(route?.reason.join(" ") ?? "", /oracle/i);
	});
}

test("oracle inherits a low parent thinking level without raising it", () => {
	const route = selectRoute(parent, [parent, economy], "low", {
		complexity: "complex",
		risk: "low",
		qualityPolicy: "balanced",
		duty: "oracle",
		minContextWindow: 0,
	});
	assert.equal(route?.model.id, "parent");
	assert.equal(route?.thinking, "low");
	assert.match(route?.reason.join(" ") ?? "", /preserve parent thinking low/i);
});

const routeFor = (duty: "scout" | "reviewer" | "research", risk: "low" | "high", qualityPolicy: "economy" | "balanced") =>
	selectRoute(parent, [parent, economy], "medium", {
		complexity: "standard",
		risk,
		qualityPolicy,
		duty,
		minContextWindow: 0,
	});

test("existing balanced reviewer and high-risk protections remain unchanged", () => {
	assert.equal(routeFor("reviewer", "low", "balanced")?.model.id, "parent");
	assert.equal(routeFor("scout", "high", "balanced")?.model.id, "parent");
	assert.equal(routeFor("research", "high", "balanced")?.model.id, "parent");
});

test("existing economical read routes remain lower-cost and below parent thinking", () => {
	for (const route of [
		routeFor("reviewer", "low", "economy"),
		routeFor("scout", "low", "balanced"),
		routeFor("research", "low", "balanced"),
	]) {
		assert.equal(route?.model.id, "economy");
		assert.equal(route?.thinking, "low");
		assert.equal(route?.strategy, "lower-cost");
	}
});

test("same-model economical fallback remains below parent thinking", () => {
	const route = selectRoute(parent, [parent], "medium", {
		complexity: "standard",
		risk: "low",
		qualityPolicy: "balanced",
		duty: "scout",
		minContextWindow: 0,
	});
	assert.equal(route?.model.id, "parent");
	assert.equal(route?.thinking, "low");
	assert.equal(route?.strategy, "same-model-lower-thinking");
});

test("no subagent route exceeds the parent thinking level", () => {
	for (const duty of ["scout", "reviewer", "research", "oracle", "worker"] as const) {
		for (const qualityPolicy of ["economy", "balanced", "strict"] as const) {
			const route = selectRoute(parent, [parent, economy], "medium", {
				complexity: "complex",
				risk: "low",
				qualityPolicy,
				duty,
				minContextWindow: 0,
			});
			assert.ok(route, `${duty}/${qualityPolicy} should produce a route`);
			assert.ok(thinkingRank(route.thinking) <= thinkingRank("medium"), `${duty}/${qualityPolicy} exceeded parent thinking`);
		}
	}
});

for (const qualityPolicy of ["economy", "balanced", "strict"] as const) {
	test(`worker preserves the parent model and thinking under ${qualityPolicy}`, () => {
		const route = selectRoute(parent, [parent, economy], "medium", {
			complexity: "standard",
			risk: "low",
			qualityPolicy,
			duty: "worker",
			minContextWindow: 0,
		});
		assert.equal(route?.model.id, "parent");
		assert.equal(route?.thinking, "medium");
		assert.equal(route?.strategy, "same-model");
		assert.match(route?.reason.join(" ") ?? "", /worker/i);
	});
}

test("worker inherits a minimal parent thinking level without raising it", () => {
	const route = selectRoute(parent, [parent, economy], "minimal", {
		complexity: "complex",
		risk: "medium",
		qualityPolicy: "balanced",
		duty: "worker",
		minContextWindow: 0,
	});
	assert.equal(route?.model.id, "parent");
	assert.equal(route?.thinking, "minimal");
	assert.match(route?.reason.join(" ") ?? "", /preserve parent thinking minimal/i);
});
