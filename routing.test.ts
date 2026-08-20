import assert from "node:assert/strict";
import test from "node:test";
import { modelRef, selectRoute, type RouteRequest, type RuntimeModel } from "./routing.ts";

function model(id: string, total: number, contextWindow = 128_000, provider = "provider-a"): RuntimeModel {
	return {
		id,
		provider,
		reasoning: true,
		input: ["text"],
		contextWindow,
		cost: { input: total / 2, output: total / 2, cacheRead: 0, cacheWrite: 0 },
	};
}

const parent = model("parent", 100, 128_000);
const cheapest = model("cheap", 10, 200_000);
const closer = model("closer", 70, 200_000);
const otherProvider = model("foreign", 1, 200_000, "provider-b");
const base: RouteRequest = {
	complexity: "standard",
	risk: "low",
	qualityPolicy: "balanced",
	role: "read",
	duty: "scout",
	minContextWindow: 0,
};

function route(request: Partial<RouteRequest> = {}, parentThinking = "medium" as const) {
	return selectRoute(parent, [parent, cheapest, closer, otherProvider], parentThinking, { ...base, ...request });
}

test("balanced low-risk scout uses the cheapest same-provider route", () => {
	const selected = route();
	assert.equal(selected?.strategy, "lower-cost");
	assert.equal(modelRef(selected!.model, selected!.thinking), "provider-a/cheap:low");
	assert.equal(selected?.eligibleLowerCost, 2);
});

test("balanced medium risk favors the closer lower-cost model", () => {
	const selected = route({ risk: "medium", duty: "research" });
	assert.equal(selected?.model.id, "closer");
});

test("balanced preserves parent capability for every reviewer and protected lane", () => {
	for (const request of [
		{ risk: "low" as const, duty: "reviewer" as const },
		{ risk: "medium" as const, duty: "reviewer" as const },
		{ risk: "medium" as const, role: "write" as const, duty: "worker" as const },
		{ risk: "high" as const, duty: "scout" as const },
		{ risk: "critical" as const, duty: "reviewer" as const },
	]) {
		const selected = route(request);
		assert.equal(selected?.strategy, "same-model");
		assert.equal(modelRef(selected!.model, selected!.thinking), "provider-a/parent:medium");
	}
});

test("strict always preserves parent while economy may down-route high risk", () => {
	assert.equal(route({ qualityPolicy: "strict" })?.strategy, "same-model");
	const economy = route({ qualityPolicy: "economy", risk: "critical", duty: "reviewer" });
	assert.equal(economy?.strategy, "lower-cost");
	assert.equal(economy?.model.id, "cheap");
});

test("falls back to lower parent thinking and then same parent runtime", () => {
	const noCandidates = selectRoute(parent, [parent, otherProvider], "medium", { ...base, qualityPolicy: "economy" });
	assert.equal(modelRef(noCandidates!.model, noCandidates!.thinking), "provider-a/parent:low");
	assert.equal(noCandidates?.strategy, "same-model-lower-thinking");
	const off = selectRoute(parent, [parent], "off", { ...base, qualityPolicy: "economy" });
	assert.equal(modelRef(off!.model, off!.thinking), "provider-a/parent:off");
	assert.equal(off?.strategy, "same-model");
});

test("context requirement applies to the selected model and never crosses providers", () => {
	const smallParent = model("small-parent", 100, 64_000);
	const largeCandidate = model("large-child", 20, 200_000);
	const selected = selectRoute(smallParent, [smallParent, largeCandidate, otherProvider], "medium", {
		...base,
		qualityPolicy: "economy",
		minContextWindow: 150_000,
	});
	assert.equal(selected?.model.id, "large-child");
	assert.equal(selected?.model.provider, smallParent.provider);
	assert.equal(selectRoute(smallParent, [smallParent, otherProvider], "medium", {
		...base,
		qualityPolicy: "economy",
		minContextWindow: 150_000,
	}), undefined);
});
