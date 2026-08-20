import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkflow } from "./workflow.ts";

function compile(script: string) {
	return new Function("runs", `return (async () => { ${script} })();`) as (runs: unknown) => Promise<unknown>;
}

async function capturedChild(context?: "fresh" | "fork") {
	let captured: Array<Record<string, unknown>> = [];
	const script = buildWorkflow([{
		key: "oracle-check",
		agent: "oracle",
		duty: "oracle",
		task: "Challenge the current plan",
		risk: "medium",
		...(context ? { context } : {}),
		output: false,
	}], [{ model: "provider/parent:high" }], "/tmp/project");
	await compile(script)({
		all: async (items: Array<Record<string, unknown>>) => {
			captured = items;
			return [{ output: "oracle result" }];
		},
	});
	return captured[0];
}

test("oracle defaults to fork context", async () => {
	assert.equal((await capturedChild())?.context, "fork");
});

test("an explicit oracle context overrides the fork default", async () => {
	assert.equal((await capturedChild("fresh"))?.context, "fresh");
});

test("oracle remains a read-only evidence lane", async () => {
	const child = await capturedChild();
	assert.match(String(child?.task), /Read-only lane/);
	assert.match(String(child?.task), /confidence/);
});

test("oracle calibration uses the same default fork context", async () => {
	let calibration: Record<string, unknown> | undefined;
	const script = buildWorkflow([{
		key: "oracle-check",
		agent: "oracle",
		duty: "oracle",
		task: "Challenge the current plan",
		risk: "medium",
		output: false,
	}], [{ model: "provider/parent:high" }], "/tmp/project", {
		calibration: { enabled: true, model: "provider/parent:high" },
	});
	await compile(script)({
		all: async () => [{ output: "oracle result" }],
		run: async (_key: string, item: Record<string, unknown>) => {
			calibration = item;
			return { output: "calibration result" };
		},
	});
	assert.equal(calibration?.context, "fork");
});
