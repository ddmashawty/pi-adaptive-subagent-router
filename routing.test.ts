import assert from "node:assert/strict";
import test from "node:test";
import { inferDuty, selectRoute, type RuntimeModel } from "./routing.ts";

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
	assert.throws(() => inferDuty("worker", "oracle"), /requires the oracle agent/i);
	assert.throws(() => inferDuty("oracle", "research"), /must use oracle duty/i);
});

for (const qualityPolicy of ["economy", "balanced", "strict"] as const) {
	test(`oracle preserves the parent model and prefers high thinking under ${qualityPolicy}`, () => {
		const route = selectRoute(parent, [parent, economy], "medium", {
			complexity: "standard",
			risk: "low",
			qualityPolicy,
			duty: "oracle",
			minContextWindow: 0,
		});
		assert.equal(route?.model.id, "parent");
		assert.equal(route?.thinking, "high");
		assert.equal(route?.strategy, "same-model");
		assert.match(route?.reason.join(" ") ?? "", /oracle/i);
	});
}

test("oracle keeps the parent thinking when high is unsupported", () => {
	const limitedParent: RuntimeModel = {
		...parent,
		thinkingLevelMap: { high: null },
	};
	const route = selectRoute(limitedParent, [limitedParent, economy], "medium", {
		complexity: "standard",
		risk: "low",
		qualityPolicy: "balanced",
		duty: "oracle",
		minContextWindow: 0,
	});
	assert.equal(route?.model.id, "parent");
	assert.equal(route?.thinking, "medium");
	assert.match(route?.reason.join(" ") ?? "", /unsupported/i);
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

test("existing economical read routes remain unchanged", () => {
	assert.equal(routeFor("reviewer", "low", "economy")?.model.id, "economy");
	assert.equal(routeFor("scout", "low", "balanced")?.model.id, "economy");
	assert.equal(routeFor("research", "low", "balanced")?.model.id, "economy");
});
